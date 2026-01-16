-- Drop and recreate the view to include support agents
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT 
  id,
  full_name,
  avatar_url,
  bio,
  title,
  show_as_author,
  created_at
FROM profiles
WHERE show_as_author = true
   OR id IN (SELECT user_id FROM support_agents);

-- Grant access to anonymous users
GRANT SELECT ON public.profiles_public TO anon;

COMMENT ON VIEW public.profiles_public IS 'Public view of profiles for authors and support agents';