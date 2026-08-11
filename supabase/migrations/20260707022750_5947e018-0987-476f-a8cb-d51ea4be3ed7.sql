-- Idempotent: schedule a pg_cron job that POSTs to newsletter/dispatch-scheduled every 5 minutes.
-- The newsletter edge function is deployed --no-verify-jwt; the handler enforces
-- that the Bearer token equals the project anon (or service) key.
-- pg_cron and pg_net are already installed on this project.
-- NB: the Bearer must be the NEW-format publishable key — the deployed edge
-- runtime's SUPABASE_ANON_KEY is the publishable key on this project, so the
-- legacy JWT anon key gets a silent 401 (see project_autonomy_cron_silent_401).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'newsletter-dispatch-scheduled') THEN
    PERFORM cron.unschedule('newsletter-dispatch-scheduled');
  END IF;
END $$;

SELECT cron.schedule(
  'newsletter-dispatch-scheduled',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/newsletter/dispatch-scheduled',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer sb_publishable_WcvHvlNYuw_GDKEqnGeolw_ir4jw4pD"}'::jsonb,
    body := jsonb_build_object('trigger', 'pg_cron', 'scheduled_at', now())
  );
  $cron$
);

-- Fresh-replay quiescence (2026-08-11): jobs must not fire into a half-built
-- schema. A from-scratch replay deadlocked (SQLSTATE 40P01) on the very first
-- GitHub-integration run. Every migration that schedules cron jobs at replay
-- time now ends by deactivating ALL jobs; the always-last finalizer
-- (99999999999999) activates everything once the schema is complete. Existing
-- instances never re-run this file (ledger), so they are unaffected.
DO $quiesce$
DECLARE r record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    -- cron.alter_job, not UPDATE: on fresh (PG17) projects the postgres role
    -- has no table UPDATE privilege on cron.job — the API function is the
    -- portable path. Verified live on ypkhjjkywgnqhuyiilcz 2026-08-11.
    FOR r IN SELECT jobid FROM cron.job LOOP
      PERFORM cron.alter_job(r.jobid, active => false);
    END LOOP;
  END IF;
END $quiesce$;
