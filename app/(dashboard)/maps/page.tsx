'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  Map as MapIcon,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import type { FieldMap } from '@/types';

const statusConfig: Record<
  FieldMap['status'],
  { label: string; icon: typeof Clock; color: string; spin?: boolean }
> = {
  uploading: {
    label: 'Uploading',
    icon: Loader2,
    color: 'text-blue-400 bg-blue-400/10',
    spin: true,
  },
  extracting: {
    label: 'Extracting',
    icon: Loader2,
    color: 'text-yellow-400 bg-yellow-400/10',
    spin: true,
  },
  ready: {
    label: 'Ready',
    icon: CheckCircle,
    color: 'text-green-400 bg-green-400/10',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-400 bg-red-400/10',
  },
};

const mapTypeLabel: Record<FieldMap['map_type'], string> = {
  byggkarta: 'Byggkarta',
  borrkarta: 'Borrkarta',
  other: 'Other',
};

export default function MapsPage() {
  const [maps, setMaps] = useState<FieldMap[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [mapType, setMapType] = useState<FieldMap['map_type']>('byggkarta');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);

  useEffect(() => {
    fetchMaps();
    // Poll status while any map is still processing
    const interval = setInterval(fetchMaps, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMaps() {
    const res = await fetch('/api/maps');
    if (res.ok) {
      const data = await res.json();
      setMaps(data);
    }
  }

  async function uploadFile(file: File) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim() || file.name);
      if (projectCode.trim()) formData.append('project_code', projectCode.trim());
      formData.append('map_type', mapType);

      const res = await fetch('/api/maps', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      // Reset form
      setName('');
      setProjectCode('');
      setMapType('byggkarta');
      pendingFileRef.current = null;

      await fetchMaps();

      // Kick off extraction in the background. We don't await it — the
      // dashboard polls map status every 5s, so the badge will flip from
      // "Extracting" to "Ready" (or "Failed") on its own.
      fetch(`/api/maps/${data.id}/extract`, { method: 'POST' }).catch((err) => {
        // Network/transient errors are swallowed here; the maps row's
        // own status field is the source of truth for whether it worked.
        console.error('Extraction trigger failed:', err);
      });
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Field maps</h2>
        <p className="text-gray-400 mt-1">
          Upload a Byggkarta or Borrkarta. The agent reads the map and surfaces
          information by GPS location for crews in the field.
        </p>
      </div>

      {/* Metadata form */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Map name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="HAMM 3 Torsåker"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Project code
            </label>
            <input
              type="text"
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              placeholder="IB350077"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Map type
            </label>
            <select
              value={mapType}
              onChange={(e) => setMapType(e.target.value as FieldMap['map_type'])}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="byggkarta">Byggkarta (cable lay)</option>
              <option value="borrkarta">Borrkarta (drilling)</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* Upload area */}
      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer mb-8 ${
          dragging
            ? 'border-indigo-500 bg-indigo-500/5'
            : 'border-gray-700 hover:border-gray-600'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-gray-300 font-medium">Uploading map…</p>
            <p className="text-gray-500 text-sm">Storing PDF</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center">
              <Upload className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <p className="text-white font-medium">
                Drop a PDF here or click to browse
              </p>
              <p className="text-gray-500 text-sm mt-1">Max 50MB · PDF only</p>
            </div>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-sm mb-6">
          {uploadError}
        </div>
      )}

      {/* Map list */}
      {maps.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <MapIcon className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>No maps yet. Upload your first Byggkarta or Borrkarta to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {maps.map((m) => {
            const cfg = statusConfig[m.status];
            const Icon = cfg.icon;
            return (
              <Link
                key={m.id}
                href={`/maps/${m.id}`}
                className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 flex items-center gap-3 hover:bg-gray-800/60 hover:border-gray-700 transition-colors"
              >
                <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
                  <MapIcon className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{m.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {mapTypeLabel[m.map_type]}
                    {m.project_code ? ` · ${m.project_code}` : ''} ·{' '}
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${cfg.color}`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${cfg.spin ? 'animate-spin' : ''}`}
                  />
                  {cfg.label}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
