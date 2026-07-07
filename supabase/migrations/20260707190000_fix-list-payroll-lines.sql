-- Fix list_payroll_lines: referenced employees.full_name, but the column is
-- employees.name — every call failed with 42703 (found during the payroll
-- pension/sick-pay UI build; the admin page now queries the table directly,
-- but the list_payroll_lines SKILL still goes through this RPC).
-- Also expose the pension + sick-pay fields added in 20260613060000 /
-- 20260707170000 so agents see the same numbers as the admin UI.
-- Idempotent (CREATE OR REPLACE). Forward-dated for the managed migrate runner.

CREATE OR REPLACE FUNCTION public.list_payroll_lines(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows JSONB;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',l.id,'employee_id',l.employee_id,'employee_name',e.name,
    'gross_cents',l.gross_cents,'benefits_cents',l.benefits_cents,'deductions_cents',l.deductions_cents,
    'taxable_cents',l.taxable_cents,'tax_cents',l.tax_cents,'social_fee_cents',l.social_fee_cents,
    'net_cents',l.net_cents,'components',l.components,
    'pension_employer_cents',l.pension_employer_cents,'pension_employee_cents',l.pension_employee_cents,
    'sick_days',l.sick_days,'sick_deduction_cents',l.sick_deduction_cents,'sick_pay_cents',l.sick_pay_cents
  ) ORDER BY e.name),'[]'::jsonb) INTO v_rows
  FROM public.payroll_lines l LEFT JOIN public.employees e ON e.id = l.employee_id
  WHERE l.run_id = p_run_id;
  RETURN jsonb_build_object('success',true,'lines',v_rows);
END; $function$;

ALTER FUNCTION "public"."list_payroll_lines"("uuid") OWNER TO "postgres";
