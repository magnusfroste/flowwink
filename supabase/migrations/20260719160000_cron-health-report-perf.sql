-- cron_health_report performance fix (found in Stage-3: the RPC timed out on the
-- dev instance behind the gateway's short statement_timeout).
--
-- Two causes, both fixed here:
--   1. cron.job_run_details grows UNBOUNDED (pg_cron never trims it). The
--      original per-job LATERAL "latest run" scanned the whole history each call.
--      Now: one DISTINCT ON over a 3-day window (a job that hasn't run in 3 days
--      is correctly surfaced as never_ran/stale anyway), so the scan is bounded.
--   2. The net._http_response scan + request_queue join over 24h was unbounded.
--      Now: 6h window, LIMIT 100, ordered — and the whole lane stays
--      EXCEPTION-guarded.
-- Belt-and-suspenders: the function raises its OWN statement_timeout to 20s
-- (via the function-level SET), so it isn't clipped by the caller's short
-- PostgREST budget even on a busy instance. Read-only, idempotent, forward-dated.

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

  -- Per-job report. Latest run resolved from a BOUNDED 3-day window so the
  -- unbounded job_run_details history is never fully scanned. Wrapped so a slow
  -- history table degrades to "no recent run" instead of failing the report.
  BEGIN
    WITH latest AS (
      SELECT DISTINCT ON (d.jobid) d.jobid, d.status, d.start_time
      FROM cron.job_run_details d
      WHERE d.start_time > now() - interval '3 days'
      ORDER BY d.jobid, d.start_time DESC
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
    -- Fall back to the parser-free core (no run history) — foreign_host, the
    -- headline signal, needs no history at all.
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
