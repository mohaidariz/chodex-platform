'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import type { FieldMap } from '@/types';

// Leaflet must be loaded client-side only (it touches window/document).
const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  ),
});

interface MapDetail {
  map: FieldMap;
  pages: any[];
  features: any[];
}

export default function MapDetailPage({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<MapDetail | null>(null);
  const [error, setError] = useState<string>('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const res = await fetch(`/api/maps/${params.id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load (${res.status})`);
        }
        const data: MapDetail = await res.json();
        if (cancelled) return;
        setDetail(data);
        setError('');

        // If still processing, poll
        if (data.map.status === 'uploading' || data.map.status === 'extracting') {
          if (!timer) timer = setInterval(load, 5000);
        } else if (timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [params.id]);

  async function handleDelete() {
    if (!confirm('Delete this map and all its extracted features? This cannot be undone.')) {
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/maps/${params.id}`, { method: 'DELETE' });
    if (res.ok) {
      window.location.href = '/maps';
    } else {
      setDeleting(false);
      alert('Delete failed');
    }
  }

  if (error) {
    return (
      <div className="p-8">
        <Link
          href="/maps"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to maps
        </Link>
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 inline-block mr-2" />
          {error}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading map…
      </div>
    );
  }

  const { map, pages, features } = detail;
  const statusColor = {
    uploading: 'text-blue-400 bg-blue-400/10',
    extracting: 'text-yellow-400 bg-yellow-400/10',
    ready: 'text-green-400 bg-green-400/10',
    failed: 'text-red-400 bg-red-400/10',
  }[map.status];

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-3 border-b border-gray-800 bg-gray-950 flex items-center gap-4 shrink-0">
        <Link
          href="/maps"
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-white font-semibold truncate">{map.name}</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {map.map_type === 'byggkarta' ? 'Byggkarta' : map.map_type === 'borrkarta' ? 'Borrkarta' : 'Other'}
            {map.project_code ? ` · ${map.project_code}` : ''} ·{' '}
            {pages.length} page{pages.length === 1 ? '' : 's'} · {features.length} feature{features.length === 1 ? '' : 's'}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor}`}>
          {map.status}
        </span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
          title="Delete map"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </header>

      {map.status === 'failed' && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
          <strong>Extraction failed:</strong> {map.error_message || 'Unknown error'}
        </div>
      )}

      {(map.status === 'uploading' || map.status === 'extracting') ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p>{map.status === 'uploading' ? 'Uploading PDF…' : 'Extracting features…'}</p>
          <p className="text-xs">This page refreshes automatically. Larger maps take longer.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <MapView map={map} pages={pages} features={features} />
        </div>
      )}
    </div>
  );
}
