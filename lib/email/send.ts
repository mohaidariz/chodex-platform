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
