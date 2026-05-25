import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

interface IncomingFeature {
  feature_type: string;
  lat: number;
  lng: number;
  end_lat?: number | null;
  end_lng?: number | null;
  source_id?: string | null;
  label?: string | null;
  props?: Record<string, unknown> | null;
  page_number?: number;
}

const VALID_TYPES = new Set([
  'cable',
  'joint',
  'pole',
  'cabinet',
  'transformer',
  'drill_segment',
  'drill_pit',
  'dig_area',
  'annotation',
  'route',
  'other',
]);

function validate(f: any): IncomingFeature | string {
  if (!f || typeof f !== 'object') return 'feature must be an object';
  if (typeof f.feature_type !== 'string') return 'feature_type required';
  if (!VALID_TYPES.has(f.feature_type)) return `unknown feature_type: ${f.feature_type}`;
  if (typeof f.lat !== 'number' || typeof f.lng !== 'number') {
    return 'lat and lng must be numbers';
  }
  if (
    (f.end_lat != null && typeof f.end_lat !== 'number') ||
    (f.end_lng != null && typeof f.end_lng !== 'number')
  ) {
    return 'end_lat/end_lng must be numbers if provided';
  }
  return {
    feature_type: f.feature_type,
    lat: f.lat,
    lng: f.lng,
    end_lat: f.end_lat ?? null,
    end_lng: f.end_lng ?? null,
    source_id: f.source_id ?? null,
    label: f.label ?? null,
    props: f.props ?? {},
    page_number: typeof f.page_number === 'number' ? f.page_number : 1,
  };
}

/**
 * POST /api/maps/[id]/features
 *
 * Create one or more features manually for a project.
 * Body: a single feature or an array of features.
 *
 * Used by the editor when the designer drops point/line features on the map.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
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

    const { data: map } = await service
      .from('maps')
      .select('org_id')
      .eq('id', params.id)
      .single();
    if (!map) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const incoming = Array.isArray(body) ? body : [body];

    const validated: IncomingFeature[] = [];
    for (const item of incoming) {
      const result = validate(item);
      if (typeof result === 'string') {
        return NextResponse.json({ error: result }, { status: 400 });
      }
      validated.push(result);
    }

    const rows = validated.map((f) => ({
      map_id: params.id,
      page_number: f.page_number ?? 1,
      feature_type: f.feature_type,
      lat: f.lat,
      lng: f.lng,
      end_lat: f.end_lat,
      end_lng: f.end_lng,
      source_id: f.source_id,
      label: f.label,
      props: f.props ?? {},
    }));

    const { data: inserted, error } = await service
      .from('map_features')
      .insert(rows)
      .select();
    if (error) throw error;

    return NextResponse.json(inserted);
  } catch (error: any) {
    console.error('Feature create error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed' },
      { status: 500 },
    );
  }
}
