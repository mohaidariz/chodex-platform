import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const serviceClient = createServiceRoleClient();

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.org_id)
      return NextResponse.json({ error: 'No organization' }, { status: 400 });

    // Fetch document and verify ownership
    const { data: doc } = await serviceClient
      .from('documents')
      .select('id, file_path, org_id')
      .eq('id', params.id)
      .eq('org_id', profile.org_id)
      .single();
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    // Delete from storage (best-effort — file may already be gone)
    if (doc.file_path) {
      await serviceClient.storage.from('documents').remove([doc.file_path]);
    }

    // Delete document row — chunks cascade via ON DELETE CASCADE
    const { error: deleteError } = await serviceClient
      .from('documents')
      .delete()
      .eq('id', doc.id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Document delete error:', error);
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
