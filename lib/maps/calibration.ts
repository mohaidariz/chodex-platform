/**
 * Single-anchor calibration for a Byggkarta/Borrkarta page.
 *
 * Given:
 *   - one anchor point (pixel position on the rendered PNG, real-world SWEREF 99 TM)
 *   - the page's scale denominator (e.g. 4500 for 1:4500)
 *   - the page's rendered image dimensions in pixels
 *   - the rendering DPI (we render at scale * 72; scale=2 -> 144 DPI)
 *
 * compute the four page corners in SWEREF 99 TM. Assumes the page is
 * axis-aligned with the SWEREF projection (north is up). True for all
 * standard Swedish utility detail sheets.
 */

import { swerefToWgs84, type SwerefPoint, type LatLng } from './georef';
import { createServiceRoleClient } from '@/lib/supabase/server';

// pdf-to-img renders at scale * 72 DPI. We use scale=2 in parser.ts.
export const RENDER_DPI = 144;
const MM_PER_INCH = 25.4;

export interface CalibrationAnchor {
  pixel_x: number;
  pixel_y: number;
  n: number;
  e: number;
}

export interface CalibrationRecord {
  // Two anchors: first and second. The first is also kept as `anchor` for
  // backwards compatibility with earlier single-anchor calibrations.
  anchor: CalibrationAnchor;
  anchor2?: CalibrationAnchor;
  calibrated_at: string;     // ISO timestamp
  calibrated_by?: string | null;
  source: 'manual' | 'vision';
}

/**
 * How many pixels represent one real-world meter on the page.
 * 1 inch on the page = RENDER_DPI pixels
 * 1 inch on the page = (scale_denominator * MM_PER_INCH) mm in the real world
 *                    = (scale_denominator * MM_PER_INCH / 1000) meters
 * So: pixels_per_meter = RENDER_DPI / (scale_denominator * MM_PER_INCH / 1000)
 */
export function pixelsPerMeter(scaleDenominator: number): number {
  return RENDER_DPI / ((scaleDenominator * MM_PER_INCH) / 1000);
}

export interface PageGeometry {
  image_width: number;
  image_height: number;
  scale_denominator: number;
}

/**
 * Compute the four page corners in SWEREF given a single anchor + scale +
 * page geometry. Used as a fallback when only one anchor is provided.
 *
 * Pixel coordinate system: origin at top-left, +y is down, +x is right.
 * SWEREF coordinate system: +n is north (up on the map), +e is east (right).
 */
export function cornersFromAnchor(
  anchor: CalibrationAnchor,
  geometry: PageGeometry,
): {
  nw: SwerefPoint;
  ne: SwerefPoint;
  sw: SwerefPoint;
  se: SwerefPoint;
} {
  const ppm = pixelsPerMeter(geometry.scale_denominator);
  const { image_width: W, image_height: H } = geometry;
  const { pixel_x: ax, pixel_y: ay, n: an, e: ae } = anchor;

  const e_left = ae - ax / ppm;
  const e_right = ae + (W - ax) / ppm;
  const n_top = an + ay / ppm;
  const n_bottom = an - (H - ay) / ppm;

  return {
    nw: { n: n_top, e: e_left },
    ne: { n: n_top, e: e_right },
    sw: { n: n_bottom, e: e_left },
    se: { n: n_bottom, e: e_right },
  };
}

/**
 * Compute the four page corners in SWEREF given TWO anchor points.
 * Derives the pixels-per-meter ratio directly from the user's clicks
 * (no DPI/scale assumption) — assumes the page is axis-aligned with the
 * SWEREF grid (north is up), which holds for all standard Swedish utility
 * detail sheets.
 */
export function cornersFromTwoAnchors(
  a: CalibrationAnchor,
  b: CalibrationAnchor,
  geometry: { image_width: number; image_height: number },
): {
  nw: SwerefPoint;
  ne: SwerefPoint;
  sw: SwerefPoint;
  se: SwerefPoint;
  ppm: number;
} {
  const { image_width: W, image_height: H } = geometry;

  // Derive pixels per meter from the two anchors. We average the x- and
  // y-direction ratios for robustness in case the user's clicks aren't
  // perfectly aligned with a grid line.
  const dPxX = b.pixel_x - a.pixel_x;
  const dPxY = b.pixel_y - a.pixel_y;
  const dE = b.e - a.e;
  const dN = a.n - b.n; // northing flips relative to pixel y

  const candidates: number[] = [];
  if (Math.abs(dE) > 1e-3) candidates.push(dPxX / dE);
  if (Math.abs(dN) > 1e-3) candidates.push(dPxY / dN);
  if (candidates.length === 0) {
    throw new Error('Two calibration anchors are at the same real-world point — pick distinct points.');
  }
  const ppm = candidates.reduce((s, v) => s + v, 0) / candidates.length;
  if (!Number.isFinite(ppm) || ppm <= 0) {
    throw new Error('Computed scale is invalid — check that calibration anchors are well-separated and correctly placed.');
  }

  // Use anchor a as the reference and extrapolate corners
  const e_left = a.e - a.pixel_x / ppm;
  const e_right = a.e + (W - a.pixel_x) / ppm;
  const n_top = a.n + a.pixel_y / ppm;
  const n_bottom = a.n - (H - a.pixel_y) / ppm;

  return {
    nw: { n: n_top, e: e_left },
    ne: { n: n_top, e: e_right },
    sw: { n: n_bottom, e: e_left },
    se: { n: n_bottom, e: e_right },
    ppm,
  };
}

/**
 * Compute the SWEREF coordinates of a pixel on a calibrated page (single anchor).
 */
export function pixelToSwerefFromAnchor(
  pixelX: number,
  pixelY: number,
  anchor: CalibrationAnchor,
  geometry: PageGeometry,
): SwerefPoint {
  const ppm = pixelsPerMeter(geometry.scale_denominator);
  const e = anchor.e + (pixelX - anchor.pixel_x) / ppm;
  const n = anchor.n - (pixelY - anchor.pixel_y) / ppm;
  return { n, e };
}

/**
 * Compute SWEREF for a pixel given two anchors. Derives ppm from the anchors.
 */
export function pixelToSwerefFromTwoAnchors(
  pixelX: number,
  pixelY: number,
  a: CalibrationAnchor,
  b: CalibrationAnchor,
): SwerefPoint {
  const dPxX = b.pixel_x - a.pixel_x;
  const dPxY = b.pixel_y - a.pixel_y;
  const dE = b.e - a.e;
  const dN = a.n - b.n;

  const candidates: number[] = [];
  if (Math.abs(dE) > 1e-3) candidates.push(dPxX / dE);
  if (Math.abs(dN) > 1e-3) candidates.push(dPxY / dN);
  if (candidates.length === 0) {
    throw new Error('Two calibration anchors are at the same real-world point');
  }
  const ppm = candidates.reduce((s, v) => s + v, 0) / candidates.length;

  const e = a.e + (pixelX - a.pixel_x) / ppm;
  const n = a.n - (pixelY - a.pixel_y) / ppm;
  return { n, e };
}

/**
 * Apply a calibration to a page:
 *   1. Recompute the corner_* columns on map_pages
 *   2. Recompute lat/lng for every map_features row on that page
 *
 * The features' original pixel positions aren't stored in our schema today,
 * so we re-project them by inverse-transforming their previous lat/lng
 * back into pixel space using the OLD corners, then forward-projecting to
 * SWEREF using the new anchor. If there are no OLD corners, features just
 * shift by the same delta the anchor implies — best we can do without
 * pixel positions, and acceptable since this is a recalibration not a
 * fresh extraction.
 */
export async function applyCalibration(
  mapId: string,
  pageNumber: number,
  anchor: CalibrationAnchor,
  calibratedBy: string | null,
  anchor2?: CalibrationAnchor,
): Promise<void> {
  const service = createServiceRoleClient();

  // Fetch the page row
  const { data: page, error } = await service
    .from('map_pages')
    .select('*')
    .eq('map_id', mapId)
    .eq('page_number', pageNumber)
    .single();
  if (error || !page) throw new Error('Page not found');
  if (!page.image_width || !page.image_height) {
    throw new Error('Page has no image dimensions — re-extract the map first');
  }

  const geometry: PageGeometry = {
    image_width: page.image_width,
    image_height: page.image_height,
    scale_denominator: page.scale_denominator ?? 1000, // fallback only used by single-anchor path
  };

  // Compute new corners. Prefer two-anchor calibration when both anchors are
  // provided — it derives the scale from the user's clicks directly, with no
  // DPI assumption. Fall back to single-anchor + scale if only one anchor.
  let corners: { nw: SwerefPoint; ne: SwerefPoint; sw: SwerefPoint; se: SwerefPoint };
  if (anchor2) {
    corners = cornersFromTwoAnchors(anchor, anchor2, {
      image_width: geometry.image_width,
      image_height: geometry.image_height,
    });
  } else {
    if (!page.scale_denominator) {
      throw new Error('Page has no scale denominator — pick two anchors or set a scale first');
    }
    corners = cornersFromAnchor(anchor, geometry);
  }

  const wgsCorners = {
    nw: swerefToWgs84(corners.nw),
    ne: swerefToWgs84(corners.ne),
    sw: swerefToWgs84(corners.sw),
    se: swerefToWgs84(corners.se),
  };

  const calibration: CalibrationRecord = {
    anchor,
    anchor2,
    calibrated_at: new Date().toISOString(),
    calibrated_by: calibratedBy,
    source: 'manual',
  };

  // Update map_pages with new corners + calibration record
  await service
    .from('map_pages')
    .update({
      corner_nw_n: corners.nw.n, corner_nw_e: corners.nw.e,
      corner_ne_n: corners.ne.n, corner_ne_e: corners.ne.e,
      corner_sw_n: corners.sw.n, corner_sw_e: corners.sw.e,
      corner_se_n: corners.se.n, corner_se_e: corners.se.e,
      corner_nw_lat: wgsCorners.nw.lat, corner_nw_lng: wgsCorners.nw.lng,
      corner_ne_lat: wgsCorners.ne.lat, corner_ne_lng: wgsCorners.ne.lng,
      corner_sw_lat: wgsCorners.sw.lat, corner_sw_lng: wgsCorners.sw.lng,
      corner_se_lat: wgsCorners.se.lat, corner_se_lng: wgsCorners.se.lng,
      calibration,
    })
    .eq('map_id', mapId)
    .eq('page_number', pageNumber);

  // Re-project every feature on this page using the new calibration.
  // We stored each feature's pixel positions in props during extraction.
  const { data: features } = await service
    .from('map_features')
    .select('id, props')
    .eq('map_id', mapId)
    .eq('page_number', pageNumber);

  if (features && features.length > 0) {
    const projectPixel = (px: number, py: number): SwerefPoint => {
      if (anchor2) return pixelToSwerefFromTwoAnchors(px, py, anchor, anchor2);
      return pixelToSwerefFromAnchor(px, py, anchor, geometry);
    };

    for (const f of features) {
      const p = (f.props ?? {}) as Record<string, any>;
      if (typeof p.pixel_x !== 'number' || typeof p.pixel_y !== 'number') {
        continue;
      }
      const startSweref = projectPixel(p.pixel_x, p.pixel_y);
      const startWgs = swerefToWgs84(startSweref);

      const update: Record<string, any> = {
        lat: startWgs.lat,
        lng: startWgs.lng,
      };

      if (typeof p.end_pixel_x === 'number' && typeof p.end_pixel_y === 'number') {
        const endSweref = projectPixel(p.end_pixel_x, p.end_pixel_y);
        const endWgs = swerefToWgs84(endSweref);
        update.end_lat = endWgs.lat;
        update.end_lng = endWgs.lng;
      }

      await service.from('map_features').update(update).eq('id', f.id);
    }
  }
}
