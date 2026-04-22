-- Migration 003: Add cancellation contact to organizations
-- Org admins can set a free-text contact string shown to visitors
-- when a cancellation request arrives within the 24-hour cutoff.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cancellation_contact TEXT NULL;
