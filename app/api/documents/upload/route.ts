import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { extractText } from '@/lib/documents/processor'
import { chunkText } from '@/lib/documents/chunker'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { getFileExtension } from '@/lib/utils'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const serviceSupabase = createServiceClient()

    // Verify authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['pdf', 'docx', 'txt']
    const ext = getFileExtension(file.name)

    if (!allowedTypes.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${allowedTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Create document record
    const { data: doc, error: docError } = await serviceSupabase
      .from('documents')
      .insert({
        org_id: profile.org_id,
        name: file.name,
        file_type: ext,
        status: 'processing',
      })
      .select('id')
      .single()

    if (docError) throw docError

    // Upload file to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const storagePath = `${profile.org_id}/${doc.id}/${file.name}`

    const { error: storageError } = await serviceSupabase.storage
      .from('documents')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (storageError) {
      await serviceSupabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', doc.id)
      throw storageError
    }

    // Update file path
    await serviceSupabase
      .from('documents')
      .update({ file_path: storagePath })
      .eq('id', doc.id)

    // Extract text from document
    const text = await extractText(fileBuffer, ext)

    if (!text || text.trim().length === 0) {
      await serviceSupabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', doc.id)
      return NextResponse.json({ error: 'Could not extract text from document' }, { status: 422 })
    }

    // Chunk the text
    const chunks = chunkText(text)

    if (chunks.length === 0) {
      await serviceSupabase
        .from('documents')
        .update({ status: 'error' })
        .eq('id', doc.id)
      return NextResponse.json({ error: 'Document produced no processable chunks' }, { status: 422 })
    }

    // Generate embeddings in batches of 20
    const BATCH_SIZE = 20
    const allEmbeddings: number[][] = []

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const embeddings = await generateEmbeddings(batch.map((c) => c.content))
      allEmbeddings.push(...embeddings)
    }

    // Insert chunks with embeddings
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      org_id: profile.org_id,
      content: chunk.content,
      embedding: `[${allEmbeddings[i].join(',')}]`,
      metadata: {
        ...chunk.metadata,
        fileName: file.name,
        fileType: ext,
      },
    }))

    const { error: chunksError } = await serviceSupabase
      .from('document_chunks')
      .insert(chunkRows)

    if (chunksError) throw chunksError

    // Mark document as ready
    await serviceSupabase
      .from('documents')
      .update({ status: 'ready' })
      .eq('id', doc.id)

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      chunksProcessed: chunks.length,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to process document' }, { status: 500 })
  }
}
