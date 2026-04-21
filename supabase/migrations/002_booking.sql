-- Migration 002: Booking system
-- Adds availability rules, blackouts, and bookings tables

-- Add booking configuration to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Stockholm',
  ADD COLUMN IF NOT EXISTS slot_duration_minutes INTEGER NOT NULL DEFAULT 30;

-- Weekly availability rules per org
-- NOTE: v1 supports one time window per day; multiple windows per day is a future enhancement
CREATE TABLE public.availability_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX availability_rules_org_idx ON public.availability_rules (org_id);
CREATE UNIQUE INDEX availability_rules_org_day_idx ON public.availability_rules (org_id, day_of_week);

-- Date/time range blackouts (one-off blocks)
CREATE TABLE public.availability_blackouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX availability_blackouts_org_idx ON public.availability_blackouts (org_id);
CREATE INDEX availability_blackouts_range_idx ON public.availability_blackouts (org_id, start_at, end_at);

-- Visitor bookings
CREATE TABLE public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  booking_code TEXT NOT NULL,
  visitor_name TEXT NOT NULL,
  visitor_email TEXT NOT NULL,
  description TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, booking_code)
);

CREATE INDEX bookings_org_idx ON public.bookings (org_id);
CREATE INDEX bookings_org_start_idx ON public.bookings (org_id, start_at);
CREATE INDEX bookings_org_code_idx ON public.bookings (org_id, booking_code);

-- Partial unique index: prevents two confirmed bookings at the same start time for the same org.
-- This is the primary double-booking guard — enforced atomically by the database engine.
-- Works correctly for v1 because all slots are fixed-duration and non-overlapping by construction.
CREATE UNIQUE INDEX bookings_no_double_book
  ON public.bookings (org_id, start_at)
  WHERE status = 'confirmed';

-- Enable RLS
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_blackouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Availability rules policies
CREATE POLICY "Org members manage availability rules" ON public.availability_rules
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Blackouts policies
CREATE POLICY "Org members manage availability blackouts" ON public.availability_blackouts
  FOR ALL USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Bookings policies (no anon insert; public inserts go through service-role API routes)
CREATE POLICY "Org members view bookings" ON public.bookings
  FOR SELECT USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Org members update bookings" ON public.bookings
  FOR UPDATE USING (org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Atomic booking insert.
-- The partial unique index (org_id, start_at) WHERE status='confirmed' handles concurrent
-- race conditions — the database raises a unique_violation which we catch and surface as a
-- friendly error message.  No advisory locks needed.
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_org_id UUID,
  p_visitor_name TEXT,
  p_visitor_email TEXT,
  p_description TEXT,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_booking_code TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id UUID;
BEGIN
  -- Fast overlap check (catches the common non-concurrent case early)
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE org_id = p_org_id
      AND status = 'confirmed'
      AND start_at < p_end_at
      AND end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object(
      'error', 'conflict',
      'reason', 'That slot is already booked. Please choose another time.'
    );
  END IF;

  INSERT INTO public.bookings
    (org_id, booking_code, visitor_name, visitor_email, description, start_at, end_at)
  VALUES
    (p_org_id, p_booking_code, p_visitor_name, p_visitor_email, p_description, p_start_at, p_end_at)
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'booking_code', p_booking_code);

EXCEPTION
  WHEN unique_violation THEN
    -- Concurrent insert lost the race; the partial unique index caught it
    RETURN jsonb_build_object(
      'error', 'conflict',
      'reason', 'That slot is already booked. Please choose another time.'
    );
END;
$$;
