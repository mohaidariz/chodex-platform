import { NextRequest, NextResponse } from 'next/server'
import { type SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/openai/embeddings'
import { streamChatCompletion, extractLearnings } from '@/lib/openai/chat'
import { sendEmail, buildConversationSummaryEmail } from '@/lib/email/resend'
import type { ChunkSource, Message } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { message, orgSlug, sessionId, visitorEmail, conversationId } = await req.json()

    if (!message || !orgSlug || !sessionId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Resolve organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, email_from, email_reply_to')
      .eq('slug', orgSlug)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Upsert conversation
    let currentConversationId = conversationId
    if (!currentConversationId) {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          org_id: org.id,
          session_id: sessionId,
          visitor_email: visitorEmail ?? null,
        })
        .select('id')
        .single()

      if (convError) throw convError
      currentConversationId = conv.id
    } else if (visitorEmail) {
      // Update visitor email if provided later
      await supabase
        .from('conversations')
        .update({ visitor_email: visitorEmail })
        .eq('id', currentConversationId)
    }

    // Save user message
    await supabase.from('messages').insert({
      conversation_id: currentConversationId,
      role: 'user',
      content: message,
    })

    // Generate embedding for the user message
    const embedding = await generateEmbedding(message)

    // Search for relevant document chunks
    const { data: chunks } = await supabase.rpc('match_chunks', {
      query_embedding: embedding,
      match_org_id: org.id,
      match_count: 5,
    })

    const sources: ChunkSource[] = (chunks ?? []).map((c: ChunkSource) => ({
      id: c.id,
      content: c.content,
      metadata: c.metadata,
      similarity: c.similarity,
    }))

    // Fetch recent conversation history (last 10 messages)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', currentConversationId)
      .order('created_at', { ascending: true })
      .limit(10)

    const chatHistory = (recentMessages ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Stream response from Azure OpenAI
    const stream = await streamChatCompletion(chatHistory, org.name, sources)

    let fullContent = ''

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? ''
            if (delta) {
              fullContent += delta
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta, conversationId: currentConversationId })}\n\n`)
              )
            }
          }

          // Save assistant message
          await supabase.from('messages').insert({
            conversation_id: currentConversationId,
            role: 'assistant',
            content: fullContent,
            sources: sources.length > 0 ? sources : null,
          })

          // Extract learnings asynchronously (don't block stream)
          extractLearningsAsync(supabase, org.id, currentConversationId)

          // Send email summary if visitor email provided
          if (visitorEmail) {
            await triggerEmailSummary(
              supabase,
              org,
              currentConversationId,
              visitorEmail,
              chatHistory,
              fullContent
            )
          }

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function extractLearningsAsync(
  supabase: SupabaseClient,
  orgId: string,
  conversationId: string
) {
  try {
    const { data: msgs } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (!msgs || msgs.length < 4) return

    const learnings = await extractLearnings(msgs as Message[], orgId)

    if (learnings.length > 0) {
      await supabase.from('learnings').insert(
        learnings.map((content: string) => ({
          org_id: orgId,
          conversation_id: conversationId,
          learning_type: 'conversation_insight',
          content,
        }))
      )
    }
  } catch (err) {
    console.error('Failed to extract learnings:', err)
  }
}

async function triggerEmailSummary(
  supabase: SupabaseClient,
  org: { id: string; name: string; email_from: string | null; email_reply_to: string | null },
  conversationId: string,
  visitorEmail: string,
  chatHistory: Array<{ role: string; content: string }>,
  lastAssistantMessage: string
) {
  try {
    const allMessages = [
      ...chatHistory,
      { role: 'assistant', content: lastAssistantMessage },
    ]

    const html = buildConversationSummaryEmail(
      org.name,
      visitorEmail,
      allMessages,
      process.env.NEXT_PUBLIC_APP_URL ?? 'https://chodex.se'
    )

    // Log the email first
    const { data: logEntry } = await supabase
      .from('email_logs')
      .insert({
        org_id: org.id,
        conversation_id: conversationId,
        to_email: visitorEmail,
        subject: `Your conversation with ${org.name} AI Assistant`,
        status: 'pending',
      })
      .select('id')
      .single()

    await sendEmail({
      to: visitorEmail,
      subject: `Your conversation with ${org.name} AI Assistant`,
      html,
      from: org.email_from ?? undefined,
      replyTo: org.email_reply_to ?? undefined,
    })

    // Update log to sent
    if (logEntry) {
      await supabase
        .from('email_logs')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', logEntry.id)
    }
  } catch (err) {
    console.error('Failed to send email summary:', err)
  }
}
