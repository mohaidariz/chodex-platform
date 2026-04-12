'use client'

import { useState, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn, formatFileSize, getFileExtension } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface UploadFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

interface DocumentUploadProps {
  onUploadComplete?: () => void
}

const ALLOWED_TYPES = ['pdf', 'docx', 'txt']

export function DocumentUpload({ onUploadComplete }: DocumentUploadProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const addFiles = (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    const validFiles = fileArray.filter((f) => {
      const ext = getFileExtension(f.name)
      return ALLOWED_TYPES.includes(ext)
    })

    const uploadFiles: UploadFile[] = validFiles.map((f) => ({
      id: `${f.name}_${Date.now()}`,
      file: f,
      status: 'pending',
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...uploadFiles])
  }

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const uploadFile = async (uploadFile: UploadFile) => {
    setFiles((prev) =>
      prev.map((f) => f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 20 } : f)
    )

    try {
      const formData = new FormData()
      formData.append('file', uploadFile.file)

      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error ?? 'Upload failed')
      }

      setFiles((prev) =>
        prev.map((f) => f.id === uploadFile.id ? { ...f, status: 'success', progress: 100 } : f)
      )
      onUploadComplete?.()
    } catch (err) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
            : f
        )
      )
    }
  }

  const uploadAll = () => {
    files
      .filter((f) => f.status === 'pending')
      .forEach(uploadFile)
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer',
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
        )}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={handleFileInput}
        />
        <Upload className={cn('w-10 h-10 mx-auto mb-3', isDragging ? 'text-blue-500' : 'text-slate-400')} />
        <p className="text-sm font-medium text-slate-700">
          Drop files here or <span className="text-blue-600">click to browse</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">Supports PDF, DOCX, TXT · Max 50MB per file</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
            >
              <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{f.file.name}</p>
                <p className="text-xs text-slate-500">
                  {formatFileSize(f.file.size)}
                  {f.error && <span className="text-red-500 ml-2">{f.error}</span>}
                </p>
                {f.status === 'uploading' && (
                  <div className="mt-1.5 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Status icon */}
              {f.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
              {f.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
              {(f.status === 'pending' || f.status === 'error') && (
                <button
                  onClick={() => removeFile(f.id)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {pendingCount > 0 && (
            <Button onClick={uploadAll} className="w-full">
              Upload {pendingCount} file{pendingCount > 1 ? 's' : ''}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
