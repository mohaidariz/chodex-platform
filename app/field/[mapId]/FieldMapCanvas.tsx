'use client';

import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Marker,
  Circle,
  useMap,
} from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapPageRow {
  page_number: number;
  corner_nw_lat: number | null; corner_nw_lng: number | null;
  corner_ne_lat: number | null; corner_ne_lng: number | null;
  corner_sw_lat: number | null; corner_sw_lng: number | null;
  corner_se_lat: number | null; corner_se_lng: number | null;
}

interface Props {
  pages: MapPageRow[];
  pageImageUrls: Record<number, string>;
  position: { lat: number; lng: number; accuracy: number } | null;
  radiusM: number;
}

// Blue dot for the user's position (Google-Maps style)
const POSITION_ICON = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="
    width:22px; height:22px; border-radius:50%;
    background:#3b82f6; border:3px solid #fff;
    box-shadow:0 0 0 2px rgba(59,130,246,0.4), 0 2px 6px rgba(0,0,0,0.4);
  "></div>`,
});

function CenterOnPosition({
  position,
  pages,
}: {
  position: { lat: number; lng: number } | null;
  pages: MapPageRow[];
}) {
  const map = useMap();
  // First load: fit to all pages or to position
  useEffect(() => {
    if (position) {
      map.setView([position.lat, position.lng], 18, { animate: true });
    } else {
      // Fit to all pages with corners
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
      if (lats.length > 0) {
        const bounds: LatLngBoundsExpression = [
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)],
        ];
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }
    // Re-run only when position appears for the first time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!position]);
  return null;
}

export default function FieldMapCanvas({ pages, pageImageUrls, position, radiusM }: Props) {
  const pagesWithCorners = useMemo(
    () => pages.filter((p) => p.corner_nw_lat != null),
    [pages],
  );

  const center: [number, number] = position
    ? [position.lat, position.lng]
    : [63.0, 17.5];

  return (
    <MapContainer
      center={center}
      zoom={position ? 18 : 9}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <CenterOnPosition position={position} pages={pages} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* PDF overlays for each calibrated page */}
      {pagesWithCorners.map((p) => {
        const url = pageImageUrls[p.page_number];
        if (!url) return null;
        const south = Math.min(p.corner_sw_lat!, p.corner_se_lat!);
        const north = Math.max(p.corner_nw_lat!, p.corner_ne_lat!);
        const west = Math.min(p.corner_nw_lng!, p.corner_sw_lng!);
        const east = Math.max(p.corner_ne_lng!, p.corner_se_lng!);
        return (
          <ImageOverlay
            key={`overlay-${p.page_number}`}
            url={url}
            bounds={[[south, west], [north, east]]}
            opacity={0.85}
          />
        );
      })}

      {/* User position + radius ring */}
      {position && (
        <>
          <Circle
            center={[position.lat, position.lng]}
            radius={radiusM}
            pathOptions={{
              color: '#3b82f6',
              weight: 1.5,
              fillColor: '#3b82f6',
              fillOpacity: 0.08,
            }}
          />
          <Circle
            center={[position.lat, position.lng]}
            radius={position.accuracy}
            pathOptions={{
              color: '#3b82f6',
              weight: 0,
              fillColor: '#3b82f6',
              fillOpacity: 0.15,
            }}
          />
          <Marker
            position={[position.lat, position.lng]}
            icon={POSITION_ICON}
          />
        </>
      )}
    </MapContainer>
  );
}
