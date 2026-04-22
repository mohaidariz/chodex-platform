import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { searchDocuments } from '@/lib/documents/search';
import { generateChatResponseWithTools, type AzureTool, type ToolExecutor } from '@/lib/openai/chat';
import { sendEscalationEmail, sendBookingConfirmationEmail, sendBookingNotificationEmail, sendCancellationConfirmationEmail, sendCancellationNotificationEmail } from '@/lib/email/send';
import { getAvailableSlots } from '@/lib/booking/availability';
import { createBooking } from '@/lib/booking/create';

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
  {
    type: 'function',
    function: {
      name: 'cancel_booking',
      description:
        'Cancel an existing booking. Requires the 8-character booking code and the email address used when the booking was created.',
      parameters: {
        type: 'object',
        properties: {
          bookingCode: { type: 'string', description: 'The 8-character booking code (case-insensitive)' },
          email: { type: 'string', description: 'Email address used when the booking was made' },
        },
        required: ['bookingCode', 'email'],
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
      .select('id, name, timezone, cancellation_contact')
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

BOOKING — follow this exact four-step flow, no exceptions:

STEP 1 — Gather preferred day (do NOT call any tool yet):
When a visitor expresses interest in booking or asks about availability, your FIRST response is always a single clarifying question: ask which day or date they prefer. Do not call check_availability. Do not propose any times. Just ask. Example: "Of course! Around which day works best for you?"

STEP 2 — Propose exactly two options (one AM, one PM):
Once the visitor names a day or date range, call check_availability scoped to that one day (use the same date for fromDate and toDate). From the results, pick at most TWO slots to present: ideally one before 12:00 (morning) and one after 12:00 (afternoon). Present them inline in a short warm sentence — never as a list. Example: "On Thursday I have 10:00 in the morning or 2:00 in the afternoon — which works better for you?" If the day has no morning slots, offer two early/late afternoon options. If the day has fewer than two slots total, offer what exists and suggest an adjacent day.

STEP 3 — Handle pushback gracefully:
If neither option works, ask "What time works best for you on [day]?" When they name a time, check whether it appears in the slots you already have. If it does, confirm it. If not, offer the closest available slot on either side — max 3 specific times in the message. Never dump the full slot list.

STEP 4 — Collect details and book:
Once the visitor confirms a specific time, collect their full name, email address, and a one-sentence description of what they'd like to discuss. Then call create_booking. On success, read back the 8-character booking code in plain text.

HARD RULES — never break these:
- Never call check_availability before asking for a preferred day
- Never present more than 3 specific times in a single message
- Never use bullet points or numbered lists for time options — always inline prose ("10:00 or 2:00")
- Never invent times — only offer slots that came back from check_availability
- When calling check_availability, set fromDate = toDate = the specific date (or at most two adjacent dates for vague inputs like "early next week")

EXAMPLE of the correct flow:
Visitor: "Can I book a meeting?"
Agent: "Of course! Around which day works best for you?"
Visitor: "Thursday"
Agent: [calls check_availability for that Thursday] "On Thursday I have 10:00 in the morning or 2:00 in the afternoon — which works better?"
Visitor: "The morning one"
Agent: "Perfect — could I get your name, email, and a quick sentence on what you'd like to discuss?"
Visitor: "Jane Smith, jane@example.com, I want to discuss the enterprise plan"
Agent: [calls create_booking] "Done! Your booking is confirmed for Thursday at 10:00. Your booking code is ABCD1234 — keep that handy."

CANCELLATION — follow this flow:

When a visitor wants to cancel a booking, ask for their booking code and the email address used when booking (if you don't already have both). Then call cancel_booking. Respond to tool results as follows:

- result "not_found": "I couldn't find a booking with that code. Please double-check the 8-character code from your confirmation email."
- result "email_mismatch": "The email address doesn't match the one used when the booking was made. Please use the same email address."
- result "already_cancelled": "That booking has already been cancelled."
- result "too_late": The booking is within 24 hours. If cancellationContact is provided, say: "Unfortunately, bookings can't be cancelled within 24 hours of the start time. To cancel, please contact [cancellationContact] directly." If cancellationContact is null, say: "Unfortunately, bookings can't be cancelled within 24 hours of the start time. Please contact the organization directly."
- result "success": "Done — your booking [bookingCode] (scheduled for [localTime]) has been cancelled. A confirmation has been sent to your email."`;

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

      if (name === 'cancel_booking') {
        const { bookingCode, email } = args as Record<string, string>;

        const { data: booking } = await supabase
          .from('bookings')
          .select('id, visitor_name, visitor_email, start_at, status')
          .eq('org_id', org.id)
          .eq('booking_code', bookingCode.toUpperCase())
          .maybeSingle();

        if (!booking) {
          return JSON.stringify({ result: 'not_found' });
        }

        if (booking.visitor_email.toLowerCase() !== email.toLowerCase()) {
          return JSON.stringify({ result: 'email_mismatch' });
        }

        if (booking.status === 'cancelled') {
          return JSON.stringify({ result: 'already_cancelled' });
        }

        const hoursUntil = (new Date(booking.start_at).getTime() - Date.now()) / 3_600_000;
        if (hoursUntil < 24) {
          return JSON.stringify({
            result: 'too_late',
            hoursUntil: Math.round(hoursUntil),
            cancellationContact: (org as any).cancellation_contact ?? null,
          });
        }

        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', booking.id);

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
              sendCancellationConfirmationEmail({
                toEmail: booking.visitor_email,
                visitorName: booking.visitor_name,
                orgName: (org as any).name,
                bookingCode: bookingCode.toUpperCase(),
                startAt: booking.start_at,
                timezone: orgTimezone,
              }),
              (adminProfile?.email || process.env.EMAIL_TO)
                ? sendCancellationNotificationEmail({
                    toEmail: adminProfile?.email || process.env.EMAIL_TO!,
                    visitorName: booking.visitor_name,
                    visitorEmail: booking.visitor_email,
                    orgName: (org as any).name,
                    bookingCode: bookingCode.toUpperCase(),
                    startAt: booking.start_at,
                    timezone: orgTimezone,
                  })
                : Promise.resolve(),
            ]);
          } catch (e) {
            console.error('Post-cancellation email error:', e);
          }
        })();

        return JSON.stringify({
          result: 'success',
          visitorName: booking.visitor_name,
          bookingCode: bookingCode.toUpperCase(),
          localTime: new Date(booking.start_at).toLocaleString('en-US', {
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
