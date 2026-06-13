-- Payroll: occupational pension + statutory sick pay
-- (docs/parity/capabilities/payroll.json: pension, sick_pay).
-- Both are isolated additions — the verified create_payroll_run is NOT touched
-- (it had schema-drift history; we add columns + standalone functions instead).
--   • apply_pension(run, employer_pct, employee_pct): per-line employer/employee
--     pension on gross, recomputes run totals; employee pension reduces net.
--     Idempotent (re-runnable — net is restored from the prior employee pension).
--   • calc_sick_pay(monthly, sick_days, work_days): Swedish-style sjuklön — 80% of
--     daily salary for employer-period days (cap 14), minus one karensavdrag
--     (20% of a 5-day sick-pay week). Pure calculator.
-- Idempotent DDL.

ALTER TABLE "public"."payroll_lines"
  ADD COLUMN IF NOT EXISTS "pension_employer_cents" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "pension_employee_cents" bigint DEFAULT 0 NOT NULL;

ALTER TABLE "public"."payroll_runs"
  ADD COLUMN IF NOT EXISTS "total_pension_employer_cents" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "total_pension_employee_cents" bigint DEFAULT 0 NOT NULL;

-- apply_pension: occupational pension on a DRAFT run. Writer-gated. Idempotent.
CREATE OR REPLACE FUNCTION "public"."apply_pension"(
  "p_run_id" "uuid", "p_employer_pct" numeric, "p_employee_pct" numeric DEFAULT 0
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_status text; v_emp_total bigint := 0; v_ee_total bigint := 0;
BEGIN
  IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only admins can apply pension';
  END IF;
  IF p_employer_pct IS NULL OR p_employer_pct < 0 OR COALESCE(p_employee_pct,0) < 0 THEN
    RAISE EXCEPTION 'pension percentages must be non-negative';
  END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — pension can only be applied to a draft', p_run_id, v_status; END IF;

  -- Recompute per line. net is restored from the prior employee-pension value so
  -- re-running with a new pct is idempotent (no compounding).
  UPDATE payroll_lines SET
    net_cents = net_cents + pension_employee_cents - ROUND(gross_cents * COALESCE(p_employee_pct,0) / 100.0)::bigint,
    pension_employer_cents = ROUND(gross_cents * p_employer_pct / 100.0)::bigint,
    pension_employee_cents = ROUND(gross_cents * COALESCE(p_employee_pct,0) / 100.0)::bigint
  WHERE run_id = p_run_id;

  SELECT COALESCE(SUM(pension_employer_cents),0), COALESCE(SUM(pension_employee_cents),0)
    INTO v_emp_total, v_ee_total FROM payroll_lines WHERE run_id = p_run_id;

  UPDATE payroll_runs SET
    total_pension_employer_cents = v_emp_total,
    total_pension_employee_cents = v_ee_total,
    total_net_cents = (SELECT COALESCE(SUM(net_cents),0) FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id,
    'employer_pct', p_employer_pct, 'employee_pct', COALESCE(p_employee_pct,0),
    'total_pension_employer_cents', v_emp_total, 'total_pension_employee_cents', v_ee_total);
END; $$;
ALTER FUNCTION "public"."apply_pension"("uuid",numeric,numeric) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."apply_pension"("uuid",numeric,numeric) TO "anon","authenticated","service_role";

-- calc_sick_pay: Swedish statutory sjuklön (employer period, days 1–14).
-- daily = monthly / work_days_per_month; sick pay = 80% × daily × min(sick_days,14)
-- minus one karensavdrag = 20% of a 5-day sick-pay week (= 0.8 × daily). Pure.
CREATE OR REPLACE FUNCTION "public"."calc_sick_pay"(
  "p_monthly_salary_cents" bigint, "p_sick_days" integer, "p_work_days_per_month" integer DEFAULT 21
) RETURNS "jsonb" LANGUAGE "plpgsql" IMMUTABLE SET "search_path" TO 'public' AS $$
DECLARE
  v_daily numeric; v_paid_days int; v_gross bigint; v_karens bigint; v_net bigint;
BEGIN
  IF p_monthly_salary_cents IS NULL OR p_monthly_salary_cents < 0 THEN RAISE EXCEPTION 'monthly salary must be >= 0'; END IF;
  IF p_sick_days IS NULL OR p_sick_days < 0 THEN RAISE EXCEPTION 'sick_days must be >= 0'; END IF;
  IF COALESCE(p_work_days_per_month,0) <= 0 THEN RAISE EXCEPTION 'work_days_per_month must be > 0'; END IF;
  IF p_sick_days = 0 THEN
    RETURN jsonb_build_object('success', true, 'sick_pay_cents', 0, 'paid_sick_days', 0, 'karensavdrag_cents', 0);
  END IF;
  v_daily := p_monthly_salary_cents::numeric / p_work_days_per_month;
  v_paid_days := LEAST(p_sick_days, 14);                       -- employer period
  v_gross := ROUND(0.80 * v_daily * v_paid_days)::bigint;      -- 80% sick pay
  v_karens := ROUND(0.80 * v_daily)::bigint;                    -- one karensavdrag (20% of a 5-day 80% week)
  v_net := GREATEST(0, v_gross - v_karens);
  RETURN jsonb_build_object('success', true,
    'sick_pay_cents', v_net, 'gross_sick_pay_cents', v_gross, 'karensavdrag_cents', v_karens,
    'paid_sick_days', v_paid_days, 'daily_salary_cents', ROUND(v_daily)::bigint,
    'capped', p_sick_days > 14);
END; $$;
ALTER FUNCTION "public"."calc_sick_pay"(bigint,integer,integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."calc_sick_pay"(bigint,integer,integer) TO "anon","authenticated","service_role";
