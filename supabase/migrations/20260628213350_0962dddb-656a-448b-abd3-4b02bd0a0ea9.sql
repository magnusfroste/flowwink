-- Reconcile the skipped service_role-escape patch class (part 2 of 2) — chunk 1/6

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_run public.payroll_runs%ROWTYPE; v_je_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Only admins can approve payroll'; END IF;
  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'Run already %', v_run.status; END IF;
  INSERT INTO public.journal_entries (entry_date, description, status, source)
  VALUES (v_run.period_date, 'Payroll run '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll')
  RETURNING id INTO v_je_id;
  IF v_run.total_gross_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7210', v_run.total_gross_cents, 0, 'Löner tjänstemän'); END IF;
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7510', v_run.total_social_fee_cents, 0, 'Arbetsgivaravgifter'); END IF;
  IF v_run.total_tax_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2710', 0, v_run.total_tax_cents, 'Personalens källskatt'); END IF;
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2731', 0, v_run.total_social_fee_cents, 'Avräkning lagstadgade sociala avgifter'); END IF;
  IF v_run.total_net_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2890', 0, v_run.total_net_cents, 'Nettolöneskuld'); END IF;
  UPDATE public.payroll_runs SET status='approved', approved_at=now(), approval_journal_id=v_je_id WHERE id=p_run_id;
  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_sale_amount_cents bigint DEFAULT 0, p_disposal_date date DEFAULT CURRENT_DATE, p_proceeds_account text DEFAULT '1930'::text, p_gain_account text DEFAULT '3970'::text, p_loss_account text DEFAULT '7970'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets; v_nbv BIGINT; v_gain_loss BIGINT; v_je_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'dispose_fixed_asset: admin role required'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset already disposed'; END IF;
  v_nbv := v_asset.cost_cents - v_asset.accumulated_cents;
  v_gain_loss := COALESCE(p_sale_amount_cents,0) - v_nbv;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_disposal_date, format('Disposal: %s', v_asset.name), 'fixed_asset_disposal', 'posted')
    RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.asset_account, 0, v_asset.cost_cents, 'Reverse cost');
    IF v_asset.accumulated_cents > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.accumulated_account, v_asset.accumulated_cents, 0, 'Reverse accum depr'); END IF;
    IF COALESCE(p_sale_amount_cents,0) > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_proceeds_account, p_sale_amount_cents, 0, 'Sale proceeds'); END IF;
    IF v_gain_loss > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_gain_account, 0, v_gain_loss, 'Gain on disposal');
    ELSIF v_gain_loss < 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_loss_account, ABS(v_gain_loss), 0, 'Loss on disposal'); END IF;
  END IF;
  UPDATE public.fixed_assets SET status='disposed', disposed_at = p_disposal_date, disposed_amount_cents = p_sale_amount_cents WHERE id = p_asset_id;
  RETURN jsonb_build_object('success', true, 'asset_id', p_asset_id, 'nbv_cents', v_nbv, 'sale_cents', p_sale_amount_cents, 'gain_loss_cents', v_gain_loss, 'journal_entry_id', v_je_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.list_payroll_lines(p_run_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  FROM public.payroll_lines l LEFT JOIN public.employees e ON e.id = l.employee_id
  WHERE l.run_id = p_run_id;
  RETURN jsonb_build_object('success',true,'lines',v_rows);
END; $function$;

CREATE OR REPLACE FUNCTION public.list_payroll_runs(p_limit integer DEFAULT 24)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rows JSONB;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.period_date DESC),'[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM public.payroll_runs ORDER BY period_date DESC LIMIT p_limit) r;
  RETURN jsonb_build_object('success',true,'runs',v_rows);
END; $function$;

CREATE OR REPLACE FUNCTION public.mark_payroll_paid(p_run_id uuid, p_payment_date date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_run public.payroll_runs%ROWTYPE; v_je_id UUID; v_date DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Only admins can mark payroll paid'; END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.register_fixed_asset(p_name text, p_cost_cents bigint, p_useful_life_months integer, p_purchase_date date DEFAULT CURRENT_DATE, p_in_service_date date DEFAULT NULL::date, p_salvage_cents bigint DEFAULT 0, p_method text DEFAULT 'straight_line'::text, p_declining_rate numeric DEFAULT NULL::numeric, p_asset_account text DEFAULT '1210'::text, p_depreciation_account text DEFAULT '7832'::text, p_accumulated_account text DEFAULT '1219'::text, p_credit_account text DEFAULT '1930'::text, p_description text DEFAULT NULL::text, p_create_journal_entry boolean DEFAULT true)
 RETURNS fixed_assets LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets; v_je_id UUID;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'register_fixed_asset: admin role required'; END IF;
  INSERT INTO public.fixed_assets (name, description, cost_cents, salvage_cents, purchase_date, in_service_date, useful_life_months, depreciation_method, declining_rate, asset_account, depreciation_account, accumulated_account)
  VALUES (p_name, p_description, p_cost_cents, COALESCE(p_salvage_cents,0), p_purchase_date, COALESCE(p_in_service_date, p_purchase_date), p_useful_life_months, p_method, p_declining_rate, p_asset_account, p_depreciation_account, p_accumulated_account)
  RETURNING * INTO v_asset;
  IF p_create_journal_entry
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (v_asset.purchase_date, format('Acquisition of fixed asset: %s', v_asset.name), 'fixed_asset_register', 'posted')
    RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, p_asset_account, p_cost_cents, 0, format('Asset: %s', v_asset.name)),
           (v_je_id, p_credit_account, 0, p_cost_cents, format('Acquisition: %s', v_asset.name));
  END IF;
  RETURN v_asset;
END; $function$;

NOTIFY pgrst, 'reload schema';
