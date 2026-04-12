import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
})

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT!,
    input: text.replace(/\n/g, ' '),
  })
  return response.data[0].embedding
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT!,
    input: texts.map((t) => t.replace(/\n/g, ' ')),
  })
  return response.data.map((d) => d.embedding)
}
