-- ============================================================================
-- The first account on a virgin instance claims admin — the self-hosted way.
--
-- Ghost, Gitea, Grafana, Plausible: the operator deploys their own instance
-- and the first person to reach the login screen becomes the admin. FlowWink
-- couldn't do that — handle_new_user() fails closed to 'customer', so a brand
-- new self-hosted instance was born with NO admin and no CLI-free way to make
-- one (you had to set signup_type metadata by hand or run SQL).
--
-- This adds the missing branch, gated on the only thing that makes it safe:
--
--     grant admin to a new signup ONLY WHILE zero admins exist.
--
-- The window is exactly "a virgin instance nobody administers yet", and it
-- bolts shut the instant the first admin row lands. This does NOT reopen the
-- hole the fail-closed migration (20260726190000) closed — that hole was
-- "empty metadata ALWAYS becomes admin", reachable on any instance at any
-- time. This branch is reachable only when the admin count is zero, which for
-- every provisioned instance it already is not: all five fleet instances have
-- an admin today, so their behaviour is unchanged. Only a fresh birth sees it.
--
-- pg_advisory_xact_lock serialises the check-and-grant so two near-simultaneous
-- first signups cannot both claim admin — the second sees count = 1 and falls
-- through to the normal fail-closed decision.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  signup_type text;
  v_admin_count integer;
BEGIN
  -- Fail CLOSED. Absent or unrecognised metadata must never imply privilege.
  signup_type := COALESCE(NEW.raw_user_meta_data ->> 'signup_type', 'customer');

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  -- Serialise the virgin-instance check so a race can't mint two admins.
  PERFORM pg_advisory_xact_lock(hashtext('handle_new_user:first_admin'));
  SELECT count(*) INTO v_admin_count FROM public.user_roles WHERE role = 'admin';

  IF v_admin_count = 0 THEN
    -- Virgin instance: the first account is the operator. Claim admin, and the
    -- window closes here. Self-hosted bootstrap — safe because it is gated on
    -- there being no admin at all, not on being "first" in general.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF signup_type = 'admin' THEN
    -- Reached only when a provisioning path asks for it by name.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF signup_type = 'employee' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'writer')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- 'customer', anything unrecognised, and anything absent.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
DECLARE v_admins integer;
BEGIN
  SELECT count(*) INTO v_admins FROM public.user_roles WHERE role = 'admin';
  IF v_admins = 0 THEN
    RAISE NOTICE 'First-admin bootstrap ACTIVE: this instance has no admin — the next signup claims it.';
  ELSE
    RAISE NOTICE 'First-admin bootstrap dormant: % admin(s) already exist, so the next signup follows the normal fail-closed rules.', v_admins;
  END IF;
END $$;
