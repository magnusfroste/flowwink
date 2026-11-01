-- MFA for staff (2026-10-29, Peter on optic asked; an ERP's human door is the
-- one door left once the data stays in the instance).
--
-- Supabase Auth has TOTP built in: enroll a factor, challenge, verify, and the
-- session's JWT carries `aal` = 'aal2'. What Supabase does NOT do is enforce
-- it: a session that signs in with a password alone is aal1 and PostgREST
-- answers it like any other. So the enforcement lives where every staff read
-- already passes — the role gate. has_role() and can_access_module() now ask
-- session_mfa_ok() first:
--
--   • a check that is not about the caller's own session (service role, a
--     definer function judging another user) is untouched;
--   • a caller with no staff role is untouched — MFA is for staff, the portal
--     customer keeps signing in as before;
--   • a staff session at aal2 passes;
--   • a staff member who ENROLLED a factor must be at aal2 — enrolled but not
--     stepped up reads nothing, however the browser was coaxed past the screen;
--   • when the instance's dial `security.mfaRequiredForStaff` is on, a staff
--     member WITHOUT a factor reads nothing either, until they enroll.
--
-- Own-row reads (profiles, one's own user_roles) do not pass through the role
-- gate, so the shell can still load, learn who the user is, and show the
-- challenge or the enrollment screen. Two admin RPCs: the fleet view of who has
-- enrolled, and the reset for a colleague who lost the phone — Supabase has no
-- recovery codes, so an admin is the recovery.

CREATE OR REPLACE FUNCTION public.session_mfa_ok(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Not this session being judged: the service role, or a check on behalf of someone else.
    WHEN auth.role() = 'service_role' THEN true
    WHEN _user_id IS NULL OR auth.uid() IS NULL OR _user_id IS DISTINCT FROM auth.uid() THEN true
    -- MFA is for staff. A customer-only account is never gated here.
    WHEN NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role <> 'customer'::public.app_role) THEN true
    -- Stepped up: the session proved the second factor.
    WHEN coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' THEN true
    -- Enrolled but not stepped up: the screen was skipped, the database is not.
    WHEN EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = _user_id AND f.status = 'verified') THEN false
    -- The instance requires MFA of its staff and this one has not enrolled yet.
    WHEN coalesce((SELECT (s.value ->> 'mfaRequiredForStaff')::boolean FROM public.site_settings s WHERE s.key = 'security'), false) THEN false
    ELSE true
  END;
$$;
GRANT EXECUTE ON FUNCTION public.session_mfa_ok(uuid) TO authenticated, anon, service_role;
COMMENT ON FUNCTION public.session_mfa_ok(uuid) IS 'The MFA half of the role gate: a staff session that enrolled a factor (or must, by the security dial) reads as staff only at aal2. Service role and checks on behalf of others pass.';

-- The role gate, with the MFA half in front. Same signature, same callers.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  ) AND public.session_mfa_ok(_user_id);
$$;
-- The gate itself is everyone's to call (the baseline's grants, restated so the
-- audience is declared beside the body).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_module(_user_id uuid, _module_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.session_mfa_ok(_user_id)
     AND (
       public.has_role(_user_id, 'admin'::app_role)
       OR EXISTS (
            SELECT 1
              FROM public.user_roles ur
              JOIN public.role_module_access rma ON rma.role = ur.role
             WHERE ur.user_id = _user_id
               AND rma.module_id = _module_id
          )
     );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_module(uuid, text) TO authenticated, anon, service_role;

-- Who has enrolled — the admin's fleet view (Users page, readiness card).
CREATE OR REPLACE FUNCTION public.admin_mfa_status()
RETURNS TABLE (user_id uuid, enrolled boolean, factors integer, last_verified_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id AS user_id,
         EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified') AS enrolled,
         (SELECT count(*)::integer FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified') AS factors,
         (SELECT max(f.updated_at) FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified') AS last_verified_at
    FROM public.profiles p
   WHERE auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role);
$$;
GRANT EXECUTE ON FUNCTION public.admin_mfa_status() TO authenticated, service_role;

-- The recovery: a colleague lost the phone. Removes every factor (and, by
-- cascade, its challenges); the person signs in with the password next time
-- and enrolls again (at once, when the dial is on). Admin only, never anon.
CREATE OR REPLACE FUNCTION public.admin_reset_mfa(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_removed integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin_reset_mfa: admin or service_role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'admin_reset_mfa: _user_id is required';
  END IF;
  DELETE FROM auth.mfa_factors WHERE user_id = _user_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('reset_mfa', 'user', _user_id, auth.uid(), jsonb_build_object('factors_removed', v_removed));
  RETURN jsonb_build_object('user_id', _user_id, 'factors_removed', v_removed);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(uuid) TO authenticated, service_role;

-- Proof: the gate judges only the caller's own staff session.
DO $$
DECLARE
  v_uid uuid := '00000000-0000-4000-8000-0000000000fa';
  v_ok boolean;
BEGIN
  BEGIN
    -- A staff user with a verified factor. auth.users may refuse the bare row on
    -- some Auth versions; then the proof is skipped, not failed.
    BEGIN
      INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      VALUES (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mfa-proof@example.invalid', '', now(), now(), '{}'::jsonb, '{}'::jsonb);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'mfa proof skipped: cannot insert auth.users here (%)', SQLERRM;
      RAISE EXCEPTION '__mfa_proof_ok__';
    END;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'sales'::public.app_role);
    INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
    VALUES (gen_random_uuid(), v_uid, 'proof', 'totp', 'verified', now(), now(), 'proof');

    -- The same user at aal1: enrolled, not stepped up → not staff.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT public.has_role(v_uid, 'sales'::public.app_role) INTO v_ok;
    IF v_ok THEN RAISE EXCEPTION 'proof: an enrolled staff session at aal1 must not read as staff'; END IF;
    SELECT public.can_access_module(v_uid, 'leads') INTO v_ok;
    IF v_ok THEN RAISE EXCEPTION 'proof: can_access_module must follow the same gate'; END IF;
    -- At aal2 → staff.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    SELECT public.has_role(v_uid, 'sales'::public.app_role) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'proof: an aal2 staff session must read as staff'; END IF;
    -- A check on behalf of ANOTHER user is not gated by this session.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
    SELECT public.has_role(v_uid, 'sales'::public.app_role) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'proof: a check on behalf of another user must not be gated'; END IF;
    -- The service role is never gated.
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE service_role';
    SELECT public.has_role(v_uid, 'sales'::public.app_role) INTO v_ok;
    IF NOT v_ok THEN RAISE EXCEPTION 'proof: the service role must not be gated'; END IF;
    RAISE NOTICE 'mfa gate proof ok';
    RAISE EXCEPTION '__mfa_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
      IF SQLERRM <> '__mfa_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
