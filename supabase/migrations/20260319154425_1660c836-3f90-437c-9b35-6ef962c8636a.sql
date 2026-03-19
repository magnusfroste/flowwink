-- Enable pg_cron and pg_net extensions for FlowPilot autonomy
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a helper function that setup-flowpilot can call to register cron jobs
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
  job_exists boolean;
  result jsonb := '{}'::jsonb;
BEGIN
  -- Check if heartbeat cron already exists
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat') INTO job_exists;
  
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-heartbeat',
      '0 0,12 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-heartbeat',
        json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || p_anon_key)::text
      )
    );
    result := result || '{"heartbeat": "registered"}'::jsonb;
  ELSE
    result := result || '{"heartbeat": "already_exists"}'::jsonb;
  END IF;

  RETURN result;
END;
$$;