'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageSquare, ChevronDown, ChevronRight, Lightbulb, User, Bot } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Conversation, Message, Learning } from '@/types'

interface ConvWithMessages extends Conversation {
  messages: Message[]
  learnings: Learning[]
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<ConvWithMessages[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile?.org_id) return

    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!convs) {
      setLoading(false)
      return
    }

    const convIds = convs.map((c) => c.id)

    const [{ data: messages }, { data: learnings }] = await Promise.all([
      supabase.from('messages').select('*').in('conversation_id', convIds).order('created_at'),
      supabase.from('learnings').select('*').in('conversation_id', convIds),
    ])

    const enriched: ConvWithMessages[] = convs.map((conv) => ({
      ...conv,
      messages: (messages ?? []).filter((m) => m.conversation_id === conv.id),
      learnings: (learnings ?? []).filter((l) => l.conversation_id === conv.id),
    }))

    setConversations(enriched)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 bg-slate-200 rounded-lg w-48 animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-purple-600" />
          Conversations
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          All visitor conversations and AI-extracted learnings.
        </p>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No conversations yet</p>
          <p className="text-slate-400 text-sm mt-1">
            Embed your chatbot to start getting conversations
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Conversation header */}
              <button
                className="w-full flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors text-left"
                onClick={() => setExpanded(expanded === conv.id ? null : conv.id)}
              >
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 text-sm">
                    {conv.visitor_email ?? 'Anonymous visitor'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(conv.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                  <span>{conv.messages.length} messages</span>
                  {conv.learnings.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Lightbulb className="w-3 h-3" />
                      {conv.learnings.length} learnings
                    </span>
                  )}
                  {expanded === conv.id ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {expanded === conv.id && (
                <div className="border-t border-slate-100 p-5 space-y-6">
                  {/* Messages */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      Messages
                    </h3>
                    <div className="space-y-2">
                      {conv.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-2 text-sm ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              msg.role === 'user' ? 'bg-blue-100' : 'bg-slate-100'
                            }`}
                          >
                            {msg.role === 'user' ? (
                              <User className="w-3 h-3 text-blue-600" />
                            ) : (
                              <Bot className="w-3 h-3 text-slate-600" />
                            )}
                          </div>
                          <div
                            className={`max-w-lg rounded-xl px-3 py-2 text-sm ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-sm'
                                : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Learnings */}
                  {conv.learnings.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3 text-amber-500" />
                        AI Learnings
                      </h3>
                      <ul className="space-y-2">
                        {conv.learnings.map((l) => (
                          <li
                            key={l.id}
                            className="flex gap-2 text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                          >
                            <span className="text-amber-500 flex-shrink-0">•</span>
                            {l.content}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
