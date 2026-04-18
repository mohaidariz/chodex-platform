export async function generateEmbedding(text: string): Promise<number[]> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT!;
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;

  const res = await fetch(
    `${endpoint}/openai/deployments/${deployment}/embeddings?api-version=2024-02-15-preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ input: text }),
    }
  );

  if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}
