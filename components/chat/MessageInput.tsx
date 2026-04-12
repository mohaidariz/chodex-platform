'use client'

import { useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { Send } from 'lucide-react'

interface MessageInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

export function MessageInput({ onSend, disabled, placeholder = 'Type a message...' }: MessageInputProps) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3">
      <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20 transition-all">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 bg-transparent resize-none text-sm text-slate-900 placeholder:text-slate-400',
            'focus:outline-none max-h-32 overflow-y-auto',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          style={{ minHeight: '24px' }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            value.trim() && !disabled
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-slate-400 text-center mt-2">
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
