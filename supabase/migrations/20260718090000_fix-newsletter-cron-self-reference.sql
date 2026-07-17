-- newsletter-dispatch-scheduled cron fix (fleet incident 2026-07-18).
--
-- The original scheduler (migration 20260707022750) HARDCODED dev's project URL
-- (https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/newsletter/dispatch-scheduled)
-- into the cron command. Every instance that ran that migration got dev's URL
-- baked in, so on the whole fleet the scheduled-newsletter cron POSTed to DEV's
-- newsletter function against DEV's data — never its own. (It also added 4× load
-- to dev.) Found while verifying dispatcher ticks by pg_net response codes.
--
-- Self-healing fix: rebuild the job's command from the always-self-referential
-- `knowledge-indexer` job (correct own host + own key), swapping the function
-- path to newsletter/dispatch-scheduled. No hardcoded URL, so this works on every
-- instance without knowing its own ref. Idempotent + forward-dated (a backdated
-- file is skipped by managed migrate ledgers). NB: the `newsletter` edge function
-- must also be current on the instance — older bundles 404 on the /dispatch-
-- scheduled route; redeploy it via the normal function-deploy step.
DO $fix$
DECLARE
  v_template text;
BEGIN
  -- Only act if both jobs exist and newsletter is NOT already self-referential
  -- to its own newsletter/dispatch-scheduled route.
  SELECT command INTO v_template FROM cron.job WHERE jobname = 'knowledge-indexer';

  IF v_template IS NOT NULL
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'newsletter-dispatch-scheduled')
     AND NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobname = 'newsletter-dispatch-scheduled'
         AND command LIKE '%functions/v1/newsletter/dispatch-scheduled%'
         -- same host as knowledge-indexer = already self-referential
         AND substring(command from 'https://([a-z0-9]+)') = substring(v_template from 'https://([a-z0-9]+)')
     )
  THEN
    PERFORM cron.alter_job(
      (SELECT jobid FROM cron.job WHERE jobname = 'newsletter-dispatch-scheduled'),
      command := replace(v_template, 'functions/v1/knowledge-indexer', 'functions/v1/newsletter/dispatch-scheduled')
    );
  END IF;
END
$fix$;
