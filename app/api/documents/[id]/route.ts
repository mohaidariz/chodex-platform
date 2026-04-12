import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const serviceSupabase = createServiceClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Verify document belongs to org
    const { data: doc } = await serviceSupabase
      .from('documents')
      .select('id, file_path, org_id')
      .eq('id', params.id)
      .eq('org_id', profile.org_id)
      .single()

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete from storage if path exists
    if (doc.file_path) {
      await serviceSupabase.storage
        .from('documents')
        .remove([doc.file_path])
    }

    // Delete document (cascades to chunks)
    await serviceSupabase
      .from('documents')
      .delete()
      .eq('id', params.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete document error:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
