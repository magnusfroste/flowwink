-- Reconcile the service_role-escape patches for create_manual_subscription and
-- create_payroll_run — the two admin functions OpenClaw Game 3 confirmed the
-- autonomous operator cannot call ("Only admins can create manual
-- subscriptions" / "Only admins can create payroll runs").
--
-- Root cause: the gateway executes RPC skills with the SERVICE key, so inside a
-- SECURITY DEFINER function auth.uid() is NULL and has_role(auth.uid(),'admin')
-- is false. The codebase already fixed this by widening the guard to
--   (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))
-- in migrations 20260610113000 (subscriptions/inventory) and 20260610130000
-- (payroll). Both are BACKDATED below the dev ledger HEAD, so the dev runner
-- skipped them and dev still runs the pre-patch bodies.
--
-- These two definitions are copied VERBATIM from those migrations (latest
-- version per function — create_payroll_run is taken from 20260610130000, not
-- the older 20260610120000). Forward-dated + idempotent (CREATE OR REPLACE) so
-- the Lovable runner applies them.
--
-- NOTE: the same skipped-patch class affects ~42 other admin functions in those
-- two migrations (manufacturing, webinars, stock, procurement, FX, fixed
-- assets, accounting periods, timesheets). Those need the same reconcile; this
-- migration fixes the two validated by QA. See the operator notes.

CREATE OR REPLACE FUNCTION public.create_manual_subscription(_customer_email text, _customer_name text, _product_name text, _unit_amount_cents integer, _currency text DEFAULT 'EUR'::text, _billing_interval text DEFAULT 'month'::text, _billing_interval_count integer DEFAULT 1, _quantity integer DEFAULT 1, _payment_terms text DEFAULT 'invoice_30'::text, _start_date date DEFAULT CURRENT_DATE, _billing_contact_email text DEFAULT NULL::text, _po_number text DEFAULT NULL::text, _product_id uuid DEFAULT NULL::uuid, _auto_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only admins can create manual subscriptions';
  END IF;

  IF _customer_email IS NULL OR length(trim(_customer_email)) = 0 THEN
    RAISE EXCEPTION 'customer_email is required';
  END IF;
  IF _unit_amount_cents IS NULL OR _unit_amount_cents <= 0 THEN
    RAISE EXCEPTION 'unit_amount_cents must be > 0';
  END IF;

  INSERT INTO public.subscriptions (
    customer_email, customer_name, product_name, product_id,
    unit_amount_cents, currency, quantity,
    billing_interval, billing_interval_count,
    payment_terms, billing_contact_email, po_number,
    provider, status,
    current_period_start, current_period_end, next_invoice_date,
    auto_finalize,
    metadata
  ) VALUES (
    lower(trim(_customer_email)), _customer_name, _product_name, _product_id,
    _unit_amount_cents, lower(_currency), GREATEST(1, _quantity),
    lower(_billing_interval), GREATEST(1, _billing_interval_count),
    _payment_terms, _billing_contact_email, _po_number,
    'manual', 'active'::subscription_status,
    _start_date::timestamptz,
    advance_billing_date(_start_date, _billing_interval, _billing_interval_count)::timestamptz,
    _start_date,
    COALESCE(_auto_finalize, false),
    jsonb_build_object('created_via', 'create_manual_subscription', 'created_by', auth.uid(), 'auto_finalize', COALESCE(_auto_finalize, false))
  )
  RETURNING id INTO _new_id;

  PERFORM public.emit_platform_event(
    'subscription.created',
    jsonb_build_object('subscription_id', _new_id, 'provider', 'manual', 'customer_email', _customer_email, 'auto_finalize', COALESCE(_auto_finalize, false)),
    'create_manual_subscription'
  );

  RETURN jsonb_build_object('ok', true, 'subscription_id', _new_id, 'next_invoice_date', _start_date, 'auto_finalize', COALESCE(_auto_finalize, false));
END $function$

;

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
    SELECT id, COALESCE(monthly_salary_cents,0) AS base, COALESCE(tax_rate_pct,30.00) AS tax_pct
    FROM public.employees
    WHERE COALESCE(status,'active') = 'active'
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

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
