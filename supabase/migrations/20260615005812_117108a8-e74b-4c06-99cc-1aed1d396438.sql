-- Retention for cron.job_run_details — prevent unbounded growth that exhausts disk IO.
--
-- pg_cron writes one row to cron.job_run_details per job execution. FlowWink registers
-- several recurring jobs (see public.register_flowpilot_cron), TWO of which run every
-- minute (automation-dispatcher-every-minute, publish-scheduled-pages). Nothing purged
-- this table, so it grew without bound — on the liteit instance it reached 102 MB.
-- The constant per-minute writes plus autovacuum churn on that table saturate the disk
-- IO baseline of small (Nano, 43 Mbps) compute, drain the daily IO burst budget, and
-- eventually wedge the instance (Postgres stops accepting connections → site down).
-- Root-caused 2026-06-15.
--
-- This migration adds a daily retention job and does a one-time bounded cleanup so
-- already-bloated instances get immediate relief when it is applied. New instances run
-- all migrations on provisioning, so they inherit the retention job automatically.
--
-- Idempotent: safe to run multiple times (guarded job creation; bounded DELETE).

DO $$
BEGIN
  -- Only act where pg_cron is installed (true for all FlowWink instances via baseline).
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- 1) Daily retention job: purge run-history older than 3 days, at 03:30.
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-run-details') THEN
      PERFORM cron.schedule(
        'purge-cron-run-details',
        '30 3 * * *',
        $cmd$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$cmd$
      );
    END IF;

    -- 2) One-time bounded cleanup for instances that are already bloated when this
    --    migration lands. Bounded to >3 days (matches the retention window) and
    --    idempotent. No-op on fresh or already-purged instances.
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';

  END IF;
END
$$;
