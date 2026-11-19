-- ============================================================================
-- Every invoice series runs in order (2026-11-19).
--
-- Invoices made from an agreement, a subscription period, a subscription
-- change and a service order were numbered PREFIX-YYYYMMDD-<five RANDOM
-- digits>: CTR-20261119-48213, then CTR-20261119-07730. That is not a running
-- series — nobody can see that one is missing — and two made the same day can
-- draw the same five digits, where the unique index refuses the second and the
-- billing run fails.
--
-- Each of the four gets a series of its own that counts: PREFIX-YYYY-NNNNN,
-- one counter per prefix and business year, in the table the quote and the
-- INV- series already use (document_counters). INV-, POS- (its own sequence)
-- and credit notes are untouched.
--
-- Invoices already numbered keep their number: a number once issued is never
-- changed. The old shape (eight digits after the prefix) and the new (four)
-- cannot collide.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.next_invoice_series_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_year text := to_char(public.platform_today(), 'YYYY');
  v_floor integer := 0;
  v_seq integer;
BEGIN
  -- The platform's own billing functions only (they run as their owner):
  -- a customer changing their own subscription reaches this through
  -- change_subscription, never by calling it.
  IF v_prefix !~ '^[A-Z]{2,6}(-[A-Z]{2,6})?$' OR v_prefix = 'INV' THEN
    RAISE EXCEPTION 'next_invoice_series_number: % is not a billing series', p_prefix USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The floor keeps the counter above any number a row already carries (an
  -- import, a restore): no number is ever answered twice.
  SELECT coalesce(max(substring(invoice_number FROM '^' || v_prefix || '-' || v_year || '-(\d{1,9})$')::integer), 0)
    INTO v_floor
    FROM public.invoices
   WHERE invoice_number LIKE v_prefix || '-' || v_year || '-%';

  -- The row lock serialises callers.
  INSERT INTO public.document_counters (kind, last_value)
  VALUES ('invoice:' || v_prefix || ':' || v_year, v_floor + 1)
  ON CONFLICT (kind)
  DO UPDATE SET last_value = greatest(document_counters.last_value, v_floor) + 1, updated_at = now()
  RETURNING last_value INTO v_seq;

  RETURN v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_series_number(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_series_number(text) TO service_role;

CREATE OR REPLACE FUNCTION public.change_subscription(p_subscription_id uuid, p_new_quantity integer DEFAULT NULL::integer, p_new_unit_amount_cents integer DEFAULT NULL::integer, p_generate_adjustment boolean DEFAULT true, p_tax_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  _sub public.subscriptions%ROWTYPE; _old_per_period bigint; _new_per_period bigint; _delta bigint;
  _fraction numeric := 0; _prorated bigint; _invoice_id uuid; _invoice_number text; _tax integer; _total integer;
  _line jsonb; _lead_id uuid; _rate numeric; _credit bigint := 0; _pending bigint;
  _billed_start timestamptz; _billed_end timestamptz; _total_days numeric; _remaining_days numeric;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'subscriptions'))) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_new_quantity IS NULL AND p_new_unit_amount_cents IS NULL THEN RAISE EXCEPTION 'Provide p_new_quantity and/or p_new_unit_amount_cents'; END IF;
  IF p_new_quantity IS NOT NULL AND p_new_quantity < 1 THEN RAISE EXCEPTION 'quantity must be >= 1 (cancel instead of zeroing)'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', p_subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'change_subscription only applies to manual subscriptions (got %); card subscriptions change at the provider', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot change subscription in status %', _sub.status; END IF;
  _old_per_period := _sub.unit_amount_cents::bigint * COALESCE(_sub.quantity, 1);
  _new_per_period := COALESCE(p_new_unit_amount_cents, _sub.unit_amount_cents)::bigint * COALESCE(p_new_quantity, _sub.quantity, 1);
  _delta := _new_per_period - _old_per_period;

  -- Den FAKTURERADE perioden slutar där pekaren börjar. Inget fakturerat → inget att justera.
  IF _sub.last_invoice_id IS NOT NULL AND _sub.current_period_start IS NOT NULL THEN
    _billed_end := _sub.current_period_start;
    _billed_start := public.advance_billing_date(_billed_end::date, _sub.billing_interval, -COALESCE(_sub.billing_interval_count, 1))::timestamptz;
    IF now() < _billed_end AND _billed_end > _billed_start THEN
      _total_days := EXTRACT(EPOCH FROM (_billed_end - _billed_start)) / 86400.0;
      _remaining_days := EXTRACT(EPOCH FROM (_billed_end - GREATEST(now(), _billed_start))) / 86400.0;
      _fraction := LEAST(GREATEST(_remaining_days / _total_days, 0), 1);
    END IF;
  END IF;
  _prorated := round(_delta * _fraction);
  IF _prorated < 0 THEN _credit := -_prorated; END IF;
  _pending := COALESCE((_sub.metadata->>'pending_credit_cents')::bigint, 0) + _credit;

  UPDATE public.subscriptions SET quantity = COALESCE(p_new_quantity, quantity), unit_amount_cents = COALESCE(p_new_unit_amount_cents, unit_amount_cents),
     metadata = COALESCE(metadata, '{}'::jsonb)
       || jsonb_build_object('pending_credit_cents', _pending)
       || jsonb_build_object('last_change', jsonb_build_object('at', now(), 'old_per_period_cents', _old_per_period, 'new_per_period_cents', _new_per_period, 'prorated_cents', _prorated, 'fraction', round(_fraction::numeric, 4),
            'billed_period_start', _billed_start, 'billed_period_end', _billed_end))
   WHERE id = p_subscription_id;

  IF _prorated > 0 AND p_generate_adjustment THEN
    _rate := COALESCE(CASE WHEN p_tax_rate > 1 THEN p_tax_rate / 100.0 ELSE p_tax_rate END, public.order_line_vat_rate(NULL) / 100.0);
    _tax := round(_prorated * _rate)::integer; _total := _prorated + _tax;
    _invoice_number := public.next_invoice_series_number('SUB-ADJ');
    _line := jsonb_build_array(jsonb_build_object('description', 'Prorated adjustment: ' || _sub.product_name || ' (' || round(_fraction * 100) || '% of the billed period ' || to_char(_billed_start, 'YYYY-MM-DD') || ' → ' || to_char(_billed_end, 'YYYY-MM-DD') || ' remaining)', 'quantity', 1, 'unit_price_cents', _prorated, 'total_cents', _prorated));
    SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, subscription_id, lead_id)
    VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, 'draft'::invoice_status, _line, _prorated::integer, _rate, _tax, _total, upper(_sub.currency), public.platform_today() + 30, public.platform_today(), 'Net 30 days', 'Prorated adjustment for subscription ' || _sub.id::text, p_subscription_id, _lead_id)
    RETURNING id INTO _invoice_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id, 'old_per_period_cents', _old_per_period, 'new_per_period_cents', _new_per_period,
    'remaining_fraction', round(_fraction::numeric, 4), 'prorated_cents', _prorated, 'adjustment_invoice_id', _invoice_id,
    'credit_cents', _credit, 'pending_credit_cents', _pending,
    'billed_period_start', _billed_start, 'billed_period_end', _billed_end,
    'note', CASE
      WHEN _sub.last_invoice_id IS NULL THEN 'Nothing is billed yet — the new terms apply from the first invoice; no adjustment.'
      WHEN _credit > 0 THEN 'Downgrade credit recorded (pending_credit_cents) — deducted as its own line on the next cycle invoice.'
      ELSE NULL END);
END $fn$;

CREATE OR REPLACE FUNCTION public.generate_contract_invoice(_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  _c public.contracts%ROWTYPE;
  _invoice_id uuid;
  _invoice_number text;
  _subtotal bigint;
  _tax bigint;
  _total bigint;
  _due_date date;
  _period_start date;
  _period_end date;
  _line jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO _c FROM public.contracts WHERE id = _contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract % not found', _contract_id; END IF;
  IF NOT _c.billing_enabled THEN RAISE EXCEPTION 'Contract % does not have billing enabled', _contract_id; END IF;
  IF _c.status <> 'active' THEN RAISE EXCEPTION 'Contract % is not active (status=%)', _contract_id, _c.status; END IF;
  IF _c.billing_amount_cents IS NULL OR _c.billing_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Contract % has no billing_amount_cents set', _contract_id;
  END IF;
  IF _c.billing_interval IS NULL THEN
    RAISE EXCEPTION 'Contract % has no billing_interval set', _contract_id;
  END IF;
  IF _c.billing_next_date IS NULL THEN
    RAISE EXCEPTION 'Contract % has no billing_next_date set', _contract_id;
  END IF;
  IF _c.billing_next_date > public.platform_today() THEN
    RAISE EXCEPTION 'Contract % not due until %', _contract_id, _c.billing_next_date;
  END IF;

  _period_start := _c.billing_next_date;
  _period_end   := public.advance_contract_billing_date(_period_start, _c.billing_interval, _c.billing_interval_count);
  _subtotal     := _c.billing_amount_cents;
  _tax          := round(_subtotal * _c.billing_tax_rate)::bigint;
  _total        := _subtotal + _tax;
  _due_date     := public.platform_today() + COALESCE(_c.billing_due_in_days, 30);

  _invoice_number := public.next_invoice_series_number('CTR');

  _line := jsonb_build_array(jsonb_build_object(
    'description', _c.title || ' (' || to_char(_period_start, 'YYYY-MM-DD') || ' → ' || to_char(_period_end, 'YYYY-MM-DD') || ')',
    'quantity', 1,
    'unit_price_cents', _subtotal,
    'total_cents', _subtotal
  ));

  INSERT INTO public.invoices (
    invoice_number, customer_email, customer_name, status, line_items,
    subtotal_cents, tax_rate, tax_cents, total_cents, currency,
    due_date, issue_date, payment_terms, notes, sent_at, contract_id
  ) VALUES (
    _invoice_number, _c.counterparty_email, _c.counterparty_name, 'sent',
    _line, _subtotal, _c.billing_tax_rate, _tax, _total, upper(_c.currency),
    _due_date, public.platform_today(), 'Net ' || COALESCE(_c.billing_due_in_days,30) || ' days',
    'Generated from contract ' || _c.id::text, now(), _c.id
  ) RETURNING id INTO _invoice_id;

  UPDATE public.contracts SET
    billing_next_date = _period_end,
    billing_last_invoice_id = _invoice_id,
    updated_at = now()
  WHERE id = _contract_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', _invoice_number,
    'total_cents', _total,
    'currency', upper(_c.currency),
    'next_invoice_date', _period_end
  );
END $fn$;

CREATE OR REPLACE FUNCTION public.generate_subscription_invoice(_subscription_id uuid, _tax_rate numeric DEFAULT NULL::numeric, _due_in_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE _sub public.subscriptions%ROWTYPE; _invoice_id uuid; _invoice_number text; _gross integer; _subtotal integer; _tax integer; _total integer; _rate numeric; _due integer; _due_date date; _base date; _next date; _line jsonb; _status invoice_status; _lead_id uuid;
  _pending bigint; _applied bigint := 0;
  _m record; _usage_lines jsonb := '[]'::jsonb; _usage_total bigint := 0; _usage_cutoff timestamptz := clock_timestamp(); _billable numeric; _amount bigint;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions'))) THEN RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'generate_subscription_invoice only applies to manual subscriptions (got %)', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot invoice subscription in status %', _sub.status; END IF;
  IF _sub.next_invoice_date IS NOT NULL AND _sub.next_invoice_date > public.platform_today() THEN
    RAISE EXCEPTION 'Subscription % is not due: next invoice date is % (already invoiced through the current period)', _subscription_id, _sub.next_invoice_date;
  END IF;
  _gross := _sub.unit_amount_cents * COALESCE(_sub.quantity, 1);
  -- Krediten från en nedgradering dras här, som en egen rad. Det som inte ryms följer med.
  _pending := COALESCE((_sub.metadata->>'pending_credit_cents')::bigint, 0);
  _applied := LEAST(GREATEST(_pending, 0), _gross);
  -- usage-billed 20260920020000
  -- Förbrukningen faktureras i efterskott: allt som ännu inte fakturerats, per
  -- mätare, minus det som ingår i perioden. Raden under prenumerationens lås —
  -- en post som skrivs nu väntar på fakturan (FK:ns KEY SHARE mot FOR UPDATE).
  FOR _m IN
    SELECT m.metric, m.unit_label, m.unit_amount_cents, m.included_quantity,
           COALESCE(SUM(r.quantity), 0) AS qty
      FROM public.subscription_usage_meters m
      JOIN public.subscription_usage_records r
        ON r.subscription_id = m.subscription_id AND r.metric = m.metric
       AND r.invoice_id IS NULL AND r.occurred_at <= _usage_cutoff
     WHERE m.subscription_id = _subscription_id
     GROUP BY m.metric, m.unit_label, m.unit_amount_cents, m.included_quantity
     ORDER BY m.metric
  LOOP
    _billable := GREATEST(_m.qty - _m.included_quantity, 0);
    _amount := round(_billable * _m.unit_amount_cents)::bigint;
    _usage_total := _usage_total + _amount;
    _usage_lines := _usage_lines || jsonb_build_array(jsonb_build_object(
      'description', 'Usage: ' || _m.metric || ' — ' || trim(to_char(_m.qty, 'FM999999999990.######')) || COALESCE(' ' || _m.unit_label, '')
                     || CASE WHEN _m.included_quantity > 0 THEN ' (' || trim(to_char(_m.included_quantity, 'FM999999999990.######')) || ' included)' ELSE '' END,
      'quantity', _billable, 'unit_price_cents', _m.unit_amount_cents, 'total_cents', _amount,
      'usage_metric', _m.metric, 'usage_quantity', _m.qty));
  END LOOP;
  _subtotal := _gross - _applied::integer + _usage_total::integer;
  _rate := COALESCE(CASE WHEN _tax_rate > 1 THEN _tax_rate / 100.0 ELSE _tax_rate END, public.order_line_vat_rate(NULL) / 100.0);
  _tax := round(_subtotal * _rate)::integer;
  _total := _subtotal + _tax;
  _due := COALESCE(_due_in_days, CASE _sub.payment_terms WHEN 'invoice_30' THEN 30 WHEN 'invoice_14' THEN 14 WHEN 'invoice_7' THEN 7 ELSE 30 END);
  _due_date := public.platform_today() + _due;
  _invoice_number := public.next_invoice_series_number('SUB');
  _line := jsonb_build_array(jsonb_build_object('description', _sub.product_name || ' (' || to_char(COALESCE(_sub.current_period_start, now()), 'YYYY-MM-DD') || ' → ' || to_char(COALESCE(_sub.current_period_end, now()), 'YYYY-MM-DD') || ')', 'quantity', _sub.quantity, 'unit_price_cents', _sub.unit_amount_cents, 'total_cents', _gross));
  IF _applied > 0 THEN
    _line := _line || jsonb_build_array(jsonb_build_object('description', 'Credit for the unused part of the previous period (downgrade)', 'quantity', 1, 'unit_price_cents', -_applied, 'total_cents', -_applied));
  END IF;
  _line := _line || _usage_lines;
  _status := CASE WHEN COALESCE(_sub.auto_finalize, false) THEN 'sent'::invoice_status ELSE 'draft'::invoice_status END;
  SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, sent_at, subscription_id, lead_id)
  VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, _status, _line, _subtotal, _rate, _tax, _total, upper(_sub.currency), _due_date, public.platform_today(), 'Net ' || _due || ' days', 'Generated from subscription ' || _sub.id::text || CASE WHEN _sub.po_number IS NOT NULL THEN E'\nPO: ' || _sub.po_number ELSE '' END, CASE WHEN _status = 'sent'::invoice_status THEN now() ELSE NULL END, _subscription_id, _lead_id)
  RETURNING id INTO _invoice_id;
  -- Exakt de poster som räknades stämplas — samma predikat, samma lås.
  UPDATE public.subscription_usage_records r SET invoice_id = _invoice_id, billed_at = now()
   WHERE r.subscription_id = _subscription_id AND r.invoice_id IS NULL AND r.occurred_at <= _usage_cutoff
     AND EXISTS (SELECT 1 FROM public.subscription_usage_meters m WHERE m.subscription_id = r.subscription_id AND m.metric = r.metric);
  -- Roll forward from the period boundary. _base = old period end = new period start.
  -- New period [_base, advance(_base)] is non-zero (proration-safe), and next_invoice_date
  -- = _base preserves the invariant next_invoice_date == current_period_start (one invoice
  -- per interval, no skipped/doubled cycles).
  _base := COALESCE(_sub.current_period_end::date, _sub.next_invoice_date, public.platform_today());
  _next := advance_billing_date(_base, _sub.billing_interval, _sub.billing_interval_count);
  UPDATE public.subscriptions SET last_invoice_id = _invoice_id, current_period_start = _base::timestamptz, current_period_end = _next::timestamptz, next_invoice_date = _base, updated_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('pending_credit_cents', GREATEST(_pending - _applied, 0))
   WHERE id = _subscription_id;
  PERFORM public.emit_platform_event('subscription.invoiced', jsonb_build_object('subscription_id', _subscription_id, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'total_cents', _total, 'currency', upper(_sub.currency), 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'status', _status), 'generate_subscription_invoice');
  IF _status = 'sent'::invoice_status THEN
    PERFORM public.emit_platform_event('invoice.finalized', jsonb_build_object('invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'subscription_id', _subscription_id, 'total_cents', _total, 'currency', upper(_sub.currency), 'source', 'subscription_auto_finalize'), 'generate_subscription_invoice');
  END IF;
  -- Return _base (what was written to next_invoice_date), not _next, so the reported
  -- next_invoice_date matches the row.
  RETURN jsonb_build_object('ok', true, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'status', _status, 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'total_cents', _total, 'credit_applied_cents', _applied, 'credit_remaining_cents', GREATEST(_pending - _applied, 0), 'usage_cents', _usage_total, 'next_invoice_date', _base);
END $fn$;

CREATE OR REPLACE FUNCTION public.service_order_to_invoice(p_order_id uuid, p_due_in_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_lines jsonb;
  v_subtotal_cents integer;
BEGIN
  -- Who may bill a service order follows the access matrix, as every other
  -- field-service write does (it named admin and writer by hand).
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'fieldService')) THEN
    RAISE EXCEPTION 'Only staff can create invoices from service orders';
  END IF;

  SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;

  IF v_order.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'invoice_id', v_order.invoice_id,
      'already_linked', true,
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_order.invoice_id));
  END IF;

  IF v_order.customer_email IS NULL THEN
    RAISE EXCEPTION 'customer_email is required on the service order';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description', l.description,
      'quantity', l.quantity,
      'unit_price_cents', round(l.unit_price * 100)::integer,
      'total_cents', round(COALESCE(l.total, l.quantity * l.unit_price) * 100)::integer
    ) ORDER BY l.position), '[]'::jsonb),
    COALESCE(sum(round(COALESCE(l.total, l.quantity * l.unit_price) * 100)::integer), 0)
  INTO v_lines, v_subtotal_cents
  FROM public.service_order_lines l WHERE l.service_order_id = p_order_id;

  IF v_subtotal_cents = 0 THEN
    RAISE EXCEPTION 'Service order % has no billable lines', v_order.order_number;
  END IF;

  v_invoice_number := public.next_invoice_series_number('SO');

  INSERT INTO public.invoices
    (invoice_number, customer_email, customer_name, status, line_items,
     subtotal_cents, tax_rate, tax_cents, total_cents, currency,
     due_date, issue_date, payment_terms, notes)
  VALUES
    (v_invoice_number, v_order.customer_email, v_order.customer_name, 'draft', v_lines,
     v_subtotal_cents, 0, 0, v_subtotal_cents, COALESCE(v_order.currency,public.business_currency()),
     public.platform_today() + COALESCE(p_due_in_days,30), public.platform_today(),
     'Net ' || COALESCE(p_due_in_days,30) || ' days',
     'Generated from service order ' || v_order.order_number)
  RETURNING id INTO v_invoice_id;

  UPDATE public.service_orders SET invoice_id = v_invoice_id WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number, 'service_order_id', p_order_id,
    'total_cents', v_subtotal_cents);
END;
$fn$;

-- ── Proof, rolled back: the series counts, and takes no number twice ─────────
DO $$
DECLARE
  a text; b text; y text := to_char(public.platform_today(), 'YYYY');
BEGIN
  BEGIN
    a := public.next_invoice_series_number('ZZT');
    b := public.next_invoice_series_number('ZZT');
    IF a <> 'ZZT-' || y || '-00001' OR b <> 'ZZT-' || y || '-00002' THEN
      RAISE EXCEPTION 'the series does not count in order: %, %', a, b;
    END IF;
    BEGIN
      PERFORM public.next_invoice_series_number('INV');
      RAISE EXCEPTION 'the INV series was answered here';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $$;
