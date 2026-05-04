'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Plus, X, Copy, Check, MoreVertical, ExternalLink,
  Calendar, Settings, Loader2, FileText, MessageSquare,
  CalendarDays, Zap,
} from 'lucide-react';

export interface OrgWithMetrics {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  docCount: number;
  monthConvCount: number;
  monthBookingCount: number;
  monthAgentCalls: number;
}

interface TotalStats {
  totalOrgs: number;
  totalConversations: number;
  totalBookings: number;
  totalDocuments: number;
}

interface Props {
  initialOrgs: OrgWithMetrics[];
  stats: TotalStats;
  userEmail: string;
}

const EMBED_BASE = 'https://chodex-platform.vercel.app';

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
      <p className="text-3xl font-bold text-[#00C0FF] tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function MetricPill({ icon: Icon, value, label }: { icon: React.ElementType; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <Icon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
      <span className="text-sm font-semibold text-white tabular-nums">{value}</span>
      <span className="text-[10px] text-gray-600 leading-none whitespace-nowrap">{label}</span>
    </div>
  );
}

export default function AdminView({ initialOrgs, stats, userEmail }: Props) {
  const [orgs, setOrgs] = useState<(OrgWithMetrics & { isNew?: boolean })[]>(initialOrgs);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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
    validateSlug(slug, name);
  }

  function handleSlugChange(raw: string) {
    const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setForm((f) => ({ ...f, slug }));
    validateSlug(slug, form.name);
  }

  function validateSlug(slug: string, name: string) {
    if (!slug && !name) { setSlugError(''); return; }
    if (!slug) { setSlugError('Slug is required'); return; }
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
        body: JSON.stringify({ name: form.name.trim(), slug: form.slug, notificationEmail: form.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.toLowerCase().includes('slug')) setSlugError(data.error);
        else setCreateError(data.error || 'Failed to create organization');
        return;
      }
      const newOrg: OrgWithMetrics & { isNew: boolean } = {
        id: data.org.id,
        name: data.org.name,
        slug: data.org.slug,
        created_at: data.org.created_at,
        docCount: 0,
        monthConvCount: 0,
        monthBookingCount: 0,
        monthAgentCalls: 0,
        isNew: true,
      };
      setOrgs((prev) => [newOrg, ...prev]);
      closeModal();
    } catch {
      setCreateError('Network error — please try again.');
    } finally {
      setCreating(false);
    }
  }

  function copyEmbed(slug: string) {
    const snippet = `<iframe src="${EMBED_BASE}/chatbot/${slug}"\n        style="position:fixed; bottom:20px; right:20px; width:400px; height:600px; border:none; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,0.3); z-index:9999;"\n        allow="microphone"></iframe>`;
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2500);
    });
  }

  return (
    <div className="p-8 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">All Organizations</h1>
          <p className="text-gray-500 text-sm mt-0.5">{orgs.length} org{orgs.length !== 1 ? 's' : ''} on this platform</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[#0A0A0A] bg-[#00C0FF] hover:bg-[#007BFF] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Organization
        </button>
      </div>

      {/* Total stats */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-px mb-8 rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      >
        {[
          { value: stats.totalOrgs, label: 'Total orgs' },
          { value: stats.totalConversations, label: 'Conversations' },
          { value: stats.totalBookings, label: 'Bookings' },
          { value: stats.totalDocuments, label: 'Documents' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 py-6 px-4">
            <Stat value={s.value} label={s.label} />
          </div>
        ))}
      </div>

      {/* Org card grid */}
      {orgs.length === 0 ? (
        <div className="text-center py-20 text-gray-600">
          <p className="text-lg">No organizations yet.</p>
          <p className="text-sm mt-1">Click &quot;New Organization&quot; to add the first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orgs.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              isNew={org.isNew}
              copiedSlug={copiedSlug}
              openMenuId={openMenuId}
              onCopyEmbed={copyEmbed}
              onToggleMenu={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
              onCloseMenu={() => setOpenMenuId(null)}
            />
          ))}
        </div>
      )}

      {/* Overlay to close menus */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* New org modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-white">New Organization</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300 transition-colors">
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
                  placeholder="Acme Corp"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00C0FF] focus:ring-2 focus:ring-[#00C0FF]/20 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Slug <span className="text-gray-600 font-normal">(URL identifier)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 text-sm select-none">
                    /chatbot/
                  </span>
                  <input
                    type="text"
                    required
                    value={form.slug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="acme-corp"
                    className={`w-full bg-gray-800 border rounded-xl pl-[88px] pr-4 py-2.5 text-white text-sm font-mono placeholder-gray-600 focus:outline-none transition focus:ring-2 ${
                      slugError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-gray-700 focus:border-[#00C0FF] focus:ring-[#00C0FF]/20'
                    }`}
                  />
                </div>
                {slugError && <p className="text-xs text-red-400 mt-1">{slugError}</p>}
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
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00C0FF] focus:ring-2 focus:ring-[#00C0FF]/20 transition"
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
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-[#0A0A0A] bg-[#00C0FF] hover:bg-[#007BFF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Creating…' : 'Create Organization'}
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

function OrgCard({
  org,
  isNew,
  copiedSlug,
  openMenuId,
  onCopyEmbed,
  onToggleMenu,
  onCloseMenu,
}: {
  org: OrgWithMetrics;
  isNew?: boolean;
  copiedSlug: string | null;
  openMenuId: string | null;
  onCopyEmbed: (slug: string) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
}) {
  const isCopied = copiedSlug === org.slug;
  const menuOpen = openMenuId === org.id;

  return (
    <div
      className="rounded-2xl flex flex-col overflow-hidden transition-all"
      style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.07)',
        animation: isNew ? 'fadeSlideIn 0.3s ease-out' : undefined,
      }}
    >
      {/* Card body */}
      <div className="p-5 flex-1">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white truncate">{org.name}</h3>
            <p className="text-xs font-mono text-gray-500 mt-0.5 truncate">{org.slug}</p>
          </div>
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            active
          </span>
        </div>

        {/* Metrics row */}
        <div
          className="grid grid-cols-4 gap-2 mt-4 pt-4"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <MetricPill icon={FileText} value={org.docCount} label="docs" />
          <MetricPill icon={MessageSquare} value={org.monthConvCount} label="convs/mo" />
          <MetricPill icon={CalendarDays} value={org.monthBookingCount} label="book/mo" />
          <MetricPill icon={Zap} value={org.monthAgentCalls} label="calls/mo" />
        </div>
      </div>

      {/* Card footer */}
      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => onCopyEmbed(org.slug)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all border ${
            isCopied
              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
              : 'text-gray-400 border-gray-700 hover:text-white hover:border-gray-600 hover:bg-gray-800'
          }`}
        >
          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {isCopied ? 'Copied!' : 'Copy embed'}
        </button>

        {/* Three-dot menu */}
        <div className="relative z-20">
          <button
            onClick={() => onToggleMenu(org.id)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 bottom-10 w-48 rounded-xl py-1 shadow-xl z-20"
              style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <a
                href={`/chatbot/${org.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCloseMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                Open chat widget
              </a>
              <a
                href={`/book/${org.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCloseMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                Open booking page
              </a>
              <Link
                href="/bookings"
                onClick={onCloseMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <CalendarDays className="w-3.5 h-3.5 text-gray-500" />
                View bookings
              </Link>
              <Link
                href="/settings/availability"
                onClick={onCloseMenu}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-gray-500" />
                Edit settings
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
