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