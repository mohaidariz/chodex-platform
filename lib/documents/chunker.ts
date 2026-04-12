export interface TextChunk {
  content: string
  metadata: {
    chunkIndex: number
    startChar: number
    endChar: number
    wordCount: number
  }
}

const CHUNK_SIZE = 500  // tokens approx (using word count as proxy)
const CHUNK_OVERLAP = 50

function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 0.75 words
  return Math.ceil(text.split(/\s+/).length / 0.75)
}

export function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = []
  const sentences = text.split(/(?<=[.!?])\s+/)

  let currentChunk = ''
  let currentStart = 0
  let charPosition = 0
  let chunkIndex = 0

  for (const sentence of sentences) {
    const potentialChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence

    if (estimateTokenCount(potentialChunk) > CHUNK_SIZE && currentChunk) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          chunkIndex,
          startChar: currentStart,
          endChar: charPosition,
          wordCount: currentChunk.split(/\s+/).length,
        },
      })

      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/)
      const overlapWords = words.slice(-CHUNK_OVERLAP)
      currentChunk = overlapWords.join(' ') + ' ' + sentence
      currentStart = charPosition - overlapWords.join(' ').length
      chunkIndex++
    } else {
      currentChunk = potentialChunk
    }

    charPosition += sentence.length + 1
  }

  // Add remaining text
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      metadata: {
        chunkIndex,
        startChar: currentStart,
        endChar: charPosition,
        wordCount: currentChunk.split(/\s+/).length,
      },
    })
  }

  return chunks.filter((c) => c.content.length > 50)
}
