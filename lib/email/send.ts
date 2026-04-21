import { Resend } from 'resend';

export async function sendEscalationEmail(params: {
  toEmail: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  conversationSummary: string;
  messages: { role: string; content: string }[];
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const messageHistory = params.messages
    .map((m) => `${m.role === 'user' ? '👤 User' : '🤖 Agent'}: ${m.content}`)
    .join('\n\n');

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Chodex <noreply@chodex.se>',
    to: params.toEmail,
    subject: params.subject,
    html: `
      <h2>New conversation escalation from Chodex</h2>
      <p><strong>From:</strong> ${params.fromName} (${params.fromEmail})</p>
      <p><strong>Summary:</strong> ${params.conversationSummary}</p>
      <hr />
      <h3>Conversation History</h3>
      <pre style="font-family: monospace; background: #f5f5f5; padding: 16px; border-radius: 8px; white-space: pre-wrap;">${messageHistory}</pre>
    `,
  });

  if (error) throw error;
  return data;
}

function formatLocalTime(isoStr: string, timezone: string): string {
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export async function sendBookingConfirmationEmail(params: {
  toEmail: string;
  visitorName: string;
  orgName: string;
  bookingCode: string;
  startAt: string;
  endAt: string;
  description: string;
  timezone: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  if (!process.env.RESEND_API_KEY) return;

  const localTime = formatLocalTime(params.startAt, params.timezone);

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Chodex <noreply@chodex.se>',
    to: params.toEmail,
    subject: `Booking confirmed — ${params.bookingCode}`,
    html: `
      <h2>Your booking is confirmed!</h2>
      <p>Hi ${params.visitorName},</p>
      <p>Your meeting with <strong>${params.orgName}</strong> has been booked.</p>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Booking code</td><td style="font-family:monospace;font-size:20px;font-weight:bold;letter-spacing:2px;">${params.bookingCode}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Time</td><td>${localTime}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Topic</td><td>${params.description}</td></tr>
      </table>
      <p style="color:#666;font-size:14px;">Keep your booking code handy — you may need it to reschedule or cancel.</p>
    `,
  });
}

export async function sendBookingNotificationEmail(params: {
  toEmail: string;
  visitorName: string;
  visitorEmail: string;
  orgName: string;
  bookingCode: string;
  startAt: string;
  endAt: string;
  description: string;
  timezone: string;
}) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  if (!process.env.RESEND_API_KEY) return;

  const localTime = formatLocalTime(params.startAt, params.timezone);

  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'Chodex <noreply@chodex.se>',
    to: params.toEmail,
    subject: `New booking from ${params.visitorName} — ${params.bookingCode}`,
    html: `
      <h2>New booking for ${params.orgName}</h2>
      <table style="border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Visitor</td><td>${params.visitorName} &lt;${params.visitorEmail}&gt;</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Booking code</td><td style="font-family:monospace;">${params.bookingCode}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Time</td><td>${localTime}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Topic</td><td>${params.description}</td></tr>
      </table>
    `,
  });
}
