-- Cron HTTP timeout sweep (hardening follow-up to cron_health_report).
--
-- Observed on the dev instance (2026-07-22): ~16 pg_net timeouts/24h, all
-- "Timeout of 5000 ms reached", clustered at :00/:30/:15 — the minutes when
-- many jobs fire simultaneously (dunning */30 + three */15 + five */5 + three
-- every-minute). pg_net's DEFAULT timeout_milliseconds is 5000; under a burst
-- the DNS lookup alone can eat the full 5 s, so the request never leaves the
-- instance and that tick's work is silently skipped (a dunning run, a
-- reminder sweep). All jobs report 'succeeded' — pg_cron only sees dispatch —
-- which is exactly the silent-failure class this hardening series exists for.
--
-- Fix: raise timeout_milliseconds to 10000 on every cron job whose command
-- calls net.http_post without an explicit timeout. Packaged as a reusable,
-- SECURITY DEFINER function so it can be re-run after future jobs are
-- registered (register_flowpilot_cron etc. predate this and don't set one):
--
--   SELECT public.apply_cron_http_timeouts();          -- default 10000 ms
--   SELECT public.apply_cron_http_timeouts(15000);     -- custom
--
-- Safety properties:
--   • Only touches commands containing net.http_post AND lacking
--     timeout_milliseconds — re-running is a no-op (idempotent).
--   • Host-preserving: the command text is only amended, never rebuilt, so
--     an instance's own URL/keys are untouched (the foreign-host incident
--     class cannot be reintroduced by this sweep).
--   • The rewrite is verified before applying: if the regexp did not produce
--     a longer command containing timeout_milliseconds, the job is skipped
--     with a NOTICE instead of altered.
--   • Degrades to a no-op result on instances without pg_cron.
--
-- Deliberately NOT done here: staggering the */15//*30 schedules. That
-- changes delivery semantics (reminder timing) for marginal gain once the
-- timeout headroom exists.
--
-- Idempotent (CREATE OR REPLACE + guarded sweep) + forward-dated for
-- managed-ledger instances.

CREATE OR REPLACE FUNCTION public.apply_cron_http_timeouts(p_timeout_ms integer DEFAULT 10000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $fn$
DECLARE
  r          record;
  v_new      text;
  v_updated  jsonb := '[]'::jsonb;
  v_skipped  jsonb := '[]'::jsonb;
BEGIN
  -- Gate: gateway (service_role), an admin, or a direct superuser connection
  -- (migrations and managed runners execute as postgres, where auth.role()
  -- is NULL — without this escape the self-sweep below would fail the apply).
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin')
          OR session_user IN ('postgres', 'supabase_admin')) THEN
    RAISE EXCEPTION 'apply_cron_http_timeouts: admin or service_role required';
  END IF;

  IF p_timeout_ms IS NULL OR p_timeout_ms < 1000 OR p_timeout_ms > 60000 THEN
    RAISE EXCEPTION 'apply_cron_http_timeouts: p_timeout_ms must be 1000..60000 (got %)', p_timeout_ms;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RETURN jsonb_build_object('cron_available', false, 'updated', v_updated, 'skipped', v_skipped);
  END IF;

  FOR r IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command ILIKE '%net.http_post%'
      AND command NOT ILIKE '%timeout_milliseconds%'
  LOOP
    -- Insert ", timeout_milliseconds := N" before the http_post call's final
    -- closing paren. Fleet cron commands are single net.http_post SELECTs, so
    -- the last ')' in the command (optionally followed by "AS <alias>" and/or
    -- ';' and whitespace) closes that call.
    -- 'i' flag: the fleet has both "AS request_id" and "as request_id".
    v_new := regexp_replace(
      r.command,
      '\)(\s*(?:AS\s+[a-zA-Z_][a-zA-Z0-9_]*)?\s*;?\s*)$',
      ', timeout_milliseconds := ' || p_timeout_ms || ')\1',
      'i'
    );

    IF v_new IS DISTINCT FROM r.command AND v_new ILIKE '%timeout_milliseconds%' THEN
      PERFORM cron.alter_job(job_id => r.jobid, command => v_new);
      v_updated := v_updated || to_jsonb(r.jobname);
      RAISE NOTICE 'apply_cron_http_timeouts: % → timeout_milliseconds=%', r.jobname, p_timeout_ms;
    ELSE
      v_skipped := v_skipped || to_jsonb(r.jobname);
      RAISE NOTICE 'apply_cron_http_timeouts: SKIPPED % (command shape not recognized — inspect manually)', r.jobname;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'cron_available', true,
    'timeout_ms', p_timeout_ms,
    'updated', v_updated,
    'skipped', v_skipped
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.apply_cron_http_timeouts(integer) TO authenticated, service_role;

-- One-time sweep on apply (service_role/definer context in migrations).
DO $do$
DECLARE
  v_result jsonb;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'apply_cron_http_timeouts: pg_cron not present — sweep skipped.';
    RETURN;
  END IF;
  v_result := public.apply_cron_http_timeouts();
  RAISE NOTICE 'apply_cron_http_timeouts sweep: %', v_result;
END
$do$;
