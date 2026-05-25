'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Map as MapIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Search,
  X,
  ChevronRight,
  Pin,
  PinOff,
  Trash2,
  Square,
  CheckSquare,
} from 'lucide-react';
import type { FieldMap } from '@/types';

const statusStyle: Record<FieldMap['status'], string> = {
  uploading: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  extracting: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  ready: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-300 border-red-500/20',
};

const statusLabel: Record<FieldMap['status'], string> = {
  uploading: 'Uploading',
  extracting: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<FieldMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch('/api/maps');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (!filter) return true;
      const f = filter.toLowerCase();
      return (
        p.name.toLowerCase().includes(f) ||
        (p.project_code ?? '').toLowerCase().includes(f)
      );
    });
  }, [projects, filter]);

  async function togglePin(project: FieldMap) {
    const wasPinned = !!project.pinned_at;
    // Optimistic update — flip locally so the row reflows immediately.
    setProjects((prev) =>
      prev
        .map((p) =>
          p.id === project.id
            ? { ...p, pinned_at: wasPinned ? null : new Date().toISOString() }
            : p,
        )
        .sort((a, b) => {
          // Pinned first (most recently pinned at top), then created desc.
          if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
          if (a.pinned_at && b.pinned_at) {
            return new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime();
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
    );
    try {
      await fetch(`/api/maps/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !wasPinned }),
      });
    } catch {
      // Revert on failure
      fetchProjects();
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.id)));
    }
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function askDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setConfirmDelete({
      ids,
      label: `${ids.length} project${ids.length === 1 ? '' : 's'}`,
    });
  }

  function askDeleteOne(p: FieldMap) {
    setConfirmDelete({ ids: [p.id], label: `'${p.name}'` });
  }

  async function executeDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const ids = confirmDelete.ids;
      await Promise.all(
        ids.map((id) => fetch(`/api/maps/${id}`, { method: 'DELETE' })),
      );
      const deletedSet = new Set(ids);
      setProjects((prev) => prev.filter((p) => !deletedSet.has(p.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  }

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="min-h-full">
      {/* Page header */}
      <div className="border-b border-gray-800/60 bg-gray-950/40 backdrop-blur sticky top-0 z-10">
        <div className="px-8 py-6 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Projects
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every utility project your crew is working on. Open one to edit
              the map, or hand a project to the field crew on iPad.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New project
          </button>
        </div>

        {/* Search row */}
        <div className="px-8 pb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by name or project code…"
              className="w-full bg-gray-900/60 border border-gray-800 rounded-xl pl-9 pr-9 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/60 focus:bg-gray-900 transition-colors"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {filtered.length > 0 && (
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800/60 rounded-lg transition-colors"
              title={allSelected ? 'Clear selection' : 'Select all'}
            >
              {allSelected ? (
                <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              {allSelected ? 'Clear' : 'Select all'}
            </button>
          )}
          <span className="text-xs text-gray-500">
            {filtered.length} project{filtered.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-8 py-2.5 flex items-center gap-3">
          <span className="text-sm text-white">
            <strong>{selected.size}</strong> selected
          </span>
          <button
            onClick={clearSelection}
            className="text-xs text-gray-400 hover:text-white"
          >
            Clear
          </button>
          <button
            onClick={askDeleteSelected}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-300 hover:text-red-200 hover:bg-red-500/15 border border-red-400/30 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete selected
          </button>
        </div>
      )}

      {/* Content */}
      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No projects match &ldquo;{filter}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                selected={selected.has(p.id)}
                onToggleSelect={() => toggleSelect(p.id)}
                onTogglePin={() => togglePin(p)}
                onDelete={() => askDeleteOne(p)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmDelete(null);
          }}
        >
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Delete {confirmDelete.label}?
                  </h3>
                  <p className="text-sm text-gray-400 mt-1.5">
                    This permanently removes the{' '}
                    {confirmDelete.ids.length === 1
                      ? 'project and all its features'
                      : `${confirmDelete.ids.length} projects and all their features`}
                    . This can&apos;t be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg transition-colors"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <NewProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => router.push(`/maps/${id}/editor`)}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  selected,
  onToggleSelect,
  onTogglePin,
  onDelete,
}: {
  project: FieldMap;
  selected: boolean;
  onToggleSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const pinned = !!project.pinned_at;
  return (
    <div
      className={`group relative bg-gray-900/60 hover:bg-gray-900 border rounded-2xl overflow-hidden transition-all ${
        selected
          ? 'border-indigo-500/50 ring-1 ring-indigo-500/30'
          : pinned
          ? 'border-amber-500/30 hover:border-amber-400/50'
          : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      {/* Click target — the navigation link covers the body but NOT the
          icon buttons in the corners. Stops at events on icon buttons. */}
      <Link
        href={`/maps/${project.id}/editor`}
        className="absolute inset-0 z-0"
        aria-label={`Open ${project.name}`}
      />

      {/* Top band */}
      <div
        className="h-28 relative overflow-hidden pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.15), transparent 60%), radial-gradient(circle at 70% 70%, rgba(56, 189, 248, 0.1), transparent 60%), #0b0d12',
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px, 24px 24px',
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <MapIcon className="w-10 h-10 text-indigo-400/40 group-hover:text-indigo-400/70 transition-colors" />
        </div>
        <span
          className={`absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            statusStyle[project.status]
          }`}
        >
          {statusLabel[project.status]}
        </span>
        {pinned && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full pointer-events-none">
            <Pin className="w-2.5 h-2.5 fill-amber-300" />
            Pinned
          </span>
        )}
      </div>

      {/* Top-left corner controls (select checkbox + pin) */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
            selected
              ? 'bg-indigo-500 text-white'
              : 'bg-gray-950/70 border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 opacity-0 group-hover:opacity-100'
          }`}
          title={selected ? 'Deselect' : 'Select'}
        >
          {selected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
            pinned
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'bg-gray-950/70 border border-gray-700 text-gray-400 hover:text-amber-300 hover:bg-gray-800 opacity-0 group-hover:opacity-100'
          }`}
          title={pinned ? 'Unpin project' : 'Pin project'}
        >
          {pinned ? <Pin className="w-3.5 h-3.5 fill-amber-300" /> : <PinOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      <div className="p-4 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white truncate">
              {project.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">
              {project.project_code || 'No project code'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="relative z-10 w-7 h-7 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
              title="Delete project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors mt-0.5" />
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800/60 text-xs text-gray-500">
          <span>
            {new Date(project.created_at).toLocaleDateString('sv-SE')}
          </span>
          <span>
            {project.map_type === 'byggkarta'
              ? 'Byggkarta'
              : project.map_type === 'borrkarta'
              ? 'Borrkarta'
              : 'Project'}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border border-dashed border-gray-800 rounded-2xl p-12 text-center bg-gray-900/30">
      <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
        <MapIcon className="w-7 h-7 text-indigo-400" />
      </div>
      <h3 className="text-lg font-semibold text-white">No projects yet</h3>
      <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
        Create your first project to start mapping a utility installation. You
        can place cables, joints, drill segments, and any feature your crew
        needs to see on site.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
      >
        <Plus className="w-4 h-4" strokeWidth={2.5} />
        New project
      </button>
    </div>
  );
}

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [projectCode, setProjectCode] = useState('');
  const [name, setName] = useState('');
  const [mapType, setMapType] = useState<FieldMap['map_type']>('byggkarta');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => codeRef.current?.focus(), 50);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectCode.trim() || !name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          project_code: projectCode.trim(),
          map_type: mapType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');
      onCreated(data.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleCreate}
        className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl shadow-black/50"
      >
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">New project</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Set up a project, then start placing features on the map.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Project ID
            </label>
            <input
              ref={codeRef}
              type="text"
              required
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              placeholder="IB350077"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[11px] text-gray-600 mt-1">
              The IBnr or internal reference for this project.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Project name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HAMM 3 Torsåker"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['byggkarta', 'borrkarta', 'other'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMapType(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    mapType === t
                      ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-700'
                  }`}
                >
                  {t === 'byggkarta'
                    ? 'Byggkarta'
                    : t === 'borrkarta'
                    ? 'Borrkarta'
                    : 'Other'}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating || !projectCode.trim() || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg shadow-md shadow-indigo-500/20 transition-all"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {creating ? 'Creating…' : 'Create and open editor'}
          </button>
        </div>
      </form>
    </div>
  );
}
