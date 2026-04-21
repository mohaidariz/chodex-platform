import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { searchDocuments } from '@/lib/documents/search';
import { generateChatResponseWithTools, type AzureTool, type ToolExecutor } from '@/lib/openai/chat';
import { sendEscalationEmail } from '@/lib/email/send';
import { getAvailableSlots } from '@/lib/booking/availability';
import { createBooking } from '@/lib/booking/create';
import { sendBookingConfirmationEmail, sendBookingNotificationEmail } from '@/lib/email/send';

const BOOKING_TOOLS: AzureTool[] = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description:
        'Check available booking slots for a date range. Use this when a visitor asks about availability, free times, or wants to schedule a meeting.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format.',
          },
          toDate: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format (optional, defaults to 7 days after fromDate).',
          },
        },
        required: ['fromDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description:
        'Create a booking for a visitor. Call ONLY after collecting name, email, description, and the visitor has confirmed a specific time.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Visitor full name' },
          email: { type: 'string', description: 'Visitor email address' },
          description: {
            type: 'string',
            description: 'Brief description of what they want to discuss (1 sentence)',
          },
          startAt: {
            type: 'string',
            description: 'Booking start time as ISO 8601 UTC string (from a check_availability result)',
          },
        },
        required: ['name', 'email', 'description', 'startAt'],
      },
    },
  },
];

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
      .select('id, name, timezone')
      .eq('slug', orgSlug)
      .single();
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const orgTimezone: string = (org as any).timezone ?? 'Europe/Stockholm';

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

    const today = new Date().toLocaleDateString('en-US', {
      timeZone: orgTimezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const systemPrompt = `You are a helpful AI assistant for ${(org as any).name || 'an organization'}. Answer questions based ONLY on the provided context documents. If you cannot find the answer in the documents, say so honestly and offer to connect them with a human.

${context ? `CONTEXT FROM DOCUMENTS:\n${context}` : 'No documents have been uploaded yet.'}

${learningContext ? `PAST LEARNINGS:\n${learningContext}` : ''}

Today is ${today}. The organization's timezone is ${orgTimezone}.

RULES:
- Only answer based on the provided context. Do not make up information.
- Be concise and helpful.
- If the user wants to speak to a human, send an email, or you cannot answer their question, ask for their name and email address so you can connect them with the right person.
- If you have their name and email and they want help, respond with EXACTLY this format on a new line: [ESCALATE: reason here]
- Be conversational and friendly but professional.

BOOKING:
You can help visitors book a meeting. When asked about availability or scheduling, use the check_availability tool. Never invent available times — always call the tool first. Once you have availability results, present the options naturally (e.g., "We have Tuesday 10:00 AM, 11:00 AM or Wednesday 9:00 AM. Which works for you?"). If the visitor wants to book, collect their name, email, and a one-sentence description of what they'd like to discuss, confirm the chosen time, then call create_booking. On success, read back the 8-character booking code prominently.`;

    const chatMessages = (history || []).map((m) => ({ role: m.role, content: m.content }));

    // Build tool executor capturing org context
    const executeTool: ToolExecutor = async (name, args) => {
      if (name === 'check_availability') {
        const fromDate = args.fromDate as string;
        const toDate = (args.toDate as string | undefined) ?? (() => {
          const d = new Date(`${fromDate}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 7);
          return d.toISOString().slice(0, 10);
        })();

        const slots = await getAvailableSlots(org.id, fromDate, toDate);

        if (!slots.length) {
          return JSON.stringify({ available: false, message: 'No available slots found for the requested period.' });
        }

        return JSON.stringify({
          available: true,
          timezone: orgTimezone,
          days: slots.map((d) => ({
            date: d.date,
            dayLabel: d.dayLabel,
            slots: d.slots.map((s) => ({
              startAt: s.startAt,
              localTime: new Date(s.startAt).toLocaleTimeString('en-US', {
                timeZone: orgTimezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              }),
            })),
          })),
        });
      }

      if (name === 'create_booking') {
        const { name: visitorName, email, description, startAt } = args as Record<string, string>;
        const result = await createBooking({ orgSlug, visitorName, visitorEmail: email, description, startAt });

        if (!result.success) {
          return JSON.stringify({ error: result.error });
        }

        // Send confirmation emails asynchronously
        void (async () => {
          try {
            const { data: adminProfile } = await supabase
              .from('profiles')
              .select('email')
              .eq('org_id', org.id)
              .eq('role', 'admin')
              .limit(1)
              .maybeSingle();

            await Promise.all([
              sendBookingConfirmationEmail({
                toEmail: email,
                visitorName,
                orgName: result.orgName,
                bookingCode: result.bookingCode,
                startAt: result.startAt,
                endAt: result.endAt,
                description,
                timezone: orgTimezone,
              }),
              (adminProfile?.email || process.env.EMAIL_TO)
                ? sendBookingNotificationEmail({
                    toEmail: adminProfile?.email || process.env.EMAIL_TO!,
                    visitorName,
                    visitorEmail: email,
                    orgName: result.orgName,
                    bookingCode: result.bookingCode,
                    startAt: result.startAt,
                    endAt: result.endAt,
                    description,
                    timezone: orgTimezone,
                  })
                : Promise.resolve(),
            ]);
          } catch (e) {
            console.error('Post-booking email error:', e);
          }
        })();

        return JSON.stringify({
          booking_code: result.bookingCode,
          start_at: result.startAt,
          end_at: result.endAt,
          local_time: new Date(result.startAt).toLocaleString('en-US', {
            timeZone: orgTimezone,
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
        });
      }

      return JSON.stringify({ error: 'Unknown tool' });
    };

    let response = await generateChatResponseWithTools(chatMessages, systemPrompt, BOOKING_TOOLS, executeTool);

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
