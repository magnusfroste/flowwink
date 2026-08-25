-- Påminnaren som aldrig kunde födas.
--
-- comms-send?kind=booking_reminders har funnits länge: sveper bekräftade
-- bokningar som startar inom 24h med reminder_sent_at NULL, mailar, stämplar.
-- Men inget cron-jobb skapades någonsin — migrationen 20260720120710 OMPEKAR
-- befintliga jobb till comms-send, och ett jobb som aldrig fötts finns inte
-- att ompeka. Uppmätt på optic 2026-08-25: cron.job saknar varje spår av
-- booking/reminder, och Magnus bokning passerade sin mötestid med
-- reminder_sent_at NULL. Momang 22-klassen: en självstartande cron kan inte
-- starta sig själv (samma klass som knowledge-indexern).
--
-- Egen registrar bredvid register_flowpilot_cron — INTE en omdefinition av
-- huvudkroppen. Två kopior av en funktionskropp driver isär; det var exakt så
-- COGS-blocket försvann (20260827200000). Prejudikat: register_retrieval_cron.
-- Klienten (ensurePlatformCron) anropar den tolerant — äldre instanser utan
-- funktionen är inte ett fel.
CREATE OR REPLACE FUNCTION public.register_booking_cron(p_supabase_url text, p_anon_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  job_exists boolean;
  auth_header text;
  result jsonb := '{}'::jsonb;
BEGIN
  -- Admin-anropad från bootstrap → intern vakt, inte revoke (husregeln från
  -- anon-svepet). session_user-armen släpper migrations/psql-provisionering.
  IF NOT (
       auth.role() = 'service_role'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR session_user IN ('postgres', 'supabase_admin')
  ) THEN
    RAISE EXCEPTION 'register_booking_cron: admin or service_role required';
  END IF;

  IF p_supabase_url IS NULL OR p_anon_key IS NULL THEN
    RAISE EXCEPTION 'register_booking_cron: p_supabase_url and p_anon_key are required';
  END IF;

  auth_header := format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', p_anon_key);

  -- Varje timme, minut 23 (spridd från heltimmesklustret). Svepfönstret är
  -- 24h och stämpeln gör omkörning ofarlig — timvis är rätt upplösning.
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'booking-reminders') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'booking-reminders',
      '23 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/comms-send?kind=booking_reminders',
        auth_header
      )
    );
    result := result || '{"booking_reminders": "registered"}'::jsonb;
  ELSE
    result := result || '{"booking_reminders": "already_exists"}'::jsonb;
  END IF;

  RETURN result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.register_booking_cron(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_booking_cron(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_booking_cron(text, text) TO authenticated, service_role;
