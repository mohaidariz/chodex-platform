'use client'

import { useState, useCallback } from 'react'
import { MessageList, type ChatMessage } from './MessageList'
import { MessageInput } from './MessageInput'
import { generateSessionId } from '@/lib/utils'
import { Mail, X } from 'lucide-react'

interface ChatWidgetProps {
  orgSlug: string
  orgName: string
}

let sessionId = ''

export function ChatWidget({ orgSlug, orgName }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [visitorEmail, setVisitorEmail] = useState<string | undefined>()
  const [showEmailPrompt, setShowEmailPrompt] = useState(false)
  const [emailInput, setEmailInput] = useState('')

  if (!sessionId) sessionId = generateSessionId()

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading) return

      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content,
      }

      const assistantMsgId = `assistant_${Date.now()}`
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsLoading(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content,
            orgSlug,
            sessionId,
            visitorEmail,
            conversationId,
          }),
        })

        if (!res.ok) throw new Error('Chat request failed')

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') break
              try {
                const parsed = JSON.parse(data)
                if (parsed.delta) {
                  fullContent += parsed.delta
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: fullContent, isStreaming: true }
                        : m
                    )
                  )
                }
                if (parsed.conversationId && !conversationId) {
                  setConversationId(parsed.conversationId)
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, isStreaming: false } : m
          )
        )

        // Show email prompt after 2 exchanges if no email yet
        if (!visitorEmail && messages.length >= 3) {
          setShowEmailPrompt(true)
        }
      } catch (err) {
        console.error('Chat error:', err)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: 'Sorry, something went wrong. Please try again.', isStreaming: false }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, orgSlug, visitorEmail, conversationId, messages.length]
  )

  const handleEmailSubmit = () => {
    if (emailInput.trim()) {
      setVisitorEmail(emailInput.trim())
      setShowEmailPrompt(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <span className="text-sm font-bold">AI</span>
        </div>
        <div>
          <p className="font-semibold text-sm">{orgName}</p>
          <p className="text-xs text-blue-100 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Online · Powered by Chodex
          </p>
        </div>
      </div>

      {/* Email capture prompt */}
      {showEmailPrompt && (
        <div className="mx-3 mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-2">
              <Mail className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-800 font-medium">
                Want a summary of this conversation sent to your email?
              </p>
            </div>
            <button onClick={() => setShowEmailPrompt(false)} className="text-blue-400 hover:text-blue-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="email"
              placeholder="your@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
              className="flex-1 text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-400 bg-white"
            />
            <button
              onClick={handleEmailSubmit}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 font-medium"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <MessageList messages={messages} orgName={orgName} />

      {/* Input */}
      <MessageInput onSend={sendMessage} disabled={isLoading} />
    </div>
  )
}
