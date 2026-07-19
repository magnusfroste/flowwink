-- Payroll: balance the wage journal + stop paying out non-cash benefits.
--
-- BUG 1 (GL, latent since benefits/deductions existed): approve_payroll_run
-- debited 7210 with total_gross_cents, but the credit side (2710 tax, 2731
-- social, 2950 pension, 1610 advances, 2890 net) was derived from
-- taxable_cents = gross + benefits - deductions. Any 'benefit' or 'deduction'
-- payroll component therefore left the journal entry UNBALANCED by
-- (benefits - deductions).
--
-- BUG 2 (net pay): create_payroll_run computed net = taxable - tax, so a
-- non-cash benefit (förmån) wrongly INCREASED the cash payout. Swedish
-- practice: förmånsvärdet raises the tax base (tax + arbetsgivaravgifter)
-- but is never paid out — net = gross - pre-tax deductions - tax (advances
-- and employee pension are then deducted on top). apply_sick_pay recomputed
-- net from taxable and had the same defect.
--
-- FIX:
--   * create_payroll_run / apply_sick_pay: net excludes benefits
--     (net = gross - deductions - tax [- pension_ee - advances]).
--   * approve_payroll_run: post Dt 7385 / Cr 7399 for förmånsvärde (P&L nets
--     to zero, tax + social still carry the benefit) and Cr 7210 'Löneavdrag'
--     for pre-tax deductions, then ASSERT SUM(debit)=SUM(credit) — a non-zero
--     diff raises and rolls back the approval.
--   * chart_of_accounts: seed 7385 if missing (7399 already exists).
--
-- Idempotent + forward-dated for the Lovable-managed migrate runner
-- (backdated files are silently skipped).

-- ── 1. Chart of accounts: benefit cost account ───────────────────────────────
INSERT INTO public.chart_of_accounts (account_code, account_name, account_type, account_category, normal_balance, locale)
VALUES ('7385', 'Kostnader för skattepliktiga förmåner', 'expense', 'Personalkostnader', 'debit', 'se-bas2024')
ON CONFLICT (account_code) DO NOTHING;

-- ── 2. Run creation v3: net pay excludes non-cash benefits ───────────────────
CREATE OR REPLACE FUNCTION public.create_payroll_run(p_period_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id UUID; v_emp RECORD;
  v_base BIGINT; v_earn BIGINT; v_benefits BIGINT; v_deductions BIGINT;
  v_s_earn BIGINT; v_s_benefits BIGINT; v_s_deductions BIGINT;
  v_taxable BIGINT; v_tax BIGINT; v_social BIGINT; v_net BIGINT; v_gross BIGINT;
  v_components JSONB; v_s_components JSONB;
  v_social_pct numeric; v_adv BIGINT; v_adv_skipped BIGINT := 0;
  v_total_gross BIGINT := 0; v_total_tax BIGINT := 0; v_total_social BIGINT := 0;
  v_total_net BIGINT := 0; v_total_adv BIGINT := 0;
  v_lines INT := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can create payroll runs';
  END IF;
  INSERT INTO public.payroll_runs (period_date, status)
  VALUES (date_trunc('month', p_period_date)::date, 'draft')
  RETURNING id INTO v_run_id;
  FOR v_emp IN
    SELECT id, COALESCE(monthly_salary_cents,0) AS base, COALESCE(tax_rate_pct,30.00) AS tax_pct,
           COALESCE(payroll_country,'SE') AS country, salary_structure_id
    FROM public.employees WHERE COALESCE(status,'active') = 'active'
  LOOP
    -- Country profile drives the employer social fee (SE default 31.42).
    SELECT employer_social_pct INTO v_social_pct
    FROM public.payroll_country_profiles WHERE country_code = v_emp.country;
    v_social_pct := COALESCE(v_social_pct, 31.42);

    -- Base salary: employee salary, else the assigned structure's base.
    v_base := v_emp.base;
    IF v_base = 0 AND v_emp.salary_structure_id IS NOT NULL THEN
      SELECT COALESCE(base_salary_cents, 0) INTO v_base
      FROM public.salary_structures WHERE id = v_emp.salary_structure_id AND active;
      v_base := COALESCE(v_base, 0);
    END IF;

    -- Per-employee recurring components (unchanged behaviour).
    SELECT
      COALESCE(SUM(CASE WHEN component_type IN ('salary','bonus','overtime') AND taxable THEN amount_cents ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN component_type='benefit' THEN amount_cents ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN component_type='deduction' THEN amount_cents ELSE 0 END),0),
      COALESCE(jsonb_agg(jsonb_build_object('type',component_type,'label',label,'amount_cents',amount_cents,'taxable',taxable)),'[]'::jsonb)
    INTO v_earn, v_benefits, v_deductions, v_components
    FROM (SELECT component_type, label, amount_cents, taxable FROM public.payroll_components
          WHERE employee_id = v_emp.id AND active AND recurring) c;

    -- Salary-structure components (fixed or % of base).
    v_s_earn := 0; v_s_benefits := 0; v_s_deductions := 0; v_s_components := '[]'::jsonb;
    IF v_emp.salary_structure_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(CASE WHEN component_type IN ('salary','bonus','overtime') AND taxable THEN amt ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN component_type='benefit' THEN amt ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN component_type='deduction' THEN amt ELSE 0 END),0),
        COALESCE(jsonb_agg(jsonb_build_object('type',component_type,'label',label,'amount_cents',amt,'taxable',taxable,'source','structure')),'[]'::jsonb)
      INTO v_s_earn, v_s_benefits, v_s_deductions, v_s_components
      FROM (
        SELECT component_type, label, taxable,
               CASE WHEN pct_of_base IS NOT NULL THEN ROUND(v_base * pct_of_base / 100.0)::bigint
                    ELSE amount_cents END AS amt
        FROM public.salary_structure_components sc
        JOIN public.salary_structures s ON s.id = sc.structure_id AND s.active
        WHERE sc.structure_id = v_emp.salary_structure_id
      ) sx;
    END IF;

    v_gross := COALESCE(v_base,0) + COALESCE(v_earn,0) + COALESCE(v_s_earn,0);
    v_benefits := COALESCE(v_benefits,0) + COALESCE(v_s_benefits,0);
    v_deductions := COALESCE(v_deductions,0) + COALESCE(v_s_deductions,0);
    v_components := COALESCE(v_components,'[]'::jsonb) || COALESCE(v_s_components,'[]'::jsonb);
    v_taxable := v_gross + v_benefits - v_deductions;
    v_tax := ROUND(v_taxable * v_emp.tax_pct / 100.0);
    v_social := ROUND(v_taxable * v_social_pct / 100.0);
    -- Net pay: förmåner raise the tax base but are never paid out in cash;
    -- pre-tax deductions reduce both the tax base and the payout.
    -- (v_gross - v_deductions - v_tax ≡ v_taxable - v_benefits - v_tax)
    v_net := v_gross - v_deductions - v_tax;

    -- Open salary advances are deducted from net (post-tax) and settled on approve.
    SELECT COALESCE(SUM(amount_cents),0) INTO v_adv
    FROM public.salary_advances WHERE employee_id = v_emp.id AND status = 'open';
    IF v_adv > 0 AND v_adv <= v_net THEN
      v_net := v_net - v_adv;
      v_components := v_components || jsonb_build_array(jsonb_build_object(
        'type','advance_repayment','label','Löneförskott avdrag','amount_cents',v_adv,'taxable',false));
      UPDATE public.salary_advances SET status='repaying', repayment_run_id=v_run_id, updated_at=now()
      WHERE employee_id = v_emp.id AND status = 'open';
    ELSE
      IF v_adv > 0 THEN v_adv_skipped := v_adv_skipped + v_adv; END IF;
      v_adv := 0;
    END IF;

    INSERT INTO public.payroll_lines (run_id, employee_id, gross_cents, benefits_cents, deductions_cents,
      taxable_cents, tax_cents, social_fee_cents, net_cents, components, advance_deduction_cents)
    VALUES (v_run_id, v_emp.id, v_gross, v_benefits, v_deductions, v_taxable, v_tax, v_social, v_net,
      v_components, v_adv);
    v_total_gross := v_total_gross + v_gross; v_total_tax := v_total_tax + v_tax;
    v_total_social := v_total_social + v_social; v_total_net := v_total_net + v_net;
    v_total_adv := v_total_adv + v_adv;
    v_lines := v_lines + 1;
  END LOOP;
  UPDATE public.payroll_runs
    SET total_gross_cents=v_total_gross, total_tax_cents=v_total_tax,
        total_social_fee_cents=v_total_social, total_net_cents=v_total_net,
        total_advances_cents=v_total_adv
  WHERE id = v_run_id;
  RETURN jsonb_build_object('success',true,'run_id',v_run_id,'lines',v_lines,
    'total_gross_cents',v_total_gross,'total_tax_cents',v_total_tax,
    'total_social_fee_cents',v_total_social,'total_net_cents',v_total_net,
    'total_advances_deducted_cents',v_total_adv,
    'advances_skipped_cents',v_adv_skipped);
END; $function$;

-- ── 3. Approve v3: benefit/deduction contra lines + balance assertion ────────
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
  v_benefits BIGINT;
  v_deductions BIGINT;
  v_debit BIGINT;
  v_credit BIGINT;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can approve payroll';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'Run already %', v_run.status; END IF;

  SELECT COALESCE(SUM(benefits_cents),0), COALESCE(SUM(deductions_cents),0)
    INTO v_benefits, v_deductions
  FROM public.payroll_lines WHERE run_id = p_run_id;

  INSERT INTO public.journal_entries (entry_date, description, status, source)
  VALUES (v_run.period_date, 'Payroll run '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll')
  RETURNING id INTO v_je_id;

  IF v_run.total_gross_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7210', v_run.total_gross_cents, 0, 'Löner tjänstemän');
  END IF;
  -- Pre-tax deductions: the employee is paid that much less, so the wage cost
  -- is reduced correspondingly (Cr 7210).
  IF v_deductions > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7210', 0, v_deductions, 'Löneavdrag');
  END IF;
  -- Förmånsvärde: cost + contra account so the P&L nets to zero while the
  -- withheld tax and employer social fees still carry the benefit value.
  IF v_benefits > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7385', v_benefits, 0, 'Skattepliktiga förmåner'),
           (v_je_id, '7399', 0, v_benefits, 'Motkonto skattepliktiga förmåner');
  END IF;
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7510', v_run.total_social_fee_cents, 0, 'Arbetsgivaravgifter');
  END IF;
  IF COALESCE(v_run.total_pension_employer_cents,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7410', v_run.total_pension_employer_cents, 0, 'Pensionsförsäkringspremier');
  END IF;
  IF v_run.total_tax_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2710', 0, v_run.total_tax_cents, 'Personalens källskatt');
  END IF;
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2731', 0, v_run.total_social_fee_cents, 'Avräkning lagstadgade sociala avgifter');
  END IF;
  v_pension_total := COALESCE(v_run.total_pension_employer_cents,0) + COALESCE(v_run.total_pension_employee_cents,0);
  IF v_pension_total > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2950', 0, v_pension_total, 'Upplupna pensionskostnader');
  END IF;
  IF COALESCE(v_run.total_advances_cents,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '1610', 0, v_run.total_advances_cents, 'Avräkning löneförskott');
  END IF;
  IF v_run.total_net_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2890', 0, v_run.total_net_cents, 'Nettolöneskuld');
  END IF;

  -- Assertion: a wage journal that does not balance must never be posted.
  SELECT COALESCE(SUM(debit_cents),0), COALESCE(SUM(credit_cents),0)
    INTO v_debit, v_credit
  FROM public.journal_entry_lines WHERE journal_entry_id = v_je_id;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Payroll journal entry does not balance: debit % <> credit % (diff % cents) — approval aborted, run % stays draft',
      v_debit, v_credit, v_debit - v_credit, p_run_id;
  END IF;

  UPDATE public.salary_advances SET status='repaid', repaid_at=now(), updated_at=now()
  WHERE repayment_run_id = p_run_id AND status = 'repaying';

  UPDATE public.payroll_runs
    SET status='approved', approved_at=now(), approval_journal_id=v_je_id
  WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id,
    'pension_posted_cents',v_pension_total,
    'benefits_posted_cents',v_benefits,
    'deductions_posted_cents',v_deductions,
    'journal_debit_cents',v_debit,
    'journal_credit_cents',v_credit,
    'advances_settled_cents',COALESCE(v_run.total_advances_cents,0));
END; $function$;

-- ── 4. Sick pay v3: net recomputation also excludes benefits ─────────────────
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
  v_monthly bigint; v_tax_pct numeric; v_social_pct numeric;
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

  SELECT COALESCE(e.monthly_salary_cents,0), COALESCE(e.tax_rate_pct,30.00),
         COALESCE(p.employer_social_pct, 31.42)
    INTO v_monthly, v_tax_pct, v_social_pct
    FROM employees e
    LEFT JOIN payroll_country_profiles p ON p.country_code = COALESCE(e.payroll_country,'SE')
    WHERE e.id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;

  v_base_gross   := v_line.gross_cents   + v_line.sick_deduction_cents - v_line.sick_pay_cents;
  v_base_taxable := v_line.taxable_cents + v_line.sick_deduction_cents - v_line.sick_pay_cents;

  v_daily := v_monthly::numeric / p_work_days_per_month;
  v_deduction := LEAST(ROUND(v_daily * p_sick_days)::bigint, v_base_gross);
  v_calc := public.calc_sick_pay(v_monthly, p_sick_days, p_work_days_per_month);
  v_sick := COALESCE((v_calc->>'sick_pay_cents')::bigint, 0);

  v_gross   := v_base_gross   - v_deduction + v_sick;
  v_taxable := v_base_taxable - v_deduction + v_sick;
  v_tax     := ROUND(v_taxable * v_tax_pct / 100.0)::bigint + v_line.tax_correction_cents;
  v_social  := ROUND(v_taxable * v_social_pct / 100.0)::bigint;
  -- Net excludes non-cash benefits (förmåner raise the tax base only).
  v_net     := v_taxable - v_line.benefits_cents - v_tax - v_line.pension_employee_cents - v_line.advance_deduction_cents;

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
