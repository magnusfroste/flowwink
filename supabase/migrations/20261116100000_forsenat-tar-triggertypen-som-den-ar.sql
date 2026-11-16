-- ============================================================================
-- "Overdue" takes the trigger type as the table holds it (2026-11-16).
--
-- 20261116090000 declared automation_is_overdue(…, p_trigger_type text, …) and
-- called it from check_operations with agent_automations.trigger_type — which
-- is the enum automation_trigger_type. Postgres does not cast an enum to text
-- to find a function, so every call of check_operations raised
--   function public.automation_is_overdue(boolean, automation_trigger_type,
--   jsonb, timestamp with time zone, timestamp with time zone) does not exist
-- The dashboard's Agent work panel reads check_operations, the nightly view
-- sweep saw the error on /admin, the proof went red and no fork was synced
-- (2026-11-16 00:25 UTC) — which is the gate doing its work: the broken read
-- reached no live instance.
--
-- The enum form is added beside the text form and answers through it, so the
-- rule stays in one body and both callers — a table column, or a caller that
-- holds the type as text — find a function. check_operations is not rewritten.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.automation_is_overdue(
  p_enabled boolean, p_trigger_type public.automation_trigger_type, p_trigger_config jsonb,
  p_last_triggered_at timestamptz, p_next_run_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  SELECT public.automation_is_overdue(p_enabled, p_trigger_type::text, p_trigger_config, p_last_triggered_at, p_next_run_at);
$fn$;

REVOKE ALL ON FUNCTION public.automation_is_overdue(boolean, public.automation_trigger_type, jsonb, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.automation_is_overdue(boolean, public.automation_trigger_type, jsonb, timestamptz, timestamptz) TO authenticated, service_role;
COMMENT ON FUNCTION public.automation_is_overdue(boolean, public.automation_trigger_type, jsonb, timestamptz, timestamptz) IS
  'The enum form of automation_is_overdue: what a call with agent_automations.trigger_type resolves to. Answers through the text form — one rule.';

-- Proof: the read that broke answers, and the two forms agree. Not skipped on
-- a missing function — that is the defect this file exists for.
DO $proof$
DECLARE
  v jsonb;
  v_enum boolean;
  v_text boolean;
BEGIN
  v := public.check_operations();
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION 'proof: check_operations must answer an object, got %', v;
  END IF;
  SELECT public.automation_is_overdue(true, 'cron'::public.automation_trigger_type, '{}'::jsonb, NULL, now() - interval '1 hour'),
         public.automation_is_overdue(true, 'cron'::text, '{}'::jsonb, NULL, now() - interval '1 hour')
    INTO v_enum, v_text;
  IF v_enum IS DISTINCT FROM true OR v_text IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'proof: a cron automation an hour late is overdue in both forms (enum %, text %)', v_enum, v_text;
  END IF;
  -- Every automation as the table holds it: the call a query actually makes.
  PERFORM public.automation_is_overdue(enabled, trigger_type, trigger_config, last_triggered_at, next_run_at) FROM public.agent_automations;
END $proof$;
