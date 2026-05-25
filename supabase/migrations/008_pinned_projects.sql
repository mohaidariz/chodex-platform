-- Migration 008: Pinned projects
-- Adds a nullable pinned_at timestamp to the maps table. Projects with a
-- non-null pinned_at sort to the top of the dashboard list.

ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS maps_pinned_idx
  ON public.maps (org_id, pinned_at DESC NULLS LAST);
