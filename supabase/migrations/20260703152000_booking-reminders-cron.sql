-- Feature: Booking reminders (docs/parity/capabilities/booking.json#reminders).
-- Wires the previously-dead bookings.reminder_sent_at column: adds a 7th job
-- to the existing register_flowpilot_cron(url, anon_key) mechanism (baseline.sql
-- ~L7756) that already registers every other FlowWink periodic job (heartbeat,
-- automation-dispatcher, publish-scheduled-pages, learn, briefing, health-check)
-- via cron.schedule + net.http_post. No new scheduling paradigm — this is the
-- same idempotent CREATE OR REPLACE + guarded cron.job existence check used
-- for every prior job in this function, extended with one more entry.
--
-- Runs every 15 minutes and hits the new send-booking-reminders edge function,
-- which finds confirmed bookings starting within ~24h with reminder_sent_at
-- still NULL, sends a reminder email, and stamps reminder_sent_at.

CREATE OR REPLACE FUNCTION "public"."register_flowpilot_cron"("p_supabase_url" "text", "p_anon_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog', 'extensions'
    AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  job_exists boolean;
  auth_header text;
BEGIN
  auth_header := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_anon_key
  )::text;

  -- 1. Heartbeat (every 12h)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-heartbeat',
      '0 0,12 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-heartbeat',
        auth_header
      )
    );
    result := result || '{"heartbeat": "registered"}'::jsonb;
  ELSE
    result := result || '{"heartbeat": "already_exists"}'::jsonb;
  END IF;

  -- 2. Automation dispatcher (every minute)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'automation-dispatcher-every-minute') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'automation-dispatcher-every-minute',
      '* * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "pg_cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/automation-dispatcher',
        auth_header
      )
    );
    result := result || '{"automation_dispatcher": "registered"}'::jsonb;
  ELSE
    result := result || '{"automation_dispatcher": "already_exists"}'::jsonb;
  END IF;

  -- 3. Publish scheduled pages (every 5 minutes — keeps per-minute cron write load
  --    down; pg_cron logs every run to cron.job_run_details. See retention migration.)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-pages') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'publish-scheduled-pages',
      '*/5 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/publish-scheduled-pages',
        auth_header
      )
    );
    result := result || '{"publish_scheduled_pages": "registered"}'::jsonb;
  ELSE
    result := result || '{"publish_scheduled_pages": "already_exists"}'::jsonb;
  END IF;

  -- 4. FlowPilot learn (daily at 03:00)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-learn') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-learn',
      '0 3 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-learn',
        auth_header
      )
    );
    result := result || '{"flowpilot_learn": "registered"}'::jsonb;
  ELSE
    result := result || '{"flowpilot_learn": "already_exists"}'::jsonb;
  END IF;

  -- 5. Daily briefing (daily at 07:00)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-daily-briefing') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-daily-briefing',
      '0 7 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-briefing',
        auth_header
      )
    );
    result := result || '{"daily_briefing": "registered"}'::jsonb;
  ELSE
    result := result || '{"daily_briefing": "already_exists"}'::jsonb;
  END IF;

  -- 6. Instance health check (every 6 hours)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'instance-health-check') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'instance-health-check',
      '0 */6 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/instance-health',
        auth_header
      )
    );
    result := result || '{"instance_health_check": "registered"}'::jsonb;
  ELSE
    result := result || '{"instance_health_check": "already_exists"}'::jsonb;
  END IF;

  -- 7. Booking reminders (every 15 minutes) — sweeps confirmed bookings starting
  --    within ~24h with reminder_sent_at still NULL and emails a reminder.
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'booking-reminders') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'booking-reminders',
      '*/15 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/send-booking-reminders',
        auth_header
      )
    );
    result := result || '{"booking_reminders": "registered"}'::jsonb;
  ELSE
    result := result || '{"booking_reminders": "already_exists"}'::jsonb;
  END IF;

  -- Cleanup: remove duplicate heartbeat-12h if it exists
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat-12h') THEN
    PERFORM cron.unschedule('flowpilot-heartbeat-12h');
    result := result || '{"heartbeat_12h_duplicate": "removed"}'::jsonb;
  END IF;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."register_flowpilot_cron"("p_supabase_url" "text", "p_anon_key" "text") OWNER TO "postgres";
