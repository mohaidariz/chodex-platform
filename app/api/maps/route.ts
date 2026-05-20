import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * POST /api/maps
 * Upload a Byggkarta or Borrkarta PDF.
 *
 * Multipart form fields:
 *   - file: the PDF (required)
 *   - name: display name for the map (optional, defaults to file name)
 *   - project_code: e.g. "IB350077" (optional)
 *   - map_type: "byggkarta" | "borrkarta" | "other" (defaults to "byggkarta")
 *
 * Returns the created map row. Status starts at "uploading"; the next
 * pipeline step (extraction) will flip it to "extracting" and then "ready".
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files allowed' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
    }

    const name = ((formData.get('name') as string) || file.name).trim();
    const projectCode = (formData.get('project_code') as string) || null;
    const mapTypeRaw = (formData.get('map_type') as string) || 'byggkarta';
    const mapType = ['byggkarta', 'borrkarta', 'other'].includes(mapTypeRaw)
      ? mapTypeRaw
      : 'byggkarta';

    // 1. Create the maps row first so we have an id for the storage path.
    //    We set a placeholder storage key and patch it after the upload succeeds.
    const { data: createdMap, error: insertError } = await serviceClient
      .from('maps')
      .insert({
        org_id: profile.org_id,
        name,
        project_code: projectCode,
        map_type: mapType,
        original_pdf_storage_key: 'pending',
        status: 'uploading',
      })
      .select()
      .single();
    if (insertError || !createdMap) throw insertError ?? new Error('Insert failed');

    // 2. Upload the PDF to storage at {org_id}/{map_id}/original.pdf
    const storageKey = `${profile.org_id}/${createdMap.id}/original.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await serviceClient.storage
      .from('Maps')
      .upload(storageKey, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      // Clean up the row we just inserted so we don't leave orphans
      await serviceClient.from('maps').delete().eq('id', createdMap.id);
      throw uploadError;
    }

    // 3. Patch the map row with the real storage key and move to "extracting".
    //    Extraction itself will be wired in the next step of the build.
    const { data: updated, error: updateError } = await serviceClient
      .from('maps')
      .update({
        original_pdf_storage_key: storageKey,
        status: 'extracting',
      })
      .eq('id', createdMap.id)
      .select()
      .single();
    if (updateError) throw updateError;

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Map upload error:', error);
    return NextResponse.json(
      { error: error?.message || 'Upload failed' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/maps
 * List the caller's org's maps, newest first.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 400 });
    }

    const { data: maps } = await serviceClient
      .from('maps')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    return NextResponse.json(maps || []);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
