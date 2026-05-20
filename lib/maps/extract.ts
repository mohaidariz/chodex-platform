/**
 * Map extraction pipeline.
 *
 * For each page of an uploaded Byggkarta/Borrkarta:
 *   1. Render the PDF page to a PNG image.
 *   2. Ask the vision model where the four corner coordinates are
 *      (SWEREF 99 TM N/E labels) and what scale the page is at.
 *   3. Ask the vision model to list every feature on the page
 *      (cable, joint, pole, cabinet, transformer, drill segment, etc.)
 *      with its pixel position and label.
 *   4. Convert pixel positions -> SWEREF -> WGS84.
 *   5. Write rows into map_pages and map_features.
 *
 * Status transitions: extracting -> ready, or extracting -> failed.
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { renderPdfPages, type RenderedPage } from '@/lib/maps/parser';
import { pageCornersToWgs84, pixelToWgs84, type PageCorners } from '@/lib/maps/georef';
import { visionExtractJSON } from '@/lib/openai/vision';

// =============================================================================
// Vision response shapes
// =============================================================================

interface CornerExtraction {
  /** True if a SWEREF 99 TM coordinate grid was detected on this page. */
  has_coordinates: boolean;
  /** Map scale denominator, e.g. 1000 for "1:1000". null if not visible. */
  scale_denominator: number | null;
  /**
   * Four page corners in SWEREF 99 TM, in projection units (meters).
   * N = northing, E = easting.
   *
   * Maps in Sweden generally have N decreasing top-to-bottom
   * (north is up, but printed coordinate labels increase as N grows,
   * so NW has the largest N, SW has the smallest N).
   */
  corners: {
    nw: { n: number; e: number };
    ne: { n: number; e: number };
    sw: { n: number; e: number };
    se: { n: number; e: number };
  } | null;
  /** Free-form notes about extraction confidence or issues. */
  notes?: string;
}

interface FeatureExtraction {
  features: Array<{
    /** Cable, joint, pole, cabinet, transformer, drill_segment, drill_pit, other. */
    feature_type: string;
    /** Pixel position. For line features (cable, drill_segment), this is the start. */
    pixel_x: number;
    pixel_y: number;
    /** Optional end pixel for line features. */
    end_pixel_x?: number;
    end_pixel_y?: number;
    /** Identifier visible on the map, e.g. LS009147, JUH3608014, 744110011. */
    source_id?: string;
    /** Raw label text from the map, e.g. "AMCL 3*95/16". */
    label?: string;
    /** Structured properties (cable_type, voltage, action, depth, etc.). */
    props?: Record<string, unknown>;
  }>;
}

// =============================================================================
// Prompts
// =============================================================================

const CORNERS_SYSTEM = `You read Swedish utility-map coordinate grids and return the corner coordinates as JSON.

Input: an image of one page from a Swedish Byggkarta (cable construction map) or Borrkarta (drilling map). The map uses the SWEREF 99 TM projection. Coordinate labels are printed near the page edges as "N <number>" for northing and "E <number>" for easting.

Reference information about SWEREF 99 TM in Sweden:

Northing (N) values in Sweden are 7-digit numbers between 6,100,000 and 7,700,000. For project areas in central and northern Sweden they typically start with 69 or 70. Examples: 6993496, 6997178, 7024672, 7034889.

Easting (E) values in Sweden are 6-digit numbers between 250,000 and 900,000, typically starting with 5, 6, or 7. Examples: 537742, 582769, 637157, 639803, 705120.

Geometry of the four corners on a page:
- NW (top-left) and NE (top-right) share the same northing because they sit on the top edge.
- SW (bottom-left) and SE (bottom-right) share the same northing on the bottom edge.
- NW (top-left) and SW (bottom-left) share the same easting on the left edge.
- NE (top-right) and SE (bottom-right) share the same easting on the right edge.
- The top northing (NW/NE) is greater than the bottom northing (SW/SE).
- The right easting (NE/SE) is greater than the left easting (NW/SW).
- The horizontal and vertical span between corners on a detail sheet is typically between 100 and 5,000 meters.

Please extract:
1. The four page-corner coordinates in SWEREF 99 TM.
2. The scale denominator (e.g. 1000 for "1:1000", or 4500 for "Skala 1:4500"), usually printed near the bottom.

If a page does not have a printed coordinate grid (for example, an overview page showing only the project extent without N/E labels), return has_coordinates: false and corners: null.

Output JSON only, matching this schema:
{
  "has_coordinates": boolean,
  "scale_denominator": number | null,
  "corners": {
    "nw": { "n": number, "e": number },
    "ne": { "n": number, "e": number },
    "sw": { "n": number, "e": number },
    "se": { "n": number, "e": number }
  } | null,
  "notes": "optional free-form text describing where the labels appear and any uncertainty"
}`;

const FEATURE_OUTPUT_SCHEMA = `Output JSON only matching this schema:
{
  "features": [
    {
      "feature_type": "cable" | "joint" | "pole" | "cabinet" | "transformer" | "drill_segment" | "drill_pit" | "dig_area" | "annotation" | "other",
      "pixel_x": number,
      "pixel_y": number,
      "end_pixel_x": number (optional, for line features),
      "end_pixel_y": number (optional, for line features),
      "source_id": string (optional),
      "label": string (optional),
      "props": object (optional)
    }
  ]
}

Line features (cables, drill segments, trench runs): give pixel_x/pixel_y as one endpoint and end_pixel_x/end_pixel_y as the other endpoint.
Point features (joints, poles, cabinets, transformers, drill pits): only pixel_x/pixel_y.
If a label is partially readable or you are unsure, include what you can read and set props to { "uncertain": true }. Do not skip features just because the label is unclear.`;

const DRILL_FEATURES_SYSTEM = `You read every drilling-related feature visible on a Swedish Borrkarta page and return them as JSON.

A Borrkarta shows where horizontal directional drilling (HDD), trenching, and digging will happen for a utility installation project.

CRITICAL: Drill segments and dig trenches are LINES on the page. Every such feature must have BOTH endpoints filled in:
- pixel_x, pixel_y = one end of the drilled/dug line
- end_pixel_x, end_pixel_y = the OTHER end

Without both endpoints, the feature shows as a dot instead of a line on our map. Trace the actual drawn segment from one end to the other.

Drill pits, cabinets, and standalone annotation labels are point features (no endpoint needed).

Drilling-related features to look for, exhaustively:
- "Tryckning N" (pressing/jacking, numbered): a horizontal drill segment, drawn as a line. feature_type = "drill_segment", BOTH endpoints required.
- "Borrning" segments: drilled cable runs. feature_type = "drill_segment", BOTH endpoints required.
- Drill pits (entry/exit points of HDD): circles or rectangles at the ends of drilling segments. feature_type = "drill_pit", single point.
- "Schakt" or dig trenches: where ground will be excavated, drawn as lines. feature_type = "dig_area", BOTH endpoints required.
- "Kab.m.skåp" cabinet locations near drill paths. feature_type = "cabinet", single point.
- Standalone annotations like "Trycks", "Borras", "Schaktas", "Grävs": feature_type = "annotation", single point at label position.

Be EXHAUSTIVE. Return every single drill segment, drill pit, dig trench, and construction annotation you can see, even small or partially readable ones. Mark uncertain ones with props: { "uncertain": true }.

${FEATURE_OUTPUT_SCHEMA}`;

const CABLES_FEATURES_SYSTEM = `You read every cable line and conductor visible on a Swedish utility map page and return them as JSON.

CRITICAL: Cables are LINES on the page, not points. Every cable you return must have BOTH endpoints filled in:
- pixel_x, pixel_y = pixel position of one end of the cable line
- end_pixel_x, end_pixel_y = pixel position of the OTHER end of the cable line

If you give only one position without an endpoint, the cable will be drawn as a dot, which is wrong. Trace the actual drawn line on the page from one end to the other.

Cables on these maps are drawn as lines, with a cable-type label printed alongside (often at the middle of the line). The label and the line both belong to the same feature.

Common cable type labels you will see (return the label EXACTLY as printed):
- Underground MV/LV: AMCL 3*95/16, AMCL 3*50/16, AKKJ 3*95/29, AKKJ 3*50/16, AKKJ 3*150/41, AKKD 4*50
- XLPE underground MV: AXCL 3*95/25, AXCEL 3*50/16, AXLJ-RMF LT 3*95/16
- Nexans LV underground: N1XV-A 4G240, N1XE-A 4G150, N1XE-AR 4G25, AML 4G25, AML 4G50, AML 4G150, AML 4G240, EKKJ 3*10/10, AXQJ 4*50/29
- Overhead copper: Cu-lina 25, FX-lina 25
- Aluminum overhead service drops: ALUS 4*25, ALUS 4*50, ALUS 4*95
- Steel-aluminum overhead transmission: FeAl 3*31, FeAl 3*62, FeAl 3*99
- Covered overhead conductors: 12 JK 3*95, 0,4 JK 4*240, 0,4 JK 4*50

Be EXHAUSTIVE. Every drawn line on the page that has a cable label is one feature. Long curving lines should be approximated by a single straight segment from one visible end to the other end — that's fine for v1.

If a line is drawn but you cannot read the label clearly, still include it as feature_type "cable" with label set to your best guess and props: { "uncertain": true }.

${FEATURE_OUTPUT_SCHEMA}`;

const INFRASTRUCTURE_FEATURES_SYSTEM = `You read every infrastructure point and identifier visible on a Swedish utility map page and return them as JSON.

These are point features (not lines) — joints, poles, cabinets, transformers, substations.

Common ID prefixes you will see:
- LS00xxxx (substations)
- GT74xxxx (transformer stations)
- JUH36xxxxx (cable joints)
- K1xxxxx (cabinets / "skåp")
- 744xxxxxx (cable section IDs)
- N16xxxx (network nodes)
- L744-xxx, L744-LFxx (cable lengths or labels)

Feature types and what they look like on the page:
- "joint": a small mark/dot with a JUH36xxxxx or 744xxxxxx label nearby. Cables meet here.
- "pole": shown as a small symbol with an LS00xxxx label nearby.
- "cabinet": "Kab.m.skåp" or K1xxxxx labels, often near distribution points.
- "transformer": GT74xxxx labeled stations.
- "annotation": any text annotation that is NOT a cable label and not a primary feature (e.g. property numbers like "3:1>2", village names, distances like "100m").

Be EXHAUSTIVE. Return every visible numeric ID and every labeled infrastructure point on this page. If the same ID appears multiple times in different positions (cable joints can be marked at both ends), return each occurrence.

${FEATURE_OUTPUT_SCHEMA}`;

// =============================================================================
// Extraction orchestrator
// =============================================================================

/**
 * Run extraction for a single map. Updates the maps row's status as it goes.
 */
export async function extractMap(mapId: string): Promise<void> {
  const service = createServiceRoleClient();

  try {
    const { data: map, error: fetchErr } = await service
      .from('maps')
      .select('*')
      .eq('id', mapId)
      .single();
    if (fetchErr || !map) throw new Error('Map not found');

    // 1. Download the PDF from storage
    const { data: pdfBlob, error: dlErr } = await service.storage
      .from('Maps')
      .download(map.original_pdf_storage_key);
    if (dlErr || !pdfBlob) throw new Error(`PDF download failed: ${dlErr?.message}`);

    const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

    // 2. Render every page to PNG
    const pages = await renderPdfPages(pdfBuffer);

    // 3. Update page_count on the map
    await service.from('maps').update({ page_count: pages.length }).eq('id', mapId);

    // 4. Process each page: corners then features
    for (const page of pages) {
      await extractPage(mapId, page);
    }

    // 5. Mark ready
    await service
      .from('maps')
      .update({ status: 'ready', error_message: null })
      .eq('id', mapId);
  } catch (e: any) {
    console.error('Map extraction failed:', e);
    await service
      .from('maps')
      .update({ status: 'failed', error_message: e?.message || String(e) })
      .eq('id', mapId);
    throw e;
  }
}

/**
 * Validate that a corner extraction passes Swedish SWEREF 99 TM sanity rules.
 * Returns null if valid, or a reason string if invalid.
 */
function validateCorners(c: CornerExtraction['corners']): string | null {
  if (!c) return 'no corners';

  const allN = [c.nw.n, c.ne.n, c.sw.n, c.se.n];
  const allE = [c.nw.e, c.ne.e, c.sw.e, c.se.e];

  // Northings must be 7 digits, starting with 69 or 70 (Sweden's lat band).
  for (const n of allN) {
    if (!Number.isFinite(n)) return `non-finite northing: ${n}`;
    if (n < 6_900_000 || n >= 7_100_000) {
      return `northing ${n} outside Swedish range (6.9M–7.1M)`;
    }
  }

  // Eastings must be 6 digits, starting with 5/6/7.
  for (const e of allE) {
    if (!Number.isFinite(e)) return `non-finite easting: ${e}`;
    if (e < 250_000 || e >= 900_000) {
      return `easting ${e} outside Swedish range (250k–900k)`;
    }
  }

  // Top corners (NW/NE) must share the same N as the top edge.
  if (Math.abs(c.nw.n - c.ne.n) > 50) {
    return `top corners have different N (${c.nw.n} vs ${c.ne.n})`;
  }
  // Bottom corners (SW/SE) must share the same N.
  if (Math.abs(c.sw.n - c.se.n) > 50) {
    return `bottom corners have different N (${c.sw.n} vs ${c.se.n})`;
  }
  // Left corners (NW/SW) must share the same E.
  if (Math.abs(c.nw.e - c.sw.e) > 50) {
    return `left corners have different E (${c.nw.e} vs ${c.sw.e})`;
  }
  // Right corners (NE/SE) must share the same E.
  if (Math.abs(c.ne.e - c.se.e) > 50) {
    return `right corners have different E (${c.ne.e} vs ${c.se.e})`;
  }

  // NW/NE must have larger N than SW/SE (top is north).
  if (c.nw.n <= c.sw.n) {
    return `top N (${c.nw.n}) should be greater than bottom N (${c.sw.n})`;
  }
  // NE/SE must have larger E than NW/SW (right is east).
  if (c.ne.e <= c.nw.e) {
    return `right E (${c.ne.e}) should be greater than left E (${c.nw.e})`;
  }

  // Horizontal span should be at least 50m and at most 100km (sanity).
  const horizSpan = c.ne.e - c.nw.e;
  if (horizSpan < 50 || horizSpan > 100_000) {
    return `horizontal span ${horizSpan}m looks wrong (expected 50m–100km)`;
  }
  // Vertical span same.
  const vertSpan = c.nw.n - c.sw.n;
  if (vertSpan < 50 || vertSpan > 100_000) {
    return `vertical span ${vertSpan}m looks wrong (expected 50m–100km)`;
  }

  return null;
}

async function extractPage(mapId: string, page: RenderedPage): Promise<void> {
  const service = createServiceRoleClient();
  const imageBase64 = page.pngBuffer.toString('base64');

  // Persist the rendered page PNG to Supabase Storage so the calibration UI
  // can show it later. Path: {org_id}/{map_id}/pages/page-{N}.png
  // We need the org_id; fetch it from the map row.
  const { data: parentMap } = await service
    .from('maps')
    .select('org_id')
    .eq('id', mapId)
    .single();
  const orgId = parentMap?.org_id;
  let renderedImageKey: string | null = null;
  if (orgId) {
    renderedImageKey = `${orgId}/${mapId}/pages/page-${page.pageNumber}.png`;
    const { error: pageUploadErr } = await service.storage
      .from('Maps')
      .upload(renderedImageKey, page.pngBuffer, {
        contentType: 'image/png',
        upsert: true,
      });
    if (pageUploadErr) {
      console.warn(`Failed to save rendered page image (${renderedImageKey}):`, pageUploadErr.message);
      renderedImageKey = null;
    }
  }

  // Step A: extract page corners + scale.
  // Retry once with a stricter "look again" instruction if the first pass
  // fails sanity validation — the prompt itself includes the rules, but
  // a second look helps when the model misreads a digit.
  let cornersResult = await visionExtractJSON<CornerExtraction>({
    systemPrompt: CORNERS_SYSTEM,
    userPrompt: `Read the four SWEREF 99 TM corner coordinates and the scale denominator from this map page. Use the reference information in the system prompt to verify the digits you read are consistent with Swedish coordinate format.`,
    imageBase64,
  });

  let validationError: string | null = null;
  if (cornersResult.has_coordinates && cornersResult.corners) {
    validationError = validateCorners(cornersResult.corners);
    if (validationError) {
      console.warn(`Page ${page.pageNumber} corner extraction looked off (${validationError}). Re-reading.`);
      cornersResult = await visionExtractJSON<CornerExtraction>({
        systemPrompt: CORNERS_SYSTEM,
        userPrompt: `The previous reading of corner coordinates appeared inconsistent (${validationError}). Please look at the page edges again and read each coordinate label carefully. Northings in Sweden are 7 digits typically starting with 69 or 70. Eastings are 6 digits typically starting with 5, 6, or 7.`,
        imageBase64,
      });
      if (cornersResult.has_coordinates && cornersResult.corners) {
        const retryError = validateCorners(cornersResult.corners);
        if (retryError) {
          // Keep the model's best-effort corners so feature extraction still
          // has a coordinate system to project into. The user will fix this
          // via manual calibration in the dashboard. We log the issue so it
          // can be surfaced in the UI later if needed.
          console.warn(`Page ${page.pageNumber} corner extraction still off after retry: ${retryError}. Keeping anyway; user calibration will fix.`);
        }
      }
    }
  }

  // For pages where the model said has_coordinates:false (no grid visible),
  // synthesise a placeholder coordinate system centred at a default location
  // in central Sweden. Features extracted from this page will be in roughly
  // the wrong place, but the user can calibrate the page afterwards and we
  // re-project everything. This is much better than dropping the features
  // entirely.
  if (!cornersResult.has_coordinates || !cornersResult.corners) {
    const fallbackScale = cornersResult.scale_denominator ?? 1000;
    // Approximate central Sweden anchor point, used only as a placeholder.
    // Center the page on (n=6995000, e=600000) and size it according to scale.
    const widthMeters = (page.width / 144) * 25.4 * fallbackScale / 1000;
    const heightMeters = (page.height / 144) * 25.4 * fallbackScale / 1000;
    const cn = 6995000;
    const ce = 600000;
    cornersResult = {
      has_coordinates: true,
      scale_denominator: fallbackScale,
      corners: {
        nw: { n: cn + heightMeters / 2, e: ce - widthMeters / 2 },
        ne: { n: cn + heightMeters / 2, e: ce + widthMeters / 2 },
        sw: { n: cn - heightMeters / 2, e: ce - widthMeters / 2 },
        se: { n: cn - heightMeters / 2, e: ce + widthMeters / 2 },
      },
      notes: 'placeholder corners (no grid visible) — calibrate this page manually',
    };
  }

  // Insert (or update) the map_pages row
  const pageRow: any = {
    map_id: mapId,
    page_number: page.pageNumber,
    scale_denominator: cornersResult.scale_denominator,
    image_width: page.width,
    image_height: page.height,
    rendered_image_storage_key: renderedImageKey,
  };

  let corners: PageCorners | null = null;
  if (cornersResult.has_coordinates && cornersResult.corners) {
    corners = cornersResult.corners as PageCorners;
    Object.assign(pageRow, {
      corner_nw_n: corners.nw.n, corner_nw_e: corners.nw.e,
      corner_ne_n: corners.ne.n, corner_ne_e: corners.ne.e,
      corner_sw_n: corners.sw.n, corner_sw_e: corners.sw.e,
      corner_se_n: corners.se.n, corner_se_e: corners.se.e,
    });
    const wgs = pageCornersToWgs84(corners);
    Object.assign(pageRow, {
      corner_nw_lat: wgs.nw.lat, corner_nw_lng: wgs.nw.lng,
      corner_ne_lat: wgs.ne.lat, corner_ne_lng: wgs.ne.lng,
      corner_sw_lat: wgs.sw.lat, corner_sw_lng: wgs.sw.lng,
      corner_se_lat: wgs.se.lat, corner_se_lng: wgs.se.lng,
    });
  }

  // Upsert by (map_id, page_number)
  await service
    .from('map_pages')
    .upsert(pageRow, { onConflict: 'map_id,page_number' });

  // If the page has no geo-reference, skip feature extraction —
  // we can't place features in space without corners.
  if (!corners) return;

  // Step B: multi-pass feature extraction.
  // Run three focused passes in parallel and combine. Each pass uses a prompt
  // tuned for one category, which dramatically improves coverage vs a single
  // "find everything" pass.
  const userPromptSuffix = ` Give pixel positions in the image coordinate system (origin top-left, x right, y down). The page image is ${page.width} pixels wide and ${page.height} pixels tall. Be EXHAUSTIVE.`;

  const [drillResult, cablesResult, infraResult] = await Promise.all([
    visionExtractJSON<FeatureExtraction>({
      systemPrompt: DRILL_FEATURES_SYSTEM,
      userPrompt: `List every drilling-related feature on this Borrkarta page (drill segments, drill pits, dig trenches, construction annotations).${userPromptSuffix}`,
      imageBase64,
      maxTokens: 8000,
    }).catch((e) => {
      console.warn(`Drill features pass failed on page ${page.pageNumber}:`, e.message);
      return { features: [] } as FeatureExtraction;
    }),
    visionExtractJSON<FeatureExtraction>({
      systemPrompt: CABLES_FEATURES_SYSTEM,
      userPrompt: `List every labeled cable line on this page. Trace each cable from one endpoint to the other and return one feature per labeled segment.${userPromptSuffix}`,
      imageBase64,
      maxTokens: 12000,
    }).catch((e) => {
      console.warn(`Cables pass failed on page ${page.pageNumber}:`, e.message);
      return { features: [] } as FeatureExtraction;
    }),
    visionExtractJSON<FeatureExtraction>({
      systemPrompt: INFRASTRUCTURE_FEATURES_SYSTEM,
      userPrompt: `List every infrastructure point and identifier on this page (joints, poles, cabinets, transformers, substations, annotations).${userPromptSuffix}`,
      imageBase64,
      maxTokens: 12000,
    }).catch((e) => {
      console.warn(`Infrastructure pass failed on page ${page.pageNumber}:`, e.message);
      return { features: [] } as FeatureExtraction;
    }),
  ]);

  const combined: FeatureExtraction['features'] = [
    ...drillResult.features,
    ...cablesResult.features,
    ...infraResult.features,
  ];

  console.log(
    `Page ${page.pageNumber}: drill=${drillResult.features.length}, ` +
    `cables=${cablesResult.features.length}, infra=${infraResult.features.length}, ` +
    `total=${combined.length}`,
  );

  // Convert pixel positions to lat/lng and bulk-insert.
  // We also persist the original pixel positions in props so calibration
  // can re-project features later without re-calling the vision model.
  const rows = combined.map((f) => {
    const start = pixelToWgs84(f.pixel_x, f.pixel_y, page.width, page.height, corners!);
    const end =
      f.end_pixel_x != null && f.end_pixel_y != null
        ? pixelToWgs84(f.end_pixel_x, f.end_pixel_y, page.width, page.height, corners!)
        : null;
    return {
      map_id: mapId,
      page_number: page.pageNumber,
      feature_type: f.feature_type,
      lat: start.lat,
      lng: start.lng,
      end_lat: end?.lat ?? null,
      end_lng: end?.lng ?? null,
      source_id: f.source_id ?? null,
      label: f.label ?? null,
      props: {
        ...(f.props ?? {}),
        pixel_x: f.pixel_x,
        pixel_y: f.pixel_y,
        ...(f.end_pixel_x != null && f.end_pixel_y != null
          ? { end_pixel_x: f.end_pixel_x, end_pixel_y: f.end_pixel_y }
          : {}),
      },
    };
  });

  if (rows.length > 0) {
    await service.from('map_features').insert(rows);
  }
}
