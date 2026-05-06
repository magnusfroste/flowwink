
CREATE OR REPLACE FUNCTION public.enforce_mcp_exposure_invariant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mcp_exposed = true AND NEW.enabled = false THEN
    RAISE EXCEPTION 'MCP invariant violated: skill "%" cannot have mcp_exposed=true while enabled=false. Either re-enable the skill or set mcp_exposed=false.', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
