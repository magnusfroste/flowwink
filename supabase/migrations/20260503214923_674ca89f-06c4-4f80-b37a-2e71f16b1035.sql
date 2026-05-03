-- Drop public-readable policy on profiles that exposed email addresses.
-- Public author display now goes through the existing profiles_public view (no email column).
DROP POLICY IF EXISTS "Public can view author profiles" ON public.profiles;