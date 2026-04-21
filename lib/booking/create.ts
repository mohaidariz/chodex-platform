import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateBookingCode } from './codes';
import { getAvailableSlots } from './availability';

export interface BookingInput {
  orgSlug: string;
  visitorName: string;
  visitorEmail: string;
  description: string;
  startAt: string;
}

export type BookingResult =
  | { success: true; bookingCode: string; startAt: string; endAt: string; orgName: string; orgTimezone: string }
  | { success: false; error: string };

export async function createBooking(input: BookingInput): Promise<BookingResult> {
  const supabase = createServiceRoleClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, timezone, slot_duration_minutes')
    .eq('slug', input.orgSlug)
    .single();

  if (!org) return { success: false, error: 'Organization not found' };

  const slotDuration: number = (org as any).slot_duration_minutes ?? 30;
  const timezone: string = (org as any).timezone ?? 'Europe/Stockholm';
  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + slotDuration * 60_000);

  // Validate the requested slot is within available windows
  const dateStr = startAt.toLocaleDateString('en-CA', { timeZone: timezone });
  const available = await getAvailableSlots(org.id, dateStr, dateStr);
  const slotValid = available.some((day) =>
    day.slots.some((s) => new Date(s.startAt).getTime() === startAt.getTime())
  );

  if (!slotValid) {
    return {
      success: false,
      error: 'That time slot is not available. Please choose another time.',
    };
  }

  // Generate unique booking code — retry up to 5× on collision
  let bookingCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateBookingCode();
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('org_id', org.id)
      .eq('booking_code', code)
      .maybeSingle();

    if (!existing) {
      bookingCode = code;
      break;
    }
  }

  if (!bookingCode) {
    return { success: false, error: 'Failed to generate booking code. Please try again.' };
  }

  // Atomic insert via SECURITY DEFINER function (prevents double-booking)
  const { data: result, error } = await supabase.rpc('create_booking_atomic', {
    p_org_id: org.id,
    p_visitor_name: input.visitorName,
    p_visitor_email: input.visitorEmail,
    p_description: input.description,
    p_start_at: startAt.toISOString(),
    p_end_at: endAt.toISOString(),
    p_booking_code: bookingCode,
  });

  if (error) return { success: false, error: 'Booking failed. Please try again.' };
  if ((result as any)?.error) {
    return { success: false, error: (result as any).reason || 'Slot conflict. Please choose another time.' };
  }

  return {
    success: true,
    bookingCode,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    orgName: (org as any).name,
    orgTimezone: timezone,
  };
}
