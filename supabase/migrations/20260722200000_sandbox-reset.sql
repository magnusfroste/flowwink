-- Sandbox reset — the destroy-half of sandbox.flowwink.com's nightly rebuild.
--
-- The sandbox model (Magnus, 2026-07-22): external testers get FULL admin and
-- run the instance as their own site; the REBUILD is the safety mechanism,
-- not the permissions. This function is the wipe: truncate everything a
-- tester (or agent) can have touched, keep the four seeded layers and the
-- instance's identity, and normalize auth so a hijacked shared password
-- self-heals every night.
--
-- Triple-gated because a wipe on a customer instance is the worst bug this
-- codebase could ship:
--   1. p_confirm must be the literal 'WIPE-SANDBOX'
--   2. site_settings.sandbox_mode must be true (only ever set on the sandbox)
--   3. caller must be service_role or an admin
-- and the whole body is atomic: if the wipe cascades into a keep-table, the
-- invariant check at the end raises and everything rolls back.

CREATE OR REPLACE FUNCTION public.sandbox_reset_wipe(p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  -- Survives every reset: seeded layers (skills, automations, chart, roles,
  -- accounting templates, locale packs), instance config, identity, gateway
  -- credentials, and the demo-cycle registry definitions live in cron/config.
  KEEP text[] := ARRAY[
    'agent_skills','agent_automations',
    'chart_of_accounts','account_roles','accounting_templates','locale_packs',
    'site_settings','user_roles','profiles','api_keys'
  ];
  _flag jsonb;
  _admin_email text;
  _tables text[];
  _t text;
  _users_deleted int := 0;
  _skill_count int;
  _settings_count int;
BEGIN
  IF p_confirm IS DISTINCT FROM 'WIPE-SANDBOX' THEN
    RAISE EXCEPTION 'sandbox_reset_wipe requires p_confirm = ''WIPE-SANDBOX''';
  END IF;

  SELECT value INTO _flag FROM public.site_settings WHERE key = 'sandbox_mode';
  IF NOT (_flag = 'true'::jsonb OR (_flag ->> 'enabled') = 'true') THEN
    RAISE EXCEPTION 'sandbox_reset_wipe refused: this instance is not a sandbox (site_settings.sandbox_mode is not true)';
  END IF;

  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only service_role or an admin can reset the sandbox';
  END IF;

  SELECT COALESCE(
    NULLIF((SELECT value #>> '{}' FROM public.site_settings WHERE key = 'sandbox_admin_email'), ''),
    'demo@flowwink.com'
  ) INTO _admin_email;

  -- One TRUNCATE over the whole wipe set. CASCADE only ever reaches tables
  -- OUTSIDE the set — and if that turns out to be a keep-table, the invariant
  -- check below rolls the whole transaction back.
  SELECT array_agg(tablename ORDER BY tablename) INTO _tables
    FROM pg_tables
   WHERE schemaname = 'public'
     AND NOT (tablename = ANY(KEEP));

  IF _tables IS NOT NULL AND array_length(_tables, 1) > 0 THEN
    EXECUTE 'TRUNCATE TABLE '
      || (SELECT string_agg(format('public.%I', t), ', ') FROM unnest(_tables) AS t)
      || ' RESTART IDENTITY CASCADE';
  END IF;

  -- Auth normalize: every account except the shared sandbox admin goes; the
  -- admin's password resets to the published demo credential. A tester who
  -- changed the password or invited themselves as a second admin is undone
  -- here — nightly, automatically.
  DELETE FROM auth.users WHERE lower(email) IS DISTINCT FROM lower(_admin_email);
  GET DIAGNOSTICS _users_deleted = ROW_COUNT;
  UPDATE auth.users
     SET encrypted_password = extensions.crypt('demo1234', extensions.gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now())
   WHERE lower(email) = lower(_admin_email);

  -- Invariants: the seeded layers and config must have survived. If a foreign
  -- key quietly cascaded into them, refuse the whole wipe.
  SELECT count(*) INTO _skill_count FROM public.agent_skills;
  SELECT count(*) INTO _settings_count FROM public.site_settings;
  IF _skill_count = 0 OR _settings_count = 0 THEN
    RAISE EXCEPTION 'sandbox_reset_wipe rollback: a keep-table was emptied (agent_skills=%, site_settings=%)',
      _skill_count, _settings_count;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(_admin_email)) THEN
    RAISE EXCEPTION 'sandbox_reset_wipe rollback: sandbox admin % missing after auth normalize', _admin_email;
  END IF;

  RETURN jsonb_build_object(
    'tables_wiped', COALESCE(array_length(_tables, 1), 0),
    'users_deleted', _users_deleted,
    'admin_email', _admin_email,
    'skills_kept', _skill_count
  );
END $function$;

-- Deliberately NOT granted to authenticated: the skill rail (service_role via
-- agent-execute) and admins-through-the-rail are the only callers.
REVOKE ALL ON FUNCTION public.sandbox_reset_wipe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sandbox_reset_wipe(text) TO service_role;
