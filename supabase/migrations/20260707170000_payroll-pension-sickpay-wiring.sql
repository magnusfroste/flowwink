-- Payroll: wire pension + statutory sick pay into the run lifecycle
-- (docs/parity/capabilities/payroll.json: pension, sick_pay — "wire into
--  payroll run/approve posting" was the remaining gap after 20260613060000).
--
--   1. approve_payroll_run now posts occupational pension to the GL:
--        Dt 7410 (Pensionsförsäkringspremier)          = employer pension
--        Cr 2950 (Upplupna pensionskostnader)           = employer + employee premium liability
--      The employee part was already deducted from net by apply_pension, so the
--      reduced Cr 2890 (net wage liability) + Cr 2950 keep the entry balanced.
--      (Särskild löneskatt 24.26% on pension is NOT posted here — later iteration.)
--      Also carries the service_role escape from 20260610120000 (the live dev
--      instance had drifted back to the admin-only gate).
--
--   2. apply_sick_pay(run, employee, sick_days, work_days): applies Swedish
--      sjuklön as an adjustment on ONE employee's draft payroll line:
--        - deducts ordinary salary for the sick days (daily × sick_days)
--        - adds statutory sick pay via calc_sick_pay (80% × daily × min(days,14)
--          − one karensavdrag)
--        - recomputes tax (per-employee rate), social fee (31.42%) and net
--      Idempotent: base values are restored from the stored prior adjustment
--      before re-applying, so re-running with new day counts never compounds.
--      p_sick_days = 0 resets the line.
--
-- Idempotent DDL (IF NOT EXISTS / CREATE OR REPLACE). Forward-dated for the
-- Lovable-managed migrate runner (backdated files are silently skipped).

ALTER TABLE "public"."payroll_lines"
  ADD COLUMN IF NOT EXISTS "sick_days" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "sick_deduction_cents" bigint DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "sick_pay_cents" bigint DEFAULT 0 NOT NULL;

-- ── 1. approve_payroll_run with pension posting ─────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
  v_pension_total BIGINT;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can approve payroll';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'Run already %', v_run.status; END IF;

  INSERT INTO public.journal_entries (entry_date, description, status, source)
  VALUES (v_run.period_date, 'Payroll run '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll')
  RETURNING id INTO v_je_id;

  -- Dt 7210 (lön)
  IF v_run.total_gross_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7210', v_run.total_gross_cents, 0, 'Löner tjänstemän');
  END IF;
  -- Dt 7510 (arb.giv.avg)
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7510', v_run.total_social_fee_cents, 0, 'Arbetsgivaravgifter');
  END IF;
  -- Dt 7410 (pensionsförsäkringspremier, arbetsgivarens del)
  IF COALESCE(v_run.total_pension_employer_cents,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7410', v_run.total_pension_employer_cents, 0, 'Pensionsförsäkringspremier');
  END IF;
  -- Cr 2710 (personalskatt)
  IF v_run.total_tax_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2710', 0, v_run.total_tax_cents, 'Personalens källskatt');
  END IF;
  -- Cr 2731 (arb.giv.avg skuld)
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2731', 0, v_run.total_social_fee_cents, 'Avräkning lagstadgade sociala avgifter');
  END IF;
  -- Cr 2950 (pensionsskuld: arbetsgivarpremie + anställdas löneavdrag)
  v_pension_total := COALESCE(v_run.total_pension_employer_cents,0) + COALESCE(v_run.total_pension_employee_cents,0);
  IF v_pension_total > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2950', 0, v_pension_total, 'Upplupna pensionskostnader');
  END IF;
  -- Cr 2890 (nettolöneskuld)
  IF v_run.total_net_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2890', 0, v_run.total_net_cents, 'Nettolöneskuld');
  END IF;

  UPDATE public.payroll_runs
    SET status='approved', approved_at=now(), approval_journal_id=v_je_id
  WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id,
    'pension_posted_cents',v_pension_total);
END; $function$;

ALTER FUNCTION "public"."approve_payroll_run"("uuid") OWNER TO "postgres";

-- ── 2. apply_sick_pay: sjuklön as a draft-line adjustment ───────────────────
CREATE OR REPLACE FUNCTION public.apply_sick_pay(
  p_run_id uuid, p_employee_id uuid, p_sick_days integer, p_work_days_per_month integer DEFAULT 21
) RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_line public.payroll_lines%ROWTYPE;
  v_monthly bigint; v_tax_pct numeric;
  v_calc jsonb; v_sick bigint; v_daily numeric; v_deduction bigint;
  v_base_gross bigint; v_base_taxable bigint;
  v_gross bigint; v_taxable bigint; v_tax bigint; v_social bigint; v_net bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can apply sick pay';
  END IF;
  IF p_sick_days IS NULL OR p_sick_days < 0 THEN
    RAISE EXCEPTION 'sick_days must be >= 0';
  END IF;
  IF COALESCE(p_work_days_per_month, 0) <= 0 THEN
    RAISE EXCEPTION 'work_days_per_month must be > 0';
  END IF;

  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Run % is % — sick pay can only be applied to a draft', p_run_id, v_status;
  END IF;

  SELECT * INTO v_line FROM payroll_lines
   WHERE run_id = p_run_id AND employee_id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payroll line for employee % on run %', p_employee_id, p_run_id;
  END IF;

  SELECT COALESCE(monthly_salary_cents,0), COALESCE(tax_rate_pct,30.00)
    INTO v_monthly, v_tax_pct FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;

  -- Restore the pre-adjustment base so re-running never compounds.
  v_base_gross   := v_line.gross_cents   + v_line.sick_deduction_cents - v_line.sick_pay_cents;
  v_base_taxable := v_line.taxable_cents + v_line.sick_deduction_cents - v_line.sick_pay_cents;

  v_daily := v_monthly::numeric / p_work_days_per_month;
  v_deduction := LEAST(ROUND(v_daily * p_sick_days)::bigint, v_base_gross);
  v_calc := public.calc_sick_pay(v_monthly, p_sick_days, p_work_days_per_month);
  v_sick := COALESCE((v_calc->>'sick_pay_cents')::bigint, 0);

  v_gross   := v_base_gross   - v_deduction + v_sick;
  v_taxable := v_base_taxable - v_deduction + v_sick;
  v_tax     := ROUND(v_taxable * v_tax_pct / 100.0)::bigint;
  v_social  := ROUND(v_taxable * 31.42 / 100.0)::bigint;
  v_net     := v_taxable - v_tax - v_line.pension_employee_cents;

  UPDATE payroll_lines SET
    gross_cents = v_gross, taxable_cents = v_taxable, tax_cents = v_tax,
    social_fee_cents = v_social, net_cents = v_net,
    sick_days = p_sick_days, sick_deduction_cents = v_deduction, sick_pay_cents = v_sick
  WHERE id = v_line.id;

  UPDATE payroll_runs SET
    total_gross_cents      = (SELECT COALESCE(SUM(gross_cents),0)      FROM payroll_lines WHERE run_id = p_run_id),
    total_tax_cents        = (SELECT COALESCE(SUM(tax_cents),0)        FROM payroll_lines WHERE run_id = p_run_id),
    total_social_fee_cents = (SELECT COALESCE(SUM(social_fee_cents),0) FROM payroll_lines WHERE run_id = p_run_id),
    total_net_cents        = (SELECT COALESCE(SUM(net_cents),0)        FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'employee_id', p_employee_id,
    'sick_days', p_sick_days,
    'salary_deduction_cents', v_deduction,
    'sick_pay_cents', v_sick,
    'karensavdrag_cents', COALESCE((v_calc->>'karensavdrag_cents')::bigint, 0),
    'paid_sick_days', COALESCE((v_calc->>'paid_sick_days')::int, 0),
    'new_gross_cents', v_gross, 'new_tax_cents', v_tax, 'new_net_cents', v_net,
    'note', CASE WHEN v_line.pension_employer_cents > 0 OR v_line.pension_employee_cents > 0
                 THEN 'Pension amounts were computed on the previous gross — re-run apply_pension to refresh them.'
                 ELSE NULL END);
END; $function$;

ALTER FUNCTION "public"."apply_sick_pay"("uuid","uuid",integer,integer) OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."apply_sick_pay"("uuid","uuid",integer,integer) TO "anon","authenticated","service_role";
