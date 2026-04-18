import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { processDocument } from '@/lib/documents/process';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id)
      return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.type !== 'application/pdf')
      return NextResponse.json({ error: 'Only PDF files allowed' }, { status: 400 });
    if (file.size > 50 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });

    const timestamp = Date.now();
    const filePath = `${profile.org_id}/${timestamp}_${file.name}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await serviceClient.storage
      .from('documents')
      .upload(filePath, buffer, { contentType: 'application/pdf' });
    if (uploadError) throw uploadError;

    const { data: doc, error: insertError } = await serviceClient
      .from('documents')
      .insert({
        org_id: profile.org_id,
        name: file.name,
        file_path: filePath,
        file_type: 'pdf',
        status: 'pending',
        chunk_count: 0,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    await processDocument(doc.id, profile.org_id);

    const { data: updated } = await serviceClient
      .from('documents')
      .select('*')
      .eq('id', doc.id)
      .single();

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Document upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceRoleClient();
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id)
      return NextResponse.json({ error: 'No organization' }, { status: 400 });

    const { data: docs } = await serviceClient
      .from('documents')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    return NextResponse.json(docs || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
