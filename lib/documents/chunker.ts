export interface Chunk {
  content: string;
  metadata: { index: number };
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): Chunk[] {
  const words = text.split(/\s+/);
  const chunks: Chunk[] = [];
  let index = 0;

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ').trim();
    if (chunk.length > 20) {
      chunks.push({ content: chunk, metadata: { index } });
      index++;
    }
  }
  return chunks;
}
