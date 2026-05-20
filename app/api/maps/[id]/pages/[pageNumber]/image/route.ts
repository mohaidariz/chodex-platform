import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/maps/[id]/pages/[pageNumber]/image
 *
 * Returns a short-lived signed URL for the rendered PNG of one page.
 * Used by the calibration UI to display the page next to OpenStreetMap.
 */
export async function GET(
  _req: NextRequest,
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

    const { data: page } = await service
      .from('map_pages')
      .select('rendered_image_storage_key, image_width, image_height')
      .eq('map_id', params.id)
      .eq('page_number', pageNumber)
      .single();
    if (!page?.rendered_image_storage_key) {
      return NextResponse.json(
        { error: 'Page image not available (re-extract the map)' },
        { status: 404 },
      );
    }

    const { data: signed, error: signErr } = await service.storage
      .from('Maps')
      .createSignedUrl(page.rendered_image_storage_key, 60 * 60); // 1 hour
    if (signErr || !signed) {
      throw signErr || new Error('Failed to sign URL');
    }

    return NextResponse.json({
      url: signed.signedUrl,
      width: page.image_width,
      height: page.image_height,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed' },
      { status: 500 },
    );
  }
}
