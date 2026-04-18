'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import type { Document } from '@/types';

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-400 bg-yellow-400/10' },
  processing: { label: 'Processing', icon: Loader2, color: 'text-blue-400 bg-blue-400/10', spin: true },
  processed: { label: 'Processed', icon: CheckCircle, color: 'text-green-400 bg-green-400/10' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-400 bg-red-400/10' },
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
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
        <div className="space-y-3">
          {documents.map((doc) => {
            const cfg = statusConfig[doc.status];
            const Icon = cfg.icon;
            return (
              <div
                key={doc.id}
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4"
              >
                <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{doc.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {doc.chunk_count} chunks · {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.color}`}>
                  <Icon className={`w-3.5 h-3.5 ${'spin' in cfg && cfg.spin ? 'animate-spin' : ''}`} />
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
