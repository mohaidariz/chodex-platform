import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { applyCalibration, type CalibrationAnchor } from '@/lib/maps/calibration';
import proj4 from 'proj4';

// Make sure SWEREF 99 TM is registered (calibration.ts depends on georef.ts which registers it,
// but importing proj4 here makes the conversion available too).
proj4.defs(
  'EPSG:3006',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);

/**
 * POST /api/maps/[id]/pages/[pageNumber]/calibration
 *
 * Body: either
 *   { pixel_x, pixel_y, n, e }        — anchor in SWEREF 99 TM
 *   { pixel_x, pixel_y, lat, lng }    — anchor in WGS84 (we convert to SWEREF)
 *
 * Recomputes the page's four corners using the anchor + scale + image
 * dimensions and writes them back to map_pages.calibration plus the
 * corner_* columns.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; pageNumber: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceRoleClient();
    const { data: profile } = await service
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const pageNumber = parseInt(params.pageNumber, 10);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
    }

    const { data: map } = await service
      .from('maps')
      .select('org_id')
      .eq('id', params.id)
      .single();
    if (!map) return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    // Helper: turn an input anchor (pixel + either {n,e} or {lat,lng}) into
    // a CalibrationAnchor in SWEREF coordinates.
    function buildAnchor(input: any, label: string): CalibrationAnchor {
      if (
        typeof input?.pixel_x !== 'number' ||
        typeof input?.pixel_y !== 'number'
      ) {
        throw new Error(`${label}: pixel_x and pixel_y are required numbers`);
      }
      let n: number;
      let e: number;
      if (typeof input.n === 'number' && typeof input.e === 'number') {
        n = input.n;
        e = input.e;
      } else if (typeof input.lat === 'number' && typeof input.lng === 'number') {
        const [easting, northing] = proj4('WGS84', 'EPSG:3006', [
          input.lng,
          input.lat,
        ]);
        n = northing;
        e = easting;
      } else {
        throw new Error(`${label}: provide either { n, e } or { lat, lng }`);
      }
      return { pixel_x: input.pixel_x, pixel_y: input.pixel_y, n, e };
    }

    // Two formats supported:
    //   v2 two-anchor: body.anchors = [a, b]
    //   v1 single-anchor: body has pixel_x/pixel_y + lat/lng or n/e
    let anchor: CalibrationAnchor;
    let anchor2: CalibrationAnchor | undefined;

    if (Array.isArray(body.anchors) && body.anchors.length >= 1) {
      anchor = buildAnchor(body.anchors[0], 'anchor 1');
      if (body.anchors.length >= 2) {
        anchor2 = buildAnchor(body.anchors[1], 'anchor 2');
      }
    } else {
      anchor = buildAnchor(body, 'anchor');
    }

    await applyCalibration(params.id, pageNumber, anchor, user.id, anchor2);

    const { data: updated } = await service
      .from('map_pages')
      .select('*')
      .eq('map_id', params.id)
      .eq('page_number', pageNumber)
      .single();

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Calibration error:', error);
    return NextResponse.json(
      { error: error?.message || 'Calibration failed' },
      { status: 500 },
    );
  }
}
