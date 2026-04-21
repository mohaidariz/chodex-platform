import { NextRequest, NextResponse } from 'next/server';
import { createBooking } from '@/lib/booking/create';
import { sendBookingConfirmationEmail, sendBookingNotificationEmail } from '@/lib/email/send';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orgSlug, name, email, description, startAt } = body;

    if (!orgSlug || !name || !email || !description || !startAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (description.length > 200) {
      return NextResponse.json({ error: 'Description must be 200 characters or less' }, { status: 400 });
    }

    const result = await createBooking({ orgSlug, visitorName: name, visitorEmail: email, description, startAt });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    // Send emails — log failures but don't fail the booking
    try {
      const supabase = createServiceRoleClient();
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, timezone')
        .eq('slug', orgSlug)
        .single();

      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('org_id', (org as any)?.id)
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();

      const timezone = (org as any)?.timezone ?? 'Europe/Stockholm';

      await Promise.all([
        sendBookingConfirmationEmail({
          toEmail: email,
          visitorName: name,
          orgName: result.orgName,
          bookingCode: result.bookingCode,
          startAt: result.startAt,
          endAt: result.endAt,
          description,
          timezone,
        }),
        (adminProfile?.email || process.env.EMAIL_TO)
          ? sendBookingNotificationEmail({
              toEmail: adminProfile?.email || process.env.EMAIL_TO!,
              visitorName: name,
              visitorEmail: email,
              orgName: result.orgName,
              bookingCode: result.bookingCode,
              startAt: result.startAt,
              endAt: result.endAt,
              description,
              timezone,
            })
          : Promise.resolve(),
      ]);
    } catch (emailErr) {
      console.error('Booking email send failed:', emailErr);
    }

    return NextResponse.json({
      bookingCode: result.bookingCode,
      startAt: result.startAt,
      endAt: result.endAt,
    });
  } catch (error: any) {
    console.error('Booking creation error:', error);
    return NextResponse.json({ error: error.message || 'Booking failed' }, { status: 500 });
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
