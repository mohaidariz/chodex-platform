'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Smartphone, Save, Loader2, MousePointer2,
  MapPin, Trash2, Cable, Drill, Box, Zap, Triangle, MoreHorizontal,
  Layers, ChevronDown, AlertCircle, Undo2, Search, X, Spline, CheckCircle2,
  Ruler, Plus,
} from 'lucide-react';

import EditorCanvas from './EditorCanvas';
import type { FieldMap } from '@/types';

// ---------- Types ----------

export interface MapFeature {
  id: string;
  map_id: string;
  page_number: number;
  feature_type: string;
  lat: number;
  lng: number;
  end_lat: number | null;
  end_lng: number | null;
  source_id: string | null;
  label: string | null;
  props: Record<string, any>;
  created_at?: string;
}

export type Tool = 'select' | 'feature' | 'route' | 'section' | 'delete';

// Three primary feature kinds the designer can place from the Features dropdown.
export type FeatureKind = 'transformer' | 'cable' | 'drilling';

export interface ToolState {
  tool: Tool;
  // Currently-selected kind in the Features dropdown.
  featureKind: FeatureKind;
  // Straight-line drawing state (for Cable / Drilling).
  drawing: { start: { lat: number; lng: number } } | null;
  // Multi-vertex route drawing state (black path).
  pathDrawing: { vertices: { lat: number; lng: number }[] } | null;
  // Sub-segment selection on an existing parent route.
  sectionPick: { parentId: string; start: { lat: number; lng: number } } | null;
}

// Configuration for the three feature kinds.
// Each kind has a feature_type (matches database), an icon, a color, and a
// "shape" (point or line).
const FEATURE_KINDS: {
  key: FeatureKind;
  label: string;
  icon: any;
  color: string;
  shape: 'point' | 'path';
  feature_type: string;
}[] = [
  { key: 'transformer', label: 'Transformer', icon: Zap, color: '#ec4899', shape: 'point', feature_type: 'transformer' },
  { key: 'cable', label: 'Cable', icon: Cable, color: '#60a5fa', shape: 'path', feature_type: 'cable' },
  { key: 'drilling', label: 'Drilling', icon: Drill, color: '#dc2626', shape: 'path', feature_type: 'drill_segment' },
];

const ROUTE_COLOR = '#0a0a0a'; // black for the work-route path
const ROUTE_FEATURE_TYPE = 'route';

export const FEATURE_COLORS: Record<string, string> = {
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

export default function EditorClient({ mapId }: { mapId: string }) {
  const [map, setMap] = useState<FieldMap | null>(null);
  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [loading, setLoading] = useState(true);
  // loadError: fatal, blocks the editor UI from rendering
  const [loadError, setLoadError] = useState('');
  // error: transient toast (saving failures, validation), does not block UI
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [toolState, setToolState] = useState<ToolState>({
    tool: 'select',
    featureKind: 'transformer',
    drawing: null,
    pathDrawing: null,
    sectionPick: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tilesType, setTilesType] = useState<'osm' | 'satellite'>('osm');
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // Undo stack — last 50 actions
  type UndoAction =
    | { kind: 'add'; feature: MapFeature }
    | { kind: 'delete'; feature: MapFeature }
    | { kind: 'update'; id: string; previous: Partial<MapFeature> };
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  function pushUndo(action: UndoAction) {
    setUndoStack((s) => [...s.slice(-49), action]);
  }

  // Load data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/maps/${mapId}`);
        if (!res.ok) throw new Error('Project not found');
        const data = await res.json();
        if (cancelled) return;
        setMap(data.map);
        setFeatures(data.features ?? []);
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  const selected = useMemo(
    () => features.find((f) => f.id === selectedId) ?? null,
    [features, selectedId],
  );

  // ---------- Feature CRUD ----------

  async function addPointFeature(lat: number, lng: number, featureType: string) {
    setSavingId('new');
    try {
      const res = await fetch(`/api/maps/${mapId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_type: featureType,
          lat,
          lng,
          label: defaultLabel(featureType),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      const created = Array.isArray(data) ? data[0] : data;
      setFeatures((prev) => [...prev, created]);
      setSelectedId(created.id);
      pushUndo({ kind: 'add', feature: created });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function addLineFeature(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number,
    featureType: string,
  ) {
    setSavingId('new');
    try {
      const res = await fetch(`/api/maps/${mapId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_type: featureType,
          lat: startLat,
          lng: startLng,
          end_lat: endLat,
          end_lng: endLng,
          label: defaultLabel(featureType),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      const created = Array.isArray(data) ? data[0] : data;
      setFeatures((prev) => [...prev, created]);
      setSelectedId(created.id);
      pushUndo({ kind: 'add', feature: created });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function updateFeature(id: string, patch: Partial<MapFeature>, skipUndo = false) {
    setSavingId(id);
    try {
      const previous = features.find((f) => f.id === id);
      const res = await fetch(`/api/maps/${mapId}/features/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setFeatures((prev) => prev.map((f) => (f.id === id ? data : f)));
      if (!skipUndo && previous) {
        const previousSnapshot: Partial<MapFeature> = {};
        for (const k of Object.keys(patch) as (keyof MapFeature)[]) {
          (previousSnapshot as any)[k] = (previous as any)[k];
        }
        pushUndo({ kind: 'update', id, previous: previousSnapshot });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  }

  async function deleteFeature(id: string, skipUndo = false) {
    try {
      const previous = features.find((f) => f.id === id);
      const res = await fetch(`/api/maps/${mapId}/features/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      setFeatures((prev) => prev.filter((f) => f.id !== id));
      if (selectedId === id) setSelectedId(null);
      if (!skipUndo && previous) {
        pushUndo({ kind: 'delete', feature: previous });
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  // ---------- Undo ----------

  async function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    if (last.kind === 'add') {
      // Undo an "add" = delete the feature, without re-recording undo
      await deleteFeature(last.feature.id, true);
    } else if (last.kind === 'delete') {
      // Undo a "delete" = re-create the feature with same props
      const f = last.feature;
      const res = await fetch(`/api/maps/${mapId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_type: f.feature_type,
          lat: f.lat,
          lng: f.lng,
          end_lat: f.end_lat,
          end_lng: f.end_lng,
          source_id: f.source_id,
          label: f.label,
          props: f.props ?? {},
          page_number: f.page_number,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const created = Array.isArray(data) ? data[0] : data;
        setFeatures((prev) => [...prev, created]);
      }
    } else if (last.kind === 'update') {
      await updateFeature(last.id, last.previous, true);
    }
  }

  // Keyboard shortcuts
  // Ctrl/Cmd+Z = undo
  // Enter (while in path mode with at least 2 vertices) = finish path
  // Escape = cancel drawing
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'Enter' && toolState.pathDrawing) {
        e.preventDefault();
        finishPath();
      } else if (e.key === 'Escape') {
        setToolState((s) => ({ ...s, drawing: null, pathDrawing: null, sectionPick: null }));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, features, toolState]);

  // ---------- Map click handler ----------

  function handleMapClick(lat: number, lng: number) {
    if (toolState.tool === 'feature') {
      const kind = FEATURE_KINDS.find((k) => k.key === toolState.featureKind);
      if (!kind) return;
      if (kind.shape === 'point') {
        addPointFeature(lat, lng, kind.feature_type);
      } else {
        // Multi-vertex path drawing for Cable / Drilling.
        setToolState((s) => {
          const existing = s.pathDrawing?.vertices ?? [];
          return {
            ...s,
            pathDrawing: { vertices: [...existing, { lat, lng }] },
          };
        });
      }
    } else if (toolState.tool === 'route') {
      setToolState((s) => {
        const existing = s.pathDrawing?.vertices ?? [];
        return {
          ...s,
          pathDrawing: { vertices: [...existing, { lat, lng }] },
        };
      });
    } else if (toolState.tool === 'section') {
      // Section selection works on any existing line/path feature.
      // If the user misses the line, we silently ignore — no error popup.
      const hit = findNearestLineFeature({ lat, lng });
      if (!hit) {
        return;
      }
      if (!toolState.sectionPick) {
        setToolState((s) => ({
          ...s,
          sectionPick: { parentId: hit.feature.id, start: hit.point },
        }));
        return;
      }
      if (toolState.sectionPick.parentId !== hit.feature.id) {
        // Treat a click on a different line as starting a NEW section on that line.
        setToolState((s) => ({
          ...s,
          sectionPick: { parentId: hit.feature.id, start: hit.point },
        }));
        return;
      }
      const startProjection = projectOntoPolyline(toolState.sectionPick.start, hit.polyline);
      if (!startProjection) {
        setToolState((s) => ({ ...s, sectionPick: null }));
        return;
      }
      commitSection(hit.feature, hit.polyline, startProjection, {
        point: hit.point,
        segmentIndex: hit.segmentIndex,
        distanceAlongMeters: hit.distanceAlongMeters,
      });
    }
  }

  // Find the nearest ROUTE feature only (used by Section tool).
  function findNearestRouteFeature(
    click: { lat: number; lng: number },
  ): ReturnType<typeof findNearestLineFeature> {
    let best: any = null;
    let bestDist = Infinity;
    for (const f of features) {
      if (f.feature_type !== ROUTE_FEATURE_TYPE) continue;
      const path = Array.isArray((f.props as any)?.path)
        ? ((f.props as any).path as { lat: number; lng: number }[])
        : null;
      if (!path || path.length < 2) continue;
      const projection = projectOntoPolyline(click, path);
      if (!projection) continue;
      const dx =
        (projection.point.lng - click.lng) *
        111_320 *
        Math.cos((click.lat * Math.PI) / 180);
      const dy = (projection.point.lat - click.lat) * 111_320;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { feature: f, ...projection, polyline: path };
      }
    }
    return bestDist < 20 ? best : null;
  }

  // Finish whatever multi-vertex path is being drawn — works for both the
  // black Work route and the colored Cable / Drilling paths.
  async function finishPath() {
    const verts = toolState.pathDrawing?.vertices;
    if (!verts || verts.length < 2) {
      setToolState((s) => ({ ...s, pathDrawing: null }));
      return;
    }

    // Decide the feature_type and label based on what tool is active.
    let feature_type = ROUTE_FEATURE_TYPE;
    let label = 'Work route';
    let extraProps: Record<string, any> = { is_route: true };
    if (toolState.tool === 'feature') {
      const kind = FEATURE_KINDS.find((k) => k.key === toolState.featureKind);
      if (kind) {
        feature_type = kind.feature_type;
        label = defaultLabel(kind.feature_type);
        extraProps = {};
      }
    }

    setSavingId('new');
    try {
      const first = verts[0];
      const last = verts[verts.length - 1];
      const res = await fetch(`/api/maps/${mapId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_type,
          lat: first.lat,
          lng: first.lng,
          end_lat: last.lat,
          end_lng: last.lng,
          label,
          props: {
            path: verts,
            ...extraProps,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add');
      const created = Array.isArray(data) ? data[0] : data;
      setFeatures((prev) => [...prev, created]);
      setSelectedId(created.id);
      pushUndo({ kind: 'add', feature: created });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
      setToolState((s) => ({ ...s, pathDrawing: null }));
    }
  }

  // ---------- Section (sub-segment) creation ----------

  // Find the nearest point on a polyline given a click. Returns the chosen
  // point, the segment index it lies on, and the distance along the entire
  // polyline (in meters).
  function projectOntoPolyline(
    click: { lat: number; lng: number },
    polyline: { lat: number; lng: number }[],
  ): { point: { lat: number; lng: number }; segmentIndex: number; distanceAlongMeters: number } | null {
    if (polyline.length < 2) return null;
    // Small-angle approximation: convert to local meters around the click.
    const mPerDegLat = 111_320;
    const mPerDegLng = 111_320 * Math.cos((click.lat * Math.PI) / 180);
    const cx = 0;
    const cy = 0;

    let best: {
      px: number;
      py: number;
      segIdx: number;
      d2: number;
      cumulativeMeters: number;
    } | null = null;
    let cumulative = 0;
    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i];
      const b = polyline[i + 1];
      const ax = (a.lng - click.lng) * mPerDegLng;
      const ay = (a.lat - click.lat) * mPerDegLat;
      const bx = (b.lng - click.lng) * mPerDegLng;
      const by = (b.lat - click.lat) * mPerDegLat;
      const abx = bx - ax;
      const aby = by - ay;
      const len2 = abx * abx + aby * aby;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * abx + (cy - ay) * aby) / len2)) : 0;
      const x = ax + t * abx;
      const y = ay + t * aby;
      const d2 = (cx - x) ** 2 + (cy - y) ** 2;
      if (best === null || d2 < best.d2) {
        const segLen = Math.sqrt(len2);
        best = {
          px: x,
          py: y,
          segIdx: i,
          d2,
          cumulativeMeters: cumulative + t * segLen,
        };
      }
      cumulative += Math.sqrt(len2);
    }
    if (!best) return null;
    // Convert chosen point back to lat/lng
    return {
      point: {
        lat: click.lat + best.py / mPerDegLat,
        lng: click.lng + best.px / mPerDegLng,
      },
      segmentIndex: best.segIdx,
      distanceAlongMeters: best.cumulativeMeters,
    };
  }

  // Find the nearest line feature to a click, plus the projected point on it.
  function findNearestLineFeature(
    click: { lat: number; lng: number },
  ): {
    feature: MapFeature;
    point: { lat: number; lng: number };
    segmentIndex: number;
    distanceAlongMeters: number;
    polyline: { lat: number; lng: number }[];
  } | null {
    let best: any = null;
    let bestDist = Infinity;
    for (const f of features) {
      const path = Array.isArray((f.props as any)?.path)
        ? ((f.props as any).path as { lat: number; lng: number }[])
        : null;
      const polyline =
        path && path.length >= 2
          ? path
          : f.end_lat != null && f.end_lng != null
          ? [{ lat: f.lat, lng: f.lng }, { lat: f.end_lat, lng: f.end_lng }]
          : null;
      if (!polyline) continue;
      const projection = projectOntoPolyline(click, polyline);
      if (!projection) continue;
      // Compute the actual distance in meters from click to projection
      const dx =
        (projection.point.lng - click.lng) * 111_320 * Math.cos((click.lat * Math.PI) / 180);
      const dy = (projection.point.lat - click.lat) * 111_320;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { feature: f, ...projection, polyline };
      }
    }
    // Click tolerance — generous so designers don't have to be pixel-perfect.
    // 100 meters at typical street zoom is about a finger-width on screen.
    return bestDist < 100 ? best : null;
  }

  function sliceBetween(
    polyline: { lat: number; lng: number }[],
    startIdx: number,
    startPoint: { lat: number; lng: number },
    endIdx: number,
    endPoint: { lat: number; lng: number },
  ): { lat: number; lng: number }[] {
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const result: { lat: number; lng: number }[] = [];
    if (startIdx <= endIdx) {
      result.push(startPoint);
      for (let i = lo + 1; i <= hi; i++) result.push(polyline[i]);
      result.push(endPoint);
    } else {
      result.push(startPoint);
      for (let i = lo + 1; i <= hi; i++) result.push(polyline[i]);
      result.push(endPoint);
      // Reverse so it reads start -> end naturally
      result.reverse();
    }
    return result;
  }

  async function commitSection(
    parent: MapFeature,
    polyline: { lat: number; lng: number }[],
    startProjection: { point: { lat: number; lng: number }; segmentIndex: number; distanceAlongMeters: number },
    endProjection: { point: { lat: number; lng: number }; segmentIndex: number; distanceAlongMeters: number },
  ) {
    setSavingId('new');
    try {
      const sliced = sliceBetween(
        polyline,
        startProjection.segmentIndex,
        startProjection.point,
        endProjection.segmentIndex,
        endProjection.point,
      );
      const first = sliced[0];
      const last = sliced[sliced.length - 1];
      const startM = Math.min(startProjection.distanceAlongMeters, endProjection.distanceAlongMeters);
      const endM = Math.max(startProjection.distanceAlongMeters, endProjection.distanceAlongMeters);

      const res = await fetch(`/api/maps/${mapId}/features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature_type: parent.feature_type,
          lat: first.lat,
          lng: first.lng,
          end_lat: last.lat,
          end_lng: last.lng,
          label: `Section of ${parent.label || parent.feature_type}`,
          props: {
            path: sliced,
            parent_id: parent.id,
            section_start_m: Math.round(startM * 10) / 10,
            section_end_m: Math.round(endM * 10) / 10,
            is_section: true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create section');
      const created = Array.isArray(data) ? data[0] : data;
      setFeatures((prev) => [...prev, created]);
      setSelectedId(created.id);
      pushUndo({ kind: 'add', feature: created });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingId(null);
      setToolState((s) => ({ ...s, sectionPick: null }));
    }
  }

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      if (toolState.tool === 'delete') {
        if (confirm('Delete this feature?')) deleteFeature(featureId);
      } else {
        setSelectedId(featureId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolState.tool, features],
  );

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-gray-500 bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (loadError || !map) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center text-red-400 bg-gray-950 gap-2">
        <AlertCircle className="w-6 h-6" />
        {loadError || 'Unable to load project'}
        <Link href="/maps" className="text-sm text-indigo-400 underline mt-2">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-black text-white overflow-hidden">
      {/* Header */}
      <header className="h-12 px-3 border-b border-gray-800 bg-black/95 backdrop-blur flex items-center gap-3 shrink-0 z-30">
        <Link
          href="/maps"
          className="p-1.5 -ml-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-sm font-semibold truncate max-w-[200px]">{map.name}</h1>
          {map.project_code && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 shrink-0">
              {map.project_code}
            </span>
          )}
        </div>

        <SearchBox
          onPick={(lat, lng, zoom) => setFlyTo({ lat, lng, zoom })}
        />

        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-gray-900 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 border border-gray-800 rounded-lg transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>

        <SaveStatus saving={savingId !== null} />

        <Link
          href={`/field/${map.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Open field view
        </Link>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left toolbar */}
        <aside className="w-44 bg-black border-r border-gray-800 flex flex-col gap-1 px-2 py-3 shrink-0 z-20">
          <ToolButton
            active={toolState.tool === 'select'}
            onClick={() =>
              setToolState((s) => ({
                ...s,
                tool: 'select',
                drawing: null,
                pathDrawing: null,
                sectionPick: null,
              }))
            }
            icon={MousePointer2}
            label="Select / pan"
          />
          {FEATURE_KINDS.map((kind) => {
            const isActive =
              toolState.tool === 'feature' && toolState.featureKind === kind.key;
            return (
              <ToolButton
                key={kind.key}
                active={isActive}
                onClick={() =>
                  setToolState((s) => ({
                    ...s,
                    tool: 'feature',
                    featureKind: kind.key,
                    drawing: null,
                    pathDrawing: null,
                    sectionPick: null,
                  }))
                }
                icon={kind.icon}
                iconColor={kind.color}
                label={kind.label}
              />
            );
          })}
          <div className="my-1 h-px w-full bg-gray-800" />
          <ToolButton
            active={toolState.tool === 'route'}
            onClick={() =>
              setToolState((s) => ({
                ...s,
                tool: 'route',
                drawing: null,
                pathDrawing: null,
                sectionPick: null,
              }))
            }
            icon={Spline}
            label="Work route"
          />
          <ToolButton
            active={toolState.tool === 'section'}
            onClick={() =>
              setToolState((s) => ({
                ...s,
                tool: 'section',
                drawing: null,
                pathDrawing: null,
                sectionPick: null,
              }))
            }
            icon={Ruler}
            label="Section selector"
          />
          {toolState.pathDrawing && toolState.pathDrawing.vertices.length >= 2 && (
            <ToolButton
              active={false}
              onClick={finishPath}
              icon={CheckCircle2}
              label="Finish path (Enter)"
            />
          )}
          <div className="my-1 h-px w-full bg-gray-800" />
          <ToolButton
            active={toolState.tool === 'delete'}
            onClick={() =>
              setToolState((s) => ({
                ...s,
                tool: 'delete',
                drawing: null,
                pathDrawing: null,
                sectionPick: null,
              }))
            }
            icon={Trash2}
            label="Delete"
            danger
          />
          <div className="mt-auto">
            <ToolButton
              active={false}
              onClick={() => setTilesType((t) => (t === 'osm' ? 'satellite' : 'osm'))}
              icon={Layers}
              label={tilesType === 'osm' ? 'Satellite view' : 'Street view'}
            />
          </div>
        </aside>

        {/* Map canvas */}
        <main className="flex-1 relative">
          <EditorCanvas
            features={features}
            selectedId={selectedId}
            toolState={toolState}
            tilesType={tilesType}
            flyTo={flyTo}
            onMapClick={handleMapClick}
            onFeatureClick={handleFeatureClick}
          />
          {/* Drawing hint */}
          {toolState.drawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-orange-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
              Click the other end to finish the line. Press Esc to cancel.
            </div>
          )}
          {toolState.tool === 'feature' && (() => {
            const kind = FEATURE_KINDS.find((k) => k.key === toolState.featureKind);
            if (!kind) return null;
            if (kind.shape === 'point') {
              return (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-indigo-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
                  Click on the map to place a {kind.label.toLowerCase()}.
                </div>
              );
            }
            if (toolState.pathDrawing) {
              return (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-orange-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
                  {toolState.pathDrawing.vertices.length} vertex{toolState.pathDrawing.vertices.length === 1 ? '' : 'es'} on the {kind.label.toLowerCase()}. Keep clicking, or press Enter to finish. Esc to cancel.
                </div>
              );
            }
            return (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-indigo-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
                Click on the map to start a {kind.label.toLowerCase()} path. Click each turn.
              </div>
            );
          })()}
          {toolState.tool === 'route' && !toolState.pathDrawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-indigo-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
              Click on the map to start the work route (black path). Click each turn.
            </div>
          )}
          {toolState.tool === 'route' && toolState.pathDrawing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-orange-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
              {toolState.pathDrawing.vertices.length} vertex{toolState.pathDrawing.vertices.length === 1 ? '' : 'es'}. Keep clicking, or press Enter to finish. Esc to cancel.
            </div>
          )}
          {toolState.tool === 'section' && !toolState.sectionPick && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-indigo-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
              Click on an existing line (cable, drilling, or route) to mark the START of a section.
            </div>
          )}
          {toolState.tool === 'section' && toolState.sectionPick && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-emerald-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
              Now click on the SAME line to mark the end of the section. Esc to cancel.
            </div>
          )}
          {toolState.tool === 'delete' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-red-500/90 text-white text-xs font-semibold rounded-full shadow-lg">
              Click any feature on the map to delete it.
            </div>
          )}
        </main>

        {/* Right sidebar */}
        <aside className="w-72 bg-black border-l border-gray-800 flex flex-col shrink-0 z-20">
          {selected ? (
            <PropertyPanel
              feature={selected}
              onChange={(patch) => updateFeature(selected.id, patch)}
              onDelete={() => deleteFeature(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <FeatureList
              features={features}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
        </aside>
      </div>

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-500/95 text-white text-xs rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function SaveStatus({ saving }: { saving: boolean }) {
  return saving ? (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
      <Loader2 className="w-3 h-3 animate-spin" />
      Saving…
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
      <Save className="w-3 h-3" />
      Saved
    </span>
  );
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
  danger,
  iconColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  danger?: boolean;
  iconColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`hover-jump group flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left transition-colors ${
        active
          ? danger
            ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
            : 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon
        className="w-4 h-4 shrink-0"
        style={iconColor && !active ? { color: iconColor } : undefined}
      />
      <span className="text-xs font-medium truncate">{label}</span>
    </button>
  );
}

function FeaturesDropdown({
  state,
  setState,
}: {
  state: ToolState;
  setState: React.Dispatch<React.SetStateAction<ToolState>>;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const active = state.tool === 'feature';

  // Whenever the dropdown opens, capture the button's screen position so
  // we can render the menu in a fixed-position layer that escapes all the
  // surrounding stacking contexts (sidebar z-20, leaflet panes up to z-700).
  useEffect(() => {
    if (open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setRect({ left: r.right + 8, top: r.top });
    }
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        title="Path Lines"
        className={`group relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          active
            ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
        <ChevronDown className="w-2 h-2 absolute right-0.5 bottom-0.5" />
      </button>
      {open && rect && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9000,
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              zIndex: 9001,
            }}
            className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-1.5 min-w-[200px]"
          >
            <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">
              Path Lines
            </div>
            {FEATURE_KINDS.map((kind) => {
              const KIcon = kind.icon;
              const isActive = kind.key === state.featureKind && state.tool === 'feature';
              return (
                <button
                  key={kind.key}
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      tool: 'feature',
                      featureKind: kind.key,
                      drawing: null,
                      pathDrawing: null,
                      sectionPick: null,
                    }));
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-700 transition-colors ${
                    isActive ? 'text-white bg-gray-700/60' : 'text-gray-200'
                  }`}
                >
                  <KIcon className="w-4 h-4" style={{ color: kind.color }} />
                  <span className="font-medium">{kind.label}</span>
                  <span className="ml-auto text-[10px] text-gray-500 uppercase tracking-wider">
                    {kind.shape}
                  </span>
                  {isActive && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 ml-1" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function FeatureList({
  features,
  onSelect,
}: {
  features: MapFeature[];
  onSelect: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const g: Record<string, MapFeature[]> = {};
    for (const f of features) {
      (g[f.feature_type] = g[f.feature_type] || []).push(f);
    }
    return g;
  }, [features]);

  if (features.length === 0) {
    return (
      <div className="p-5 text-sm text-gray-500">
        <p>No features yet.</p>
        <p className="text-xs text-gray-600 mt-2">
          Pick a tool from the left and click on the map to start placing
          cables, joints, drill segments, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto flex-1">
      <div className="px-4 py-3 sticky top-0 bg-gray-900 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Features
          <span className="ml-2 text-gray-600">({features.length})</span>
        </h3>
      </div>
      {Object.entries(grouped).map(([type, list]) => {
        const color = FEATURE_COLORS[type] ?? FEATURE_COLORS.other;
        return (
          <div key={type} className="border-b border-gray-800/60 last:border-0">
            <div className="px-4 py-2 flex items-center gap-2 bg-gray-900/60">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-xs text-gray-400 capitalize">
                {type.replace(/_/g, ' ')}
              </span>
              <span className="ml-auto text-[10px] text-gray-600">{list.length}</span>
            </div>
            {list.map((f) => (
              <button
                key={f.id}
                onClick={() => onSelect(f.id)}
                className="w-full px-4 py-2 text-left hover:bg-gray-800/60 transition-colors"
              >
                <p className="text-sm text-white truncate">
                  {f.label || f.source_id || '(no label)'}
                </p>
                <p className="text-[11px] text-gray-500 truncate">
                  {f.source_id ? `${f.source_id} · ` : ''}
                  {f.lat.toFixed(5)}, {f.lng.toFixed(5)}
                </p>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PropertyPanel({
  feature,
  onChange,
  onDelete,
  onClose,
}: {
  feature: MapFeature;
  onChange: (patch: Partial<MapFeature>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(feature.label ?? '');
  const [sourceId, setSourceId] = useState(feature.source_id ?? '');
  const [cableType, setCableType] = useState(feature.props?.cable_type ?? '');
  const [depthM, setDepthM] = useState(feature.props?.depth_m?.toString() ?? '');
  const [action, setAction] = useState(feature.props?.action ?? '');

  // Re-sync local form state when a different feature is selected
  useEffect(() => {
    setLabel(feature.label ?? '');
    setSourceId(feature.source_id ?? '');
    setCableType(feature.props?.cable_type ?? '');
    setDepthM(feature.props?.depth_m?.toString() ?? '');
    setAction(feature.props?.action ?? '');
  }, [feature.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    const props = { ...(feature.props ?? {}) };
    if (cableType.trim()) props.cable_type = cableType.trim();
    else delete props.cable_type;
    const d = parseFloat(depthM);
    if (!isNaN(d)) props.depth_m = d;
    else delete props.depth_m;
    if (action) props.action = action;
    else delete props.action;

    onChange({
      label: label.trim() || null,
      source_id: sourceId.trim() || null,
      props,
    });
  }

  const isLine = feature.end_lat != null && feature.end_lng != null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white capitalize truncate">
            {feature.feature_type.replace(/_/g, ' ')}
          </h3>
          <p className="text-[10px] font-mono text-gray-500 truncate">
            {feature.id.slice(0, 8)}…
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-xs"
        >
          Close
        </button>
      </div>

      <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">
        <Field
          label="Label"
          value={label}
          onChange={setLabel}
          onBlur={commit}
          placeholder="e.g. AMCL 3*95/16"
        />
        <Field
          label="Source ID"
          value={sourceId}
          onChange={setSourceId}
          onBlur={commit}
          placeholder="e.g. LS009147, JUH3608014"
          mono
        />

        {(isLine || feature.feature_type === 'cable') && (
          <Field
            label="Cable type"
            value={cableType}
            onChange={setCableType}
            onBlur={commit}
            placeholder="AMCL 3*95/16"
          />
        )}

        <Field
          label="Depth (m)"
          value={depthM}
          onChange={setDepthM}
          onBlur={commit}
          placeholder="0.7"
          type="number"
        />

        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
            Action
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['install', 'demolish', 'keep'] as const).map((a) => (
              <button
                key={a}
                onClick={() => {
                  setAction(a);
                  setTimeout(commit, 0);
                }}
                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  action === a
                    ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                    : 'bg-gray-950 border-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-800 space-y-1.5 text-xs text-gray-500">
          {feature.props?.is_section && (
            <div className="mb-2 px-2 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-300">
              Section of parent line: m{' '}
              {feature.props.section_start_m ?? '?'} → m{' '}
              {feature.props.section_end_m ?? '?'}
            </div>
          )}
          <div>
            <span className="text-gray-600">Position:</span>{' '}
            {feature.lat.toFixed(6)}, {feature.lng.toFixed(6)}
          </div>
          {isLine && (
            <div>
              <span className="text-gray-600">End:</span>{' '}
              {feature.end_lat!.toFixed(6)}, {feature.end_lng!.toFixed(6)}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-gray-800">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 rounded-lg transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete feature
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 ${
          mono ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

// ---------- Search box (geocoding + coordinate parsing) ----------

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
}

function parseCoordinate(input: string): { lat: number; lng: number } | null {
  // Accept formats like "63.0805, 17.7325" or "63.0805 17.7325"
  // or even "N63.08 E17.73" (basic)
  const cleaned = input.replace(/[NEWS]/gi, ' ').trim();
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 2) {
    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    if (
      !isNaN(a) && !isNaN(b) &&
      a >= -90 && a <= 90 &&
      b >= -180 && b <= 180
    ) {
      return { lat: a, lng: b };
    }
  }
  return null;
}

function SearchBox({
  onPick,
}: {
  onPick: (lat: number, lng: number, zoom?: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);

  // Debounced search
  useEffect(() => {
    setCoord(parseCoordinate(query));
    if (!query.trim() || parseCoordinate(query)) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&q=${encodeURIComponent(query)}`,
          { headers: { Accept: 'application/json' } },
        );
        if (res.ok) {
          const data: NominatimHit[] = await res.json();
          setResults(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  function pickHit(hit: NominatimHit) {
    onPick(parseFloat(hit.lat), parseFloat(hit.lon), 18);
    setQuery(hit.display_name);
    setOpen(false);
  }

  function pickCoord() {
    if (coord) {
      onPick(coord.lat, coord.lng, 19);
      setOpen(false);
    }
  }

  return (
    <div className="flex-1 max-w-md relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (coord) pickCoord();
              else if (results[0]) pickHit(results[0]);
            }
          }}
          placeholder="Search address, place, or paste 63.0805, 17.7325"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setCoord(null);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && (query || loading) && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-xl py-1 z-40 max-h-80 overflow-y-auto">
            {coord ? (
              <button
                onClick={pickCoord}
                className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors"
              >
                <div className="text-sm text-white">
                  Go to {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
                </div>
                <div className="text-[10px] text-gray-500">Direct coordinate</div>
              </button>
            ) : loading ? (
              <div className="px-3 py-2 text-xs text-gray-500 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Searching…
              </div>
            ) : results.length === 0 && query.trim() ? (
              <div className="px-3 py-2 text-xs text-gray-500">No results.</div>
            ) : (
              results.map((hit, i) => (
                <button
                  key={`${hit.lat}-${hit.lon}-${i}`}
                  onClick={() => pickHit(hit)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors"
                >
                  <div className="text-sm text-white truncate">
                    {hit.display_name}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {parseFloat(hit.lat).toFixed(5)},{' '}
                    {parseFloat(hit.lon).toFixed(5)}
                    {hit.type ? ` · ${hit.type}` : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function defaultLabel(type: string): string {
  switch (type) {
    case 'transformer': return '';
    case 'cabinet': return '';
    case 'joint': return '';
    case 'pole': return '';
    case 'drill_pit': return 'Drill pit';
    case 'annotation': return 'Note';
    case 'cable': return '';
    case 'drill_segment': return 'Drilling';
    case 'dig_area': return 'Schakt';
    case 'route': return 'Work route';
    default: return '';
  }
}
