
-- Add payroll fields to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS tax_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  ADD COLUMN IF NOT EXISTS monthly_salary_cents BIGINT NOT NULL DEFAULT 0;

-- Payroll runs
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  total_gross_cents BIGINT NOT NULL DEFAULT 0,
  total_tax_cents BIGINT NOT NULL DEFAULT 0,
  total_social_fee_cents BIGINT NOT NULL DEFAULT 0,
  total_net_cents BIGINT NOT NULL DEFAULT 0,
  approval_journal_id UUID REFERENCES public.journal_entries(id),
  payment_journal_id UUID REFERENCES public.journal_entries(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  UNIQUE (period_date)
);

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  gross_cents BIGINT NOT NULL DEFAULT 0,
  benefits_cents BIGINT NOT NULL DEFAULT 0,
  deductions_cents BIGINT NOT NULL DEFAULT 0,
  taxable_cents BIGINT NOT NULL DEFAULT 0,
  tax_cents BIGINT NOT NULL DEFAULT 0,
  social_fee_cents BIGINT NOT NULL DEFAULT 0,
  net_cents BIGINT NOT NULL DEFAULT 0,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.payroll_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL CHECK (component_type IN ('salary','benefit','deduction','bonus','overtime')),
  label TEXT NOT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT true,
  recurring BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON public.payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_employee ON public.payroll_lines(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_components_employee ON public.payroll_components(employee_id) WHERE active;

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage payroll_runs" ON public.payroll_runs;
CREATE POLICY "Admins manage payroll_runs" ON public.payroll_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins manage payroll_lines" ON public.payroll_lines;
CREATE POLICY "Admins manage payroll_lines" ON public.payroll_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Admins manage payroll_components" ON public.payroll_components;
CREATE POLICY "Admins manage payroll_components" ON public.payroll_components FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ===== RPCs =====

-- Create payroll run
CREATE OR REPLACE FUNCTION public.create_payroll_run(p_period_date DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id UUID;
  v_emp RECORD;
  v_gross BIGINT; v_benefits BIGINT; v_deductions BIGINT;
  v_taxable BIGINT; v_tax BIGINT; v_social BIGINT; v_net BIGINT;
  v_components JSONB;
  v_total_gross BIGINT := 0; v_total_tax BIGINT := 0; v_total_social BIGINT := 0; v_total_net BIGINT := 0;
  v_lines INT := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can create payroll runs';
  END IF;

  INSERT INTO public.payroll_runs (period_date, status)
  VALUES (date_trunc('month', p_period_date)::date, 'draft')
  RETURNING id INTO v_run_id;

  FOR v_emp IN
    SELECT id, COALESCE(monthly_salary_cents,0) AS base, COALESCE(tax_rate_pct,30.00) AS tax_pct, full_name
    FROM public.employees
    WHERE COALESCE(employment_status,'active') = 'active'
  LOOP
    v_gross := v_emp.base;
    v_benefits := 0; v_deductions := 0;
    v_components := '[]'::jsonb;

    -- Pull recurring components
    SELECT
      COALESCE(SUM(CASE WHEN component_type IN ('salary','bonus','overtime') AND taxable THEN amount_cents ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN component_type='benefit' THEN amount_cents ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN component_type='deduction' THEN amount_cents ELSE 0 END),0),
      COALESCE(jsonb_agg(jsonb_build_object('type',component_type,'label',label,'amount_cents',amount_cents,'taxable',taxable)),'[]'::jsonb)
    INTO v_gross, v_benefits, v_deductions, v_components
    FROM (
      SELECT component_type, label, amount_cents, taxable FROM public.payroll_components
      WHERE employee_id = v_emp.id AND active AND recurring
    ) c;

    v_gross := COALESCE(v_emp.base,0) + COALESCE(v_gross,0);
    v_taxable := v_gross + v_benefits - v_deductions;
    v_tax := ROUND(v_taxable * v_emp.tax_pct / 100.0);
    v_social := ROUND(v_taxable * 31.42 / 100.0);
    v_net := v_taxable - v_tax;

    INSERT INTO public.payroll_lines (run_id, employee_id, gross_cents, benefits_cents, deductions_cents, taxable_cents, tax_cents, social_fee_cents, net_cents, components)
    VALUES (v_run_id, v_emp.id, v_gross, v_benefits, v_deductions, v_taxable, v_tax, v_social, v_net, v_components);

    v_total_gross := v_total_gross + v_gross;
    v_total_tax := v_total_tax + v_tax;
    v_total_social := v_total_social + v_social;
    v_total_net := v_total_net + v_net;
    v_lines := v_lines + 1;
  END LOOP;

  UPDATE public.payroll_runs
    SET total_gross_cents=v_total_gross, total_tax_cents=v_total_tax,
        total_social_fee_cents=v_total_social, total_net_cents=v_total_net
  WHERE id = v_run_id;

  RETURN jsonb_build_object('success',true,'run_id',v_run_id,'lines',v_lines,
    'total_gross_cents',v_total_gross,'total_tax_cents',v_total_tax,
    'total_social_fee_cents',v_total_social,'total_net_cents',v_total_net);
END; $$;

-- Approve payroll run -> book journal entry
CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can approve payroll';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'Run already %', v_run.status; END IF;

  INSERT INTO public.journal_entries (entry_date, description, status, source_type, source_id)
  VALUES (v_run.period_date, 'Payroll run '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll', v_run.id)
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
  -- Cr 2710 (nettolöneskuld) - using 2710 sub or 2890
  IF v_run.total_net_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2890', 0, v_run.total_net_cents, 'Nettolöneskuld');
  END IF;

  UPDATE public.payroll_runs
    SET status='approved', approved_at=now(), approval_journal_id=v_je_id
  WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id);
END; $$;

-- Mark paid
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(p_run_id UUID, p_payment_date DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
  v_date DATE;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can mark payroll paid';
  END IF;
  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'Run must be approved first'; END IF;

  v_date := COALESCE(p_payment_date, CURRENT_DATE);

  INSERT INTO public.journal_entries (entry_date, description, status, source_type, source_id)
  VALUES (v_date, 'Payroll payment '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll_payment', v_run.id)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je_id, '2890', v_run.total_net_cents, 0, 'Utbetald nettolön'),
         (v_je_id, '1930', 0, v_run.total_net_cents, 'Bank');

  UPDATE public.payroll_runs SET status='paid', paid_at=now(), payment_journal_id=v_je_id WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id);
END; $$;

-- List runs
CREATE OR REPLACE FUNCTION public.list_payroll_runs(p_limit INT DEFAULT 24)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.period_date DESC),'[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM public.payroll_runs ORDER BY period_date DESC LIMIT p_limit) r;
  RETURN jsonb_build_object('success',true,'runs',v_rows);
END; $$;

-- List lines for run
CREATE OR REPLACE FUNCTION public.list_payroll_lines(p_run_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',l.id,'employee_id',l.employee_id,'employee_name',e.full_name,
    'gross_cents',l.gross_cents,'benefits_cents',l.benefits_cents,'deductions_cents',l.deductions_cents,
    'taxable_cents',l.taxable_cents,'tax_cents',l.tax_cents,'social_fee_cents',l.social_fee_cents,
    'net_cents',l.net_cents,'components',l.components
  ) ORDER BY e.full_name),'[]'::jsonb) INTO v_rows
  FROM public.payroll_lines l
  LEFT JOIN public.employees e ON e.id = l.employee_id
  WHERE l.run_id = p_run_id;
  RETURN jsonb_build_object('success',true,'lines',v_rows);
END; $$;

GRANT EXECUTE ON FUNCTION public.create_payroll_run(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payroll_run(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_payroll_paid(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_payroll_runs(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_payroll_lines(UUID) TO authenticated;
