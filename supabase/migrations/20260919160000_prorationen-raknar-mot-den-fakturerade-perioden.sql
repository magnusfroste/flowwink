-- Prorationen räknar mot den FAKTURERADE perioden.
--
-- Processbatteriet 2026-09-19 (subscribe-to-renew). Manuella abonnemang
-- faktureras i förskott: generate_subscription_invoice fakturerar perioden och
-- rullar sedan current_period_* framåt till NÄSTA, ännu ofakturerade period.
-- change_subscription prorerade mot just den pekaren:
--
--   FEL PERIOD   "Återstående andel" räknades på en period som inte börjat, så
--                den blev alltid ≥ 100 %. Med 48 % kvar av den fakturerade
--                månaden kostade två extra platser à 1 000 kr 200 000 öre i
--                stället för ~96 600.
--   DUBBELT      En uppgradering FÖRE första fakturan gav en justeringsfaktura
--                plus en cykelfaktura på den nya kvantiteten: en period om
--                300 000 öre fakturerades som 496 678.
--   KREDITEN     En nedgradering skrev krediten i metadata.last_change med
--                noten "apply on next invoice". Ingenting läste den — nästa
--                faktura blev 300 000, väntat 248 328.
--
-- Den fakturerade perioden är [current_period_start − intervall, current_period_start),
-- och bara om något faktiskt är fakturerat (last_invoice_id). Innan dess finns
-- inget att justera: den nya kvantiteten gäller från första fakturan.
-- Krediten bokförs i metadata.pending_credit_cents (ackumulerande), dras som en
-- egen rad på nästa cykelfaktura, och det som inte ryms följer med till nästa.
-- Momsen: den begärda, annars instansens standard — aldrig 0.25 i koden.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.change_subscription(p_subscription_id uuid, p_new_quantity integer DEFAULT NULL::integer, p_new_unit_amount_cents integer DEFAULT NULL::integer, p_generate_adjustment boolean DEFAULT true, p_tax_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    _invoice_number := 'SUB-ADJ-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
    _line := jsonb_build_array(jsonb_build_object('description', 'Prorated adjustment: ' || _sub.product_name || ' (' || round(_fraction * 100) || '% of the billed period ' || to_char(_billed_start, 'YYYY-MM-DD') || ' → ' || to_char(_billed_end, 'YYYY-MM-DD') || ' remaining)', 'quantity', 1, 'unit_price_cents', _prorated, 'total_cents', _prorated));
    SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, subscription_id, lead_id)
    VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, 'draft'::invoice_status, _line, _prorated::integer, _rate, _tax, _total, upper(_sub.currency), CURRENT_DATE + 30, CURRENT_DATE, 'Net 30 days', 'Prorated adjustment for subscription ' || _sub.id::text, p_subscription_id, _lead_id)
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
END $function$;

CREATE OR REPLACE FUNCTION public.generate_subscription_invoice(_subscription_id uuid, _tax_rate numeric DEFAULT NULL::numeric, _due_in_days integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _sub public.subscriptions%ROWTYPE; _invoice_id uuid; _invoice_number text; _gross integer; _subtotal integer; _tax integer; _total integer; _rate numeric; _due integer; _due_date date; _base date; _next date; _line jsonb; _status invoice_status; _lead_id uuid;
  _pending bigint; _applied bigint := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(), 'subscriptions'))) THEN RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'generate_subscription_invoice only applies to manual subscriptions (got %)', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot invoice subscription in status %', _sub.status; END IF;
  IF _sub.next_invoice_date IS NOT NULL AND _sub.next_invoice_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Subscription % is not due: next invoice date is % (already invoiced through the current period)', _subscription_id, _sub.next_invoice_date;
  END IF;
  _gross := _sub.unit_amount_cents * COALESCE(_sub.quantity, 1);
  -- Krediten från en nedgradering dras här, som en egen rad. Det som inte ryms följer med.
  _pending := COALESCE((_sub.metadata->>'pending_credit_cents')::bigint, 0);
  _applied := LEAST(GREATEST(_pending, 0), _gross);
  _subtotal := _gross - _applied::integer;
  _rate := COALESCE(CASE WHEN _tax_rate > 1 THEN _tax_rate / 100.0 ELSE _tax_rate END, public.order_line_vat_rate(NULL) / 100.0);
  _tax := round(_subtotal * _rate)::integer;
  _total := _subtotal + _tax;
  _due := COALESCE(_due_in_days, CASE _sub.payment_terms WHEN 'invoice_30' THEN 30 WHEN 'invoice_14' THEN 14 WHEN 'invoice_7' THEN 7 ELSE 30 END);
  _due_date := CURRENT_DATE + _due;
  _invoice_number := 'SUB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
  _line := jsonb_build_array(jsonb_build_object('description', _sub.product_name || ' (' || to_char(COALESCE(_sub.current_period_start, now()), 'YYYY-MM-DD') || ' → ' || to_char(COALESCE(_sub.current_period_end, now()), 'YYYY-MM-DD') || ')', 'quantity', _sub.quantity, 'unit_price_cents', _sub.unit_amount_cents, 'total_cents', _gross));
  IF _applied > 0 THEN
    _line := _line || jsonb_build_array(jsonb_build_object('description', 'Credit for the unused part of the previous period (downgrade)', 'quantity', 1, 'unit_price_cents', -_applied, 'total_cents', -_applied));
  END IF;
  _status := CASE WHEN COALESCE(_sub.auto_finalize, false) THEN 'sent'::invoice_status ELSE 'draft'::invoice_status END;
  SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, sent_at, subscription_id, lead_id)
  VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, _status, _line, _subtotal, _rate, _tax, _total, upper(_sub.currency), _due_date, CURRENT_DATE, 'Net ' || _due || ' days', 'Generated from subscription ' || _sub.id::text || CASE WHEN _sub.po_number IS NOT NULL THEN E'\nPO: ' || _sub.po_number ELSE '' END, CASE WHEN _status = 'sent'::invoice_status THEN now() ELSE NULL END, _subscription_id, _lead_id)
  RETURNING id INTO _invoice_id;
  -- Roll forward from the period boundary. _base = old period end = new period start.
  -- New period [_base, advance(_base)] is non-zero (proration-safe), and next_invoice_date
  -- = _base preserves the invariant next_invoice_date == current_period_start (one invoice
  -- per interval, no skipped/doubled cycles).
  _base := COALESCE(_sub.current_period_end::date, _sub.next_invoice_date, CURRENT_DATE);
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
  RETURN jsonb_build_object('ok', true, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'status', _status, 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'total_cents', _total, 'credit_applied_cents', _applied, 'credit_remaining_cents', GREATEST(_pending - _applied, 0), 'next_invoice_date', _base);
END $function$;

DO $proof$
DECLARE v_sub uuid; v_early uuid; v_r jsonb; v_n bigint; v_inv uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- Fakturerad i förskott för tjugo dagar sedan; tio dagar av perioden återstår.
    INSERT INTO subscriptions (customer_email, customer_name, product_name, status, provider, unit_amount_cents, quantity, currency,
                               billing_interval, billing_interval_count, current_period_start, current_period_end, next_invoice_date)
    VALUES ('proof-sub@example.test', 'Proof Sub', 'Proof plan', 'active', 'manual', 100000, 1, 'SEK', 'month', 1,
            now() - interval '20 days', now() + interval '10 days', (now() - interval '20 days')::date)
    RETURNING id INTO v_sub;
    PERFORM public.generate_subscription_invoice(v_sub);

    -- +2 platser: ungefär en tredjedel av 200 000, aldrig hela beloppet.
    v_r := public.change_subscription(v_sub, 3);
    IF (v_r->>'prorated_cents')::bigint NOT BETWEEN 55000 AND 75000 THEN
      RAISE EXCEPTION 'proof: two seats with ~1/3 of the billed period left cost % (expected ~66 000)', v_r->>'prorated_cents';
    END IF;
    -- −2 platser: samma andel tillbaka som kredit, ingen faktura.
    v_r := public.change_subscription(v_sub, 1);
    IF (v_r->>'credit_cents')::bigint NOT BETWEEN 55000 AND 75000 OR v_r->>'adjustment_invoice_id' IS NOT NULL THEN
      RAISE EXCEPTION 'proof: the downgrade credit is % (expected ~66 000, no invoice)', v_r;
    END IF;
    v_n := (v_r->>'pending_credit_cents')::bigint;

    -- En månad går: nästa cykel bär krediten som egen rad, och den är sedan förbrukad.
    UPDATE subscriptions SET current_period_start = current_period_start - interval '1 month', current_period_end = current_period_end - interval '1 month',
           next_invoice_date = (next_invoice_date - interval '1 month')::date WHERE id = v_sub;
    v_r := public.generate_subscription_invoice(v_sub);
    v_inv := (v_r->>'invoice_id')::uuid;
    IF (SELECT subtotal_cents FROM invoices WHERE id = v_inv) <> 100000 - v_n THEN
      RAISE EXCEPTION 'proof: the next invoice is % net (expected 100 000 − % credit)', (SELECT subtotal_cents FROM invoices WHERE id = v_inv), v_n;
    END IF;
    IF COALESCE((SELECT (metadata->>'pending_credit_cents')::bigint FROM subscriptions WHERE id = v_sub), -1) <> 0 THEN
      RAISE EXCEPTION 'proof: the credit was not spent';
    END IF;

    -- Uppgradering FÖRE första fakturan: ingen justering, en period = en faktura.
    INSERT INTO subscriptions (customer_email, customer_name, product_name, status, provider, unit_amount_cents, quantity, currency,
                               billing_interval, billing_interval_count, current_period_start, current_period_end, next_invoice_date)
    VALUES ('proof-early@example.test', 'Proof Early', 'Proof plan', 'active', 'manual', 100000, 1, 'SEK', 'month', 1,
            now(), now() + interval '1 month', current_date)
    RETURNING id INTO v_early;
    v_r := public.change_subscription(v_early, 3);
    IF (v_r->>'prorated_cents')::bigint <> 0 OR v_r->>'adjustment_invoice_id' IS NOT NULL THEN
      RAISE EXCEPTION 'proof: a change before the first invoice produced an adjustment: %', v_r;
    END IF;
    PERFORM public.generate_subscription_invoice(v_early);
    SELECT COALESCE(sum(subtotal_cents), 0) INTO v_n FROM invoices WHERE subscription_id = v_early;
    IF v_n <> 300000 THEN RAISE EXCEPTION 'proof: one period at three seats was billed % (expected 300 000)', v_n; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'prorationen: proof passed';
END $proof$;
