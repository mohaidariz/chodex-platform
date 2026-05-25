import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/maps/[id]
 *
 * Returns the map row plus all its pages and features.
 * Used by the dashboard map detail page (QA view) and by the field view.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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
      .select('*')
      .eq('id', params.id)
      .single();
    if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [{ data: pages }, { data: features }] = await Promise.all([
      service
        .from('map_pages')
        .select('*')
        .eq('map_id', params.id)
        .order('page_number'),
      service
        .from('map_features')
        .select('*')
        .eq('map_id', params.id)
        .order('page_number'),
    ]);

    return NextResponse.json({
      map,
      pages: pages ?? [],
      features: features ?? [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/maps/[id]
 *
 * Update project metadata. Currently used to toggle `pinned_at` (pin /
 * unpin a project in the dashboard list). Accepts:
 *   { pinned: true | false }  — convenience flag, server picks now() / null
 *   { pinned_at: ISO string | null }  — explicit
 *   { name: string }
 *   { project_code: string }
 *   { map_type: 'byggkarta' | 'borrkarta' | 'other' }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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
    if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const patch: Record<string, any> = {};

    if (typeof body.pinned === 'boolean') {
      patch.pinned_at = body.pinned ? new Date().toISOString() : null;
    } else if ('pinned_at' in body) {
      patch.pinned_at = body.pinned_at;
    }
    if (typeof body.name === 'string' && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if ('project_code' in body) {
      patch.project_code = body.project_code?.trim() || null;
    }
    if (
      typeof body.map_type === 'string' &&
      ['byggkarta', 'borrkarta', 'other'].includes(body.map_type)
    ) {
      patch.map_type = body.map_type;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No updatable fields' }, { status: 400 });
    }

    const { data: updated, error } = await service
      .from('maps')
      .update(patch)
      .eq('id', params.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Update failed' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/maps/[id]
 *
 * Removes a map and (via cascade) its pages and features.
 * Also removes the original PDF from storage.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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
      .select('org_id, original_pdf_storage_key')
      .eq('id', params.id)
      .single();
    if (!map) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Best-effort storage cleanup; ignore errors so we always delete the row.
    if (map.original_pdf_storage_key && map.original_pdf_storage_key !== 'pending') {
      await service.storage.from('Maps').remove([map.original_pdf_storage_key]);
    }

    await service.from('maps').delete().eq('id', params.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Delete failed' },
      { status: 500 },
    );
  }
}
