-- Migration 007: Remove tables/columns for the now-deleted booking + chatbot
-- + documents/RAG features. The platform is now single-purpose: the field-map
-- agent for utility crews. Anything not related to maps is removed here.
--
-- Order matters because of foreign keys.
-- IF EXISTS is used everywhere so the migration is idempotent and won't error
-- if a particular object was already dropped.

-- =============================================================================
-- Bookings system (migrations 002, 003 added these)
-- =============================================================================

-- The booking atomic-insert function created in 002
DROP FUNCTION IF EXISTS public.create_booking_atomic(
  uuid, text, text, text, text, timestamptz, timestamptz
) CASCADE;

DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.availability_blackouts CASCADE;
DROP TABLE IF EXISTS public.availability_rules CASCADE;

-- Booking-related columns on organizations
ALTER TABLE public.organizations DROP COLUMN IF EXISTS timezone;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS slot_duration_minutes;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS cancellation_contact;

-- =============================================================================
-- Chat / conversations / RAG (migration 001 created these)
-- =============================================================================

-- messages references conversations
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;

-- learnings table (helpful-message captures)
DROP TABLE IF EXISTS public.learnings CASCADE;

-- email logs
DROP TABLE IF EXISTS public.email_logs CASCADE;

-- documents + chunks (the RAG knowledge base)
DROP TABLE IF EXISTS public.document_chunks CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;

-- =============================================================================
-- The pgvector extension was added for document embeddings. If no other tables
-- need it (none of the maps schema does), it can be dropped too. Commented out
-- by default — uncomment if you want to fully remove it.
-- =============================================================================
-- DROP EXTENSION IF EXISTS vector;
