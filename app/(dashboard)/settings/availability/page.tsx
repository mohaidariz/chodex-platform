'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const TIMEZONES = [
  'Europe/Stockholm',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Copenhagen',
  'Europe/Oslo',
  'Europe/Helsinki',
  'Europe/Zurich',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Prague',
  'Europe/Budapest',
  'Europe/Bucharest',
  'Europe/Athens',
  'Europe/Istanbul',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'America/Bogota',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Jakarta',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Perth',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'UTC',
];

interface RuleState {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface BlackoutState {
  id?: string;
  startAt: string;
  endAt: string;
  reason: string;
}

const defaultRules = (): RuleState[] =>
  DAYS.map((_, i) => ({
    dayOfWeek: i,
    enabled: i >= 1 && i <= 5,
    startTime: '09:00',
    endTime: '17:00',
  }));

export default function AvailabilityPage() {
  const [timezone, setTimezone] = useState('Europe/Stockholm');
  const [slotDuration, setSlotDuration] = useState(30);
  const [rules, setRules] = useState<RuleState[]>(defaultRules());
  const [blackouts, setBlackouts] = useState<BlackoutState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings/availability')
      .then((r) => r.json())
      .then((data) => {
        setTimezone(data.timezone ?? 'Europe/Stockholm');
        setSlotDuration(data.slotDuration ?? 30);

        const loaded = defaultRules();
        for (const r of data.rules ?? []) {
          const idx = loaded.findIndex((d) => d.dayOfWeek === r.dayOfWeek);
          if (idx !== -1) {
            loaded[idx] = {
              ...loaded[idx],
              enabled: true,
              startTime: r.startTime?.slice(0, 5) ?? '09:00',
              endTime: r.endTime?.slice(0, 5) ?? '17:00',
            };
          }
        }
        setRules(loaded);

        setBlackouts(
          (data.blackouts ?? []).map((b: any) => ({
            id: b.id,
            startAt: b.startAt ? new Date(b.startAt).toISOString().slice(0, 16) : '',
            endAt: b.endAt ? new Date(b.endAt).toISOString().slice(0, 16) : '',
            reason: b.reason ?? '',
          }))
        );
      })
      .finally(() => setLoading(false));
  }, []);

  function updateRule(dayOfWeek: number, patch: Partial<RuleState>) {
    setRules((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r)));
  }

  function addBlackout() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const start = now.toISOString().slice(0, 16);
    const end = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 16);
    setBlackouts((prev) => [...prev, { startAt: start, endAt: end, reason: '' }]);
  }

  function updateBlackout(index: number, patch: Partial<BlackoutState>) {
    setBlackouts((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeBlackout(index: number) {
    setBlackouts((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, slotDuration, rules, blackouts }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Availability</h2>
        <p className="text-gray-400 mt-1">Configure when visitors can book meetings with you</p>
      </div>

      <div className="space-y-6">
        {/* Timezone + slot duration */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-5">
            General
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Slot duration</label>
              <div className="flex gap-2">
                {[15, 30, 60].map((d) => (
                  <button
                    key={d}
                    onClick={() => setSlotDuration(d)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      slotDuration === d
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Weekly schedule */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-5">
            Weekly Schedule
          </h3>
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.dayOfWeek} className="flex items-center gap-3">
                <div className="w-24 shrink-0">
                  <span className="text-sm text-gray-300">{DAYS[rule.dayOfWeek]}</span>
                </div>
                <button
                  onClick={() => updateRule(rule.dayOfWeek, { enabled: !rule.enabled })}
                  className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${
                    rule.enabled ? 'bg-indigo-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      rule.enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
                {rule.enabled ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={rule.startTime}
                      onChange={(e) => updateRule(rule.dayOfWeek, { startTime: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-gray-500 text-sm">–</span>
                    <input
                      type="time"
                      value={rule.endTime}
                      onChange={(e) => updateRule(rule.dayOfWeek, { endTime: e.target.value })}
                      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-gray-600">Closed</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Blackouts */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
              Blackout periods
            </h3>
            <button
              onClick={addBlackout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 border border-indigo-400/20 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add blackout
            </button>
          </div>
          {blackouts.length === 0 ? (
            <p className="text-sm text-gray-600">No blackout periods set.</p>
          ) : (
            <div className="space-y-3">
              {blackouts.map((bo, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-gray-800/50 rounded-xl">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">From</label>
                        <input
                          type="datetime-local"
                          value={bo.startAt}
                          onChange={(e) => updateBlackout(i, { startAt: e.target.value })}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">To</label>
                        <input
                          type="datetime-local"
                          value={bo.endAt}
                          onChange={(e) => updateBlackout(i, { endAt: e.target.value })}
                          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={bo.reason}
                      onChange={(e) => updateBlackout(i, { reason: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => removeBlackout(i)}
                    className="p-1.5 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-colors shrink-0 mt-4"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            Times are stored in UTC. Enter times in your browser's local timezone.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
          </button>
          {saved && (
            <span className="text-sm text-green-400">Settings saved successfully.</span>
          )}
        </div>
      </div>
    </div>
  );
}
