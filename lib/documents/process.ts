import { createServiceRoleClient } from '@/lib/supabase/server';
import { parsePDF } from './parser';
import { chunkText } from './chunker';
import { generateEmbeddings } from '@/lib/openai/embeddings';

export async function processDocument(documentId: string, orgId: string) {
  const supabase = createServiceRoleClient();

  await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);

  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();
    if (!doc) throw new Error('Document not found');

    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('documents')
      .download(doc.file_path);
    if (downloadErr || !fileData) throw new Error('Failed to download file');

    const buffer = Buffer.from(await fileData.arrayBuffer());

    const text = await parsePDF(buffer);
    if (!text.trim()) throw new Error('No text extracted from PDF');

    const chunks = chunkText(text);

    const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

    const chunkRecords = chunks.map((chunk, i) => ({
      document_id: documentId,
      org_id: orgId,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i]),
      metadata: chunk.metadata,
    }));

    for (let i = 0; i < chunkRecords.length; i += 20) {
      const batch = chunkRecords.slice(i, i + 20);
      const { error } = await supabase.from('document_chunks').insert(batch);
      if (error) throw error;
    }

    await supabase
      .from('documents')
      .update({ status: 'processed', chunk_count: chunks.length })
      .eq('id', documentId);

    return { success: true, chunks: chunks.length };
  } catch (error: any) {
    await supabase.from('documents').update({ status: 'error' }).eq('id', documentId);
    throw error;
  }
}
