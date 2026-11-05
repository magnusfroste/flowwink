-- A skill the platform took out of the catalog stays out until someone lets it back.
--
-- Self-healing (the heartbeat's runSelfHealing) disables a skill whose handler
-- failed three times in a row. Until 2026-11-05 that disable never took for an
-- exposed skill: it wrote enabled:false alone, trg_enforce_mcp_exposure_invariant
-- refused it (mcp_exposed=true requires enabled=true), and nobody read the
-- error. Writing both flags makes it take — and then sync_skills_from_code,
-- which runs on every admin page load and re-enables every "hidden" skill of
-- an enabled module, would undo it within minutes.
--
-- The marker lives on the row so the disable and the reason are ONE write:
--   quarantined_at     when the platform (self-healing, FlowPilot's
--                      skill_disable) took the skill out
--   quarantine_reason  why, in words a person reads in the Self-Healing alert
--
-- Every sync path (agent-execute's sync_skills_from_code, bootstrapModule,
-- bootstrapPlatform, scripts/sync-skills.ts) leaves a quarantined row's
-- enabled/mcp_exposed alone. The quarantine lifts when anything sets
-- enabled=true — a person's re-enable, FlowPilot's skill_enable, or the sync
-- itself when the deploy brings a new handler or tool_definition for the
-- skill (new code is a new chance). A quarantined skill is a disabled skill:
-- the trigger below keeps that true, so the marker can never outlive the
-- disable it explains.

ALTER TABLE public.agent_skills
  ADD COLUMN IF NOT EXISTS quarantined_at timestamptz,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

CREATE OR REPLACE FUNCTION public.skill_quarantine_lifts_on_enable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.enabled = true THEN
    NEW.quarantined_at := NULL;
    NEW.quarantine_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_quarantine_lifts_on_enable ON public.agent_skills;
CREATE TRIGGER trg_skill_quarantine_lifts_on_enable
  BEFORE INSERT OR UPDATE ON public.agent_skills
  FOR EACH ROW EXECUTE FUNCTION public.skill_quarantine_lifts_on_enable();
