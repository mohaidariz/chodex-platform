-- Migration 006: Per-page calibration for field-map agent
-- Adds:
--   - map_pages.image_width / image_height: rendered PNG pixel dimensions,
--     needed to compute corners from a single calibration anchor.
--   - map_pages.calibration: JSONB storing an anchor point in pixel space
--     and its real-world SWEREF 99 TM coordinates, plus metadata.
--
-- Schema of the calibration JSON:
--   {
--     "anchor": {
--       "pixel_x": number,    // pixel coords on the rendered PNG (0 = left)
--       "pixel_y": number,    // pixel coords on the rendered PNG (0 = top)
--       "n": number,          // SWEREF 99 TM northing
--       "e": number           // SWEREF 99 TM easting
--     },
--     "calibrated_at": ISO timestamp,
--     "calibrated_by": auth user id (uuid),
--     "source": "manual" | "vision"
--   }
--
-- When `calibration` is set, the corner_* columns are recomputed from the
-- anchor + the page's scale_denominator + image dimensions, and all
-- map_features on that page get their lat/lng recomputed.

ALTER TABLE public.map_pages
  ADD COLUMN IF NOT EXISTS image_width INTEGER,
  ADD COLUMN IF NOT EXISTS image_height INTEGER,
  ADD COLUMN IF NOT EXISTS calibration JSONB;

-- Helper index for finding calibrated vs un-calibrated pages
CREATE INDEX IF NOT EXISTS map_pages_calibration_idx
  ON public.map_pages ((calibration IS NOT NULL));
