-- Skriven av Lovables agent 2026-09-05 mot dev (rzhj), där cron-historiken var
-- 774 MB. Där kördes TRUNCATE. Filen går med fork-syncen till alla instanser,
-- och där är retention rätt verb: samma regel som purge-jobbet, idempotent.
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days';

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-run-details') THEN
    PERFORM cron.schedule('purge-cron-run-details', '30 3 * * *', $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 days'$$);
  END IF;
END
$do$;