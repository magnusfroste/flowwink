-- Ordern når böckerna när den betalas.
--
-- Tills nu nådde en e-handelsorder huvudboken bara om någon skapade en faktura
-- för den (send_invoice_for_order). place_order bokade kostnaden vid leverans
-- (värderingstriggern) men ingen intäkt — kassan, returerna och kreditnotorna
-- fick sina verifikationer 09-17 (#539), ordern inte. Optic: 0 fakturor på
-- ordrar någonsin.
--
-- Beslut (Magnus 09-17, "du avgör"): intäkten bokförs NÄR ORDERN BLIR BETALD,
-- oavsett vem som säger det — Stripe-webhooken, en operatör som markerar
-- betald, eller demo-cykeln. Ingen aktiv Stripe-integration behövs: signalen
-- är orders.status → 'paid', samma signal som redan driver order.paid-eventet.
--
--   Dt  1580 Fordringar för kontokort (roll payment_clearing) — det Stripe är
--            skyldig oss tills utbetalningen når banken (sync_stripe_payouts
--            matchar den mot 1580, inte mot intäkten)
--   Kr  intäkt per momssats (radernas tax_rate_pct; frakt följer 25 %)
--   Kr  utgående moms per sats
--
-- Orderns rader bär KUNDPRISET inklusive moms (kassan visar priser inkl. moms;
-- offertordrar stämplar total_includes_tax). Rabatt på ordern fördelas i
-- proportion. En faktura som senare skapas för ordern är ett kvitto och bokas
-- inte igen; en retur backar mot order_paid-verifikationen och krediterar
-- clearingkontot när pengarna går tillbaka via Stripe.
--
-- Idempotent: en verifikation per order (source order_paid, reference = order id),
-- roll ON CONFLICT DO NOTHING, bevis som rullas tillbaka.

INSERT INTO public.account_roles (locale, role, account_code, description) VALUES
  ('se-bas2024', 'payment_clearing', '1580', 'Fordringar för kontokort och kuponger — betalväxeln (Stripe m.fl.) tills utbetalningen når banken')
ON CONFLICT (locale, role) DO NOTHING;

-- The VAT rate an order line carries when the line itself says nothing: the
-- commerce setting, else the register default in use, else the SE pack's 25.
CREATE OR REPLACE FUNCTION public.order_line_vat_rate(p_rate numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(p_rate,
    (SELECT NULLIF((value->>'default_tax_rate_pct'), '')::numeric FROM public.site_settings WHERE key = 'commerce' LIMIT 1),
    (SELECT default_tax_rate FROM public.pos_registers WHERE active ORDER BY created_at LIMIT 1),
    25);
$fn$;

CREATE OR REPLACE FUNCTION public.book_order_paid(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_o record;
  v_je uuid;
  v_gross bigint;
  v_scale numeric := 1;
  v_rate record;
  v_ship_rate numeric;
  v_ship_net bigint; v_ship_vat bigint;
  v_debit bigint; v_credit bigint; v_diff bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting') OR public.can_access_module(auth.uid(), 'ecommerce')) THEN
    RAISE EXCEPTION 'Booking an order requires the accounting or ecommerce module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  IF v_o.status NOT IN ('paid', 'shipped', 'delivered') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is ' || v_o.status || ' — only a paid order is booked');
  END IF;
  SELECT id INTO v_je FROM public.journal_entries WHERE source = 'order_paid' AND reference_number = p_order_id::text LIMIT 1;
  IF v_je IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked', 'journal_entry_id', v_je);
  END IF;
  IF COALESCE(v_o.total_cents, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order total is zero');
  END IF;

  -- The lines are gross (customer price incl. VAT); the order total is what was
  -- paid. A discount, or anything else between them, scales every line.
  SELECT COALESCE(SUM(price_cents * quantity), 0) + COALESCE(v_o.shipping_cost_cents, 0) INTO v_gross FROM public.order_items WHERE order_id = p_order_id;
  IF v_gross <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order has no priced lines');
  END IF;
  v_scale := v_o.total_cents::numeric / v_gross;

  INSERT INTO public.journal_entries (entry_date, description, reference_number, source, status)
  VALUES (COALESCE(v_o.updated_at::date, CURRENT_DATE), 'Order ' || left(p_order_id::text, 8) || ' paid' || COALESCE(' — ' || v_o.customer_email, ''),
          p_order_id::text, 'order_paid', 'posted')
  RETURNING id INTO v_je;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je, public.account_for_or('payment_clearing', 'bank'), v_o.total_cents, 0, 'Payment provider clearing');

  FOR v_rate IN
    SELECT public.order_line_vat_rate(oi.tax_rate_pct) AS rate,
           round(SUM(oi.price_cents * oi.quantity) * v_scale) AS gross
      FROM public.order_items oi WHERE oi.order_id = p_order_id
     GROUP BY 1
  LOOP
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, CASE v_rate.rate WHEN 12 THEN public.account_for_or('sales_revenue_12', 'sales_revenue')
                             WHEN 6  THEN public.account_for_or('sales_revenue_6', 'sales_revenue')
                             ELSE public.account_for('sales_revenue') END,
       0, round(v_rate.gross / (1 + v_rate.rate / 100.0)), 'Sales ' || v_rate.rate || ' %');
    IF v_rate.rate > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
        (v_je, CASE v_rate.rate WHEN 12 THEN public.account_for_or('vat_output_12', 'vat_output')
                               WHEN 6  THEN public.account_for_or('vat_output_6', 'vat_output')
                               ELSE public.account_for('vat_output') END,
         0, v_rate.gross - round(v_rate.gross / (1 + v_rate.rate / 100.0)), 'Output VAT ' || v_rate.rate || ' %');
    END IF;
  END LOOP;

  IF COALESCE(v_o.shipping_cost_cents, 0) > 0 THEN
    v_ship_rate := public.order_line_vat_rate(NULL);
    v_ship_net := round(round(v_o.shipping_cost_cents * v_scale) / (1 + v_ship_rate / 100.0));
    v_ship_vat := round(v_o.shipping_cost_cents * v_scale) - v_ship_net;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, public.account_for('sales_revenue'), 0, v_ship_net, 'Shipping charged');
    IF v_ship_vat > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
        (v_je, public.account_for('vat_output'), 0, v_ship_vat, 'Output VAT on shipping');
    END IF;
  END IF;

  SELECT COALESCE(SUM(debit_cents), 0), COALESCE(SUM(credit_cents), 0) INTO v_debit, v_credit FROM public.journal_entry_lines WHERE journal_entry_id = v_je;
  v_diff := v_debit - v_credit;
  IF v_diff <> 0 THEN
    IF abs(v_diff) > 50 THEN
      RAISE EXCEPTION 'order_paid entry for % does not balance: debit % credit %', p_order_id, v_debit, v_credit;
    END IF;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, public.account_for('rounding_variance'), GREATEST(-v_diff, 0), GREATEST(v_diff, 0), 'Rounding');
  END IF;

  RETURN jsonb_build_object('success', true, 'journal_entry_id', v_je, 'order_id', p_order_id, 'total_cents', v_o.total_cents);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.book_order_paid(uuid) FROM PUBLIC, anon;

-- The signal is the status flip — whoever flips it. A shop without a chart of
-- accounts still takes the order; the warning says what to run later.
CREATE OR REPLACE FUNCTION public.on_order_paid_book()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_res jsonb;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM set_config('request.jwt.claims', COALESCE(current_setting('request.jwt.claims', true), '{"role":"service_role"}'), true);
      v_res := public.book_order_paid(NEW.id);
      IF NOT COALESCE((v_res->>'success')::boolean, false) AND (v_res->>'skipped') IS NULL THEN
        RAISE WARNING 'order % paid but not booked: % — run book_order_paid(%) once accounting is configured', NEW.id, v_res->>'error', NEW.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'order % paid but could not be booked: % — run book_order_paid(%) once accounting is configured', NEW.id, SQLERRM, NEW.id;
    END;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_order_paid_book ON public.orders;
CREATE TRIGGER trg_order_paid_book
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_paid_book();

CREATE OR REPLACE FUNCTION public.book_invoice_issued(p_invoice_id uuid, p_ar_account text DEFAULT NULL::text, p_revenue_account text DEFAULT NULL::text, p_vat_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
  v_is_credit boolean;
  v_source text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  p_revenue_account := COALESCE(p_revenue_account, public.account_for('sales_revenue'));
  p_vat_account := COALESCE(p_vat_account, public.account_for('vat_output'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_inv.origin = 'pos_receipt' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'POS receipt — the session close books the sale');
  END IF;
  -- The order was booked when it was paid: this invoice is its receipt, not a second sale.
  IF v_inv.order_id IS NOT NULL AND v_inv.invoice_type = 'invoice'
     AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'order_paid' AND j.reference_number = v_inv.order_id::text) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'order already booked at payment (order_paid) — the invoice is a receipt');
  END IF;

  v_is_credit := (v_inv.invoice_type = 'credit_note');
  v_source := CASE WHEN v_is_credit THEN 'credit_note_issued' ELSE 'invoice_issued' END;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = v_source) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  -- A credit note carries its amounts negative; the entry mirrors the invoice.
  v_total := abs(COALESCE(v_inv.total_cents, 0));
  v_vat   := abs(COALESCE(v_inv.tax_cents, 0));
  v_net   := abs(COALESCE(v_inv.subtotal_cents, v_inv.total_cents - v_inv.tax_cents));
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice total is zero');
  END IF;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.issue_date, CURRENT_DATE),
          CASE WHEN v_is_credit THEN 'Credit note ' ELSE 'Invoice ' END || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' issued',
          v_source, p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  IF v_is_credit THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_entry_id, p_revenue_account, v_net, 0, 'Revenue reversed'),
      (v_entry_id, p_ar_account, 0, v_total, 'Accounts receivable');
    IF v_vat > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, p_vat_account, v_vat, 0, 'Output VAT reversed');
    END IF;
  ELSE
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_entry_id, p_ar_account, v_total, 0, 'Accounts receivable'),
      (v_entry_id, p_revenue_account, 0, v_net, 'Revenue');
    IF v_vat > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, p_vat_account, 0, v_vat, 'Output VAT');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id,
    'total_cents', v_inv.total_cents, 'source', v_source);
END;
$function$;

CREATE OR REPLACE FUNCTION public.book_invoice_paid(p_invoice_id uuid, p_bank_account text DEFAULT NULL::text, p_ar_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_amount bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_payment') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;
  IF v_inv.order_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'order_paid' AND j.reference_number = v_inv.order_id::text) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'order already booked at payment (order_paid) — nothing to settle');
  END IF;

  v_amount := COALESCE(v_inv.paid_amount_cents, v_inv.total_cents, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount is zero');
  END IF;

  -- If issuance was never booked (e.g. legacy invoice), book it first so AR exists.
  PERFORM public.book_invoice_issued(p_invoice_id);

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.paid_at::date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' paid',
          'invoice_payment', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_bank_account, v_amount, 0, 'Bank');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, 0, v_amount, 'Settle accounts receivable');

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id, 'amount_cents', v_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refund_return(p_return_id uuid, p_refund_cents integer, p_method text DEFAULT 'manual'::text, p_final boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ret RECORD;
  v_line_count integer;
  v_gross bigint;
  v_expected bigint;
  v_already bigint;
  v_new_total bigint;
  v_done boolean;
  v_order_total bigint;
  v_order_refunded bigint;
  v_invoice uuid;
  v_order_booked boolean := false;
  v_je uuid;
  v_rate numeric;
  v_vat bigint;
  v_net bigint;
  v_ledger jsonb;
BEGIN
  -- staff-guard 20260917090000
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'returns')) THEN
    RAISE EXCEPTION 'Refunding a return requires the returns module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ret FROM returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;
  IF v_ret.status NOT IN ('received','approved') THEN
    RAISE EXCEPTION 'Return not in refundable state (status %)', v_ret.status;
  END IF;
  IF p_refund_cents IS NULL OR p_refund_cents < 0 THEN
    RAISE EXCEPTION 'refund_cents must not be negative';
  END IF;
  IF p_refund_cents = 0 AND NOT p_final THEN
    RAISE EXCEPTION 'refund_cents must be positive (pass p_final: true with refund_cents 0 only to close an RMA without a further payout)';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(quantity * unit_refund_cents), 0) INTO v_line_count, v_gross FROM return_items WHERE return_id = p_return_id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Return % has no return lines — add lines via manage_return_item (return_id, quantity, unit_refund_cents) before refunding', p_return_id;
  END IF;
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) but an expected refund of 0 — set unit_refund_cents on the lines via manage_return_item before refunding', p_return_id, v_line_count;
  END IF;

  v_expected := GREATEST(v_gross - v_ret.restocking_fee_cents, 0);
  SELECT o.total_cents INTO v_order_total FROM orders o WHERE o.id = v_ret.order_id;
  SELECT COALESCE(SUM(r.refund_amount_cents), 0) INTO v_order_refunded FROM returns r WHERE r.order_id = v_ret.order_id AND r.id <> p_return_id;
  IF v_order_total IS NOT NULL THEN
    v_expected := LEAST(v_expected, GREATEST(v_order_total - v_order_refunded, 0));
  END IF;

  v_already := COALESCE(v_ret.refund_amount_cents, 0);
  v_new_total := v_already + p_refund_cents;
  v_done := p_final OR v_new_total >= v_expected;
  IF p_refund_cents > 0 AND v_new_total > v_expected THEN
    RAISE EXCEPTION 'Refund % would exceed expected total % (items % − restocking fee %, capped by order total % less % refunded on other returns); already refunded %. To close this RMA without a further payout, call again with refund_cents 0 and p_final true',
      v_new_total, v_expected, v_gross, v_ret.restocking_fee_cents, v_order_total, v_order_refunded, v_already;
  END IF;

  UPDATE returns
     SET refund_amount_cents = v_new_total,
         refund_method = CASE WHEN p_refund_cents > 0 THEN p_method ELSE refund_method END,
         refund_processed_at = now(),
         status = CASE WHEN v_done THEN 'refunded' ELSE status END
   WHERE id = p_return_id;

  -- The books. The sale is in them through the order's invoice; the refund
  -- reverses revenue and VAT (the lines' rate) and pays out of the bank — or,
  -- for store credit, into the customer's prepayment. An order that never got
  -- an invoice has no revenue to reverse: the answer says so instead of
  -- inventing a negative sale.
  v_ledger := NULL;
  IF p_refund_cents > 0 THEN
    SELECT i.id INTO v_invoice FROM invoices i
     WHERE i.order_id = v_ret.order_id AND i.invoice_type = 'invoice'
       AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.invoice_id = i.id AND j.source = 'invoice_issued')
     ORDER BY i.created_at LIMIT 1;
    v_order_booked := EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'order_paid' AND j.reference_number = v_ret.order_id::text);
    IF v_invoice IS NULL AND NOT v_order_booked THEN
      v_ledger := jsonb_build_object('booked', false, 'why', 'order has no booked sale — neither an order_paid entry nor a booked invoice; nothing in the books to reverse');
    ELSE
      BEGIN
        -- VAT share from the return lines' order lines, weighted by refund value.
        SELECT COALESCE(SUM(ri.quantity * ri.unit_refund_cents * COALESCE(oi.tax_rate_pct, 0) / (100 + COALESCE(oi.tax_rate_pct, 0)))
                        / NULLIF(SUM(ri.quantity * ri.unit_refund_cents), 0), 0)
          INTO v_rate
          FROM return_items ri LEFT JOIN order_items oi ON oi.id = ri.order_item_id
         WHERE ri.return_id = p_return_id;
        v_vat := round(p_refund_cents * COALESCE(v_rate, 0))::bigint;
        v_net := p_refund_cents - v_vat;
        INSERT INTO journal_entries (entry_date, description, reference_number, source, invoice_id, status)
        VALUES (CURRENT_DATE, 'Refund ' || COALESCE(v_ret.rma_number, p_return_id::text) || ' (' || p_method || ')',
                COALESCE(v_ret.rma_number, p_return_id::text), 'return_refund', v_invoice, 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
          (v_je, public.account_for('sales_revenue'), v_net, 0, 'Revenue reversed on return');
        IF v_vat > 0 THEN
          INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
            (v_je, public.account_for('vat_output'), v_vat, 0, 'Output VAT reversed on return');
        END IF;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
          (v_je, CASE WHEN p_method = 'store_credit' THEN public.account_for_or('customer_credit', 'accounts_receivable')
                      -- A card refund goes back through the payment provider: the clearing account, until the payout nets it.
                      WHEN p_method IN ('stripe', 'card') THEN public.account_for_or('payment_clearing', 'bank')
                      ELSE public.account_for('bank') END,
           0, p_refund_cents, CASE WHEN p_method = 'store_credit' THEN 'Store credit issued'
                                   WHEN p_method IN ('stripe', 'card') THEN 'Refund via payment provider' ELSE 'Refund paid out' END);
        v_ledger := jsonb_build_object('booked', true, 'journal_entry_id', v_je, 'net_cents', v_net, 'vat_cents', v_vat);
      EXCEPTION WHEN OTHERS THEN
        v_ledger := jsonb_build_object('booked', false, 'why', SQLERRM);
        RAISE WARNING 'refund_return %: paid out but not booked: %', p_return_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id,
    'refunded_cents', v_new_total, 'expected_cents', v_expected,
    'remaining_cents', GREATEST(v_expected - v_new_total, 0),
    'line_count', v_line_count,
    'status', CASE WHEN v_done THEN 'refunded' ELSE v_ret.status END,
    'ledger', v_ledger);
END $function$;

-- ── Bevisar sig själv (rullas alltid tillbaka) ──────────────────────────────
DO $proof$
DECLARE v_p1 uuid; v_p2 uuid; v_o uuid; v_oi uuid; v_je uuid; v_d bigint; v_c bigint; v_inv uuid; v_ret uuid; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT EXISTS (SELECT 1 FROM public.account_roles WHERE role = 'sales_revenue') THEN
    RAISE NOTICE 'ordern-nar-bockerna: no account roles — proof skipped'; RETURN;
  END IF;
  BEGIN
    PERFORM public.account_for('sales_revenue');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ordern-nar-bockerna: no accounting locale activated (%) — proof skipped', SQLERRM; RETURN;
  END;
  BEGIN
    INSERT INTO public.products (name, price_cents, is_active) VALUES ('proof-a', 12500, true) RETURNING id INTO v_p1;
    INSERT INTO public.products (name, price_cents, is_active) VALUES ('proof-b', 5600, true) RETURNING id INTO v_p2;
    INSERT INTO public.orders (customer_email, status, total_cents, currency, shipping_cost_cents)
      VALUES ('proof@example.test', 'pending', 12500*2 + 5600 + 4900, 'SEK', 4900) RETURNING id INTO v_o;
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents, tax_rate_pct) VALUES (v_o, v_p1, 'proof-a', 2, 12500, 25) RETURNING id INTO v_oi;
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents, tax_rate_pct) VALUES (v_o, v_p2, 'proof-b', 1, 5600, 12);
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source = 'order_paid' AND reference_number = v_o::text) THEN RAISE EXCEPTION 'proof: a pending order was booked'; END IF;
    UPDATE public.orders SET status = 'paid' WHERE id = v_o;
    SELECT id INTO v_je FROM public.journal_entries WHERE source = 'order_paid' AND reference_number = v_o::text;
    IF v_je IS NULL THEN RAISE EXCEPTION 'proof: paying the order booked nothing'; END IF;
    SELECT SUM(debit_cents), SUM(credit_cents) INTO v_d, v_c FROM public.journal_entry_lines WHERE journal_entry_id = v_je;
    IF v_d <> v_c OR v_d <> 35500 THEN RAISE EXCEPTION 'proof: order entry should be 35500/35500, got %/%', v_d, v_c; END IF;
    -- 25000 gross at 25 % → 20000 net + 5000 VAT; 5600 at 12 % → 5000 + 600; shipping 4900 → 3920 + 980
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND credit_cents = 20000) THEN RAISE EXCEPTION 'proof: 25 %% net 20000 missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND credit_cents = 5000 AND account_code = public.account_for_or('sales_revenue_12','sales_revenue')) THEN RAISE EXCEPTION 'proof: 12 %% net 5000 missing'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = v_je AND debit_cents = 35500 AND account_code = public.account_for_or('payment_clearing','bank')) THEN RAISE EXCEPTION 'proof: clearing 35500 missing'; END IF;
    UPDATE public.orders SET status = 'shipped' WHERE id = v_o;
    UPDATE public.orders SET status = 'paid' WHERE id = v_o;
    IF (SELECT count(*) FROM public.journal_entries WHERE source = 'order_paid' AND reference_number = v_o::text) <> 1 THEN RAISE EXCEPTION 'proof: booked twice'; END IF;
    -- an invoice raised for the paid order is a receipt
    INSERT INTO public.invoices (invoice_number, invoice_type, order_id, customer_email, subtotal_cents, tax_cents, total_cents, currency, status, issue_date, due_date)
      VALUES ('PROOF-ORD-R', 'invoice', v_o, 'proof@example.test', 28920, 6580, 35500, 'SEK', 'paid', CURRENT_DATE, CURRENT_DATE) RETURNING id INTO v_inv;
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE invoice_id = v_inv) THEN RAISE EXCEPTION 'proof: the receipt invoice was booked again'; END IF;
    -- a refund via Stripe reverses against the order and credits the clearing account
    INSERT INTO public.returns (order_id, status, reason) VALUES (v_o, 'approved', 'proof') RETURNING id INTO v_ret;
    INSERT INTO public.return_items (return_id, order_item_id, quantity, condition) VALUES (v_ret, v_oi, 1, 'unopened');
    v_r := public.refund_return(v_ret, 12500, 'stripe', false);
    IF NOT (v_r->'ledger'->>'booked')::boolean THEN RAISE EXCEPTION 'proof: refund on an order booked at payment was not booked: %', v_r->'ledger'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id = (v_r->'ledger'->>'journal_entry_id')::uuid AND credit_cents = 12500 AND account_code = public.account_for_or('payment_clearing','bank')) THEN
      RAISE EXCEPTION 'proof: a Stripe refund should credit the clearing account';
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $proof$;
