-- The run history keeps every job's latest run — so "never ran" means never ran.
--
-- cron.job_run_details is purged nightly down to three days (the disk-IO wedge
-- of 2026-09). cron_health_report judges a job "never_ran" by the absence of a
-- row there, and the health judge (_shared/cron/health.ts) turns an active
-- never_ran job red — by pg_cron's own evidence, no schedule parser (River
-- incident rule). Put together, a weekly job was red four days of seven and a
-- monthly job nearly always: its last run had been purged, its next was days
-- away, and "no row" read as "never ran". Optic, Friday 2026-11-06:
-- knowledge-gap-retention (Mon 04:30), weekly-knowledge-river (Mon 07:00) and
-- purge-stale-prospects (1st, 03:15) — "3 scheduled jobs unhealthy", 0 failed
-- runs among 19 jobs.
--
-- The evidence stays evidence: the purge now keeps each job's newest row
-- however old it is (19 rows on a 19-job instance), and the report reads the
-- latest run per job over the whole — small — history instead of the 20000
-- newest runids, which would push a kept monthly row out of view within days.
-- No parser, no schedule arithmetic: "never_ran" is now exactly "no run on
-- record since the job was scheduled".
--
-- Transition: a job whose last run was purged before this landed stays
-- never_ran until it next runs (a weekly job: the coming Monday). Nothing to
-- backfill — the rows are gone.

-- 1. The purge keeps the newest run of every job. Re-scheduled under the same
--    name (cron.schedule on an existing jobname replaces its command).
DO $do$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  PERFORM cron.schedule(
    'purge-cron-run-details',
    '30 3 * * *',
    $cmd$DELETE FROM cron.job_run_details d
          WHERE d.end_time < now() - interval '3 days'
            AND d.runid < (SELECT max(r.runid) FROM cron.job_run_details r WHERE r.jobid = d.jobid)$cmd$
  );
END
$do$;

-- 2. The report reads the latest run per job over the whole history.
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
  v_profile     jsonb := '[]'::jsonb;
  v_mode        text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'cron_health_report: admin or service_role required';
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    RETURN jsonb_build_object(
      'checked_at', now(), 'cron_available', false, 'self_host', NULL,
      'pulse_profile', '[]'::jsonb, 'performance_mode', NULL,
      'jobs', '[]'::jsonb, 'http_errors_recent', '[]'::jsonb,
      'flags', jsonb_build_object('jobs_total', 0, 'jobs_never_ran', 0,
                                  'jobs_foreign_host', 0, 'http_errors_24h', 0)
    );
  END IF;

  SELECT command INTO v_indexer_cmd FROM cron.job WHERE jobname = 'knowledge-indexer';
  v_self_host := substring(coalesce(v_indexer_cmd, '') from 'https://[a-z0-9]+\.supabase\.co');

  -- Latest run per job over the WHOLE history. The history is three days plus
  -- every job's latest run (purge-cron-run-details keeps that row), so the
  -- table is small and a full pass is cheap; the earlier "20000 newest runids"
  -- window would drop a monthly job's kept last run below the minute jobs'
  -- churn within days and call it never_ran again. Degrades to the parser-free
  -- core (foreign_host needs no history) if anything goes wrong.
  BEGIN
    WITH latest AS (
      SELECT DISTINCT ON (jobid) jobid, status, start_time
      FROM cron.job_run_details
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

  -- Hourly pulse profile: pg_cron's own evidence, bounded by runid (the PK) so
  -- the scan stays cheap on the very instances that are IO-starved.
  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'hour', to_char(h.hour, 'YYYY-MM-DD"T"HH24:00:00"Z"'),
      'runs', h.runs, 'failed', h.failed, 'startup_timeouts', h.startup_timeouts
    ) ORDER BY h.hour), '[]'::jsonb) INTO v_profile
    FROM (
      SELECT date_trunc('hour', r.start_time AT TIME ZONE 'UTC') AS hour,
             count(*) AS runs,
             count(*) FILTER (WHERE r.status = 'failed') AS failed,
             count(*) FILTER (WHERE r.return_message = 'job startup timeout') AS startup_timeouts
      FROM (
        SELECT start_time, status, return_message
        FROM cron.job_run_details
        ORDER BY runid DESC
        LIMIT 60000
      ) r
      WHERE r.start_time > now() - interval '7 days'
      GROUP BY 1
    ) h;
  EXCEPTION WHEN OTHERS THEN
    v_profile := '[]'::jsonb;
    RAISE NOTICE 'cron_health_report: pulse profile skipped (%).', SQLERRM;
  END;

  BEGIN
    SELECT value->>'mode' INTO v_mode FROM public.site_settings WHERE key = 'performance_mode';
  EXCEPTION WHEN OTHERS THEN
    v_mode := NULL;
  END;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'pulse_profile', v_profile,
    'performance_mode', v_mode,
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


-- The browser calls it as a signed-in admin, the platform as the service role;
-- anon never did (the body refuses it) and no longer holds EXECUTE.
REVOKE EXECUTE ON FUNCTION public.cron_health_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cron_health_report() TO authenticated, service_role;
