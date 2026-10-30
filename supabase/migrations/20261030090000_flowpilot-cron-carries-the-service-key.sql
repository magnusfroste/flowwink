-- ============================================================
-- Migration: FlowPilot's cron jobs carry the service-role key
-- Date: 2026-10-30
-- Safe to re-run: Yes
-- ============================================================
--
-- flowpilot-heartbeat authenticates its caller from 2026-10-30 (service role
-- or admin): a run costs AI tokens and takes real actions, and the function
-- accepted anyone on the internet. The cron jobs registered by
-- register_flowpilot_cron / update_autonomy_cadence carried the publishable
-- key, so after the deploy every scheduled tick would be refused until the
-- heartbeat's own self-heal re-registered them (one missed tick per instance).
--
-- This rewrites the Authorization header of the FlowPilot jobs to the
-- service-role key from vault — present on every fleet instance — so no tick
-- is missed. Where vault has no key (a fork provisioned differently) nothing
-- changes here and the heartbeat heals the jobs on its first refused tick.
--
-- Also callable at runtime (admin or service role): the admin shell runs it
-- after register_flowpilot_cron on every bootstrap, so a fresh install —
-- whose registrar only knows the publishable key the browser has — ends up
-- with the service key too.

CREATE OR REPLACE FUNCTION public.flowpilot_cron_use_service_key()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_token text;
  v_job record;
  v_cmd text;
  v_rewritten int := 0;
  v_seen int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'flowpilot_cron_use_service_key: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;
  IF v_token IS NULL OR v_token = '' THEN
    RETURN jsonb_build_object('rewritten', 0, 'reason', 'vault has no SUPABASE_SERVICE_ROLE_KEY — the heartbeat re-registers its jobs on the next refused tick');
  END IF;

  FOR v_job IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE command LIKE '%/functions/v1/flowpilot-heartbeat%'
       OR command LIKE '%/functions/v1/flowpilot-lifecycle%'
  LOOP
    v_seen := v_seen + 1;
    -- Only a job whose bearer is NOT already the service key is touched.
    IF position(v_token IN v_job.command) = 0 AND v_job.command ~ 'Bearer [A-Za-z0-9_.\-]+' THEN
      v_cmd := regexp_replace(v_job.command, 'Bearer [A-Za-z0-9_.\-]+', 'Bearer ' || v_token);
      PERFORM cron.alter_job(job_id := v_job.jobid, command := v_cmd);
      v_rewritten := v_rewritten + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('seen', v_seen, 'rewritten', v_rewritten);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.flowpilot_cron_use_service_key() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.flowpilot_cron_use_service_key() TO authenticated, service_role;
COMMENT ON FUNCTION public.flowpilot_cron_use_service_key() IS
  'Rewrites the FlowPilot cron jobs (heartbeat, lifecycle) to carry the vault service-role key. Admin or service role. Idempotent.';

-- Apply now, as the migration runner (service role / postgres). A failure here
-- must not fail the deploy: the heartbeat heals the jobs itself.
DO $$
BEGIN
  PERFORM public.flowpilot_cron_use_service_key();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'flowpilot_cron_use_service_key skipped: %', SQLERRM;
END $$;
