import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<{ id: string }> {
  const { data, error } = await resend.emails.send({
    from: options.from ?? process.env.EMAIL_FROM ?? 'noreply@chodex.se',
    to: options.to,
    subject: options.subject,
    html: options.html,
    reply_to: options.replyTo,
  })

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`)
  }

  return { id: data!.id }
}

export function buildConversationSummaryEmail(
  orgName: string,
  visitorEmail: string,
  messages: Array<{ role: string; content: string }>,
  appUrl: string
): string {
  const conversationHtml = messages
    .map(
      (m) => `
      <tr>
        <td style="padding: 8px 12px; background: ${m.role === 'user' ? '#f0f4ff' : '#f9fafb'}; border-radius: 6px; margin-bottom: 8px; display: block;">
          <strong style="color: ${m.role === 'user' ? '#1d4ed8' : '#374151'}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">${m.role === 'user' ? 'You' : orgName + ' AI'}</strong>
          <p style="margin: 4px 0 0; color: #374151; font-size: 14px; line-height: 1.5;">${m.content}</p>
        </td>
      </tr>
    `
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

    <div style="background: #1d4ed8; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Chodex AI Assistant</h1>
      <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">Conversation Summary from ${orgName}</p>
    </div>

    <div style="padding: 32px;">
      <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">
        Hi there! Here's a summary of your recent conversation with our AI assistant.
      </p>

      <h2 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 16px;">Conversation</h2>

      <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
        ${conversationHtml}
      </table>

      <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 13px; margin: 0;">
          This email was sent by ${orgName} via <a href="${appUrl}" style="color: #1d4ed8;">Chodex</a>.
          If you have more questions, simply start a new conversation.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `
}
