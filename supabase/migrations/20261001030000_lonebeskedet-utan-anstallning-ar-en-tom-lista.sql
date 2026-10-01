-- A customer without an employment has no payslips — that is an empty list, not an error.
--
-- Nightly fresh install run #2 (2026-10-01), view sweep as the customer role on
-- /account/payslips: POST rpc/get_payslip → 400 P0001 "No employee record linked
-- to your account". The portal lists payslips for whoever is signed in; a portal
-- account that HR has not linked to an employee is the normal state of every
-- customer, and the page already draws "No payslips yet" for it — it only got
-- there by pattern-matching the error text. The list call now answers honestly:
-- success, employee_id null, payslips []. The single-payslip path (p_run_id set)
-- keeps raising, because asking for ONE payslip without an employment is a
-- genuine error. Same guard as before: service_role or the payroll module reads
-- anyone; everyone else reads only their own. Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.get_payslip(p_run_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean;
  v_emp public.employees%ROWTYPE;
  v_line public.payroll_lines%ROWTYPE;
  v_run public.payroll_runs%ROWTYPE;
  v_rows jsonb;
  v_ytd jsonb;
  v_employer text;
  v_social_pct numeric;
BEGIN
  v_admin := auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll');

  IF NOT v_admin THEN
    SELECT * INTO v_emp FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
    IF NOT FOUND THEN
      -- No employment: the list is empty, not broken. One payslip is still an error.
      IF p_run_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'employee_id', NULL,
          'employee_name', NULL, 'payslips', '[]'::jsonb);
      END IF;
      RAISE EXCEPTION 'No employee record linked to your account';
    END IF;
    IF p_employee_id IS NOT NULL AND p_employee_id <> v_emp.id THEN
      RAISE EXCEPTION 'You can only view your own payslips';
    END IF;
    p_employee_id := v_emp.id;
  ELSE
    IF p_employee_id IS NULL THEN
      RAISE EXCEPTION 'p_employee_id is required (admins must pick an employee)';
    END IF;
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;
  END IF;

  -- No run: list available payslips for the employee.
  IF p_run_id IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'run_id', r.id, 'period', to_char(r.period_date,'YYYY-MM'), 'status', r.status,
      'gross_cents', l.gross_cents, 'net_cents', l.net_cents)
      ORDER BY r.period_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.payroll_lines l
    JOIN public.payroll_runs r ON r.id = l.run_id
    WHERE l.employee_id = p_employee_id
      AND (v_admin OR r.status IN ('approved','paid'));
    RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id,
      'employee_name', v_emp.name, 'payslips', v_rows);
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF NOT v_admin AND v_run.status NOT IN ('approved','paid') THEN
    RAISE EXCEPTION 'Payslip not available until the run is approved';
  END IF;
  SELECT * INTO v_line FROM public.payroll_lines
  WHERE run_id = p_run_id AND employee_id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No payroll line for this employee on run %', p_run_id; END IF;

  SELECT NULLIF(trim(both '"' from value::text), '') INTO v_employer
  FROM public.site_settings WHERE key = 'site_name' LIMIT 1;
  SELECT employer_social_pct INTO v_social_pct
  FROM public.payroll_country_profiles WHERE country_code = COALESCE(v_emp.payroll_country,'SE');

  SELECT jsonb_build_object(
    'gross_cents', COALESCE(SUM(l.gross_cents),0),
    'taxable_cents', COALESCE(SUM(l.taxable_cents),0),
    'tax_cents', COALESCE(SUM(l.tax_cents),0),
    'net_cents', COALESCE(SUM(l.net_cents),0),
    'pension_employee_cents', COALESCE(SUM(l.pension_employee_cents),0),
    'months', COUNT(*))
  INTO v_ytd
  FROM public.payroll_lines l
  JOIN public.payroll_runs r ON r.id = l.run_id
  WHERE l.employee_id = p_employee_id
    AND r.status IN ('approved','paid')
    AND date_trunc('year', r.period_date) = date_trunc('year', v_run.period_date)
    AND r.period_date <= v_run.period_date;

  RETURN jsonb_build_object('success', true,
    'employer', jsonb_build_object('name', COALESCE(v_employer, 'FlowWink')),
    'employee', jsonb_build_object('id', v_emp.id, 'name', v_emp.name, 'email', v_emp.email,
      'title', v_emp.title, 'department', v_emp.department,
      'payroll_country', COALESCE(v_emp.payroll_country,'SE')),
    'period', to_char(v_run.period_date,'YYYY-MM'),
    'run_id', v_run.id,
    'status', v_run.status,
    'components', v_line.components,
    'amounts', jsonb_build_object(
      'gross_cents', v_line.gross_cents,
      'benefits_cents', v_line.benefits_cents,
      'deductions_cents', v_line.deductions_cents,
      'taxable_cents', v_line.taxable_cents,
      'tax_cents', v_line.tax_cents,
      'tax_correction_cents', v_line.tax_correction_cents,
      'social_fee_cents', v_line.social_fee_cents,
      'employer_social_pct', COALESCE(v_social_pct, 31.42),
      'pension_employer_cents', v_line.pension_employer_cents,
      'pension_employee_cents', v_line.pension_employee_cents,
      'sick_days', v_line.sick_days,
      'sick_deduction_cents', v_line.sick_deduction_cents,
      'sick_pay_cents', v_line.sick_pay_cents,
      'advance_deduction_cents', v_line.advance_deduction_cents,
      'net_cents', v_line.net_cents),
    'ytd', v_ytd);
END;
$function$;
