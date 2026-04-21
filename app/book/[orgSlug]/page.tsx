'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, Clock, CheckCircle, Loader2, ChevronLeft, Bot } from 'lucide-react';

interface Slot {
  startAt: string;
  endAt: string;
}

interface DaySlots {
  date: string;
  dayLabel: string;
  slots: Slot[];
}

type Step = 'dates' | 'slots' | 'form' | 'confirm';

function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function BookingPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const [step, setStep] = useState<Step>('dates');
  const [daySlots, setDaySlots] = useState<DaySlots[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DaySlots | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [orgTimezone, setOrgTimezone] = useState('Europe/Stockholm');
  const [orgName, setOrgName] = useState('');
  const [form, setForm] = useState({ name: '', email: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [bookingCode, setBookingCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 13);
    const toStr = to.toISOString().slice(0, 10);

    fetch(`/api/bookings/availability?orgSlug=${orgSlug}&from=${today}&to=${toStr}`)
      .then((r) => r.json())
      .then((data) => {
        setDaySlots(data.slots || []);
        if (data.timezone) setOrgTimezone(data.timezone);
        if (data.orgName) setOrgName(data.orgName);
      })
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  }, [orgSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgSlug,
          name: form.name,
          email: form.email,
          description: form.description,
          startAt: selectedSlot.startAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Booking failed. Please try again.');
        return;
      }
      setBookingCode(data.bookingCode);
      setStep('confirm');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <style>{`
        html, body { background: #0A0A0A !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background-color: #2a2a2a; border-radius: 4px; }
      `}</style>

      <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0] flex flex-col items-center px-4 py-12">
        {/* Header */}
        <div className="w-full max-w-lg mb-8 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(0,192,255,0.12)', boxShadow: '0 0 20px rgba(0,192,255,0.15)' }}
          >
            <Bot className="w-6 h-6 text-[#00C0FF]" />
          </div>
          <h1 className="text-2xl font-bold text-[#E0E0E0]">
            {orgName ? `Book a meeting with ${orgName}` : 'Book a meeting'}
          </h1>
          <p className="text-[#A0A0A0] text-sm mt-2">
            {step === 'dates' && 'Choose a date'}
            {step === 'slots' && 'Choose a time slot'}
            {step === 'form' && 'Fill in your details'}
            {step === 'confirm' && 'You\'re all set!'}
          </p>
        </div>

        <div
          className="w-full max-w-lg rounded-2xl p-6"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Step: pick a date */}
          {step === 'dates' && (
            <>
              {loadingSlots ? (
                <div className="flex items-center justify-center py-12 gap-2 text-[#A0A0A0]">
                  <Loader2 className="w-5 h-5 animate-spin text-[#00C0FF]" />
                  Loading availability…
                </div>
              ) : daySlots.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarDays className="w-10 h-10 text-[#444] mx-auto mb-3" />
                  <p className="text-[#A0A0A0]">No available slots in the next 14 days.</p>
                  <p className="text-[#707070] text-sm mt-1">Please check back later.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {daySlots.map((day) => (
                    <button
                      key={day.date}
                      onClick={() => {
                        setSelectedDay(day);
                        setStep('slots');
                      }}
                      className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-medium transition-colors text-[#E0E0E0] hover:border-[#00C0FF]"
                      style={{
                        background: '#1A1A1A',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = '#00C0FF';
                        (e.currentTarget as HTMLElement).style.background = 'rgba(0,192,255,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                        (e.currentTarget as HTMLElement).style.background = '#1A1A1A';
                      }}
                    >
                      <span>{day.dayLabel}</span>
                      <span className="text-[#A0A0A0] text-xs">
                        {day.slots.length} slot{day.slots.length !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step: pick a slot */}
          {step === 'slots' && selectedDay && (
            <>
              <button
                onClick={() => setStep('dates')}
                className="flex items-center gap-1 text-sm text-[#A0A0A0] hover:text-[#E0E0E0] mb-4 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <p className="text-sm font-semibold text-[#E0E0E0] mb-3">{selectedDay.dayLabel}</p>
              <div className="grid grid-cols-3 gap-2">
                {selectedDay.slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setStep('form');
                    }}
                    className="px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{
                      background: '#1A1A1A',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#E0E0E0',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#00C0FF';
                      (e.currentTarget as HTMLElement).style.color = '#00C0FF';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
                      (e.currentTarget as HTMLElement).style.color = '#E0E0E0';
                    }}
                  >
                    {fmtTime(slot.startAt, orgTimezone)}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step: form */}
          {step === 'form' && selectedSlot && selectedDay && (
            <>
              <button
                onClick={() => setStep('slots')}
                className="flex items-center gap-1 text-sm text-[#A0A0A0] hover:text-[#E0E0E0] mb-4 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>

              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-5 text-sm"
                style={{ background: 'rgba(0,192,255,0.08)', border: '1px solid rgba(0,192,255,0.2)' }}
              >
                <Clock className="w-4 h-4 text-[#00C0FF] shrink-0" />
                <span className="text-[#00C0FF] font-medium">
                  {selectedDay.dayLabel} at {fmtTime(selectedSlot.startAt, orgTimezone)}
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs text-[#A0A0A0] mb-1.5">Your name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-[#E0E0E0] placeholder-[#505050] focus:outline-none transition"
                    style={{
                      background: '#0A0A0A',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#00C0FF';
                    }}
                    onBlur={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A0A0A0] mb-1.5">Email *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@example.com"
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-[#E0E0E0] placeholder-[#505050] focus:outline-none transition"
                    style={{
                      background: '#0A0A0A',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#00C0FF';
                    }}
                    onBlur={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#A0A0A0] mb-1.5">
                    What would you like to discuss? * (max 200 chars)
                  </label>
                  <textarea
                    required
                    maxLength={200}
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="A brief sentence about your topic…"
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-[#E0E0E0] placeholder-[#505050] focus:outline-none transition resize-none"
                    style={{
                      background: '#0A0A0A',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                    onFocus={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#00C0FF';
                    }}
                    onBlur={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  />
                  <p className="text-right text-xs text-[#505050] mt-0.5">
                    {form.description.length}/200
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{
                    background: submitting ? 'rgba(0,192,255,0.3)' : '#00C0FF',
                    color: '#0A0A0A',
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Confirming…
                    </>
                  ) : (
                    'Confirm booking'
                  )}
                </button>
              </form>
            </>
          )}

          {/* Step: confirmation */}
          {step === 'confirm' && bookingCode && selectedSlot && selectedDay && (
            <div className="text-center py-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{
                  background: 'rgba(0,192,255,0.12)',
                  boxShadow: '0 0 24px rgba(0,192,255,0.2)',
                }}
              >
                <CheckCircle className="w-7 h-7 text-[#00C0FF]" />
              </div>
              <h2 className="text-xl font-bold text-[#E0E0E0] mb-1">Booking confirmed!</h2>
              <p className="text-[#A0A0A0] text-sm mb-6">
                {selectedDay.dayLabel} at {fmtTime(selectedSlot.startAt, orgTimezone)}
              </p>

              <div
                className="rounded-2xl px-6 py-5 mb-6"
                style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p className="text-xs text-[#707070] mb-2 uppercase tracking-wider">Booking code</p>
                <p
                  className="text-3xl font-bold tracking-widest"
                  style={{ color: '#00C0FF', fontFamily: 'monospace' }}
                >
                  {bookingCode}
                </p>
                <p className="text-xs text-[#707070] mt-3">
                  Save this code — you may need it to reference your booking.
                </p>
              </div>

              <p className="text-sm text-[#A0A0A0]">
                A confirmation email has been sent to{' '}
                <span className="text-[#E0E0E0]">{form.email}</span>.
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-[#505050] text-xs">Powered by Chodex</p>
      </div>
    </>
  );
}
