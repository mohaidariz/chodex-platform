'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, X } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  conversationId: string | null;
  visitorName: string;
  visitorEmail: string;
}

export default function ChatbotPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: `Hi! I'm an AI assistant. How can I help you today?` },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ChatState>({ conversationId: null, visitorName: '', visitorEmail: '' });
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showInfoForm, setShowInfoForm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(content: string, name?: string, email?: string) {
    if (!content.trim()) return;
    setLoading(true);
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', content }]);
    setInput('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          conversationId: state.conversationId,
          orgSlug,
          visitorName: name || state.visitorName || undefined,
          visitorEmail: email || state.visitorEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get response');
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: data.response },
      ]);
      setState((prev) => ({ ...prev, conversationId: data.conversationId }));
      const lower = data.response.toLowerCase();
      if (
        !state.visitorName &&
        (lower.includes('your name') ||
          lower.includes('name and email') ||
          lower.includes('contact information'))
      ) {
        setShowInfoForm(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput || !emailInput) return;
    setState((prev) => ({ ...prev, visitorName: nameInput, visitorEmail: emailInput }));
    setShowInfoForm(false);
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: 'user', content: `My name is ${nameInput} and my email is ${emailInput}` },
    ]);
    await sendMessage(
      `My name is ${nameInput} and my email is ${emailInput}. Please connect me with the team.`,
      nameInput,
      emailInput
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      <style>{`
        html, body { background: #0A0A0A !important; }
        .messages-scroll::-webkit-scrollbar { width: 4px; }
        .messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .messages-scroll::-webkit-scrollbar-thumb { background-color: #2a2a2a; border-radius: 4px; }
        .messages-scroll { scrollbar-width: thin; scrollbar-color: #2a2a2a transparent; }
      `}</style>

      <div className="flex flex-col h-screen bg-[#0A0A0A] text-[#E0E0E0]">

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-4 bg-[#0A0A0A] shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(0,192,255,0.12)', boxShadow: '0 0 12px rgba(0,192,255,0.15)' }}
          >
            <Bot className="w-5 h-5 text-[#00C0FF]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#E0E0E0]">AI Assistant</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00C0FF] animate-pulse" />
              <p className="text-xs text-[#A0A0A0]">Online</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="messages-scroll flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-[#0A0A0A]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5"
                  style={{ background: 'rgba(0,192,255,0.12)', boxShadow: '0 0 12px rgba(0,192,255,0.1)' }}
                >
                  <Bot className="w-3.5 h-3.5 text-[#00C0FF]" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed text-[#E0E0E0] ${
                  msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                }`}
                style={
                  msg.role === 'user'
                    ? { background: 'rgba(0,192,255,0.12)', border: '1px solid rgba(0,192,255,0.2)' }
                    : { background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)' }
                }
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-0.5"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  <User className="w-3.5 h-3.5 text-[#A0A0A0]" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-end gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'rgba(0,192,255,0.12)', boxShadow: '0 0 12px rgba(0,192,255,0.1)' }}
              >
                <Bot className="w-3.5 h-3.5 text-[#00C0FF]" />
              </div>
              <div
                className="rounded-2xl rounded-bl-sm px-4 py-3"
                style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#A0A0A0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-[#A0A0A0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-[#A0A0A0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Contact info form */}
        {showInfoForm && (
          <div className="px-4 pb-3">
            <form
              onSubmit={handleInfoSubmit}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <p className="text-sm text-[#E0E0E0] font-medium">Share your contact info</p>
              <input
                type="text"
                required
                placeholder="Your name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[#E0E0E0] placeholder-[#707070] focus:outline-none transition border border-white/10 focus:border-[#00C0FF] focus:ring-[3px] focus:ring-[#00C0FF]/15"
                style={{ background: '#0A0A0A' }}
              />
              <input
                type="email"
                required
                placeholder="Your email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-[#E0E0E0] placeholder-[#707070] focus:outline-none transition border border-white/10 focus:border-[#00C0FF] focus:ring-[3px] focus:ring-[#00C0FF]/15"
                style={{ background: '#0A0A0A' }}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-[#00C0FF] hover:bg-[#007BFF] text-[#0A0A0A] text-sm font-semibold py-2 rounded-xl transition-colors"
                >
                  Submit
                </button>
                <button
                  type="button"
                  onClick={() => setShowInfoForm(false)}
                  className="px-3 py-2 text-[#A0A0A0] hover:text-[#E0E0E0] hover:bg-white/5 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Input area */}
        <div
          className="px-4 pb-4 pt-2 shrink-0 bg-[#0A0A0A]"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2.5 transition border border-white/10 focus-within:border-[#00C0FF] focus-within:ring-[3px] focus-within:ring-[#00C0FF]/15"
            style={{ background: '#1A1A1A' }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-[#E0E0E0] placeholder-[#707070] focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:cursor-not-allowed ${
                !input.trim() || loading ? 'bg-transparent' : 'bg-[#00C0FF] hover:bg-[#007BFF]'
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#707070]" />
              ) : (
                <Send className={`w-3.5 h-3.5 ${!input.trim() ? 'text-[#707070]' : 'text-[#0A0A0A]'}`} />
              )}
            </button>
          </div>
          <p className="text-center text-[#707070] text-xs mt-2 select-none">Powered by Chodex</p>
        </div>

      </div>
    </>
  );
}
