
-- MCP exposure invariant enforced at DB level (replaces CI guardrail dependency on service role key)
CREATE OR REPLACE FUNCTION public.enforce_mcp_exposure_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mcp_exposed = true AND NEW.enabled = false THEN
    RAISE EXCEPTION 'MCP invariant violated: skill "%" cannot have mcp_exposed=true while enabled=false. Either re-enable the skill or set mcp_exposed=false.', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_mcp_exposure_invariant ON public.agent_skills;
CREATE TRIGGER trg_enforce_mcp_exposure_invariant
  BEFORE INSERT OR UPDATE ON public.agent_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_mcp_exposure_invariant();
