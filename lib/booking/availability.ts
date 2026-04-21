import { createServiceRoleClient } from '@/lib/supabase/server';

export interface DaySlots {
  date: string;
  dayLabel: string;
  slots: Array<{ startAt: string; endAt: string }>;
}

function getUTCOffset(utcDate: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(utcDate);

  const v: Record<string, number> = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') v[p.type] = Number(p.value);
  });

  const localAsUTC = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return localAsUTC - utcDate.getTime();
}

export function localToUTC(dateStr: string, timeStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);

  // Two-iteration offset correction handles DST transitions correctly
  const offset1 = getUTCOffset(new Date(target), timezone);
  const utc1 = new Date(target - offset1);
  const offset2 = getUTCOffset(utc1, timezone);
  return new Date(target - offset2);
}

export async function getAvailableSlots(
  orgId: string,
  fromDate: string,
  toDate: string
): Promise<DaySlots[]> {
  const supabase = createServiceRoleClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('timezone, slot_duration_minutes')
    .eq('id', orgId)
    .single();

  const timezone: string = (org as any)?.timezone ?? 'Europe/Stockholm';
  const slotDuration: number = (org as any)?.slot_duration_minutes ?? 30;

  const { data: rules } = await supabase
    .from('availability_rules')
    .select('day_of_week, start_time, end_time')
    .eq('org_id', orgId);

  if (!rules?.length) return [];

  const rulesMap: Record<number, { startTime: string; endTime: string }> = {};
  for (const r of rules) {
    rulesMap[r.day_of_week] = {
      startTime: r.start_time.slice(0, 5),
      endTime: r.end_time.slice(0, 5),
    };
  }

  const rangeStart = localToUTC(fromDate, '00:00', timezone);
  const rangeEnd = localToUTC(toDate, '23:59', timezone);

  const [{ data: blackouts }, { data: existingBookings }] = await Promise.all([
    supabase
      .from('availability_blackouts')
      .select('start_at, end_at')
      .eq('org_id', orgId)
      .lte('start_at', rangeEnd.toISOString())
      .gte('end_at', rangeStart.toISOString()),
    supabase
      .from('bookings')
      .select('start_at, end_at')
      .eq('org_id', orgId)
      .eq('status', 'confirmed')
      .gte('start_at', rangeStart.toISOString())
      .lte('start_at', rangeEnd.toISOString()),
  ]);

  const blockedRanges = [
    ...(blackouts || []).map((b) => ({ start: new Date(b.start_at), end: new Date(b.end_at) })),
    ...(existingBookings || []).map((b) => ({
      start: new Date(b.start_at),
      end: new Date(b.end_at),
    })),
  ];

  function isBlocked(slotStart: Date, slotEnd: Date): boolean {
    return blockedRanges.some((r) => r.start < slotEnd && r.end > slotStart);
  }

  const results: DaySlots[] = [];
  const now = new Date();
  const bufferMs = 15 * 60 * 1000;

  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  // Use noon UTC as base to safely handle any timezone offset during day iteration
  const startUTC = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const endUTC = Date.UTC(ty, tm - 1, td, 12, 0, 0);

  for (let dayMs = startUTC; dayMs <= endUTC; dayMs += 86_400_000) {
    const dayDate = new Date(dayMs);
    const dateStr = dayDate.toLocaleDateString('en-CA', { timeZone: timezone });
    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay();

    const rule = rulesMap[dayOfWeek];
    if (!rule) continue;

    const slots: Array<{ startAt: string; endAt: string }> = [];
    let cursor = localToUTC(dateStr, rule.startTime, timezone);
    const dayEnd = localToUTC(dateStr, rule.endTime, timezone);

    while (cursor < dayEnd) {
      const slotEnd = new Date(cursor.getTime() + slotDuration * 60_000);
      if (slotEnd > dayEnd) break;

      if (cursor.getTime() > now.getTime() + bufferMs && !isBlocked(cursor, slotEnd)) {
        slots.push({ startAt: cursor.toISOString(), endAt: slotEnd.toISOString() });
      }

      cursor = slotEnd;
    }

    if (slots.length > 0) {
      const dayLabel = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-US', {
        timeZone: timezone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      results.push({ date: dateStr, dayLabel, slots });
    }
  }

  return results;
}
