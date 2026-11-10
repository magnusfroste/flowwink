-- ============================================================================
-- Two more sweeps ask whether there is work (2026-11-10).
--
-- Follows 20261109220000: an automation declares trigger_config.work_probe and
-- the database answers before the dispatcher or the skill is woken. The first
-- four were the every-15-minute sweeps that found nothing most often; these
-- are the next two on a short interval.
--
--   SLA Sweep (every 15 min)            → sla_policies_enabled
--     run_sla_sweep loops over ENABLED policies and nothing else: with none
--     enabled it measures nothing.
--   consultant_reindex_stale (hourly)   → consultant_profiles_stale
--     reindex_consultants action reindex_stale embeds profiles whose
--     embedding_status is 'stale' and nothing else.
--
-- Quote Expiry Reminders (every six hours) is left as it is: four ticks a day
-- is not worth a probe, and a probed row runs the minute work appears rather
-- than at its hour.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.work_probe_sla_policies_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$ SELECT EXISTS (SELECT 1 FROM public.sla_policies WHERE enabled = true) $$;
-- The lane and the dispatcher ask as the owner / the service role; no browser does.
REVOKE ALL ON FUNCTION public.work_probe_sla_policies_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_sla_policies_enabled() TO service_role;

CREATE OR REPLACE FUNCTION public.work_probe_consultant_profiles_stale()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$ SELECT EXISTS (SELECT 1 FROM public.consultant_profiles WHERE embedding_status = 'stale') $$;
REVOKE ALL ON FUNCTION public.work_probe_consultant_profiles_stale() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_consultant_profiles_stale() TO service_role;

-- Existing rows declare their probe: one key merged in, the schedule untouched,
-- only where none is declared, and only the sweep form of each skill.
UPDATE public.agent_automations a
SET trigger_config = a.trigger_config || jsonb_build_object('work_probe', 'sla_policies_enabled')
WHERE a.skill_name = 'sla_check'
  AND a.trigger_type = 'cron'
  AND NOT (a.trigger_config ? 'work_probe')
  AND coalesce(a.skill_arguments, '{}'::jsonb) = '{}'::jsonb;

UPDATE public.agent_automations a
SET trigger_config = a.trigger_config || jsonb_build_object('work_probe', 'consultant_profiles_stale')
WHERE a.skill_name = 'reindex_consultants'
  AND a.trigger_type = 'cron'
  AND NOT (a.trigger_config ? 'work_probe')
  AND a.skill_arguments->>'action' = 'reindex_stale';
