'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Polygon,
  Popup,
  ImageOverlay,
  useMap,
} from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Layers, Smartphone } from 'lucide-react';

import type { FieldMap } from '@/types';

// ---------- Types ----------

interface MapPage {
  page_number: number;
  scale_denominator: number | null;
  corner_nw_lat: number | null; corner_nw_lng: number | null;
  corner_ne_lat: number | null; corner_ne_lng: number | null;
  corner_sw_lat: number | null; corner_sw_lng: number | null;
  corner_se_lat: number | null; corner_se_lng: number | null;
  rendered_image_storage_key?: string | null;
  calibration?: any;
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
  pages: MapPage[];
  features: MapFeature[];
}

// ---------- Feature styling ----------

const FEATURE_COLORS: Record<string, string> = {
  cable: '#60a5fa',          // blue
  drill_segment: '#f97316',  // orange
  drill_pit: '#ef4444',      // red
  dig_area: '#fb923c',       // light orange
  joint: '#a78bfa',          // purple
  pole: '#fbbf24',           // yellow
  cabinet: '#10b981',        // green
  transformer: '#ec4899',    // pink
  annotation: '#94a3b8',     // slate
  other: '#9ca3af',          // gray
};

// Line weight per feature type
const LINE_WEIGHT: Record<string, number> = {
  cable: 4,
  drill_segment: 5,
  dig_area: 4,
};

// Marker size per feature type
const MARKER_SIZE: Record<string, number> = {
  drill_pit: 18,
  joint: 14,
  pole: 14,
  cabinet: 16,
  transformer: 18,
  annotation: 10,
  other: 12,
};

function colorFor(type: string): string {
  return FEATURE_COLORS[type] ?? FEATURE_COLORS.other;
}

function weightFor(type: string): number {
  return LINE_WEIGHT[type] ?? 3;
}

function sizeFor(type: string): number {
  return MARKER_SIZE[type] ?? 14;
}

// Marker icon factory — circle with white border and subtle shadow
function makeMarkerIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border:2.5px solid #fff;
      box-shadow:0 0 0 1.5px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4);
    "></div>`,
  });
}

// ---------- Auto-fit hook ----------

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [bounds, map]);
  return null;
}

// ---------- Main view ----------

export default function MapView({ map, pages, features }: Props) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => {
    return new Set(Object.keys(FEATURE_COLORS));
  });
  const [selectedPage, setSelectedPage] = useState<number | 'all'>('all');

  // Image overlay state
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.8);
  const [showFeatures, setShowFeatures] = useState<boolean>(false);
  const [pageImageUrls, setPageImageUrls] = useState<Record<number, string>>({});

  // Fetch signed URLs for all calibrated pages (or all pages with corners)
  useEffect(() => {
    const wanted = pages.filter(
      (p) => p.rendered_image_storage_key && p.corner_nw_lat != null,
    );
    let cancelled = false;
    (async () => {
      const entries: Array<[number, string]> = [];
      for (const p of wanted) {
        try {
          const res = await fetch(
            `/api/maps/${map.id}/pages/${p.page_number}/image`,
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (data.url) entries.push([p.page_number, data.url]);
        } catch {
          // skip
        }
      }
      if (!cancelled) {
        setPageImageUrls(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [map.id, pages]);

  // Compute bounds from all corners + features
  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const lats: number[] = [];
    const lngs: number[] = [];

    for (const p of pages) {
      for (const [lat, lng] of [
        [p.corner_nw_lat, p.corner_nw_lng],
        [p.corner_ne_lat, p.corner_ne_lng],
        [p.corner_sw_lat, p.corner_sw_lng],
        [p.corner_se_lat, p.corner_se_lng],
      ]) {
        if (lat != null && lng != null) {
          lats.push(lat);
          lngs.push(lng);
        }
      }
    }
    for (const f of features) {
      lats.push(f.lat);
      lngs.push(f.lng);
      if (f.end_lat != null && f.end_lng != null) {
        lats.push(f.end_lat);
        lngs.push(f.end_lng);
      }
    }

    if (lats.length === 0) return null;
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [pages, features]);

  // Centre/zoom defaults — these only matter on first render; FitBounds takes over.
  const initialCenter: [number, number] = bounds
    ? [
        (
          (bounds as [[number, number], [number, number]])[0][0] +
          (bounds as [[number, number], [number, number]])[1][0]
        ) / 2,
        (
          (bounds as [[number, number], [number, number]])[0][1] +
          (bounds as [[number, number], [number, number]])[1][1]
        ) / 2,
      ]
    : [63.0, 17.5]; // fallback to central-northern Sweden

  // Filter features by type + page
  const visibleFeatures = features.filter(
    (f) =>
      selectedTypes.has(f.feature_type in FEATURE_COLORS ? f.feature_type : 'other') &&
      (selectedPage === 'all' || f.page_number === selectedPage),
  );

  // Feature type counts (for the legend)
  const counts: Record<string, number> = {};
  for (const f of features) {
    const k = f.feature_type in FEATURE_COLORS ? f.feature_type : 'other';
    counts[k] = (counts[k] ?? 0) + 1;
  }

  function toggleType(t: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const pagesWithCorners = pages.filter((p) => p.corner_nw_lat != null);

  return (
    <div className="flex h-full">
      {/* Left sidebar: layer controls, filters, stats */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
        {/* Layers panel */}
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            Layers
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOverlay}
                onChange={(e) => setShowOverlay(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-500"
              />
              <span className="text-sm text-gray-300">PDF overlay</span>
            </label>
            {showOverlay && (
              <div className="pl-6 mt-1">
                <label className="text-xs text-gray-500 block mb-1">
                  Opacity: {Math.round(overlayOpacity * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFeatures}
                onChange={(e) => setShowFeatures(e.target.checked)}
                className="w-3.5 h-3.5 accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Extracted features</span>
            </label>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Pages
          </h3>
          <select
            value={selectedPage === 'all' ? 'all' : String(selectedPage)}
            onChange={(e) =>
              setSelectedPage(
                e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10),
              )
            }
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All pages ({pages.length})</option>
            {pages.map((p) => (
              <option key={p.page_number} value={p.page_number}>
                Page {p.page_number}
                {p.scale_denominator ? ` · 1:${p.scale_denominator}` : ''}
                {p.corner_nw_lat == null ? ' · no grid' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Feature types
          </h3>
          <div className="space-y-1">
            {Object.entries(FEATURE_COLORS).map(([t, color]) => {
              const checked = selectedTypes.has(t);
              const count = counts[t] ?? 0;
              return (
                <label
                  key={t}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-800 ${
                    count === 0 ? 'opacity-40' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleType(t)}
                    className="w-3.5 h-3.5 accent-indigo-500"
                  />
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="text-sm text-gray-300 flex-1 capitalize">
                    {t.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-500">{count}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-gray-800 text-xs text-gray-500 space-y-1.5">
          <div>
            Pages with grid:{' '}
            <span className="text-gray-300">
              {pagesWithCorners.length}/{pages.length}
            </span>
          </div>
          <div>
            Calibrated pages:{' '}
            <span className="text-gray-300">
              {pages.filter((p) => p.calibration).length}/{pages.length}
            </span>
          </div>
          <div>
            Total features: <span className="text-gray-300">{features.length}</span>
          </div>
          <div>
            Showing: <span className="text-gray-300">{visibleFeatures.length}</span>
          </div>
        </div>

        <Link
          href={`/maps/${map.id}/calibrate${
            selectedPage === 'all' ? '' : `?page=${selectedPage}`
          }`}
          className="mt-5 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          <Crosshair className="w-4 h-4" />
          Calibrate {selectedPage === 'all' ? 'pages' : `page ${selectedPage}`}
        </Link>

        <Link
          href={`/field/${map.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          Open field view
        </Link>
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={initialCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <FitBounds bounds={bounds} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* PDF page image overlays — the actual map rendered as an image,
              positioned on top of OSM using the calibrated corner coordinates */}
          {showOverlay && pagesWithCorners.map((p) => {
            const url = pageImageUrls[p.page_number];
            if (!url) return null;
            if (selectedPage !== 'all' && selectedPage !== p.page_number) return null;
            const south = Math.min(p.corner_sw_lat!, p.corner_se_lat!);
            const north = Math.max(p.corner_nw_lat!, p.corner_ne_lat!);
            const west = Math.min(p.corner_nw_lng!, p.corner_sw_lng!);
            const east = Math.max(p.corner_ne_lng!, p.corner_se_lng!);
            return (
              <ImageOverlay
                key={`overlay-${p.page_number}`}
                url={url}
                bounds={[
                  [south, west],
                  [north, east],
                ]}
                opacity={overlayOpacity}
              />
            );
          })}

          {/* Page-corner rectangles, drawn lightly to show extent */}
          {pagesWithCorners.map((p) => {
            const ring: [number, number][] = [
              [p.corner_nw_lat!, p.corner_nw_lng!],
              [p.corner_ne_lat!, p.corner_ne_lng!],
              [p.corner_se_lat!, p.corner_se_lng!],
              [p.corner_sw_lat!, p.corner_sw_lng!],
            ];
            return (
              <Polygon
                key={`page-${p.page_number}`}
                positions={ring}
                pathOptions={{
                  color: '#6366f1',
                  weight: 1.5,
                  opacity: 0.6,
                  fillColor: '#6366f1',
                  fillOpacity: 0.05,
                }}
              >
                <Popup>
                  <strong>Page {p.page_number}</strong>
                  <br />
                  {p.scale_denominator ? `Scale 1:${p.scale_denominator}` : 'Scale unknown'}
                </Popup>
              </Polygon>
            );
          })}

          {/* Features (off by default — the image overlay already shows them
              visually. Toggle on from the sidebar for the structured data view.) */}
          {showFeatures && visibleFeatures.map((f) => {
            const color = colorFor(f.feature_type);
            // Line feature
            if (f.end_lat != null && f.end_lng != null) {
              return (
                <Polyline
                  key={f.id}
                  positions={[
                    [f.lat, f.lng],
                    [f.end_lat, f.end_lng],
                  ]}
                  pathOptions={{
                    color,
                    weight: weightFor(f.feature_type),
                    opacity: 0.95,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                >
                  <Popup>
                    <FeaturePopup f={f} />
                  </Popup>
                </Polyline>
              );
            }
            // Point feature
            return (
              <Marker
                key={f.id}
                position={[f.lat, f.lng]}
                icon={makeMarkerIcon(color, sizeFor(f.feature_type))}
              >
                <Popup>
                  <FeaturePopup f={f} />
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

function FeaturePopup({ f }: { f: MapFeature }) {
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {f.feature_type.replace(/_/g, ' ')}
        {f.source_id ? <span style={{ color: '#666' }}> · {f.source_id}</span> : null}
      </div>
      {f.label && (
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 4 }}>
          {f.label}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#666' }}>
        Page {f.page_number} · {f.lat.toFixed(5)}, {f.lng.toFixed(5)}
      </div>
      {f.props && Object.keys(f.props).length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: '#666', cursor: 'pointer' }}>
            Properties
          </summary>
          <pre style={{ fontSize: 10, marginTop: 4 }}>
            {JSON.stringify(f.props, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
