'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, RotateCcw, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  mapId: string;
  pageNumber: number;
  scaleDenominator: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  hasStoredImage: boolean;
  existingCalibration: any;
}

// Two distinct pin colors for the two anchors
const PIN_COLORS = ['#f97316', '#3b82f6']; // orange, blue

function makePinIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    html: `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C8 0 3 5 3 11c0 8 11 17 11 17s11-9 11-17c0-6-5-11-11-11z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="14" y="14" font-family="ui-sans-serif,system-ui" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">${label}</text>
    </svg>`,
  });
}

function MapClickHandler({ onClick }: { onClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

type Anchor = {
  pixel: { x: number; y: number } | null;
  world: { lat: number; lng: number } | null;
};

const emptyAnchor = (): Anchor => ({ pixel: null, world: null });

export default function CalibrationWizard({
  mapId,
  pageNumber,
  imageWidth,
  imageHeight,
  hasStoredImage,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string>('');

  const [anchors, setAnchors] = useState<[Anchor, Anchor]>([emptyAnchor(), emptyAnchor()]);
  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasStoredImage) {
        setImageError('No rendered image saved for this page. Re-upload the map to regenerate page images.');
        return;
      }
      try {
        const res = await fetch(`/api/maps/${mapId}/pages/${pageNumber}/image`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load image');
        }
        const data = await res.json();
        if (!cancelled) setImageUrl(data.url);
      } catch (e: any) {
        if (!cancelled) setImageError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId, pageNumber, hasStoredImage]);

  function setAnchor(idx: 0 | 1, patch: Partial<Anchor>) {
    setAnchors((prev) => {
      const next: [Anchor, Anchor] = [{ ...prev[0] }, { ...prev[1] }];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setSaveError('');
    setSavedAt(null);
  }

  function handlePageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgRef.current || !imageWidth || !imageHeight) return;
    const rect = imgRef.current.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const x = (displayX / rect.width) * imageWidth;
    const y = (displayY / rect.height) * imageHeight;
    setAnchor(activeIndex, { pixel: { x, y } });
    // If we set the pixel and world is already set, move to next anchor
    if (anchors[activeIndex].world) {
      maybeAdvance(activeIndex);
    }
  }

  function handleMapClick(latlng: L.LatLng) {
    setAnchor(activeIndex, { world: { lat: latlng.lat, lng: latlng.lng } });
    if (anchors[activeIndex].pixel) {
      maybeAdvance(activeIndex);
    }
  }

  function maybeAdvance(idx: 0 | 1) {
    if (idx === 0) setActiveIndex(1);
  }

  function reset() {
    setAnchors([emptyAnchor(), emptyAnchor()]);
    setActiveIndex(0);
    setSaveError('');
    setSavedAt(null);
  }

  async function save() {
    const [a, b] = anchors;
    const a1Ready = a.pixel && a.world;
    const a2Ready = b.pixel && b.world;
    if (!a1Ready) return;

    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        anchors: [
          { pixel_x: a.pixel!.x, pixel_y: a.pixel!.y, lat: a.world!.lat, lng: a.world!.lng },
          ...(a2Ready
            ? [{ pixel_x: b.pixel!.x, pixel_y: b.pixel!.y, lat: b.world!.lat, lng: b.world!.lng }]
            : []),
        ],
      };
      const res = await fetch(
        `/api/maps/${mapId}/pages/${pageNumber}/calibration`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedAt(new Date().toISOString());
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Pin positions over the image (display-space)
  const pinDisplay = (idx: 0 | 1) => {
    const a = anchors[idx];
    if (!a.pixel || !imgRef.current || !imageWidth || !imageHeight) return null;
    const rect = imgRef.current.getBoundingClientRect();
    return {
      left: (a.pixel.x / imageWidth) * rect.width,
      top: (a.pixel.y / imageHeight) * rect.height,
    };
  };

  const canSave = anchors[0].pixel && anchors[0].world;
  const fullyTwoPoint = anchors[0].pixel && anchors[0].world && anchors[1].pixel && anchors[1].world;

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div className="px-6 py-3 bg-gray-900 border-b border-gray-800 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
          {[0, 1].map((i) => {
            const a = anchors[i as 0 | 1];
            const done = !!(a.pixel && a.world);
            const partial = !!a.pixel !== !!a.world;
            const active = activeIndex === i && !done;
            return (
              <button
                key={i}
                onClick={() => setActiveIndex(i as 0 | 1)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                    : done
                    ? 'bg-green-500/10 border border-green-500/30 text-green-300'
                    : partial
                    ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
                    : 'bg-gray-800 border border-gray-700 text-gray-400'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: PIN_COLORS[i] }}
                />
                Anchor {i + 1}
                {done ? <Check className="w-3.5 h-3.5" /> : null}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 flex-1 truncate">
          {!anchors[activeIndex].pixel
            ? `Click a recognizable point on the page (anchor ${activeIndex + 1}).`
            : !anchors[activeIndex].world
            ? `Now click the same point on the OpenStreetMap on the right.`
            : activeIndex === 0 && !fullyTwoPoint
            ? 'Anchor 1 done. Pick a second anchor for highest accuracy (or save with just 1).'
            : 'Both anchors set. Ready to save.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : fullyTwoPoint ? 'Save 2-point calibration' : 'Save 1-point calibration'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {saveError}
        </div>
      )}

      {savedAt && (
        <div className="px-6 py-2 bg-green-500/10 border-b border-green-500/20 text-green-400 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          Calibration saved. Return to the map view to see the overlay snap into position.
        </div>
      )}

      {/* Side-by-side panes */}
      <div className="flex-1 flex overflow-hidden">
        {/* Page image (left) */}
        <div className="flex-1 bg-gray-950 overflow-auto relative">
          {imageError ? (
            <div className="p-6 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {imageError}
            </div>
          ) : !imageUrl ? (
            <div className="p-6 flex items-center gap-2 text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading page image…
            </div>
          ) : (
            <div className="relative inline-block min-w-full min-h-full" onClick={handlePageClick}>
              <img
                ref={imgRef}
                src={imageUrl}
                alt={`Page ${pageNumber}`}
                className="max-w-none cursor-crosshair"
                style={{ display: 'block' }}
                draggable={false}
              />
              {[0, 1].map((i) => {
                const pos = pinDisplay(i as 0 | 1);
                if (!pos) return null;
                const color = PIN_COLORS[i];
                return (
                  <div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{ left: pos.left - 14, top: pos.top - 28 }}
                  >
                    <svg width="28" height="28" viewBox="0 0 28 28">
                      <path
                        d="M14 0C8 0 3 5 3 11c0 8 11 17 11 17s11-9 11-17c0-6-5-11-11-11z"
                        fill={color}
                        stroke="#fff"
                        strokeWidth="2"
                      />
                      <text
                        x="14"
                        y="14"
                        fontFamily="ui-sans-serif,system-ui"
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                        fill="#fff"
                      >
                        {i + 1}
                      </text>
                    </svg>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* OSM map (right) */}
        <div className="flex-1 border-l border-gray-800 relative">
          <MapContainer
            center={[63.0, 17.5]}
            zoom={9}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; OSM'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onClick={handleMapClick} />
            {anchors.map((a, i) =>
              a.world ? (
                <Marker
                  key={i}
                  position={[a.world.lat, a.world.lng]}
                  icon={makePinIcon(PIN_COLORS[i], String(i + 1))}
                />
              ) : null,
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
