'use client';

import { useState } from 'react';
import { Calendar, List, X, Mail, User, Hash } from 'lucide-react';

interface Booking {
  id: string;
  booking_code: string;
  visitor_name: string;
  visitor_email: string;
  description: string;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
}

interface Props {
  bookings: Booking[];
  orgSlug: string;
  orgTimezone: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAL_START_HOUR = 7;
const CAL_END_HOUR = 20;
const SLOT_MINS = 30;
const ROWS = ((CAL_END_HOUR - CAL_START_HOUR) * 60) / SLOT_MINS;

function getWeekDates(weekOffset: number, timezone: string): string[] {
  const now = new Date();
  const localDate = now.toLocaleDateString('en-CA', { timeZone: timezone });
  const d = new Date(`${localDate}T12:00:00Z`);
  const day = d.getUTCDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime() + (toMonday + weekOffset * 7) * 86_400_000);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'UTC' })
  );
}

function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}


function getLocalDateStr(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

function getGridRow(iso: string, tz: string): { start: number; span: number } {
  const d = new Date(iso);
  const h = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d)
  );
  const m = d.getMinutes();
  const slotIndex = Math.floor(((h - CAL_START_HOUR) * 60 + m) / SLOT_MINS);
  return { start: Math.max(slotIndex, 0) + 2, span: 1 };
}

export default function BookingsView({ bookings, orgSlug, orgTimezone }: Props) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [weekOffset, setWeekOffset] = useState(0);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [localBookings, setLocalBookings] = useState<Booking[]>(bookings);

  const now = new Date().toISOString();
  const upcoming = localBookings.filter(
    (b) => b.status === 'confirmed' && b.start_at >= now
  );

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLocalBookings((prev) =>
          prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' as const } : b))
        );
      }
    } finally {
      setCancelling(null);
    }
  }

  // Group upcoming bookings by date
  const grouped: Record<string, Booking[]> = {};
  for (const b of upcoming) {
    const dateKey = getLocalDateStr(b.start_at, orgTimezone);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(b);
  }
  const sortedDates = Object.keys(grouped).sort();

  // Calendar
  const weekDates = getWeekDates(weekOffset, orgTimezone);
  const weekBookings = upcoming.filter((b) =>
    weekDates.includes(getLocalDateStr(b.start_at, orgTimezone))
  );

  const weekLabel = (() => {
    const first = new Date(`${weekDates[0]}T12:00:00Z`);
    const last = new Date(`${weekDates[6]}T12:00:00Z`);
    return `${first.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  })();

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Bookings</h2>
          <p className="text-gray-400 mt-1">
            {upcoming.length} upcoming • Timezone: {orgTimezone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'list'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <List className="w-4 h-4" /> List
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === 'calendar'
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Calendar className="w-4 h-4" /> Week
          </button>
        </div>
      </div>

      {view === 'list' && (
        <>
          {sortedDates.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
              <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 mb-1">No upcoming bookings.</p>
              {orgSlug && (
                <p className="text-gray-500 text-sm">
                  Share your booking link:{' '}
                  <span className="text-indigo-400 font-mono">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/book/{orgSlug}
                  </span>
                </p>
              )}
              <a
                href="/settings/availability"
                className="inline-block mt-4 text-sm text-indigo-400 hover:text-indigo-300"
              >
                Configure availability →
              </a>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => (
                <div key={dateKey}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', {
                      timeZone: orgTimezone,
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </h3>
                  <div className="space-y-2">
                    {grouped[dateKey].map((b) => (
                      <div
                        key={b.id}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start justify-between gap-4"
                      >
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="text-center shrink-0 w-14">
                            <p className="text-lg font-bold text-indigo-400">
                              {fmtTime(b.start_at, orgTimezone)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {fmtTime(b.end_at, orgTimezone)}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="text-sm font-medium text-white truncate">
                                {b.visitor_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mb-1">
                              <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="text-sm text-gray-400 truncate">
                                {b.visitor_email}
                              </span>
                            </div>
                            <p className="text-sm text-gray-300 mt-1 line-clamp-2">
                              {b.description}
                            </p>
                            <div className="flex items-center gap-1.5 mt-2">
                              <Hash className="w-3 h-3 text-gray-500" />
                              <span className="text-xs font-mono text-gray-500">
                                {b.booking_code}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleCancel(b.id)}
                          disabled={cancelling === b.id}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 border border-red-400/20 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                          {cancelling === b.id ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'calendar' && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              ← Prev
            </button>
            <span className="text-sm font-medium text-white">{weekLabel}</span>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              Next →
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-auto">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '52px repeat(7, 1fr)',
                gridTemplateRows: `40px repeat(${ROWS}, 40px)`,
                minWidth: 600,
              }}
            >
              {/* Day headers */}
              <div style={{ gridColumn: 1, gridRow: 1 }} />
              {weekDates.map((dateStr, i) => {
                const d = new Date(`${dateStr}T12:00:00Z`);
                const isToday =
                  d.toLocaleDateString('en-CA', { timeZone: orgTimezone }) ===
                  new Date().toLocaleDateString('en-CA', { timeZone: orgTimezone });
                return (
                  <div
                    key={dateStr}
                    style={{ gridColumn: i + 2, gridRow: 1 }}
                    className={`flex flex-col items-center justify-center border-b border-l border-gray-800 py-2 text-xs font-medium ${
                      isToday ? 'text-indigo-400' : 'text-gray-400'
                    }`}
                  >
                    <span>{DAYS[i]}</span>
                    <span className={`text-sm mt-0.5 ${isToday ? 'font-bold text-indigo-400' : 'text-white'}`}>
                      {d.getUTCDate()}
                    </span>
                  </div>
                );
              })}

              {/* Hour labels */}
              {Array.from({ length: ROWS }, (_, i) => {
                const totalMins = i * SLOT_MINS;
                const hour = CAL_START_HOUR + Math.floor(totalMins / 60);
                const min = totalMins % 60;
                return (
                  <div
                    key={i}
                    style={{ gridColumn: 1, gridRow: i + 2 }}
                    className="flex items-start justify-end pr-2 pt-1 text-xs text-gray-600 border-b border-gray-800/50"
                  >
                    {min === 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                  </div>
                );
              })}

              {/* Background grid cells */}
              {weekDates.map((_, col) =>
                Array.from({ length: ROWS }, (_, row) => (
                  <div
                    key={`${col}-${row}`}
                    style={{ gridColumn: col + 2, gridRow: row + 2 }}
                    className="border-b border-l border-gray-800/40"
                  />
                ))
              )}

              {/* Bookings */}
              {weekBookings.map((b) => {
                const dateStr = getLocalDateStr(b.start_at, orgTimezone);
                const colIndex = weekDates.indexOf(dateStr);
                if (colIndex === -1) return null;
                const { start, span } = getGridRow(b.start_at, orgTimezone);
                return (
                  <div
                    key={b.id}
                    style={{
                      gridColumn: colIndex + 2,
                      gridRow: `${start} / span ${span}`,
                      margin: '2px 3px',
                    }}
                    className="bg-indigo-600/20 border border-indigo-500/40 rounded-md px-2 py-1 overflow-hidden cursor-default"
                    title={`${b.visitor_name} — ${b.description}`}
                  >
                    <p className="text-xs font-medium text-indigo-300 truncate">
                      {fmtTime(b.start_at, orgTimezone)}
                    </p>
                    <p className="text-xs text-indigo-200/70 truncate">{b.visitor_name}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
