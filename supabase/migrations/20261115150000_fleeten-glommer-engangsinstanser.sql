-- ============================================================================
-- The fleet forgets an instance that pinged once (2026-11-15).
--
-- www's fleet list (feedback_instances) read 35 instances on 2026-11-15. Eight
-- were real; 27 were http://localhost:5173 with one ping each — CI stacks and
-- local test installs, every one a new instance id. Test stacks stopped
-- pinging with 20261115120000, but the ones already listed stay for ever, and
-- "35 instances, 8 active" misreads as a fleet that is shrinking.
--
-- A real instance pings every day. One that pinged once and has not been seen
-- for a week was a test: it is forgotten. Nothing names localhost — a
-- self-hoster on a laptop pings daily and stays; a production site that was
-- installed and abandoned after a day goes, which is also right.
--
-- Runs with the nightly thinning (the prune-logs job).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.feedback_forget_one_time_instances(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n int := 0;
BEGIN
  IF to_regclass('public.feedback_instances') IS NULL THEN
    RETURN jsonb_build_object('status', 'no_fleet_table');
  END IF;
  IF p_dry_run THEN
    SELECT count(*) INTO v_n FROM public.feedback_instances
     WHERE coalesce(ping_count, 1) <= 1 AND last_seen_at < now() - interval '7 days';
    RETURN jsonb_build_object('status', 'dry_run', 'would_forget', v_n);
  END IF;
  DELETE FROM public.feedback_instances
   WHERE coalesce(ping_count, 1) <= 1 AND last_seen_at < now() - interval '7 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('status', 'ok', 'forgotten', v_n);
END
$fn$;

REVOKE ALL ON FUNCTION public.feedback_forget_one_time_instances(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.feedback_forget_one_time_instances(boolean) TO service_role;

-- One nightly housekeeping job, two statements (the same name replaces the command).
DO $do$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  PERFORM cron.schedule('prune-logs', '50 3 * * *',
    $cmd$SELECT public.prune_logs(); SELECT public.feedback_forget_one_time_instances()$cmd$);
END
$do$;

-- Proof, rolled back.
DO $proof$
DECLARE
  v jsonb;
  v_left text[];
BEGIN
  BEGIN
    INSERT INTO public.feedback_instances (instance_id, site_url, ping_count, first_seen_at, last_seen_at) VALUES
      ('00000000-0000-4000-8000-0000000f0001', 'http://localhost:5173', 1, now() - interval '9 days', now() - interval '9 days'),   -- a test stack: goes
      ('00000000-0000-4000-8000-0000000f0002', 'http://localhost:5173', 1, now() - interval '2 days', now() - interval '2 days'),   -- one ping, this week: stays
      ('00000000-0000-4000-8000-0000000f0003', 'http://localhost:5173', 12, now() - interval '30 days', now() - interval '9 days'), -- a laptop that pinged daily: stays
      ('00000000-0000-4000-8000-0000000f0004', 'https://proof.example', 40, now() - interval '60 days', now());                      -- the fleet: stays
    v := public.feedback_forget_one_time_instances(true);
    IF (v->>'would_forget')::int < 1 THEN RAISE EXCEPTION 'proof: the dry run counts the test stack, got %', v; END IF;
    IF (SELECT count(*) FROM public.feedback_instances WHERE instance_id::text LIKE '00000000-0000-4000-8000-0000000f000%') <> 4 THEN
      RAISE EXCEPTION 'proof: a dry run forgets nothing';
    END IF;
    PERFORM public.feedback_forget_one_time_instances();
    SELECT array_agg(right(instance_id::text, 1) ORDER BY instance_id::text) INTO v_left
      FROM public.feedback_instances WHERE instance_id::text LIKE '00000000-0000-4000-8000-0000000f000%';
    IF v_left IS DISTINCT FROM ARRAY['2', '3', '4'] THEN
      RAISE EXCEPTION 'proof: only the one-ping instance unseen for a week is forgotten; left %', v_left;
    END IF;
    RAISE EXCEPTION 'proof passed — rolling back' USING ERRCODE = 'P0PRF';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN NULL;
    WHEN undefined_table OR undefined_column OR undefined_object THEN
      RAISE NOTICE 'fleet forgets: proof skipped here (%)', SQLERRM;
  END;
END $proof$;
