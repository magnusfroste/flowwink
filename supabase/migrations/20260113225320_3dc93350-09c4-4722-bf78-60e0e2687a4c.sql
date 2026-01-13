-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create a view that excludes email for public author access
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  full_name,
  avatar_url,
  bio,
  title,
  show_as_author,
  created_at
FROM public.profiles
WHERE show_as_author = true;

-- Allow public to view the safe profiles view (author info only)
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Authenticated users can view all profiles (for admin features)
CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can still view their own profile even if not authenticated elsewhere
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (id = auth.uid());