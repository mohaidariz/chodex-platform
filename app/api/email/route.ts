import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend'
import { isValidEmail } from '@/lib/utils'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const serviceSupabase = createServiceClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    const body = await req.json()
    const { to, subject, html, conversationId } = body

    if (!to || !subject || !html) {
      return NextResponse.json({ error: 'Missing required fields: to, subject, html' }, { status: 400 })
    }

    if (!isValidEmail(to)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    // Get org email settings
    const { data: org } = await serviceSupabase
      .from('organizations')
      .select('email_from, email_reply_to')
      .eq('id', profile.org_id)
      .single()

    // Log first
    const { data: logEntry } = await serviceSupabase
      .from('email_logs')
      .insert({
        org_id: profile.org_id,
        conversation_id: conversationId ?? null,
        to_email: to,
        subject,
        status: 'pending',
      })
      .select('id')
      .single()

    await sendEmail({
      to,
      subject,
      html,
      from: org?.email_from ?? undefined,
      replyTo: org?.email_reply_to ?? undefined,
    })

    if (logEntry) {
      await serviceSupabase
        .from('email_logs')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', logEntry.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email API error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
