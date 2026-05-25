'use client';

import { memo, useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapFeature, ToolState } from './EditorClient';
import { FEATURE_COLORS } from './EditorClient';

interface Props {
  features: MapFeature[];
  selectedId: string | null;
  toolState: ToolState;
  tilesType: 'osm' | 'satellite';
  flyTo: { lat: number; lng: number; zoom?: number } | null;
  onMapClick: (lat: number, lng: number) => void;
  onFeatureClick: (id: string) => void;
}

function FlyToHandler({ target }: { target: Props['flyTo'] }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? 18, {
      animate: true,
      duration: 0.8,
    });
  }, [target, map]);
  return null;
}

function makeMarkerIcon(color: string, size: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border:3px solid #fff;
      box-shadow:0 0 0 ${selected ? '3px' : '1.5px'} ${selected ? 'rgba(99,102,241,0.7)' : 'rgba(0,0,0,0.5)'}, 0 2px 6px rgba(0,0,0,0.4);
      cursor:pointer;
    "></div>`,
  });
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function CursorOverride({ tool }: { tool: ToolState['tool'] }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (tool === 'feature' || tool === 'route' || tool === 'section') el.style.cursor = 'crosshair';
    else if (tool === 'delete') el.style.cursor = 'not-allowed';
    else el.style.cursor = '';
    return () => {
      el.style.cursor = '';
    };
  }, [tool, map]);
  return null;
}

const TILE_SOURCES = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 19,
  },
};

export default function EditorCanvas({
  features,
  selectedId,
  toolState,
  tilesType,
  flyTo,
  onMapClick,
  onFeatureClick,
}: Props) {
  // Auto-center: fit to features if any, else Sweden
  const initialCenter = useMemo<[number, number]>(() => {
    if (features.length === 0) return [63.0, 17.5]; // central Sweden default
    const lats = features.map((f) => f.lat);
    const lngs = features.map((f) => f.lng);
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];
  }, [features]);

  const initialZoom = features.length > 0 ? 16 : 5;
  const source = TILE_SOURCES[tilesType];

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      maxZoom={22}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
      preferCanvas={true}
    >
      <CursorOverride tool={toolState.tool} />
      <FlyToHandler target={flyTo} />
      <TileLayer
        key={tilesType}
        url={source.url}
        attribution={source.attribution}
        maxZoom={22}
        maxNativeZoom={source.maxNativeZoom}
      />
      <MapClickHandler onClick={onMapClick} />

      {/* Straight-line drawing in progress: show start marker */}
      {toolState.drawing && (
        <Marker
          position={[toolState.drawing.start.lat, toolState.drawing.start.lng]}
          icon={L.divIcon({
            className: '',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            html: `<div style="
              width:16px; height:16px; border-radius:50%;
              background:#f97316; border:3px solid #fff;
              box-shadow:0 0 0 2px rgba(0,0,0,0.5);
            "></div>`,
          })}
        />
      )}

      {/* Section pick start anchor (bigger + glow for visibility) */}
      {toolState.sectionPick && (
        <Marker
          position={[toolState.sectionPick.start.lat, toolState.sectionPick.start.lng]}
          icon={L.divIcon({
            className: '',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: `<div style="
              width:22px; height:22px; border-radius:50%;
              background:#10b981; border:4px solid #fff;
              box-shadow:0 0 0 3px rgba(16,185,129,0.4), 0 2px 8px rgba(0,0,0,0.6);
            "></div>`,
          })}
        />
      )}

      {/* Path drawing in progress: show all vertices + connecting line */}
      {toolState.pathDrawing && toolState.pathDrawing.vertices.length > 0 && (
        <>
          {toolState.pathDrawing.vertices.length >= 2 && (
            <Polyline
              positions={toolState.pathDrawing.vertices.map((v) => [v.lat, v.lng])}
              pathOptions={{
                color: '#f97316',
                weight: 4,
                opacity: 0.9,
                dashArray: '6 6',
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}
          {toolState.pathDrawing.vertices.map((v, i) => (
            <Marker
              key={i}
              position={[v.lat, v.lng]}
              icon={L.divIcon({
                className: '',
                iconSize: [12, 12],
                iconAnchor: [6, 6],
                html: `<div style="
                  width:12px; height:12px; border-radius:50%;
                  background:#f97316; border:2px solid #fff;
                  box-shadow:0 0 0 1.5px rgba(0,0,0,0.5);
                "></div>`,
              })}
            />
          ))}
        </>
      )}

      <FeaturesLayer
        features={features}
        selectedId={selectedId}
        onFeatureClick={onFeatureClick}
      />
    </MapContainer>
  );
}

/**
 * Renders all saved features as Leaflet polylines and markers.
 * Memoised so that pure toolState changes (drawing, sectionPick, etc.) in
 * the parent EditorCanvas don't trigger a re-render of every feature.
 */
const FeaturesLayer = memo(function FeaturesLayer({
  features,
  selectedId,
  onFeatureClick,
}: {
  features: MapFeature[];
  selectedId: string | null;
  onFeatureClick: (id: string) => void;
}) {
  return (
    <>
      {features.map((f) => {
        const color = FEATURE_COLORS[f.feature_type] ?? FEATURE_COLORS.other;
        const selected = f.id === selectedId;

        const pathVerts = Array.isArray(f.props?.path)
          ? (f.props.path as { lat: number; lng: number }[])
          : null;
        if (pathVerts && pathVerts.length >= 2) {
          return (
            <Polyline
              key={f.id}
              positions={pathVerts.map((p) => [p.lat, p.lng])}
              eventHandlers={{ click: () => onFeatureClick(f.id) }}
              pathOptions={{
                color,
                weight: selected ? 7 : 4,
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
              eventHandlers={{ click: () => onFeatureClick(f.id) }}
              pathOptions={{
                color,
                weight: selected ? 7 : 4,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          );
        }

        const size = selected ? 22 : 16;
        return (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={makeMarkerIcon(color, size, selected)}
            eventHandlers={{ click: () => onFeatureClick(f.id) }}
          />
        );
      })}
    </>
  );
});
