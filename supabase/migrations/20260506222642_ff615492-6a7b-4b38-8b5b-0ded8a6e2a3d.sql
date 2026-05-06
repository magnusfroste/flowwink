
CREATE OR REPLACE FUNCTION public.mcp_create_payroll_run(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.create_payroll_run(COALESCE((args->>'period_date')::date, CURRENT_DATE));
END; $$;

CREATE OR REPLACE FUNCTION public.mcp_approve_payroll_run(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.approve_payroll_run((args->>'run_id')::uuid);
END; $$;

CREATE OR REPLACE FUNCTION public.mcp_mark_payroll_paid(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.mark_payroll_paid((args->>'run_id')::uuid, NULLIF(args->>'payment_date','')::date);
END; $$;

CREATE OR REPLACE FUNCTION public.mcp_list_payroll_runs(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.list_payroll_runs(COALESCE((args->>'limit')::int, 24));
END; $$;

CREATE OR REPLACE FUNCTION public.mcp_list_payroll_lines(args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.list_payroll_lines((args->>'run_id')::uuid);
END; $$;

GRANT EXECUTE ON FUNCTION public.mcp_create_payroll_run(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_approve_payroll_run(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_mark_payroll_paid(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_list_payroll_runs(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_list_payroll_lines(jsonb) TO authenticated;
