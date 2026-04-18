import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { searchDocuments } from '@/lib/documents/search';
import { generateChatResponse } from '@/lib/openai/chat';
import { sendEscalationEmail } from '@/lib/email/send';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationId, orgSlug, visitorName, visitorEmail } = body;

    if (!message || !orgSlug) {
      return NextResponse.json({ error: 'Missing message or orgSlug' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .single();
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    let convId = conversationId;
    if (!convId) {
      const { data: conv } = await supabase
        .from('conversations')
        .insert({
          org_id: org.id,
          visitor_name: visitorName || null,
          visitor_email: visitorEmail || null,
          status: 'active',
        })
        .select()
        .single();
      convId = conv?.id;
    } else if (visitorName || visitorEmail) {
      await supabase
        .from('conversations')
        .update({ visitor_name: visitorName, visitor_email: visitorEmail })
        .eq('id', convId);
    }

    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message,
    });

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    const chunks = await searchDocuments(message, org.id, 5);
    const context = chunks.map((c: any) => c.content).join('\n\n---\n\n');

    const { data: learnings } = await supabase
      .from('learnings')
      .select('question, answer')
      .eq('org_id', org.id)
      .limit(10);
    const learningContext =
      learnings?.map((l) => `Q: ${l.question}\nA: ${l.answer}`).join('\n\n') || '';

    const systemPrompt = `You are a helpful AI assistant for an organization. Answer questions based ONLY on the provided context documents. If you cannot find the answer in the documents, say so honestly and offer to connect them with a human.

${context ? `CONTEXT FROM DOCUMENTS:\n${context}` : 'No documents have been uploaded yet.'}

${learningContext ? `PAST LEARNINGS:\n${learningContext}` : ''}

RULES:
- Only answer based on the provided context. Do not make up information.
- Be concise and helpful.
- If the user wants to speak to a human, send an email, or you cannot answer their question, ask for their name and email address so you can connect them with the right person.
- If you have their name and email and they want help, respond with EXACTLY this format on a new line: [ESCALATE: reason here]
- Be conversational and friendly but professional.`;

    const chatMessages = (history || []).map((m) => ({ role: m.role, content: m.content }));
    let response = await generateChatResponse(chatMessages, systemPrompt);

    if (response.includes('[ESCALATE:') && visitorName && visitorEmail) {
      const reason =
        response.match(/\[ESCALATE:\s*(.+?)\]/)?.[1] || 'User requested human assistance';
      response = response.replace(/\[ESCALATE:.*?\]/, '').trim();

      try {
        await sendEscalationEmail({
          toEmail: process.env.EMAIL_TO || 'mohammed.a.haidari@gmail.com',
          fromName: visitorName,
          fromEmail: visitorEmail,
          subject: `Chodex: Conversation escalation from ${visitorName}`,
          conversationSummary: reason,
          messages: history || [],
        });

        await supabase.from('email_logs').insert({
          org_id: org.id,
          conversation_id: convId,
          to_email: process.env.EMAIL_TO || 'mohammed.a.haidari@gmail.com',
          from_name: visitorName,
          from_email: visitorEmail,
          subject: `Escalation from ${visitorName}`,
          body: reason,
          status: 'sent',
        });

        await supabase
          .from('conversations')
          .update({ status: 'escalated' })
          .eq('id', convId);

        if (!response) {
          response = `I've forwarded your conversation to our team. They'll reach out to you at ${visitorEmail} shortly. Is there anything else I can help with in the meantime?`;
        }
      } catch (emailErr) {
        console.error('Email send failed:', emailErr);
        response +=
          '\n\nI tried to connect you with our team but encountered an issue. Please try again or email us directly.';
      }
    }

    await supabase.from('messages').insert({
      conversation_id: convId,
      role: 'assistant',
      content: response,
    });

    if (history && history.length >= 4) {
      const lastUserMsg = history.filter((m) => m.role === 'user').pop();
      if (lastUserMsg) {
        void supabase
          .from('learnings')
          .insert({
            org_id: org.id,
            conversation_id: convId,
            question: lastUserMsg.content,
            answer: response,
            helpful: true,
          })
          .then(() => {}, () => {});
      }
    }

    return NextResponse.json({
      response,
      conversationId: convId,
      sources: chunks.map((c: any) => ({ content: c.content?.substring(0, 100) + '...' })),
    });
  } catch (error: any) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: error.message || 'Chat failed' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
