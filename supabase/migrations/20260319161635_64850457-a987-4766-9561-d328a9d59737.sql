-- Helper functions for cron job management from edge functions

-- Unschedule a cron job by name (idempotent)
CREATE OR REPLACE FUNCTION public.unschedule_cron_job(p_jobname text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_jobname) THEN
    PERFORM cron.unschedule(p_jobname);
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- Schedule a cron job with HTTP POST (idempotent — drops existing first)
CREATE OR REPLACE FUNCTION public.schedule_cron_job(
  p_jobname text,
  p_schedule text,
  p_url text,
  p_headers text,
  p_body text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $$
BEGIN
  -- Remove existing job if present
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_jobname) THEN
    PERFORM cron.unschedule(p_jobname);
  END IF;

  PERFORM cron.schedule(
    p_jobname,
    p_schedule,
    format(
      'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb) AS request_id;',
      p_url,
      p_headers,
      p_body
    )
  );
  
  RETURN true;
END;
$$;