-- Auth fix, part 2: open the UNDERLYING functions that the 34 skill RPCs call.
--
-- The 34 skills reach these via mcp_* wrappers (e.g. mcp_create_payroll_run →
-- create_payroll_run). The wrappers had no gate, but the underlying functions do
-- (has_role(auth.uid(),'admin')), so the skills still failed for agents
-- ("Only admins can create payroll runs", "admin role required"). These 10 are
-- exactly the functions transitively called by a skill handler — found by
-- scanning skill-handler bodies — so opening them to the service path completes
-- the same owner-authorized fix. Standalone admin ops NOT called by any skill
-- (reset_role_module_access, enable/disable_demo_cycle_cron, …) are deliberately
-- left gated. Idempotent CREATE OR REPLACE.

-- approve_payroll_run
CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
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
END; $function$

;

-- create_payroll_run
CREATE OR REPLACE FUNCTION public.create_payroll_run(p_period_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id UUID;
  v_emp RECORD;
  v_gross BIGINT; v_benefits BIGINT; v_deductions BIGINT;
  v_taxable BIGINT; v_tax BIGINT; v_social BIGINT; v_net BIGINT;
  v_components JSONB;
  v_total_gross BIGINT := 0; v_total_tax BIGINT := 0; v_total_social BIGINT := 0; v_total_net BIGINT := 0;
  v_lines INT := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
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
END; $function$

;

-- dispose_fixed_asset
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_sale_amount_cents bigint DEFAULT 0, p_disposal_date date DEFAULT CURRENT_DATE, p_proceeds_account text DEFAULT '1930'::text, p_gain_account text DEFAULT '3970'::text, p_loss_account text DEFAULT '7970'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets;
  v_nbv BIGINT;
  v_gain_loss BIGINT;
  v_je_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'dispose_fixed_asset: admin role required';
  END IF;

  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset already disposed'; END IF;

  v_nbv := v_asset.cost_cents - v_asset.accumulated_cents;
  v_gain_loss := COALESCE(p_sale_amount_cents,0) - v_nbv;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_disposal_date, format('Disposal: %s', v_asset.name), 'fixed_asset_disposal', 'posted')
    RETURNING id INTO v_je_id;

    -- Remove cost
    INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.asset_account, 0, v_asset.cost_cents, 'Reverse cost');
    -- Remove accumulated depreciation
    IF v_asset.accumulated_cents > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.accumulated_account, v_asset.accumulated_cents, 0, 'Reverse accum depr');
    END IF;
    -- Cash proceeds
    IF COALESCE(p_sale_amount_cents,0) > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_proceeds_account, p_sale_amount_cents, 0, 'Sale proceeds');
    END IF;
    -- Gain or loss
    IF v_gain_loss > 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_gain_account, 0, v_gain_loss, 'Gain on disposal');
    ELSIF v_gain_loss < 0 THEN
      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_loss_account, ABS(v_gain_loss), 0, 'Loss on disposal');
    END IF;
  END IF;

  UPDATE public.fixed_assets
     SET status='disposed',
         disposed_at = p_disposal_date,
         disposed_amount_cents = p_sale_amount_cents
   WHERE id = p_asset_id;

  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'nbv_cents', v_nbv,
    'sale_cents', p_sale_amount_cents,
    'gain_loss_cents', v_gain_loss,
    'journal_entry_id', v_je_id
  );
END;
$function$

;

-- list_payroll_lines
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
    'id',l.id,'employee_id',l.employee_id,'employee_name',e.full_name,
    'gross_cents',l.gross_cents,'benefits_cents',l.benefits_cents,'deductions_cents',l.deductions_cents,
    'taxable_cents',l.taxable_cents,'tax_cents',l.tax_cents,'social_fee_cents',l.social_fee_cents,
    'net_cents',l.net_cents,'components',l.components
  ) ORDER BY e.full_name),'[]'::jsonb) INTO v_rows
  FROM public.payroll_lines l
  LEFT JOIN public.employees e ON e.id = l.employee_id
  WHERE l.run_id = p_run_id;
  RETURN jsonb_build_object('success',true,'lines',v_rows);
END; $function$

;

-- list_payroll_runs
CREATE OR REPLACE FUNCTION public.list_payroll_runs(p_limit integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows JSONB;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.period_date DESC),'[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM public.payroll_runs ORDER BY period_date DESC LIMIT p_limit) r;
  RETURN jsonb_build_object('success',true,'runs',v_rows);
END; $function$

;

-- mark_payroll_paid
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(p_run_id uuid, p_payment_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
  v_date DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can mark payroll paid';
  END IF;
  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'Run must be approved first'; END IF;

  v_date := COALESCE(p_payment_date, CURRENT_DATE);

  INSERT INTO public.journal_entries (entry_date, description, status, source)
  VALUES (v_date, 'Payroll payment '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll_payment')
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je_id, '2890', v_run.total_net_cents, 0, 'Utbetald nettolön'),
         (v_je_id, '1930', 0, v_run.total_net_cents, 'Bank');

  UPDATE public.payroll_runs SET status='paid', paid_at=now(), payment_journal_id=v_je_id WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id);
END; $function$

;

-- register_fixed_asset
CREATE OR REPLACE FUNCTION public.register_fixed_asset(p_name text, p_cost_cents bigint, p_useful_life_months integer, p_purchase_date date DEFAULT CURRENT_DATE, p_in_service_date date DEFAULT NULL::date, p_salvage_cents bigint DEFAULT 0, p_method text DEFAULT 'straight_line'::text, p_declining_rate numeric DEFAULT NULL::numeric, p_asset_account text DEFAULT '1210'::text, p_depreciation_account text DEFAULT '7832'::text, p_accumulated_account text DEFAULT '1219'::text, p_credit_account text DEFAULT '1930'::text, p_description text DEFAULT NULL::text, p_create_journal_entry boolean DEFAULT true)
 RETURNS fixed_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets;
  v_je_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'register_fixed_asset: admin role required';
  END IF;

  INSERT INTO public.fixed_assets (
    name, description, cost_cents, salvage_cents, purchase_date, in_service_date,
    useful_life_months, depreciation_method, declining_rate,
    asset_account, depreciation_account, accumulated_account
  ) VALUES (
    p_name, p_description, p_cost_cents, COALESCE(p_salvage_cents,0),
    p_purchase_date, COALESCE(p_in_service_date, p_purchase_date),
    p_useful_life_months, p_method, p_declining_rate,
    p_asset_account, p_depreciation_account, p_accumulated_account
  ) RETURNING * INTO v_asset;

  IF p_create_journal_entry
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (
      v_asset.purchase_date,
      format('Acquisition of fixed asset: %s', v_asset.name),
      'fixed_asset_register',
      'posted'
    ) RETURNING id INTO v_je_id;

    INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
    VALUES
      (v_je_id, p_asset_account,  p_cost_cents, 0, format('Asset: %s', v_asset.name)),
      (v_je_id, p_credit_account, 0, p_cost_cents, format('Acquisition: %s', v_asset.name));
  END IF;

  RETURN v_asset;
END;
$function$

;

-- revalue_open_balances
CREATE OR REPLACE FUNCTION public.revalue_open_balances(p_revaluation_date date DEFAULT CURRENT_DATE, p_fx_gain_account text DEFAULT '3960'::text, p_fx_loss_account text DEFAULT '7960'::text, p_ar_account text DEFAULT '1510'::text, p_ap_account text DEFAULT '2440'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base TEXT;
  v_total_gain NUMERIC := 0;
  v_total_loss NUMERIC := 0;
  v_ar_lines INT := 0;
  v_ap_lines INT := 0;
  v_ar_delta NUMERIC := 0;
  v_ap_delta NUMERIC := 0;
  v_je_id UUID;
  rec RECORD;
  v_current_rate NUMERIC;
  v_delta NUMERIC;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'revalue_open_balances: admin role required';
  END IF;

  SELECT code INTO v_base FROM public.currencies WHERE is_base = true LIMIT 1;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'No base currency configured';
  END IF;

  -- Compute AR delta (open invoices in non-base currency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    FOR rec IN
      SELECT id, currency, exchange_rate, total_cents, status
      FROM public.invoices
      WHERE currency <> v_base
        AND COALESCE(status, 'draft') NOT IN ('paid', 'cancelled', 'void')
    LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      -- delta in base currency = amount * (current_rate - booked_rate)
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      v_ar_delta := v_ar_delta + v_delta;
      v_ar_lines := v_ar_lines + 1;
    END LOOP;
  END IF;

  -- Compute AP delta (open POs / vendor bills in non-base currency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    FOR rec IN
      SELECT id, currency, exchange_rate, COALESCE(total_cents, 0) as total_cents, status
      FROM public.purchase_orders
      WHERE currency <> v_base
        AND COALESCE(status, 'draft') NOT IN ('paid', 'cancelled', 'closed')
    LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      -- AP delta is opposite sign (liability)
      v_ap_delta := v_ap_delta - v_delta;
      v_ap_lines := v_ap_lines + 1;
    END LOOP;
  END IF;

  IF v_ar_delta > 0 THEN v_total_gain := v_total_gain + v_ar_delta; ELSE v_total_loss := v_total_loss + ABS(v_ar_delta); END IF;
  IF v_ap_delta > 0 THEN v_total_gain := v_total_gain + v_ap_delta; ELSE v_total_loss := v_total_loss + ABS(v_ap_delta); END IF;

  -- Create journal entry only if there's anything to book and accounting tables exist
  IF (v_total_gain > 0.01 OR v_total_loss > 0.01)
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN

    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (
      p_revaluation_date,
      format('FX revaluation %s — AR %s lines, AP %s lines', p_revaluation_date, v_ar_lines, v_ap_lines),
      'fx_revaluation',
      'posted'
    )
    RETURNING id INTO v_je_id;

    -- AR delta
    IF ABS(v_ar_delta) > 0.01 THEN
      IF v_ar_delta > 0 THEN
        -- AR increased in base value → Dt 1510, Cr 3960 (gain)
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_ar_account, ROUND(v_ar_delta * 100), 0, 'FX revaluation AR'),
          (v_je_id, p_fx_gain_account, 0, ROUND(v_ar_delta * 100), 'Unrealized FX gain on AR');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_fx_loss_account, ROUND(ABS(v_ar_delta) * 100), 0, 'Unrealized FX loss on AR'),
          (v_je_id, p_ar_account, 0, ROUND(ABS(v_ar_delta) * 100), 'FX revaluation AR');
      END IF;
    END IF;

    -- AP delta
    IF ABS(v_ap_delta) > 0.01 THEN
      IF v_ap_delta > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_ap_account, ROUND(v_ap_delta * 100), 0, 'FX revaluation AP'),
          (v_je_id, p_fx_gain_account, 0, ROUND(v_ap_delta * 100), 'Unrealized FX gain on AP');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_fx_loss_account, ROUND(ABS(v_ap_delta) * 100), 0, 'Unrealized FX loss on AP'),
          (v_je_id, p_ap_account, 0, ROUND(ABS(v_ap_delta) * 100), 'FX revaluation AP');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'revaluation_date', p_revaluation_date,
    'base_currency', v_base,
    'ar_lines', v_ar_lines,
    'ap_lines', v_ap_lines,
    'ar_delta', v_ar_delta,
    'ap_delta', v_ap_delta,
    'total_gain', v_total_gain,
    'total_loss', v_total_loss,
    'journal_entry_id', v_je_id
  );
END;
$function$

;

-- run_monthly_depreciation
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(p_period_date date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets;
  v_amount BIGINT;
  v_je_id UUID;
  v_total_amount BIGINT := 0;
  v_processed INT := 0;
  v_skipped INT := 0;
  v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'run_monthly_depreciation: admin role required';
  END IF;

  v_period := date_trunc('month', p_period_date)::DATE;

  FOR v_asset IN
    SELECT * FROM public.fixed_assets
    WHERE status = 'active' AND in_service_date <= (v_period + INTERVAL '1 month - 1 day')::DATE
  LOOP
    -- Skip if already booked this period
    IF EXISTS (SELECT 1 FROM public.depreciation_entries WHERE asset_id = v_asset.id AND period_date = v_period) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_amount := public.compute_monthly_depreciation(v_asset);
    IF v_amount <= 0 THEN
      -- Mark fully depreciated
      UPDATE public.fixed_assets SET status='fully_depreciated' WHERE id=v_asset.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_je_id := NULL;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (
        (v_period + INTERVAL '1 month - 1 day')::DATE,
        format('Depreciation %s — %s', to_char(v_period,'YYYY-MM'), v_asset.name),
        'fixed_asset_depreciation',
        'posted'
      ) RETURNING id INTO v_je_id;

      INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
      VALUES
        (v_je_id, v_asset.depreciation_account, v_amount, 0, format('Depreciation: %s', v_asset.name)),
        (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum depr: %s', v_asset.name));
    END IF;

    INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id)
    VALUES (v_asset.id, v_period, v_amount, v_je_id);

    UPDATE public.fixed_assets
       SET accumulated_cents = accumulated_cents + v_amount,
           status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents
                         THEN 'fully_depreciated' ELSE status END
     WHERE id = v_asset.id;

    v_total_amount := v_total_amount + v_amount;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period', v_period,
    'processed', v_processed,
    'skipped', v_skipped,
    'total_depreciation_cents', v_total_amount
  );
END;
$function$

;

-- set_exchange_rate
CREATE OR REPLACE FUNCTION public.set_exchange_rate(p_base text, p_quote text, p_rate numeric, p_rate_date date DEFAULT CURRENT_DATE, p_source text DEFAULT 'manual'::text)
 RETURNS exchange_rates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.exchange_rates;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'set_exchange_rate: admin role required';
  END IF;

  INSERT INTO public.exchange_rates (base_currency, quote_currency, rate, rate_date, source)
  VALUES (p_base, p_quote, p_rate, p_rate_date, p_source)
  ON CONFLICT (base_currency, quote_currency, rate_date)
  DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$

;
