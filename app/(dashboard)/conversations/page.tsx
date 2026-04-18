'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, User, Mail } from 'lucide-react';
import type { Conversation, Message } from '@/types';
import { createClient } from '@/lib/supabase/client';

const statusColors: Record<string, string> = {
  active: 'text-green-400 bg-green-400/10',
  resolved: 'text-gray-400 bg-gray-400/10',
  escalated: 'text-orange-400 bg-orange-400/10',
};

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  async function fetchConversations() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('created_at', { ascending: false });
    setConversations(data || []);
    setLoading(false);
  }

  async function selectConversation(conv: Conversation) {
    setSelected(conv);
    const supabase = createClient();
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  }

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-80 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">Conversations</h2>
          <p className="text-gray-400 text-sm mt-0.5">{conversations.length} total</p>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500">
              <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv)}
                className={`w-full text-left px-4 py-4 border-b border-gray-800/50 hover:bg-gray-800/50 transition-colors ${
                  selected?.id === conv.id ? 'bg-gray-800' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white text-sm font-medium truncate">
                    {conv.visitor_name || 'Anonymous'}
                  </span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[conv.status] || statusColors.active}`}
                  >
                    {conv.status}
                  </span>
                </div>
                <p className="text-gray-500 text-xs truncate">{conv.visitor_email || 'No email'}</p>
                <p className="text-gray-600 text-xs mt-1">
                  {new Date(conv.created_at).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm mt-1">Click a conversation on the left to view messages</p>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-white font-medium">{selected.visitor_name || 'Anonymous'}</p>
                {selected.visitor_email && (
                  <p className="text-gray-400 text-sm flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {selected.visitor_email}
                  </p>
                )}
              </div>
              <span
                className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${statusColors[selected.status] || statusColors.active}`}
              >
                {selected.status}
              </span>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-gray-800 text-gray-200 rounded-tl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
