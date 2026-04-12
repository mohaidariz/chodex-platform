'use client'

import { useState } from 'react'
import { FileText, Trash2, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { formatDate, formatFileSize } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Document } from '@/types'

interface DocumentListProps {
  documents: Document[]
  onDelete?: (id: string) => void
}

const statusConfig = {
  ready: { label: 'Ready', variant: 'success' as const, icon: CheckCircle },
  processing: { label: 'Processing', variant: 'warning' as const, icon: Loader2 },
  error: { label: 'Error', variant: 'error' as const, icon: AlertCircle },
}

const fileTypeIcons: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  txt: '📃',
}

export function DocumentList({ documents, onDelete }: DocumentListProps) {
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete?.(id)
      } else {
        alert('Failed to delete document')
      }
    } catch {
      alert('Failed to delete document')
    } finally {
      setDeleting(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No documents yet</p>
        <p className="text-slate-400 text-sm mt-1">Upload your first document above</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {documents.map((doc) => {
        const status = statusConfig[doc.status] ?? statusConfig.processing
        const StatusIcon = status.icon
        const emoji = fileTypeIcons[doc.file_type ?? ''] ?? '📄'

        return (
          <div
            key={doc.id}
            className="flex items-center gap-4 py-4 px-1 hover:bg-slate-50 rounded-lg -mx-1 px-1 transition-colors"
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">
              {emoji}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{doc.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-400">{formatDate(doc.created_at)}</span>
                {doc.file_type && (
                  <span className="text-xs text-slate-400 uppercase font-mono">{doc.file_type}</span>
                )}
              </div>
            </div>

            {/* Status */}
            <Badge variant={status.variant}>
              <StatusIcon
                className={`w-3 h-3 mr-1 ${doc.status === 'processing' ? 'animate-spin' : ''}`}
              />
              {status.label}
            </Badge>

            {/* Delete */}
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deleting === doc.id}
              className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 flex-shrink-0"
              title="Delete document"
            >
              {deleting === doc.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
