CREATE OR REPLACE FUNCTION public.tg_emit_deal_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage = 'closed_won'::deal_stage THEN
    PERFORM public.emit_platform_event(
      'deal.won',
      jsonb_build_object('id', NEW.id, 'data', to_jsonb(NEW)),
      'deals'
    );
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.beta_test_findings
SET resolved_at = now(),
    description = COALESCE(description, '') || E'\n\n[RESOLVED 2026-05-18] Fixed: tg_emit_deal_events trigger compared stage to literal ''won'' which is not in deal_stage enum (valid: lead/prospecting/qualified/proposal/negotiation/closed_won/closed_lost). Any UPDATE on deals crashed at enum-cast. Trigger now compares to ''closed_won''::deal_stage.'
WHERE id = 'd4e241c5-24fc-42c1-9d01-1865f5ee3270';

UPDATE public.beta_test_findings
SET resolved_at = now(),
    description = COALESCE(description, '') || E'\n\n[RESOLVED 2026-05-18] Fixed: both agent-execute (openclaw_report_finding case) and mcp-server tool handler now accept reported_by and persist it. Tool schema in mcp-server also exposes the parameter so peers can self-attribute.'
WHERE id = '72b74f78-78ac-4e8a-a556-0a9e7b45f9a7';

UPDATE public.beta_test_findings
SET resolved_at = now()
WHERE id = '62a6cb89-6530-4b12-baf9-06e491e15519';