import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateEmbedding } from '@/lib/openai/embeddings';

export async function searchDocuments(query: string, orgId: string, limit = 5) {
  const supabase = createServiceRoleClient();
  const embedding = await generateEmbedding(query);

  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: JSON.stringify(embedding),
    match_org_id: orgId,
    match_threshold: 0.7,
    match_count: limit,
  });

  if (error) throw error;
  return data || [];
}
