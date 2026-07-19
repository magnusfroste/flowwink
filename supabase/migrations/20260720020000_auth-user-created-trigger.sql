-- Fresh-install finding #8 (demo rebuild 2026-07-20): the role-assigning
-- trigger on auth.users existed ONLY as undocumented drift.
--
-- public.handle_new_user() (profiles row + role from signup_type metadata) is
-- in the baseline, but the TRIGGER that fires it lives on auth.users — and
-- pg_dump never dumps the auth schema, so no migration ever created it. On
-- dev and the fleet it was created out-of-band long ago; every FRESH install
-- got a role-less, profile-less first admin (login succeeds, /admin denies).
--
-- Guarded creation: existing instances may carry the trigger under any name,
-- so only create ours if NO trigger on auth.users already executes
-- handle_new_user — creating a second one would double-fire (harmless thanks
-- to ON CONFLICT, but wrong). Then backfill users the gap already bit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'auth' AND c.relname = 'users'
       AND NOT t.tgisinternal
       AND t.tgfoid = 'public.handle_new_user'::regproc
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    RAISE NOTICE 'created on_auth_user_created trigger on auth.users';
  END IF;
END $$;

-- Backfill: users created while the trigger was missing. Same semantics as
-- handle_new_user (default signup_type: admin — matches the function).
INSERT INTO public.profiles (id, email, full_name)
SELECT u.id, u.email, COALESCE(u.raw_user_meta_data ->> 'full_name', u.email)
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       CASE COALESCE(u.raw_user_meta_data ->> 'signup_type', 'admin')
         WHEN 'customer' THEN 'customer'::app_role
         WHEN 'admin'    THEN 'admin'::app_role
         ELSE 'writer'::app_role
       END
  FROM auth.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;
