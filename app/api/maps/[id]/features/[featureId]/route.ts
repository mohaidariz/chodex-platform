import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

async function checkAccess(
  mapId: string,
  userId: string,
  service: ReturnType<typeof createServiceRoleClient>,
) {
  const { data: profile } = await service
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single();
  if (!profile?.org_id) return { error: 'No organization', status: 400 };

  const { data: map } = await service
    .from('maps')
    .select('org_id')
    .eq('id', mapId)
    .single();
  if (!map) return { error: 'Project not found', status: 404 };
  if (map.org_id !== profile.org_id) {
    return { error: 'Forbidden', status: 403 };
  }
  return { orgId: profile.org_id };
}

/**
 * PATCH /api/maps/[id]/features/[featureId]
 * Update an existing feature's properties.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; featureId: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceRoleClient();
    const access = await checkAccess(params.id, user.id, service);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await req.json();
    const allowed = [
      'feature_type',
      'lat',
      'lng',
      'end_lat',
      'end_lng',
      'source_id',
      'label',
      'props',
    ];
    const patch: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No updatable fields' }, { status: 400 });
    }

    const { data: updated, error } = await service
      .from('map_features')
      .update(patch)
      .eq('id', params.featureId)
      .eq('map_id', params.id)
      .select()
      .single();
    if (error) throw error;
    if (!updated) return NextResponse.json({ error: 'Feature not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/maps/[id]/features/[featureId]
 * Remove a feature.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; featureId: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceRoleClient();
    const access = await checkAccess(params.id, user.id, service);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const { error } = await service
      .from('map_features')
      .delete()
      .eq('id', params.featureId)
      .eq('map_id', params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed' },
      { status: 500 },
    );
  }
}
