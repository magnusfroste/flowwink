-- Payroll: occupational pension + statutory sick pay (Swedish深, additive)
-- (docs/parity/capabilities/payroll.json: pension, sick_pay).
-- DELIBERATELY additive: does NOT modify create_payroll_run or the wage journal
-- posting (a SECURITY DEFINER monolith with prior schema-drift history). Instead adds
-- payroll_lines.pension_cents / sick_pay_cents and standalone apply_* functions that
-- compute + store them on a DRAFT run. Full roll-up into gross/net + journal posting,
-- and statutory karens/qualifying-day rules, are the remaining work before done.
-- Idempotent.

ALTER TABLE "public"."payroll_lines"
  ADD COLUMN IF NOT EXISTS "pension_cents" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "sick_pay_cents" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "sick_days" numeric(6,2) DEFAULT 0 NOT NULL;

-- Allow pension / sick_pay as configurable recurring component types too
ALTER TABLE "public"."payroll_components" DROP CONSTRAINT IF EXISTS "payroll_components_component_type_check";
ALTER TABLE "public"."payroll_components" ADD CONSTRAINT "payroll_components_component_type_check"
  CHECK ("component_type" = ANY (ARRAY['salary','benefit','deduction','bonus','overtime','pension','sick_pay']));

-- apply_payroll_pension: employer occupational pension as % of gross, per line of a
-- DRAFT run (default 4.5% — common Swedish tjänstepension on salary up to 7.5 IBB).
CREATE OR REPLACE FUNCTION "public"."apply_payroll_pension"(
  "p_run_id" "uuid", "p_pension_pct" numeric DEFAULT 4.5
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin'));
  v_status text; v_lines int; v_total bigint;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can apply pension'; END IF;
  IF p_pension_pct IS NULL OR p_pension_pct < 0 THEN RAISE EXCEPTION 'pension_pct must be >= 0'; END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — pension can only be applied to a draft', p_run_id, v_status; END IF;

  UPDATE payroll_lines SET pension_cents = ROUND(gross_cents * p_pension_pct / 100.0)::bigint
  WHERE run_id = p_run_id;
  GET DIAGNOSTICS v_lines = ROW_COUNT;
  SELECT COALESCE(SUM(pension_cents),0) INTO v_total FROM payroll_lines WHERE run_id = p_run_id;
  RETURN jsonb_build_object('success', true, 'lines', v_lines, 'pension_pct', p_pension_pct,
    'total_pension_cents', v_total);
END; $$;
ALTER FUNCTION "public"."apply_payroll_pension"("uuid",numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."apply_payroll_pension"("uuid",numeric) TO "anon","authenticated","service_role";

-- apply_payroll_sick_pay: statutory sick pay for one employee's line on a DRAFT run.
-- sick_pay = sick_days × daily_rate × pct (default 80%). karens/qualifying-day handling
-- is left to the caller's daily_rate / sick_days for now (documented limitation).
CREATE OR REPLACE FUNCTION "public"."apply_payroll_sick_pay"(
  "p_run_id" "uuid", "p_employee_id" "uuid", "p_sick_days" numeric,
  "p_daily_rate_cents" bigint, "p_pct" numeric DEFAULT 80
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin'));
  v_status text; v_sick bigint;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Only admins can apply sick pay'; END IF;
  IF p_sick_days IS NULL OR p_sick_days < 0 OR p_daily_rate_cents IS NULL OR p_daily_rate_cents < 0
     OR p_pct IS NULL OR p_pct < 0 THEN RAISE EXCEPTION 'sick_days, daily_rate_cents and pct must be >= 0'; END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — sick pay can only be applied to a draft', p_run_id, v_status; END IF;

  v_sick := ROUND(p_sick_days * p_daily_rate_cents * p_pct / 100.0)::bigint;
  UPDATE payroll_lines SET sick_pay_cents = v_sick, sick_days = p_sick_days
  WHERE run_id = p_run_id AND employee_id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No payroll line for employee % on run %', p_employee_id, p_run_id; END IF;
  RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'sick_days', p_sick_days,
    'pct', p_pct, 'sick_pay_cents', v_sick);
END; $$;
ALTER FUNCTION "public"."apply_payroll_sick_pay"("uuid","uuid",numeric,bigint,numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."apply_payroll_sick_pay"("uuid","uuid",numeric,bigint,numeric) TO "anon","authenticated","service_role";
