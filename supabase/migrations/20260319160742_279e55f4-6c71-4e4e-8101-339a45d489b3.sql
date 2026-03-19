-- Replace register_flowpilot_cron to register ALL autonomy cron jobs
CREATE OR REPLACE FUNCTION public.register_flowpilot_cron(
  p_supabase_url text,
  p_anon_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
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

  -- 3. Publish scheduled pages (every minute)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-pages') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'publish-scheduled-pages',
      '* * * * *',
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

  -- Cleanup: remove duplicate heartbeat-12h if it exists
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat-12h') THEN
    PERFORM cron.unschedule('flowpilot-heartbeat-12h');
    result := result || '{"heartbeat_12h_duplicate": "removed"}'::jsonb;
  END IF;

  RETURN result;
END;
$$;