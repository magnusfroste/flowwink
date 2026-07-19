-- cron_health_report perf, take 2 (Stage-3: still timed out after the 3-day
-- window). Root cause is deeper: cron.job_run_details has NO index on
-- start_time, so `WHERE start_time > now() - 3d` still forces a full seq scan of
-- the whole (huge, never-trimmed) table — bounding the window doesn't help
-- without an index.
--
-- Fix: scan by `runid` instead, which IS indexed (it's the table's key). A
-- monotonic bigint, so `ORDER BY runid DESC LIMIT N` is a cheap index scan that
-- returns the most recent N runs regardless of table size; the latest-per-job is
-- then a DISTINCT ON over that small bounded set. N=20000 comfortably spans the
-- last run of even a daily job amid minute-level jobs. Also (best-effort,
-- non-fatal) create a supporting index so future scans stay fast.
--
-- Keeps the function-level 20s timeout and the EXCEPTION-guarded degrade path.

-- Best-effort: index to keep the recent-runs scan cheap. Wrapped — on a managed
-- instance the cron schema may reject DDL from a non-owner; that's fine, the
-- runid PK scan below already avoids the seq scan.
DO $idx$
BEGIN
  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS job_run_details_jobid_runid_idx
        ON cron.job_run_details (jobid, runid DESC);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'cron_health_report: could not create job_run_details index (%); relying on runid PK scan.', SQLERRM;
    END;
  END IF;
END
$idx$;

CREATE OR REPLACE FUNCTION public.cron_health_report()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
SET statement_timeout TO '20s'
AS $fn$
DECLARE
  v_self_host   text;
  v_indexer_cmd text;
  v_jobs        jsonb := '[]'::jsonb;
  v_http_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'cron_health_report: admin or service_role required';
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RETURN jsonb_build_object(
      'checked_at', now(), 'cron_available', false, 'self_host', NULL,
      'jobs', '[]'::jsonb, 'http_errors_recent', '[]'::jsonb,
      'flags', jsonb_build_object('jobs_total', 0, 'jobs_never_ran', 0,
                                  'jobs_foreign_host', 0, 'http_errors_24h', 0)
    );
  END IF;

  SELECT command INTO v_indexer_cmd FROM cron.job WHERE jobname = 'knowledge-indexer';
  v_self_host := substring(coalesce(v_indexer_cmd, '') from 'https://[a-z0-9]+\.supabase\.co');

  -- Latest run per job via a runid (PK, indexed) scan of the most recent runs —
  -- fast regardless of how large the never-trimmed history is. Degrades to the
  -- parser-free core (foreign_host needs no history) if anything goes wrong.
  BEGIN
    WITH recent AS (
      SELECT jobid, status, start_time, runid
      FROM cron.job_run_details
      ORDER BY runid DESC
      LIMIT 20000
    ),
    latest AS (
      SELECT DISTINCT ON (jobid) jobid, status, start_time
      FROM recent
      ORDER BY jobid, runid DESC
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'jobname', jb.jobname,
      'schedule', jb.schedule,
      'active', jb.active,
      'target_host', substring(jb.command from 'https://[a-z0-9]+\.supabase\.co'),
      'foreign_host', (
        v_self_host IS NOT NULL
        AND substring(jb.command from 'https://[a-z0-9]+\.supabase\.co') IS NOT NULL
        AND substring(jb.command from 'https://[a-z0-9]+\.supabase\.co') <> v_self_host
      ),
      'never_ran', (lr.status IS NULL),
      'last_status', lr.status,
      'last_run', lr.start_time,
      'last_run_age_seconds', CASE WHEN lr.start_time IS NULL THEN NULL
                                   ELSE extract(epoch FROM (now() - lr.start_time))::bigint END
    ) ORDER BY jb.jobname), '[]'::jsonb) INTO v_jobs
    FROM cron.job jb
    LEFT JOIN latest lr ON lr.jobid = jb.jobid;
  EXCEPTION WHEN OTHERS THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'jobname', jb.jobname, 'schedule', jb.schedule, 'active', jb.active,
      'target_host', substring(jb.command from 'https://[a-z0-9]+\.supabase\.co'),
      'foreign_host', (
        v_self_host IS NOT NULL
        AND substring(jb.command from 'https://[a-z0-9]+\.supabase\.co') IS NOT NULL
        AND substring(jb.command from 'https://[a-z0-9]+\.supabase\.co') <> v_self_host
      ),
      'never_ran', NULL, 'last_status', NULL, 'last_run', NULL, 'last_run_age_seconds', NULL
    ) ORDER BY jb.jobname), '[]'::jsonb) INTO v_jobs
    FROM cron.job jb;
    RAISE NOTICE 'cron_health_report: run-history lookup degraded (%).', SQLERRM;
  END;

  -- Recent HTTP errors — bounded window + cap, guarded.
  IF to_regclass('net._http_response') IS NOT NULL THEN
    BEGIN
      SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_http_errors
      FROM (
        SELECT jsonb_build_object(
          'id', r.id, 'status_code', r.status_code, 'created', r.created, 'error', r.error_msg
        ) AS e
        FROM net._http_response r
        WHERE r.created > now() - interval '6 hours'
          AND (r.status_code IS NULL OR r.status_code >= 400 OR r.error_msg IS NOT NULL)
        ORDER BY r.created DESC
        LIMIT 100
      ) q;
    EXCEPTION WHEN OTHERS THEN
      v_http_errors := '[]'::jsonb;
      RAISE NOTICE 'cron_health_report: http-error scan skipped (%).', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'cron_available', true,
    'self_host', v_self_host,
    'jobs', v_jobs,
    'http_errors_recent', v_http_errors,
    'flags', jsonb_build_object(
      'jobs_total', jsonb_array_length(v_jobs),
      'jobs_never_ran', (SELECT count(*) FROM jsonb_array_elements(v_jobs) e WHERE (e->>'never_ran')::boolean IS TRUE),
      'jobs_foreign_host', (SELECT count(*) FROM jsonb_array_elements(v_jobs) e WHERE (e->>'foreign_host')::boolean IS TRUE),
      'http_errors_24h', jsonb_array_length(v_http_errors)
    )
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.cron_health_report() TO anon, authenticated, service_role;
