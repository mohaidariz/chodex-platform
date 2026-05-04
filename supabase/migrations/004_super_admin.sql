ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Set Mohammed as the first super admin
UPDATE public.profiles
SET is_super_admin = TRUE
WHERE id = (SELECT id FROM auth.users WHERE email = 'mohammed.a.haidari@gmail.com');
