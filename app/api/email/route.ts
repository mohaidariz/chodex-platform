import { NextRequest, NextResponse } from 'next/server';
import { sendEscalationEmail } from '@/lib/email/send';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await sendEscalationEmail({
      toEmail: process.env.EMAIL_TO || 'mohammed.a.haidari@gmail.com',
      fromName: name,
      fromEmail: email,
      subject: `Chodex: Message from ${name}`,
      conversationSummary: message,
      messages: [{ role: 'user', content: message }],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
