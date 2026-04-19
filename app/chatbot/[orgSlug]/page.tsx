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
  collectingInfo: boolean;
}

export default function ChatbotPage({ params }: { params: { orgSlug: string } }) {
  const { orgSlug } = params;
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi! I'm an AI assistant. How can I help you today?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ChatState>({
    conversationId: null,
    visitorName: '',
    visitorEmail: '',
    collectingInfo: false,
  });
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [showInfoForm, setShowInfoForm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(content: string, name?: string, email?: string) {
    if (!content.trim()) return;
    setLoading(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
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

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setState((prev) => ({ ...prev, conversationId: data.conversationId }));

      const lowerResponse = data.response.toLowerCase();
      if (
        !state.visitorName &&
        (lowerResponse.includes('your name') ||
          lowerResponse.includes('name and email') ||
          lowerResponse.includes('contact information'))
      ) {
        setShowInfoForm(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput || !emailInput) return;
    setState((prev) => ({
      ...prev,
      visitorName: nameInput,
      visitorEmail: emailInput,
    }));
    setShowInfoForm(false);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: `My name is ${nameInput} and my email is ${emailInput}`,
      },
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
    <div className="flex flex-col h-screen bg-[#F8FAFB] text-[#0F172A]">
      {/* Header — navy */}
      <div className="flex items-center gap-3 px-4 py-4 bg-[#0F172A] border-b border-[#1E293B] shrink-0">
        <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">AI Assistant</p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <p className="text-xs text-[#94A3B8]">Online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 bg-[#0F172A] rounded-full flex items-center justify-center shrink-0 mb-0.5">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#0F172A] text-white rounded-br-sm'
                  : 'bg-white text-[#0F172A] rounded-bl-sm border border-[#E2E8F0]'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 bg-[#CBD5E1] rounded-full flex items-center justify-center shrink-0 mb-0.5">
                <User className="w-3.5 h-3.5 text-[#475569]" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 bg-[#0F172A] rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white border border-[#E2E8F0] rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-[#94A3B8] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-[#94A3B8] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-[#94A3B8] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3"
          >
            <p className="text-sm text-[#0F172A] font-medium">Share your contact info</p>
            <input
              type="text"
              required
              placeholder="Your name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full bg-[#F8FAFB] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
            />
            <input
              type="email"
              required
              placeholder="Your email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full bg-[#F8FAFB] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#0F172A]"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-[#0F172A] hover:bg-[#1E293B] text-white text-sm font-medium py-2 rounded-xl transition-colors"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setShowInfoForm(false)}
                className="px-3 py-2 text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0 bg-white border-t border-[#E2E8F0]">
        <div className="flex items-center gap-2 bg-[#F8FAFB] border border-[#E2E8F0] rounded-2xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-[#0F172A] focus-within:border-transparent transition">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="w-8 h-8 bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-colors shrink-0"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <Send className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>
        <p className="text-center text-[#94A3B8] text-xs mt-2">Powered by Chodex</p>
      </div>
    </div>
  );
}
