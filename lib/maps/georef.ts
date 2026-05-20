/**
 * Georeferencing helpers for Swedish utility maps.
 *
 * Swedish Byggkarta/Borrkarta drawings use SWEREF 99 TM (EPSG:3006) as the
 * projection. We need to convert those northing/easting coordinates to
 * WGS84 (EPSG:4326, standard lat/lng) so the browser, GPS and Google Maps
 * APIs can use them.
 */

import proj4 from 'proj4';

// SWEREF 99 TM (EPSG:3006) projection definition
proj4.defs(
  'EPSG:3006',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);

export interface SwerefPoint {
  n: number; // northing (Y)
  e: number; // easting (X)
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Convert a single SWEREF 99 TM (N, E) point to WGS84 (lat, lng).
 */
export function swerefToWgs84(point: SwerefPoint): LatLng {
  // proj4 expects [x, y] = [easting, northing]
  const [lng, lat] = proj4('EPSG:3006', 'WGS84', [point.e, point.n]);
  return { lat, lng };
}

export interface PageCorners {
  nw: SwerefPoint;
  ne: SwerefPoint;
  sw: SwerefPoint;
  se: SwerefPoint;
}

export interface PageCornersWgs84 {
  nw: LatLng;
  ne: LatLng;
  sw: LatLng;
  se: LatLng;
}

export function pageCornersToWgs84(corners: PageCorners): PageCornersWgs84 {
  return {
    nw: swerefToWgs84(corners.nw),
    ne: swerefToWgs84(corners.ne),
    sw: swerefToWgs84(corners.sw),
    se: swerefToWgs84(corners.se),
  };
}

/**
 * Convert a pixel position on the rendered page to a SWEREF 99 TM point,
 * given the page's four corner coordinates and the page image dimensions.
 *
 * Uses simple bilinear interpolation. This is exact when the map is an
 * axis-aligned rectangular slice of the projection (which Byggkarta/Borrkarta
 * detail sheets are). For maps with rotation/skew, we'd need an affine
 * transform — not needed for v1.
 */
export function pixelToSweref(
  pixelX: number,
  pixelY: number,
  imageWidth: number,
  imageHeight: number,
  corners: PageCorners,
): SwerefPoint {
  // Fractional position in [0, 1]
  const u = pixelX / imageWidth;   // 0 = left, 1 = right
  const v = pixelY / imageHeight;  // 0 = top, 1 = bottom

  // Bilinear interpolation across the four corners.
  // Top edge: nw -> ne (parameterised by u)
  const topN = corners.nw.n + u * (corners.ne.n - corners.nw.n);
  const topE = corners.nw.e + u * (corners.ne.e - corners.nw.e);

  // Bottom edge: sw -> se (parameterised by u)
  const botN = corners.sw.n + u * (corners.se.n - corners.sw.n);
  const botE = corners.sw.e + u * (corners.se.e - corners.sw.e);

  // Vertical interpolation top -> bottom (parameterised by v)
  const n = topN + v * (botN - topN);
  const e = topE + v * (botE - topE);

  return { n, e };
}

/**
 * Convert a pixel position directly to WGS84 lat/lng.
 */
export function pixelToWgs84(
  pixelX: number,
  pixelY: number,
  imageWidth: number,
  imageHeight: number,
  corners: PageCorners,
): LatLng {
  const sweref = pixelToSweref(pixelX, pixelY, imageWidth, imageHeight, corners);
  return swerefToWgs84(sweref);
}
