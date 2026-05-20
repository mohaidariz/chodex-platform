import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { extractMap } from '@/lib/maps/extract';

// Vision calls can take a while; extend the route timeout for Vercel.
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

/**
 * POST /api/maps/[id]/extract
 *
 * Triggers extraction for a single map. The caller must be a member of the
 * map's organization.
 *
 * This route runs the extraction synchronously inside the request — the
 * status transitions from `extracting` -> `ready` (or `failed`) on the map
 * row. The client should poll `GET /api/maps` to see the result.
 */
export async function POST(
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
      .select('org_id, status')
      .eq('id', params.id)
      .single();
    if (!map) {
      return NextResponse.json({ error: 'Map not found' }, { status: 404 });
    }
    if (map.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Set status to extracting (covers the case where it was failed and is being retried)
    await service
      .from('maps')
      .update({ status: 'extracting', error_message: null })
      .eq('id', params.id);

    await extractMap(params.id);

    const { data: updated } = await service
      .from('maps')
      .select('*')
      .eq('id', params.id)
      .single();

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error?.message || 'Extraction failed' },
      { status: 500 },
    );
  }
}
