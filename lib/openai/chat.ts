import OpenAI from 'openai'
import type { ChunkSource, Message } from '@/types'

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
})

export function buildSystemPrompt(orgName: string, sources: ChunkSource[]): string {
  const context = sources
    .map((s, i) => `[Source ${i + 1}]:\n${s.content}`)
    .join('\n\n---\n\n')

  return `You are an intelligent AI assistant for ${orgName}. You help users by answering questions based on the organization's documents and knowledge base.

CONTEXT FROM DOCUMENTS:
${context || 'No relevant documents found.'}

INSTRUCTIONS:
- Answer based on the provided context when available
- If the context doesn't contain relevant information, say so honestly
- Be concise, helpful, and professional
- When referencing specific information, mention which source it came from
- If asked to send an email or if the user wants a follow-up, ask for their email address
- Keep responses clear and well-structured`
}

export async function streamChatCompletion(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  orgName: string,
  sources: ChunkSource[]
) {
  const systemPrompt = buildSystemPrompt(orgName, sources)

  return client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    stream: true,
    temperature: 0.7,
    max_tokens: 1024,
  })
}

export async function extractLearnings(
  messages: Message[],
  orgName: string
): Promise<string[]> {
  const conversation = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')

  const response = await client.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT!,
    messages: [
      {
        role: 'system',
        content: `You extract key learnings and insights from support conversations for ${orgName}.
Return a JSON array of strings, each being a concise learning or insight.
Focus on: frequently asked questions, gaps in documentation, user confusion points, feature requests.
Return empty array if no significant learnings.`,
      },
      {
        role: 'user',
        content: `Extract learnings from this conversation:\n\n${conversation}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  })

  try {
    const parsed = JSON.parse(response.choices[0].message.content ?? '{}')
    return Array.isArray(parsed.learnings) ? parsed.learnings : []
  } catch {
    return []
  }
}
