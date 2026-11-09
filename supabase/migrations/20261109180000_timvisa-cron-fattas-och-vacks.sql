-- ============================================================================
-- An hourly schedule at a fixed minute is understood, and what it switched off
-- comes back on (2026-11-09).
--
-- The consultants module seeds `consultant_reindex_stale` at '7 * * * *'
-- (hourly, since 2026-09-04). The dispatcher's parser had no branch for
-- "minute N of every hour", so isSupportedCron said no and the dispatcher
-- switched the automation off on its first tick, with last_error
-- 'Disabled by dispatcher: cron expression "7 * * * *" is not understood …'.
-- Every instance with Consultants on has carried it disabled since: stale
-- profiles were only embedded by consultant-match's own pre-search sweep.
--
-- _shared/cron/next-run.ts now runs M * * * *, and a guard checks every cron
-- expression a module seeds. This heals what the old parser switched off — only
-- rows the DISPATCHER disabled for exactly that shape, and (for automations)
-- only when the skill they run is still enabled, so an automation of a module
-- someone turned off stays off.
-- ============================================================================

UPDATE public.agent_automations a
SET enabled = true,
    next_run_at = NULL,          -- the dispatcher computes it on its next tick
    last_error = NULL,
    updated_at = now()
WHERE a.enabled = false
  AND a.trigger_type = 'cron'
  AND a.last_error LIKE 'Disabled by dispatcher: cron expression "%" is not understood by the dispatcher''s parser%'
  AND coalesce(a.trigger_config->>'expression', a.trigger_config->>'cron', a.trigger_config->>'schedule', '')
      ~ '^\s*[0-9]{1,2}\s+\*\s+\*\s+\*\s+\*\s*$'
  AND (
    a.skill_name IS NULL
    OR EXISTS (SELECT 1 FROM public.agent_skills s WHERE s.name = a.skill_name AND s.enabled = true)
  );

UPDATE public.agent_workflows w
SET enabled = true,
    last_error = NULL
WHERE w.enabled = false
  AND w.last_error LIKE 'Disabled by dispatcher: cron expression "%" is not understood by the dispatcher''s parser%'
  AND coalesce(w.trigger_config->>'expression', w.trigger_config->>'cron', w.trigger_config->>'schedule', '')
      ~ '^\s*[0-9]{1,2}\s+\*\s+\*\s+\*\s+\*\s*$';
