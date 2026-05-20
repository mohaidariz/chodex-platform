-- Migration 005: Field-map agent
-- Adds maps, map_pages, and map_features for the iPad field-map agent
-- that reads Byggkarta/Borrkarta PDFs and surfaces nearby features by GPS.

-- =============================================================================
-- maps: one row per uploaded Byggkarta or Borrkarta PDF
-- =============================================================================
CREATE TABLE public.maps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  project_code TEXT,                            -- e.g. IB350077
  map_type TEXT NOT NULL DEFAULT 'byggkarta'
    CHECK (map_type IN ('byggkarta', 'borrkarta', 'other')),
  original_pdf_storage_key TEXT NOT NULL,       -- Supabase Storage object key
  page_count INTEGER,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'extracting', 'ready', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX maps_org_idx ON public.maps (org_id);
CREATE INDEX maps_org_status_idx ON public.maps (org_id, status);

-- =============================================================================
-- map_pages: one row per PDF page, with corner coordinates for georeferencing
-- Corners are stored in both SWEREF 99 TM (the source projection on the map)
-- and WGS84 (lat/lng for browser + GPS use).
-- =============================================================================
CREATE TABLE public.map_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID REFERENCES public.maps ON DELETE CASCADE NOT NULL,
  page_number INTEGER NOT NULL,
  scale_denominator INTEGER,                    -- e.g. 1000 for 1:1000

  -- Page corners in SWEREF 99 TM (N = northing, E = easting)
  corner_nw_n DOUBLE PRECISION, corner_nw_e DOUBLE PRECISION,
  corner_ne_n DOUBLE PRECISION, corner_ne_e DOUBLE PRECISION,
  corner_sw_n DOUBLE PRECISION, corner_sw_e DOUBLE PRECISION,
  corner_se_n DOUBLE PRECISION, corner_se_e DOUBLE PRECISION,

  -- Same corners in WGS84
  corner_nw_lat DOUBLE PRECISION, corner_nw_lng DOUBLE PRECISION,
  corner_ne_lat DOUBLE PRECISION, corner_ne_lng DOUBLE PRECISION,
  corner_sw_lat DOUBLE PRECISION, corner_sw_lng DOUBLE PRECISION,
  corner_se_lat DOUBLE PRECISION, corner_se_lng DOUBLE PRECISION,

  rendered_image_storage_key TEXT,              -- PNG of this page for display
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (map_id, page_number)
);

CREATE INDEX map_pages_map_idx ON public.map_pages (map_id);

-- =============================================================================
-- map_features: cables, joints, poles, cabinets, transformers, drill segments
-- All locations in WGS84 (lat/lng). Cable segments use lat/lng + end_lat/end_lng.
-- =============================================================================
CREATE TABLE public.map_features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id UUID REFERENCES public.maps ON DELETE CASCADE NOT NULL,
  page_number INTEGER NOT NULL,
  feature_type TEXT NOT NULL,                   -- 'cable', 'joint', 'pole',
                                                -- 'cabinet', 'transformer',
                                                -- 'drill_segment', 'drill_pit', etc.

  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION,                     -- for line features (cables, drill segments)
  end_lng DOUBLE PRECISION,

  source_id TEXT,                               -- e.g. LS009147, JUH3608014, 744110011
  label TEXT,                                   -- raw text label, e.g. "AMCL 3*95/16"
  props JSONB DEFAULT '{}' NOT NULL,            -- cable_type, voltage, depth,
                                                -- action ('install'/'demolish'), etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX map_features_map_idx ON public.map_features (map_id);
CREATE INDEX map_features_location_idx ON public.map_features (lat, lng);
CREATE INDEX map_features_type_idx ON public.map_features (feature_type);
CREATE INDEX map_features_source_id_idx ON public.map_features (source_id);

-- =============================================================================
-- Row Level Security
-- Org members can read and write their own org's maps. Pages and features
-- inherit access from their parent map.
-- =============================================================================
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage maps" ON public.maps
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members manage map pages" ON public.map_pages
  FOR ALL USING (
    map_id IN (
      SELECT id FROM public.maps
      WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Org members manage map features" ON public.map_features
  FOR ALL USING (
    map_id IN (
      SELECT id FROM public.maps
      WHERE org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
    )
  );

-- =============================================================================
-- updated_at trigger on maps
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_maps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maps_updated_at
  BEFORE UPDATE ON public.maps
  FOR EACH ROW EXECUTE FUNCTION public.set_maps_updated_at();
