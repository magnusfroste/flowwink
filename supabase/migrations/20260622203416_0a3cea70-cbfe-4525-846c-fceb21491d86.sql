
-- Auto-sweep stuck "ringing" voice calls: if 46elks never sends a terminal
-- webhook (caller hung up, DND, mobile off), flip to "missed" after 5 minutes
-- so the receptionist's queue stays clean.
CREATE OR REPLACE FUNCTION public.sweep_stale_voice_calls()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  swept integer;
BEGIN
  UPDATE public.voice_calls
     SET status = 'missed',
         ended_at = COALESCE(ended_at, now()),
         callback_status = CASE
           WHEN callback_status = 'none' THEN 'pending'::voice_callback_status
           ELSE callback_status
         END,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'auto_swept', true,
           'auto_swept_at', now()
         )
   WHERE status = 'ringing'
     AND started_at < now() - interval '5 minutes';
  GET DIAGNOSTICS swept = ROW_COUNT;
  RETURN swept;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_stale_voice_calls() TO authenticated, service_role;

-- Schedule it every minute via pg_cron (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule previous if exists
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'voice-calls-sweep-stale';
    PERFORM cron.schedule(
      'voice-calls-sweep-stale',
      '* * * * *',
      $cron$ SELECT public.sweep_stale_voice_calls(); $cron$
    );
  END IF;
END;
$$;
