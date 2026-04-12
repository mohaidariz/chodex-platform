'use client'

import { useState, useEffect, useCallback } from 'react'
import { DocumentUpload } from '@/components/documents/DocumentUpload'
import { DocumentList } from '@/components/documents/DocumentList'
import { createClient } from '@/lib/supabase/client'
import { FileText } from 'lucide-react'
import type { Document } from '@/types'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchDocuments = useCallback(async () => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .single()

    if (!profile?.org_id) return

    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })

    setDocuments(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleDelete = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" />
          Documents
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload documents to power your AI assistant&apos;s knowledge base.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Upload panel */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Upload new documents</h2>
            <DocumentUpload onUploadComplete={fetchDocuments} />
          </div>
        </div>

        {/* Document list */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">
                All documents{' '}
                <span className="text-slate-400 font-normal">({documents.length})</span>
              </h2>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <DocumentList documents={documents} onDelete={handleDelete} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
