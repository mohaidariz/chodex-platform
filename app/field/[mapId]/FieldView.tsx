'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ChevronLeft,
  Crosshair,
  Loader2,
  MapPin,
  Cable,
  Drill,
  Box,
  Zap,
  AlertCircle,
  Compass,
  MessageSquare,
  Send,
  List,
} from 'lucide-react';
import type { FieldMap } from '@/types';

// Leaflet must be client-only
const FieldMapCanvas = dynamic(() => import('./FieldMapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center text-gray-500">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  ),
});

import { haversineMeters, pointToSegmentMeters } from '@/lib/maps/geo';

interface MapPageRow {
  page_number: number;
  scale_denominator: number | null;
  corner_nw_lat: number | null; corner_nw_lng: number | null;
  corner_ne_lat: number | null; corner_ne_lng: number | null;
  corner_sw_lat: number | null; corner_sw_lng: number | null;
  corner_se_lat: number | null; corner_se_lng: number | null;
  rendered_image_storage_key: string | null;
  calibration: any;
}

interface MapFeature {
  id: string;
  page_number: number;
  feature_type: string;
  lat: number;
  lng: number;
  end_lat: number | null;
  end_lng: number | null;
  source_id: string | null;
  label: string | null;
  props: Record<string, unknown>;
}

interface Props {
  map: FieldMap;
  pages: MapPageRow[];
  features: MapFeature[];
}

const FEATURE_ICONS: Record<string, any> = {
  cable: Cable,
  drill_segment: Drill,
  drill_pit: Drill,
  dig_area: Drill,
  joint: Box,
  pole: Zap,
  cabinet: Box,
  transformer: Zap,
  annotation: MapPin,
  other: MapPin,
};

const FEATURE_COLORS: Record<string, string> = {
  cable: 'text-blue-400',
  drill_segment: 'text-orange-400',
  drill_pit: 'text-red-400',
  dig_area: 'text-orange-300',
  joint: 'text-purple-400',
  pole: 'text-yellow-400',
  cabinet: 'text-green-400',
  transformer: 'text-pink-400',
  annotation: 'text-slate-400',
  other: 'text-gray-400',
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export default function FieldView({ map, pages, features }: Props) {
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [gpsStarting, setGpsStarting] = useState<boolean>(true);
  const [radiusM, setRadiusM] = useState<number>(50);
  const [pageImageUrls, setPageImageUrls] = useState<Record<number, string>>({});
  const watchIdRef = useRef<number | null>(null);

  // Bottom panel tab + chat state
  const [tab, setTab] = useState<'nearby' | 'chat'>('nearby');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Start GPS watch
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation not supported by this browser.');
      setGpsStarting(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsError('');
        setGpsStarting(false);
      },
      (err) => {
        setGpsError(err.message);
        setGpsStarting(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      },
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Fetch signed URLs for PDF overlays on pages with corners
  useEffect(() => {
    const wanted = pages.filter(
      (p) => p.rendered_image_storage_key && p.corner_nw_lat != null,
    );
    let cancelled = false;
    (async () => {
      const entries: Array<[number, string]> = [];
      for (const p of wanted) {
        try {
          const res = await fetch(`/api/maps/${map.id}/pages/${p.page_number}/image`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.url) entries.push([p.page_number, data.url]);
        } catch {}
      }
      if (!cancelled) setPageImageUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [map.id, pages]);

  // Compute nearby features
  const nearby = useMemo(() => {
    if (!position) return [];
    const withDistance = features.map((f) => {
      let d: number;
      if (f.end_lat != null && f.end_lng != null) {
        d = pointToSegmentMeters(
          position.lat, position.lng,
          f.lat, f.lng,
          f.end_lat, f.end_lng,
        );
      } else {
        d = haversineMeters(position.lat, position.lng, f.lat, f.lng);
      }
      return { feature: f, distance: d };
    });
    return withDistance
      .filter((x) => x.distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 50);
  }, [position, features, radiusM]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="px-3 py-2 border-b border-gray-800 flex items-center gap-2 shrink-0">
        <Link
          href={`/maps/${map.id}`}
          className="p-2 -ml-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{map.name}</h1>
          <p className="text-xs text-gray-500 truncate">
            {map.project_code ? `${map.project_code} · ` : ''}
            {map.map_type === 'byggkarta' ? 'Byggkarta' : map.map_type === 'borrkarta' ? 'Borrkarta' : ''}
          </p>
        </div>
        <GpsBadge gpsStarting={gpsStarting} gpsError={gpsError} position={position} />
      </header>

      {/* Map area */}
      <div className="flex-1 relative">
        <FieldMapCanvas
          pages={pages}
          pageImageUrls={pageImageUrls}
          position={position}
          radiusM={radiusM}
        />
      </div>

      {/* Bottom panel: Nearby / Chat tabs */}
      <div className="border-t border-gray-800 bg-gray-900 max-h-[50vh] flex flex-col shrink-0">
        {/* Tab strip */}
        <div className="flex shrink-0 border-b border-gray-800">
          <button
            onClick={() => setTab('nearby')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              tab === 'nearby'
                ? 'text-white bg-gray-900 border-b-2 border-indigo-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <List className="w-4 h-4" />
            Nearby
            {position && nearby.length > 0 && (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                {nearby.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('chat')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              tab === 'chat'
                ? 'text-white bg-gray-900 border-b-2 border-indigo-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Ask agent
            {chat.length > 0 && (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">
                {chat.length}
              </span>
            )}
          </button>
        </div>

        {tab === 'nearby' && (
          <>
        <div className="px-4 py-2.5 flex items-center justify-between bg-gray-900 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold">Within {radiusM}m</h2>
            <p className="text-xs text-gray-500">
              {position
                ? `${nearby.length} feature${nearby.length === 1 ? '' : 's'} nearby`
                : 'Waiting for GPS…'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[20, 50, 100, 250].map((r) => (
              <button
                key={r}
                onClick={() => setRadiusM(r)}
                className={`text-xs px-2 py-1 rounded ${
                  r === radiusM
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {r}m
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
        {!position ? (
          gpsError ? (
            <div className="p-4 text-sm text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {gpsError}. Allow location permission and reload.
            </div>
          ) : (
            <div className="p-4 text-sm text-gray-500 flex items-center gap-2">
              <Compass className="w-4 h-4 animate-pulse" />
              Acquiring GPS…
            </div>
          )
        ) : nearby.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">
            Nothing in range. Try a larger radius, or move closer to the project area.
          </div>
        ) : (
          <ul>
            {nearby.map(({ feature: f, distance }) => {
              const Icon = FEATURE_ICONS[f.feature_type] ?? MapPin;
              const colorCls = FEATURE_COLORS[f.feature_type] ?? 'text-gray-400';
              return (
                <li
                  key={f.id}
                  className="px-4 py-3 border-b border-gray-800/80 last:border-0 flex items-start gap-3"
                >
                  <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${colorCls}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">
                        {f.feature_type.replace(/_/g, ' ')}
                      </span>
                      {f.source_id && (
                        <span className="text-xs text-gray-500">{f.source_id}</span>
                      )}
                    </div>
                    {f.label && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 whitespace-pre-wrap">
                        {f.label}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-0.5">
                      Page {f.page_number}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-indigo-300 shrink-0">
                    {distance < 1 ? '<1m' : `${Math.round(distance)}m`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        </div>
          </>
        )}

        {tab === 'chat' && (
          <ChatPanel
            mapId={map.id}
            position={position}
            radiusM={radiusM}
            chat={chat}
            setChat={setChat}
            input={chatInput}
            setInput={setChatInput}
            loading={chatLoading}
            setLoading={setChatLoading}
            error={chatError}
            setError={setChatError}
            endRef={chatEndRef}
          />
        )}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  mapId: string;
  position: { lat: number; lng: number; accuracy: number } | null;
  radiusM: number;
  chat: ChatMessage[];
  setChat: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  endRef: React.MutableRefObject<HTMLDivElement | null>;
}

function ChatPanel({
  mapId,
  position,
  radiusM,
  chat,
  setChat,
  input,
  setInput,
  loading,
  setLoading,
  error,
  setError,
  endRef,
}: ChatPanelProps) {
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.length, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');
    const newHistory: ChatMessage[] = [...chat, { role: 'user', content: text }];
    setChat(newHistory);
    setLoading(true);
    try {
      const res = await fetch(`/api/maps/${mapId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: newHistory.slice(0, -1),
          position,
          radius_m: radiusM,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      setChat((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        {chat.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-4">
            Ask anything about what is near you. Examples:
            <ul className="mt-3 space-y-1.5 text-xs text-gray-400">
              <li>"What cables are around me?"</li>
              <li>"What should I dig here?"</li>
              <li>"Vad finns inom 50 meter?"</li>
              <li>"Vilken kabel ska läggas på den här sträckan?"</li>
            </ul>
          </div>
        )}
        {chat.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-gray-800 text-gray-100 rounded-bl-md'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl bg-gray-800 text-gray-400 text-sm rounded-bl-md flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <div className="text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-800 p-2 flex items-end gap-2 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Ask about what's near you…"
          className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none max-h-32"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </>
  );
}

function GpsBadge({
  gpsStarting,
  gpsError,
  position,
}: {
  gpsStarting: boolean;
  gpsError: string;
  position: { lat: number; lng: number; accuracy: number } | null;
}) {
  if (gpsError) {
    return (
      <span className="text-xs text-red-400 flex items-center gap-1">
        <AlertCircle className="w-3.5 h-3.5" />
        GPS off
      </span>
    );
  }
  if (gpsStarting || !position) {
    return (
      <span className="text-xs text-gray-500 flex items-center gap-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        GPS…
      </span>
    );
  }
  return (
    <span className="text-xs text-green-400 flex items-center gap-1">
      <Crosshair className="w-3.5 h-3.5" />
      ±{Math.round(position.accuracy)}m
    </span>
  );
}
