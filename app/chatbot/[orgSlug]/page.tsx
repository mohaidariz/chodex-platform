'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, X, Mic, Volume2, VolumeX } from 'lucide-react';

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

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';
type VoiceModalKind = 'inapp' | 'denied' | 'unsupported';

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|LinkedInApp|Twitter|TikTok|Slack/i.test(navigator.userAgent);
}

function checkVoiceSupport(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices) return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return !!getSupportedMimeType();
}

function VoicePermissionModal({ kind, onClose }: { kind: VoiceModalKind; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full md:max-w-[400px] md:mx-4 rounded-t-2xl md:rounded-2xl p-6 space-y-4"
        style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.09)' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-[#E0E0E0] leading-snug">
            {kind === 'inapp'
              ? 'Open in your browser'
              : kind === 'denied'
              ? 'Allow microphone access'
              : 'Voice not supported'}
          </h2>
          <button
            onClick={onClose}
            className="text-[#707070] hover:text-[#A0A0A0] transition-colors shrink-0 mt-0.5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {kind === 'inapp' && (
          <>
            <p className="text-sm text-[#A0A0A0] leading-relaxed">
              Voice mode requires microphone access, which is not available inside Instagram,
              Facebook, LinkedIn, and similar in-app browsers. Open this page in Safari or Chrome
              to use voice.
            </p>
            <button
              onClick={copyLink}
              className="w-full py-3 rounded-xl text-sm font-semibold text-[#0A0A0A] transition-colors"
              style={{ background: copied ? '#22c55e' : '#00C0FF' }}
            >
              {copied ? 'Link copied!' : 'Copy link to open in Safari'}
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm text-[#A0A0A0] hover:text-[#E0E0E0] hover:bg-white/5 transition-colors"
            >
              Continue with text only
            </button>
          </>
        )}

        {kind === 'denied' && (
          <>
            <p className="text-sm text-[#A0A0A0] leading-relaxed">
              Microphone access was blocked. To enable it on your iPhone or iPad:
            </p>
            <ol className="space-y-2.5 text-sm text-[#A0A0A0]">
              <li className="flex gap-2.5">
                <span className="text-[#00C0FF] font-semibold shrink-0">1.</span>
                <span>Open the <strong className="text-[#E0E0E0]">Settings</strong> app</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-[#00C0FF] font-semibold shrink-0">2.</span>
                <span>Scroll down and tap <strong className="text-[#E0E0E0]">Safari</strong> (or Chrome)</span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-[#00C0FF] font-semibold shrink-0">3.</span>
                <span>
                  Tap <strong className="text-[#E0E0E0]">Microphone</strong>, then select{' '}
                  <strong className="text-[#E0E0E0]">Allow</strong>
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="text-[#00C0FF] font-semibold shrink-0">4.</span>
                <span>Come back here and tap the mic again</span>
              </li>
            </ol>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-semibold text-[#0A0A0A] bg-[#00C0FF] hover:bg-[#007BFF] transition-colors"
            >
              Try again
            </button>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm text-[#A0A0A0] hover:text-[#E0E0E0] hover:bg-white/5 transition-colors"
            >
              Continue with text only
            </button>
          </>
        )}

        {kind === 'unsupported' && (
          <>
            <p className="text-sm text-[#A0A0A0] leading-relaxed">
              Voice mode is not supported in this browser. Please open this page in Safari 14.3+
              or Chrome to use voice interaction.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-medium text-[#E0E0E0] hover:bg-white/5 border transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.15)' }}
            >
              Continue with text only
            </button>
          </>
        )}
      </div>
    </div>
  );
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

  // Voice state
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceModal, setVoiceModal] = useState<VoiceModalKind | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [showMicHint, setShowMicHint] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('chodex-voice-muted') === 'true';
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const supported = checkVoiceSupport();
    setVoiceSupported(supported);
    if (supported) {
      setShowMicHint(localStorage.getItem('chodex-mic-hint-shown') !== 'true');
    }
    return () => {
      audioRef.current?.pause();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('chodex-voice-muted', String(next));
    if (next && audioRef.current) {
      audioRef.current.pause();
      setVoiceState('idle');
    }
  }

  async function sendTextMessage(content: string, name?: string, email?: string) {
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

  const playAudio = useCallback((base64: string) => {
    audioRef.current?.pause();
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audioRef.current = audio;
    setVoiceState('speaking');
    audio.play().catch(() => setVoiceState('idle'));
    audio.onended = () => setVoiceState('idle');
    audio.onerror = () => setVoiceState('idle');
  }, []);

  async function sendVoiceMessage(audioBlob: Blob) {
    setVoiceState('processing');
    try {
      const ext = (audioBlob.type || '').includes('mp4') ? 'm4a' : 'webm';
      const form = new FormData();
      form.append('audio', audioBlob, `recording.${ext}`);
      form.append('orgSlug', orgSlug);
      if (state.conversationId) form.append('conversationId', state.conversationId);
      if (state.visitorName) form.append('visitorName', state.visitorName);
      if (state.visitorEmail) form.append('visitorEmail', state.visitorEmail);
      if (muted) form.append('noAudio', 'true');

      const res = await fetch('/api/voice', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice processing failed');

      const { transcript, response, conversationId, audioBase64 } = data;
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: 'user', content: transcript },
        { id: (Date.now() + 1).toString(), role: 'assistant', content: response },
      ]);
      setState((prev) => ({ ...prev, conversationId }));

      if (!muted && audioBase64) {
        playAudio(audioBase64);
      } else {
        setVoiceState('idle');
      }
    } catch {
      setVoiceState('idle');
    }
  }

  function setupRecorder(stream: MediaStream) {
    console.log('[voice] stream acquired, setting up recorder');
    streamRef.current = stream;

    const mimeType = getSupportedMimeType();
    console.log('[voice] preferred mimeType:', mimeType || '(browser default)');

    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err: any) {
      console.warn('[voice] MediaRecorder with mimeType failed, retrying without:', err.message);
      try {
        recorder = new MediaRecorder(stream);
      } catch (err2: any) {
        console.error('[voice] MediaRecorder construction failed entirely:', err2);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setVoiceModal('unsupported');
        setVoiceState('idle');
        return;
      }
    }

    const actualMimeType = recorder.mimeType || mimeType || 'audio/mp4';
    console.log('[voice] recorder.mimeType:', actualMimeType);

    mediaRecorderRef.current = recorder;
    audioChunksRef.current = [];
    recordingStartRef.current = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const duration = Date.now() - recordingStartRef.current;
      console.log(`[voice] stopped — duration ${duration}ms, chunks ${audioChunksRef.current.length}`);
      if (duration < 300 || audioChunksRef.current.length === 0) {
        setVoiceState('idle');
        return;
      }
      const blob = new Blob(audioChunksRef.current, { type: actualMimeType });
      console.log(`[voice] blob: ${blob.size}B type:${blob.type}`);
      sendVoiceMessage(blob);
    };

    recorder.start(100);
    console.log('[voice] recording started');
    setVoiceState('listening');
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function handleMicPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);

    if (voiceState === 'speaking') {
      audioRef.current?.pause();
      setVoiceState('idle');
      return;
    }
    if (voiceState !== 'idle') return;

    // Check in-app browser before anything else
    if (isInAppBrowser()) {
      setVoiceModal('inapp');
      return;
    }

    // PWA / home-screen mode blocks getUserMedia on iOS
    if (typeof window !== 'undefined' && (window.navigator as any).standalone === true) {
      setVoiceModal('unsupported');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceModal('unsupported');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setVoiceModal('unsupported');
      return;
    }

    // Dismiss first-use hint
    if (showMicHint) {
      setShowMicHint(false);
      localStorage.setItem('chodex-mic-hint-shown', 'true');
    }

    audioRef.current?.pause();

    // ⚠️ iOS Safari requires getUserMedia in the same synchronous task as the gesture.
    console.log('[voice] requesting microphone access...');
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })
      .then((stream) => setupRecorder(stream))
      .catch((err: any) => {
        console.error('[voice] getUserMedia error:', err.name, err.message, err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setVoiceModal('denied');
        } else {
          setVoiceModal('unsupported');
        }
        setVoiceState('idle');
      });
  }

  function handleMicPointerUp() {
    if (voiceState === 'listening') {
      stopRecording();
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
    await sendTextMessage(
      `My name is ${nameInput} and my email is ${emailInput}. Please connect me with the team.`,
      nameInput,
      emailInput
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage(input);
    }
  }

  const isTextDisabled = loading || voiceState === 'listening' || voiceState === 'processing';

  return (
    <>
      <style>{`
        html, body { background: #0A0A0A !important; }
        .messages-scroll::-webkit-scrollbar { width: 4px; }
        .messages-scroll::-webkit-scrollbar-track { background: transparent; }
        .messages-scroll::-webkit-scrollbar-thumb { background-color: #2a2a2a; border-radius: 4px; }
        .messages-scroll { scrollbar-width: thin; scrollbar-color: #2a2a2a transparent; }
        @keyframes soundwave {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        .bar1 { animation: soundwave 0.7s ease-in-out infinite; }
        .bar2 { animation: soundwave 0.7s ease-in-out infinite 0.14s; }
        .bar3 { animation: soundwave 0.7s ease-in-out infinite 0.28s; }
        .bar4 { animation: soundwave 0.7s ease-in-out infinite 0.42s; }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        .mic-listening { animation: mic-pulse 1s ease-in-out infinite; border-radius: 12px; }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .modal-enter { animation: slide-up 0.2s ease-out; }
      `}</style>

      {voiceModal && (
        <VoicePermissionModal kind={voiceModal} onClose={() => setVoiceModal(null)} />
      )}

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
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#E0E0E0]">AI Assistant</p>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00C0FF] animate-pulse" />
              <p className="text-xs text-[#A0A0A0]">Online</p>
            </div>
          </div>
          {voiceSupported && (
            <button
              onClick={toggleMute}
              title={muted ? 'Unmute voice responses' : 'Mute voice responses'}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
              style={{ color: muted ? '#707070' : '#A0A0A0' }}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}
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

          {(loading || voiceState === 'processing') && (
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

        {/* Stop speaking button */}
        {voiceState === 'speaking' && (
          <div className="px-4 pb-2">
            <button
              onClick={() => { audioRef.current?.pause(); setVoiceState('idle'); }}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-[#00C0FF] border border-[#00C0FF]/30 hover:bg-[#00C0FF]/10 transition-colors"
            >
              Stop speaking
            </button>
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
              placeholder={
                voiceState === 'listening'
                  ? 'Listening…'
                  : voiceState === 'processing'
                  ? 'Thinking…'
                  : 'Type a message…'
              }
              disabled={isTextDisabled}
              className="flex-1 bg-transparent text-sm text-[#E0E0E0] placeholder-[#707070] focus:outline-none disabled:opacity-50"
            />

            {/* Mic button — only shown when voice is supported */}
            {voiceSupported && (
              <button
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerUp}
                disabled={voiceState === 'processing' || loading}
                aria-label={
                  voiceState === 'listening'
                    ? 'Release to send'
                    : voiceState === 'speaking'
                    ? 'Tap to stop audio'
                    : 'Hold to record'
                }
                style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                  voiceState === 'processing' || loading
                    ? 'opacity-30 cursor-not-allowed'
                    : voiceState === 'listening'
                    ? 'mic-listening cursor-pointer bg-red-500/15'
                    : voiceState === 'speaking'
                    ? 'cursor-pointer'
                    : 'cursor-pointer text-[#707070] hover:text-[#A0A0A0] hover:bg-white/5'
                }`}
              >
                {voiceState === 'listening' ? (
                  <Mic className="w-4 h-4 text-red-400" />
                ) : voiceState === 'speaking' ? (
                  <div className="flex items-end gap-[2px] h-4 w-4 justify-center" style={{ paddingBottom: '1px' }}>
                    <span className="bar1 block rounded-sm bg-[#00C0FF]" style={{ width: 3, height: 8, transformOrigin: 'bottom' }} />
                    <span className="bar2 block rounded-sm bg-[#00C0FF]" style={{ width: 3, height: 12, transformOrigin: 'bottom' }} />
                    <span className="bar3 block rounded-sm bg-[#00C0FF]" style={{ width: 3, height: 10, transformOrigin: 'bottom' }} />
                    <span className="bar4 block rounded-sm bg-[#00C0FF]" style={{ width: 3, height: 6, transformOrigin: 'bottom' }} />
                  </div>
                ) : voiceState === 'processing' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#707070]" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Send button */}
            <button
              onClick={() => sendTextMessage(input)}
              disabled={!input.trim() || isTextDisabled}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:cursor-not-allowed ${
                !input.trim() || isTextDisabled ? 'bg-transparent' : 'bg-[#00C0FF] hover:bg-[#007BFF]'
              }`}
            >
              {loading && voiceState === 'idle' ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#707070]" />
              ) : (
                <Send className={`w-3.5 h-3.5 ${!input.trim() || isTextDisabled ? 'text-[#707070]' : 'text-[#0A0A0A]'}`} />
              )}
            </button>
          </div>

          {/* Status / footer line */}
          <div className="flex items-center justify-center gap-2 mt-2 select-none">
            <p className="text-xs">
              {voiceState === 'listening' ? (
                <span className="text-red-400">&#x25CF; Recording &#x2014; release to send</span>
              ) : voiceState === 'speaking' ? (
                <span className="text-[#00C0FF]">Speaking &#x2014; tap mic to stop</span>
              ) : showMicHint && voiceSupported ? (
                <span className="text-[#A0A0A0]">Tap the mic to talk</span>
              ) : (
                <span className="text-[#707070]">Powered by Chodex</span>
              )}
            </p>
            {voiceSupported && voiceState === 'idle' && !showMicHint && (
              <button
                onClick={() => setVoiceModal('denied')}
                className="text-xs text-[#505050] hover:text-[#707070] underline underline-offset-2 transition-colors"
              >
                Need help?
              </button>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
