'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Marker,
  Polyline,
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

interface MapFeature {
  id: string;
  feature_type: string;
  lat: number;
  lng: number;
  end_lat: number | null;
  end_lng: number | null;
  source_id: string | null;
  label: string | null;
  props: Record<string, any>;
}

interface Props {
  pages: MapPageRow[];
  pageImageUrls: Record<number, string>;
  features: MapFeature[];
  position: { lat: number; lng: number; accuracy: number } | null;
  radiusM: number;
  overlayOpacity: number;
  followMe: boolean;
  onPanned?: () => void;
}

const FEATURE_COLORS: Record<string, string> = {
  cable: '#60a5fa',
  drill_segment: '#dc2626',
  drill_pit: '#ef4444',
  dig_area: '#fb923c',
  joint: '#a78bfa',
  pole: '#fbbf24',
  cabinet: '#10b981',
  transformer: '#ec4899',
  annotation: '#94a3b8',
  route: '#0a0a0a',
  other: '#9ca3af',
};

const POSITION_ICON = L.divIcon({
  className: 'gps-position-marker',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: `<div style="
    width:28px; height:28px; border-radius:50%;
    background:#3b82f6; border:4px solid #fff;
    box-shadow:0 0 0 2px rgba(59,130,246,0.4), 0 2px 8px rgba(0,0,0,0.4);
  "></div>`,
});

function makeMarkerIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border:3px solid #fff;
      box-shadow:0 0 0 1.5px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
  });
}

function ViewController({
  position,
  pages,
  features,
  followMe,
  onPanned,
}: {
  position: { lat: number; lng: number } | null;
  pages: MapPageRow[];
  features: MapFeature[];
  followMe: boolean;
  onPanned?: () => void;
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  useEffect(() => {
    if (initialFitDone.current) return;
    if (position) {
      map.setView([position.lat, position.lng], 18, { animate: true });
      initialFitDone.current = true;
      return;
    }

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
      const path = Array.isArray(f.props?.path) ? f.props.path : null;
      if (path) {
        for (const v of path) {
          lats.push(v.lat);
          lngs.push(v.lng);
        }
      }
    }
    if (lats.length > 0) {
      const bounds: LatLngBoundsExpression = [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ];
      map.fitBounds(bounds, { padding: [40, 40] });
      initialFitDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, pages, features]);

  useEffect(() => {
    if (followMe && position) {
      map.setView([position.lat, position.lng], map.getZoom() || 18, { animate: true });
    }
  }, [followMe, position, map]);

  useEffect(() => {
    if (!onPanned) return;
    const handler = (e: any) => {
      if (e?.originalEvent) onPanned();
    };
    map.on('dragstart', handler);
    return () => {
      map.off('dragstart', handler);
    };
  }, [map, onPanned]);

  return null;
}

export default function FieldMapCanvas({
  pages,
  pageImageUrls,
  features,
  position,
  radiusM,
  overlayOpacity,
  followMe,
  onPanned,
}: Props) {
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
      maxZoom={22}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      preferCanvas={true}
    >
      <ViewController
        position={position}
        pages={pages}
        features={features}
        followMe={followMe}
        onPanned={onPanned}
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={22}
        maxNativeZoom={19}
      />

      {/* PDF overlays */}
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
            opacity={overlayOpacity}
          />
        );
      })}

      {/* Features placed by the designer */}
      {features.map((f) => {
        const color = FEATURE_COLORS[f.feature_type] ?? FEATURE_COLORS.other;
        const path = Array.isArray(f.props?.path) ? (f.props.path as { lat: number; lng: number }[]) : null;
        if (path && path.length >= 2) {
          return (
            <Polyline
              key={f.id}
              positions={path.map((p) => [p.lat, p.lng])}
              pathOptions={{
                color,
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          );
        }
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
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          );
        }
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={makeMarkerIcon(color, 18)}
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
