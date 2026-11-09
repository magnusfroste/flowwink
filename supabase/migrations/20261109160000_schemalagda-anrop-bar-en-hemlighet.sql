-- ============================================================================
-- A scheduled call carries a secret the database made itself (2026-11-09).
--
-- Nine edge functions are what pg_cron calls on a schedule: the automation,
-- event and signal dispatchers, the knowledge indexer, dunning, contract and
-- subscription billing, quote-expiry reminders and demo-cycle. They run as the
-- service role and checked nobody: pg_cron called them with the site's
-- publishable key (the one every browser carries), so anyone holding it could
-- start the billing run, the reminders, the automations — or, on a demo
-- instance, the nightly rebuild — whenever and as often as they liked.
--
-- They could not simply demand the service key: automation-dispatcher is what
-- puts the service key in the vault (ensure_platform_secret), and the cron
-- jobs that call it were written with the publishable key before the vault
-- held anything. So the database makes its own secret:
--
--   CRON_SECRET          — 32 random bytes in the vault, born here, never
--                          shown to a browser, never returned by any function.
--   cron_secret_header() — adds `x-cron-secret` to a job's headers at CALL
--                          time, read from the vault (the job text carries a
--                          function call, never the secret).
--   pulse_lane()         — the hop every pulsed lane takes; now adds it.
--   cron_jobs_carry_the_secret() — rewrites every scheduled net.http_post to
--                          an edge function so its headers go through
--                          cron_secret_header(). Idempotent; run here and by
--                          automation-dispatcher every tick, so a job a later
--                          writer schedules (demo mode, performance mode) is
--                          healed within a minute — reconcile the state, do
--                          not trust every writer.
--   cron_secret_matches(text) — the edge layer's question (requireScheduledCaller
--                          in _shared/edge-auth.ts). Answers true/false only.
--
-- The edge side accepts the service key, a staff session (admin for
-- demo-cycle) or the secret; for one week a call with none of them is let
-- through and logged, then refused.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_cron_secret()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions', 'pg_catalog'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET') THEN
    RETURN false;
  END IF;
  PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'CRON_SECRET',
    'Born by the database (2026-11-09): pg_cron sends it as x-cron-secret; the edge layer checks it with cron_secret_matches().');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_cron_secret() TO service_role;

CREATE OR REPLACE FUNCTION public.cron_secret_header(p_headers jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_catalog'
AS $$
DECLARE
  v_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;
  IF v_secret IS NULL THEN
    RETURN coalesce(p_headers, '{}'::jsonb);
  END IF;
  RETURN coalesce(p_headers, '{}'::jsonb) || jsonb_build_object('x-cron-secret', v_secret);
END;
$$;
-- pg_cron runs jobs as their owner (postgres); nobody else needs it.
REVOKE ALL ON FUNCTION public.cron_secret_header(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_secret_header(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.cron_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_catalog'
AS $$
DECLARE
  v_secret text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'cron_secret_matches: service role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  RETURN v_secret IS NOT NULL AND v_secret = p_secret;
END;
$$;
REVOKE ALL ON FUNCTION public.cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_secret_matches(text) TO service_role;

-- The pulsed lanes (automation, event, knowledge …) all take this hop.
CREATE OR REPLACE FUNCTION public.pulse_lane(
  p_lane text,
  p_url text,
  p_headers jsonb,
  p_body jsonb DEFAULT '{"source":"pg_cron"}'::jsonb,
  p_timeout_ms integer DEFAULT 10000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NOT public.lane_has_work(p_lane) THEN
    RETURN NULL; -- skipped: nothing to do, no cold start
  END IF;
  RETURN net.http_post(url := p_url, headers := public.cron_secret_header(p_headers), body := p_body, timeout_milliseconds := p_timeout_ms);
END;
$function$;
REVOKE ALL ON FUNCTION public.pulse_lane(text, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
-- pg_cron runs it as the job owner; the service role is its only other audience.
GRANT EXECUTE ON FUNCTION public.pulse_lane(text, text, jsonb, jsonb, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.cron_jobs_carry_the_secret()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_job record;
  v_new text;
  v_rewritten text[] := '{}';
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'cron_jobs_carry_the_secret: service role only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN jsonb_build_object('skipped', 'pg_cron_missing');
  END IF;
  PERFORM public.ensure_cron_secret();
  FOR v_job IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE command LIKE '%net.http_post(%'
      AND command LIKE '%/functions/v1/%'
      AND command NOT LIKE '%cron_secret_header(%'
  LOOP
    -- headers := '<json>'::jsonb  →  headers := public.cron_secret_header('<json>'::jsonb)
    v_new := regexp_replace(
      v_job.command,
      'headers\s*:=\s*(''(?:[^'']|'''')*''::jsonb)',
      'headers := public.cron_secret_header(\1)',
      'g'
    );
    IF v_new IS DISTINCT FROM v_job.command THEN
      PERFORM cron.alter_job(v_job.jobid, command := v_new);
      v_rewritten := v_rewritten || v_job.jobname;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('rewritten', to_jsonb(v_rewritten));
END;
$$;
REVOKE ALL ON FUNCTION public.cron_jobs_carry_the_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_jobs_carry_the_secret() TO service_role;

COMMENT ON FUNCTION public.cron_jobs_carry_the_secret() IS
  'Rewrites every scheduled net.http_post to an edge function so its headers carry x-cron-secret (read from the vault at call time). Idempotent; automation-dispatcher runs it every tick.';

DO $$
BEGIN
  PERFORM public.ensure_cron_secret();
  PERFORM public.cron_jobs_carry_the_secret();
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name OR insufficient_privilege THEN
  RAISE NOTICE 'cron secret: vault or pg_cron not reachable here (%); automation-dispatcher heals it on its first tick', SQLERRM;
END $$;
