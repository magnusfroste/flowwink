-- When did a person last sign in, and when were they last active?
-- The admin Users table and the users_list skill read this. auth.users is not
-- a public table, so it is read through an admin-only definer function, the
-- same way admin_mfa_status reads auth.mfa_factors.
--   last_sign_in_at — the last time the person signed in (password, magic
--                     link, OAuth). Staying signed in does not move it.
--   last_active_at  — the newest of that and their sessions' last refresh: a
--                     browser that keeps a session alive refreshes it while
--                     the person works.
CREATE OR REPLACE FUNCTION public.admin_user_sign_ins()
RETURNS TABLE (user_id uuid, last_sign_in_at timestamptz, last_active_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id AS user_id,
         u.last_sign_in_at,
         GREATEST(
           u.last_sign_in_at,
           (SELECT max(s.updated_at) FROM auth.sessions s WHERE s.user_id = u.id)
         ) AS last_active_at
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
   WHERE auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role);
$$;
REVOKE ALL ON FUNCTION public.admin_user_sign_ins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_sign_ins() TO authenticated, service_role;
