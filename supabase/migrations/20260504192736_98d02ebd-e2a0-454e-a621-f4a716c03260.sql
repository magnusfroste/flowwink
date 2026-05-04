-- ── Webinar Reminders Infrastructure ──────────────────────────────
-- Adds reminder marker columns to registrations so the tick function
-- can emit each reminder exactly once per registration. Actual email
-- delivery is wired by automations subscribing to the emitted events.

ALTER TABLE public.webinar_registrations
  ADD COLUMN IF NOT EXISTS reminder_confirm_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_t24_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_t1_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_post_sent_at timestamptz;

-- ── webinar_reminder_tick() ──
-- Walks active registrations and emits one of:
--   webinar.reminder.confirm  (immediately after registration)
--   webinar.reminder.t24      (24h before start)
--   webinar.reminder.t1       (1h before start)
--   webinar.reminder.post     (30m after end, attended OR no-show variant in payload)
-- Each emission is deduped via a marker column. Idempotent.
CREATE OR REPLACE FUNCTION public.webinar_reminder_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirm int := 0;
  v_t24     int := 0;
  v_t1      int := 0;
  v_post    int := 0;
  r record;
BEGIN
  -- 1. Confirmation: any registration without confirm marker, webinar not cancelled
  FOR r IN
    SELECT wr.id, wr.webinar_id, wr.email, wr.name, wr.lead_id, w.title, w.date, w.meeting_url
    FROM webinar_registrations wr
    JOIN webinars w ON w.id = wr.webinar_id
    WHERE wr.reminder_confirm_sent_at IS NULL
      AND w.status IN ('draft','published','live')
    LIMIT 200
  LOOP
    PERFORM emit_platform_event(
      'webinar.reminder.confirm',
      jsonb_build_object(
        'registration_id', r.id, 'webinar_id', r.webinar_id,
        'email', r.email, 'name', r.name, 'lead_id', r.lead_id,
        'title', r.title, 'date', r.date, 'meeting_url', r.meeting_url
      ),
      'webinars'
    );
    UPDATE webinar_registrations SET reminder_confirm_sent_at = now() WHERE id = r.id;
    v_confirm := v_confirm + 1;
  END LOOP;

  -- 2. T-24h: webinar starts within next 24h, more than 23h away
  FOR r IN
    SELECT wr.id, wr.webinar_id, wr.email, wr.name, wr.lead_id, w.title, w.date, w.meeting_url
    FROM webinar_registrations wr
    JOIN webinars w ON w.id = wr.webinar_id
    WHERE wr.reminder_t24_sent_at IS NULL
      AND w.status IN ('published','live')
      AND w.date BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
    LIMIT 500
  LOOP
    PERFORM emit_platform_event(
      'webinar.reminder.t24',
      jsonb_build_object(
        'registration_id', r.id, 'webinar_id', r.webinar_id,
        'email', r.email, 'name', r.name, 'lead_id', r.lead_id,
        'title', r.title, 'date', r.date, 'meeting_url', r.meeting_url
      ),
      'webinars'
    );
    UPDATE webinar_registrations SET reminder_t24_sent_at = now() WHERE id = r.id;
    v_t24 := v_t24 + 1;
  END LOOP;

  -- 3. T-1h: webinar starts within next hour
  FOR r IN
    SELECT wr.id, wr.webinar_id, wr.email, wr.name, wr.lead_id, w.title, w.date, w.meeting_url
    FROM webinar_registrations wr
    JOIN webinars w ON w.id = wr.webinar_id
    WHERE wr.reminder_t1_sent_at IS NULL
      AND w.status IN ('published','live')
      AND w.date BETWEEN now() + interval '40 minutes' AND now() + interval '90 minutes'
    LIMIT 500
  LOOP
    PERFORM emit_platform_event(
      'webinar.reminder.t1',
      jsonb_build_object(
        'registration_id', r.id, 'webinar_id', r.webinar_id,
        'email', r.email, 'name', r.name, 'lead_id', r.lead_id,
        'title', r.title, 'date', r.date, 'meeting_url', r.meeting_url
      ),
      'webinars'
    );
    UPDATE webinar_registrations SET reminder_t1_sent_at = now() WHERE id = r.id;
    v_t1 := v_t1 + 1;
  END LOOP;

  -- 4. Post-webinar: 30m+ after end, only for completed webinars
  FOR r IN
    SELECT wr.id, wr.webinar_id, wr.email, wr.name, wr.lead_id, wr.attended,
           w.title, w.recording_url, w.date
    FROM webinar_registrations wr
    JOIN webinars w ON w.id = wr.webinar_id
    WHERE wr.reminder_post_sent_at IS NULL
      AND w.status = 'completed'
      AND (w.date + (COALESCE(w.duration_minutes,60) || ' minutes')::interval + interval '30 minutes') < now()
    LIMIT 500
  LOOP
    PERFORM emit_platform_event(
      'webinar.reminder.post',
      jsonb_build_object(
        'registration_id', r.id, 'webinar_id', r.webinar_id,
        'email', r.email, 'name', r.name, 'lead_id', r.lead_id,
        'title', r.title, 'recording_url', r.recording_url,
        'attended', COALESCE(r.attended, false),
        'variant', CASE WHEN r.attended THEN 'thanks' ELSE 'missed_you' END
      ),
      'webinars'
    );
    UPDATE webinar_registrations SET reminder_post_sent_at = now() WHERE id = r.id;
    v_post := v_post + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'emitted', jsonb_build_object(
      'confirm', v_confirm, 't24', v_t24, 't1', v_t1, 'post', v_post
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.webinar_reminder_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webinar_reminder_tick() TO service_role;

-- ── Cron: every 15 minutes ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('webinar-reminder-tick-15min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'webinar-reminder-tick-15min');
    PERFORM cron.schedule(
      'webinar-reminder-tick-15min',
      '*/15 * * * *',
      $cron$ SELECT public.webinar_reminder_tick(); $cron$
    );
  END IF;
END $$;

-- ── Composite skill: generate_blog_from_webinar ──
-- Pure metadata; the actual handler lives in ai-task hub. Registered
-- via the webinars module skillSeeds.
COMMENT ON FUNCTION public.webinar_reminder_tick() IS
  'Emits webinar.reminder.{confirm,t24,t1,post} platform events. Cron every 15 min. Each reminder dedup''d via marker column on webinar_registrations.';
