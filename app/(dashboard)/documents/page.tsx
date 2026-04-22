'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import type { Document } from '@/types';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-400 bg-yellow-400/10' },
  processing: { label: 'Processing', icon: Loader2, color: 'text-blue-400 bg-blue-400/10', spin: true },
  processed: { label: 'Processed', icon: CheckCircle, color: 'text-green-400 bg-green-400/10' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-400 bg-red-400/10' },
};

interface ConfirmState {
  ids: string[];
  label: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    const res = await fetch('/api/documents');
    if (res.ok) {
      const data = await res.json();
      setDocuments(data);
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
      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await fetchDocuments();
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

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === documents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(documents.map((d) => d.id)));
    }
  }

  function openConfirmSingle(doc: Document) {
    setConfirmModal({ ids: [doc.id], label: `'${doc.name}'` });
  }

  function openConfirmBulk() {
    const ids = Array.from(selected);
    setConfirmModal({ ids, label: `${ids.length} document${ids.length !== 1 ? 's' : ''}` });
  }

  async function handleDelete() {
    if (!confirmModal) return;
    setDeleting(true);
    try {
      await Promise.all(
        confirmModal.ids.map((id) => fetch(`/api/documents/${id}`, { method: 'DELETE' }))
      );
      const deletedSet = new Set(confirmModal.ids);
      setDocuments((prev) => prev.filter((d) => !deletedSet.has(d.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of confirmModal.ids) next.delete(id);
        return next;
      });
    } finally {
      setDeleting(false);
      setConfirmModal(null);
    }
  }

  const allSelected = documents.length > 0 && selected.size === documents.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Documents</h2>
        <p className="text-gray-400 mt-1">Upload PDFs to power your AI agent&apos;s knowledge base</p>
      </div>

      {/* Upload area */}
      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer mb-8 ${
          dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-gray-700 hover:border-gray-600'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
            <p className="text-gray-300 font-medium">Processing document...</p>
            <p className="text-gray-500 text-sm">Parsing, chunking, and embedding</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-gray-800 rounded-2xl flex items-center justify-center">
              <Upload className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <p className="text-white font-medium">Drop a PDF here or click to browse</p>
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

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>No documents yet. Upload your first PDF to get started.</p>
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-gray-400">
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </label>

            {selected.size > 0 && (
              <button
                onClick={openConfirmBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 border border-red-400/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected ({selected.size})
              </button>
            )}
          </div>

          <div className="space-y-2">
            {documents.map((doc) => {
              const cfg = statusConfig[doc.status];
              const Icon = cfg.icon;
              const isSelected = selected.has(doc.id);
              return (
                <div
                  key={doc.id}
                  className={`bg-gray-900 border rounded-xl px-4 py-4 flex items-center gap-3 transition-colors ${
                    isSelected ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-gray-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(doc.id)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-indigo-500 cursor-pointer shrink-0"
                  />
                  <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{doc.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {doc.chunk_count} chunks · {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${cfg.color}`}>
                    <Icon className={`w-3.5 h-3.5 ${'spin' in cfg && cfg.spin ? 'animate-spin' : ''}`} />
                    {cfg.label}
                  </span>
                  <button
                    onClick={() => openConfirmSingle(doc)}
                    className="shrink-0 p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Confirmation modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">
                  Delete {confirmModal.label}?
                </h3>
                <p className="text-gray-400 text-sm mt-1">
                  This will remove the{' '}
                  {confirmModal.ids.length === 1 ? 'document' : `${confirmModal.ids.length} documents`}{' '}
                  and all their chunks from the knowledge base. This can&apos;t be undone.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg transition-colors"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
