'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Plus, X, Loader2, Map as MapIcon, CheckCircle, FileText,
} from 'lucide-react';

export interface OrgWithMetrics {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  mapCount: number;
  readyMapCount: number;
  featureCount: number;
}

interface TotalStats {
  totalOrgs: number;
  totalMaps: number;
  totalFeatures: number;
}

interface Props {
  initialOrgs: OrgWithMetrics[];
  stats: TotalStats;
  userEmail: string;
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-indigo-400 tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function MetricPill({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <Icon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
      <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
      <span className="text-[10px] text-gray-600 leading-none whitespace-nowrap">{label}</span>
    </div>
  );
}

export default function AdminView({ initialOrgs, stats, userEmail }: Props) {
  const [orgs, setOrgs] = useState<OrgWithMetrics[]>(initialOrgs);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', email: userEmail });
  const [slugError, setSlugError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showModal) setTimeout(() => nameRef.current?.focus(), 50);
  }, [showModal]);

  function handleNameChange(name: string) {
    const slug = nameToSlug(name);
    setForm((f) => ({ ...f, name, slug }));
    validateSlug(slug);
  }

  function handleSlugChange(raw: string) {
    const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm((f) => ({ ...f, slug }));
    validateSlug(slug);
  }

  function validateSlug(slug: string) {
    if (!slug) {
      setSlugError('');
      return;
    }
    if (orgs.some((o) => o.slug === slug)) {
      setSlugError('Slug already taken');
    } else {
      setSlugError('');
    }
  }

  function openModal() {
    setForm({ name: '', slug: '', email: userEmail });
    setSlugError('');
    setCreateError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (slugError || !form.name.trim() || !form.slug) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug,
          notificationEmail: form.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.toLowerCase().includes('slug')) setSlugError(data.error);
        else setCreateError(data.error || 'Failed to create organization');
        return;
      }
      const newOrg: OrgWithMetrics = {
        id: data.org.id,
        name: data.org.name,
        slug: data.org.slug,
        created_at: data.org.created_at,
        mapCount: 0,
        readyMapCount: 0,
        featureCount: 0,
      };
      setOrgs((prev) => [newOrg, ...prev]);
      closeModal();
    } catch {
      setCreateError('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">All organizations</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {orgs.length} org{orgs.length !== 1 ? 's' : ''} on this platform
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          New organization
        </button>
      </div>

      {/* Total stats */}
      <div className="grid grid-cols-3 gap-px mb-8 rounded-2xl overflow-hidden bg-white/[0.06]">
        {[
          { value: stats.totalOrgs, label: 'Total orgs' },
          { value: stats.totalMaps, label: 'Total maps' },
          { value: stats.totalFeatures, label: 'Total features' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 py-6 px-4">
            <Stat value={s.value} label={s.label} />
          </div>
        ))}
      </div>

      {/* Org cards */}
      {orgs.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg">No organizations yet.</p>
          <p className="text-sm mt-1">Click &ldquo;New organization&rdquo; to add the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="rounded-2xl p-5 bg-gray-900 border border-white/[0.07]"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white truncate">
                    {org.name}
                  </h3>
                  <p className="text-xs font-mono text-gray-500 mt-0.5 truncate">
                    {org.slug}
                  </p>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  active
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                <MetricPill icon={MapIcon} value={org.mapCount} label="maps" />
                <MetricPill icon={CheckCircle} value={org.readyMapCount} label="ready" />
                <MetricPill icon={FileText} value={org.featureCount} label="features" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New org modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-md rounded-2xl p-6 bg-gray-900 border border-white/[0.08]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-white">New organization</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Organization name
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="E Karlströms AB"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Slug{' '}
                  <span className="text-gray-600 font-normal">(URL identifier)</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="e-karlstroms"
                  className={`w-full bg-gray-800 border rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none transition focus:ring-2 ${
                    slugError
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                      : 'border-gray-700 focus:border-indigo-500 focus:ring-indigo-500/20'
                  }`}
                />
                {slugError && (
                  <p className="text-xs text-red-400 mt-1">{slugError}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Notification email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="admin@example.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {createError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating || !!slugError || !form.name.trim() || !form.slug}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {creating ? 'Creating…' : 'Create organization'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
