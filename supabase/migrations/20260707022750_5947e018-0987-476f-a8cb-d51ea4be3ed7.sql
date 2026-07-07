-- Idempotent: schedule a pg_cron job that POSTs to newsletter/dispatch-scheduled every 5 minutes.
-- The newsletter edge function is deployed --no-verify-jwt; the handler enforces
-- that the Bearer token equals the project anon (or service) key.
-- pg_cron and pg_net are already installed on this project.

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
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6aGpvdHhmZmpmc2RsaHJka3BqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTk2MzAsImV4cCI6MjA4MTEzNTYzMH0.h_S8ZHuCWWz97-uzQge0sb3riHmElrKTTfs5jrwE72c"}'::jsonb,
    body := jsonb_build_object('trigger', 'pg_cron', 'scheduled_at', now())
  );
  $cron$
);