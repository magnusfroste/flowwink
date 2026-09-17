-- Pengarna ut följer ordern.
--
-- Processtestet 2026-09-17 körde retur, kassa och kreditnota ända fram till
-- pengarna och fann att ingen av dem hade ett tak som hängde ihop med det
-- kunden faktiskt betalade:
--
--   RETURER   En orderrad om 3 st à 500 kr kunde få en returrad om 10 st à
--             900 kr. Taket i refund_return kom från returens EGNA rader, så
--             9 900 kr betalades ut på en order om 1 500 kr — och tio enheter
--             gick in i lagret från en order om tre. Flaggan `restock` lästes
--             aldrig; dispositionen kom bara ur `condition`.
--   KASSAN    record_pos_sale (v1) rörde inte lagret och skrev ingen betalning
--             — en senare återbetalning lade tillbaka varor som aldrig dragits.
--             En rabatt på hela köpet drogs EFTER momsen och EFTER raderna, så
--             momsen blev för hög, återbetalningen räknade utan rabatten och
--             slog i taket, och fakturan ur kassan hade ett huvud där
--             delsumma + moms ≠ total. Dagsavslutet summerade bara `completed`
--             — en delvis återbetalad försäljning föll ur medan återbetalningen
--             räknades, och växeln drogs aldrig av: 490 kr fel på ett skift.
--             Kvittonummer ur epoch-sekunder kolliderade när två köp slogs in
--             samma sekund. Tendern `invoice` annonserades men vägrades av
--             check-villkoret.
--   KREDITNOTA En delkreditering satte moms = 0, så 105 000 i moms på en helt
--             krediterad faktura backades aldrig.
--
-- Principen som återställs: det som betalas ut, läggs tillbaka eller krediteras
-- får aldrig överstiga det som såldes — och rabatten hör hemma på raderna,
-- FÖRE momsen, så att varje senare beräkning (moms, återbetalning, faktura,
-- Z-rapport) ser samma tal.
--
-- Idempotent: CREATE OR REPLACE, triggrar droppas/skapas, villkor byts i DO.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RETURER — raderna följer orderraderna
-- ═══════════════════════════════════════════════════════════════════════════

-- En returrad hör till en orderrad. Hittas via order_item_id, annars via
-- product_id på returens order. Antal över alla RMA:er på ordern får inte
-- överstiga det sålda antalet; återbetalning per enhet får inte överstiga
-- priset per enhet, och saknas den fylls den med priset.
CREATE OR REPLACE FUNCTION public.return_items_follow_the_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_order_id uuid;
  v_status text;
  v_oi record;
  v_returned numeric;
BEGIN
  SELECT r.order_id, r.status INTO v_order_id, v_status FROM public.returns r WHERE r.id = NEW.return_id;
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Return % has no order — a return line must belong to an order', NEW.return_id;
  END IF;

  IF NEW.order_item_id IS NOT NULL THEN
    SELECT * INTO v_oi FROM public.order_items oi WHERE oi.id = NEW.order_item_id AND oi.order_id = v_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'order_item % does not belong to order %', NEW.order_item_id, v_order_id;
    END IF;
  ELSIF NEW.product_id IS NOT NULL THEN
    SELECT * INTO v_oi FROM public.order_items oi
     WHERE oi.order_id = v_order_id AND oi.product_id = NEW.product_id
     ORDER BY oi.created_at LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % was not sold on order % — a return line must match an order line', NEW.product_id, v_order_id;
    END IF;
    NEW.order_item_id := v_oi.id;
  ELSE
    RAISE EXCEPTION 'A return line needs order_item_id or product_id so it can be matched against what was sold';
  END IF;

  IF NEW.product_id IS NULL THEN NEW.product_id := v_oi.product_id; END IF;

  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  -- Already claimed on this order line by every live return (this row excluded).
  SELECT COALESCE(SUM(ri.quantity), 0) INTO v_returned
    FROM public.return_items ri
    JOIN public.returns r ON r.id = ri.return_id
   WHERE ri.order_item_id = v_oi.id
     AND ri.id IS DISTINCT FROM NEW.id
     AND r.status NOT IN ('rejected', 'cancelled');
  IF v_returned + NEW.quantity > v_oi.quantity THEN
    RAISE EXCEPTION 'Return quantity % exceeds what is left to return on this order line: sold %, already on returns %',
      NEW.quantity, v_oi.quantity, v_returned;
  END IF;

  IF NEW.unit_refund_cents IS NULL THEN
    NEW.unit_refund_cents := v_oi.price_cents;
  ELSIF NEW.unit_refund_cents < 0 THEN
    RAISE EXCEPTION 'unit_refund_cents must not be negative';
  ELSIF NEW.unit_refund_cents > v_oi.price_cents THEN
    RAISE EXCEPTION 'unit_refund_cents % exceeds the unit price % the customer paid for this line',
      NEW.unit_refund_cents, v_oi.price_cents;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_return_items_follow_the_order ON public.return_items;
CREATE TRIGGER trg_return_items_follow_the_order
  BEFORE INSERT OR UPDATE OF order_item_id, product_id, quantity, unit_refund_cents ON public.return_items
  FOR EACH ROW EXECUTE FUNCTION public.return_items_follow_the_order();

-- Dispositionen: `restock` är kundens/handläggarens ord om varan får tillbaka
-- på hyllan alls. Nej betyder nej — då kan `condition` aldrig föreslå restock.
CREATE OR REPLACE FUNCTION public.compute_return_item_action()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.suggested_action := CASE lower(coalesce(NEW.condition,''))
    WHEN 'unopened'  THEN 'restock'
    WHEN 'new'       THEN 'restock'
    WHEN 'opened'    THEN 'refurbish'
    WHEN 'used'      THEN 'refurbish'
    WHEN 'damaged'   THEN 'rtv'
    WHEN 'defective' THEN 'rtv'
    ELSE 'scrap'
  END;
  IF NOT COALESCE(NEW.restock, true) AND NEW.suggested_action = 'restock' THEN
    NEW.suggested_action := 'refurbish';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_return_item_action ON public.return_items;
CREATE TRIGGER trg_return_item_action
  BEFORE INSERT OR UPDATE OF condition, restock ON public.return_items
  FOR EACH ROW EXECUTE FUNCTION public.compute_return_item_action();

-- refund_return: taket från raderna, OCH från ordern — vad som än står på
-- raderna kan summan över orderns alla RMA:er aldrig passera orderns total.
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

  SELECT COUNT(*), COALESCE(SUM(quantity * unit_refund_cents), 0)
    INTO v_line_count, v_gross
    FROM return_items WHERE return_id = p_return_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Return % has no return lines — add lines via manage_return_item (return_id, quantity, unit_refund_cents) before refunding', p_return_id;
  END IF;
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Return % has % line(s) but an expected refund of 0 — set unit_refund_cents on the lines via manage_return_item before refunding', p_return_id, v_line_count;
  END IF;

  v_expected := GREATEST(v_gross - v_ret.restocking_fee_cents, 0);

  -- The order's ceiling: its total, minus what its OTHER returns already paid out.
  SELECT o.total_cents INTO v_order_total FROM orders o WHERE o.id = v_ret.order_id;
  SELECT COALESCE(SUM(r.refund_amount_cents), 0) INTO v_order_refunded
    FROM returns r WHERE r.order_id = v_ret.order_id AND r.id <> p_return_id;
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

  RETURN jsonb_build_object('success', true, 'return_id', p_return_id,
    'refunded_cents', v_new_total, 'expected_cents', v_expected,
    'remaining_cents', GREATEST(v_expected - v_new_total, 0),
    'line_count', v_line_count,
    'status', CASE WHEN v_done THEN 'refunded' ELSE v_ret.status END);
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. KREDITNOTA — en delkreditering bär sin andel av momsen
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_credit_note(p_invoice_id uuid, p_reason text DEFAULT NULL::text, p_amount_cents integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_seq int;
  v_number text;
  v_sub int;
  v_tax int;
  v_tot int;
  v_id uuid;
  v_already_credited bigint;
  v_remaining bigint;
  v_amount int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  SELECT COALESCE(SUM(ABS(total_cents)), 0) INTO v_already_credited
    FROM invoices
   WHERE credited_invoice_id = p_invoice_id AND invoice_type = 'credit_note' AND status::text <> 'cancelled';

  v_remaining := GREATEST(0, v_inv.total_cents - v_already_credited);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Invoice % is already fully credited (total %, already credited %)', p_invoice_id, v_inv.total_cents, v_already_credited;
  END IF;

  v_amount := COALESCE(p_amount_cents, v_remaining::int);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'Credit % exceeds remaining creditable amount % (invoice total %, already credited %)', v_amount, v_remaining, v_inv.total_cents, v_already_credited;
  END IF;

  -- The credited amount is gross. Its VAT share is the invoice's own ratio, so
  -- that crediting the whole invoice in parts reverses exactly the VAT charged.
  IF v_amount = v_remaining AND v_already_credited = 0 THEN
    v_sub := -v_inv.subtotal_cents; v_tax := -v_inv.tax_cents; v_tot := -v_inv.total_cents;
  ELSE
    v_tax := CASE WHEN COALESCE(v_inv.total_cents, 0) > 0
                  THEN -round(v_amount::numeric * COALESCE(v_inv.tax_cents, 0) / v_inv.total_cents)::int
                  ELSE 0 END;
    -- The last part reverses whatever VAT is still un-reversed, so rounding can never leave an öre behind.
    IF v_amount = v_remaining THEN
      SELECT -(COALESCE(v_inv.tax_cents, 0) - COALESCE(SUM(ABS(tax_cents)), 0)) INTO v_tax
        FROM invoices WHERE credited_invoice_id = p_invoice_id AND invoice_type = 'credit_note' AND status::text <> 'cancelled';
    END IF;
    v_tot := -v_amount;
    v_sub := v_tot - v_tax;
  END IF;

  SELECT count(*) + 1 INTO v_seq FROM invoices WHERE credited_invoice_id = p_invoice_id;
  v_number := COALESCE(v_inv.invoice_number, v_inv.id::text) || '-CN' || v_seq::text;

  INSERT INTO invoices (
    invoice_number, invoice_type, credited_invoice_id, lead_id, customer_name, customer_email,
    currency, subtotal_cents, tax_cents, total_cents, status, issue_date, due_date, notes
  ) VALUES (
    v_number, 'credit_note', p_invoice_id, v_inv.lead_id, v_inv.customer_name, v_inv.customer_email,
    v_inv.currency, v_sub, v_tax, v_tot, 'sent', CURRENT_DATE, CURRENT_DATE,
    COALESCE(p_reason, 'Credit note for ' || COALESCE(v_inv.invoice_number, v_inv.id::text))
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true, 'credit_note_id', v_id, 'invoice_number', v_number,
    'subtotal_cents', v_sub, 'tax_cents', v_tax, 'total_cents', v_tot,
    'already_credited_cents', v_already_credited, 'remaining_creditable_cents', v_remaining - v_amount);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. KASSAN — rabatten på raderna före momsen, en försäljningsväg, växeln bokförd
-- ═══════════════════════════════════════════════════════════════════════════

-- `invoice` annonseras som tender och pos_payments tillåter den; pos_sales gjorde inte det.
DO $chk$
BEGIN
  ALTER TABLE public.pos_sales DROP CONSTRAINT IF EXISTS pos_sales_payment_method_check;
  ALTER TABLE public.pos_sales ADD CONSTRAINT pos_sales_payment_method_check
    CHECK (payment_method = ANY (ARRAY['cash','card','swish','klarna','gift_card','invoice','split','other']));
END $chk$;

CREATE SEQUENCE IF NOT EXISTS public.pos_receipt_seq;

-- Rabatt på hela köpet fördelas på raderna i proportion till radens belopp
-- (största resten tar öret) — en rad bär sedan sin hela rabatt, momsen räknas
-- på det rabatterade beloppet och varje senare läsare ser samma tal.
CREATE OR REPLACE FUNCTION public.pos_spread_discount(p_lines jsonb, p_discount_cents integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  v_line jsonb; v_out jsonb := '[]'::jsonb;
  v_base numeric := 0; v_n int := 0; v_i int := 0;
  v_gross numeric; v_share numeric; v_alloc int; v_given int := 0; v_disc int;
BEGIN
  IF COALESCE(p_discount_cents, 0) <= 0 THEN RETURN p_lines; END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_base := v_base + GREATEST(((v_line->>'unit_price_cents')::numeric * (v_line->>'quantity')::numeric) - COALESCE((v_line->>'discount_cents')::numeric, 0), 0);
    v_n := v_n + 1;
  END LOOP;
  IF v_base <= 0 THEN RETURN p_lines; END IF;
  IF p_discount_cents > v_base THEN
    RAISE EXCEPTION 'Sale discount % exceeds the goods total %', p_discount_cents, v_base;
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_i := v_i + 1;
    v_gross := GREATEST(((v_line->>'unit_price_cents')::numeric * (v_line->>'quantity')::numeric) - COALESCE((v_line->>'discount_cents')::numeric, 0), 0);
    IF v_i = v_n THEN
      v_alloc := p_discount_cents - v_given;          -- the last line takes the rounding
    ELSE
      v_share := p_discount_cents * v_gross / v_base;
      v_alloc := floor(v_share)::int;
      v_given := v_given + v_alloc;
    END IF;
    v_disc := COALESCE((v_line->>'discount_cents')::int, 0) + v_alloc;
    v_out := v_out || jsonb_build_array(v_line || jsonb_build_object('discount_cents', v_disc, 'sale_discount_cents', v_alloc));
  END LOOP;
  RETURN v_out;
END $fn$;

CREATE OR REPLACE FUNCTION public.record_pos_sale_v2(p_register_id uuid, p_session_id uuid, p_lines jsonb, p_payments jsonb, p_customer_id uuid DEFAULT NULL::uuid, p_customer_email text DEFAULT NULL::text, p_discount_cents integer DEFAULT 0, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id uuid; v_receipt text;
  v_subtotal integer := 0; v_tax integer := 0; v_total integer := 0; v_paid integer := 0;
  v_line jsonb; v_payment jsonb; v_register_currency text; v_default_tax numeric;
  v_line_subtotal integer; v_line_tax integer; v_tax_rate numeric;
  v_product record; v_payment_summary text; v_lines jsonb := '[]'::jsonb;
  v_unit integer; v_resolved record; v_pname text;
  v_payments jsonb := '[]'::jsonb; v_amount integer; v_change integer;
BEGIN
  -- staff-guard 20260917100000
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'pos')) THEN
    RAISE EXCEPTION 'Recording a POS sale requires the POS module' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pos_sessions WHERE id = p_session_id AND register_id = p_register_id AND status = 'open') THEN
    RAISE EXCEPTION 'Session % is not open for register % — open_pos_session first', p_session_id, p_register_id;
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'p_lines must contain at least one line'; END IF;
  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN RAISE EXCEPTION 'p_payments must contain at least one tender'; END IF;

  SELECT currency, default_tax_rate INTO v_register_currency, v_default_tax FROM public.pos_registers WHERE id = p_register_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_unit := (v_line->>'unit_price_cents')::integer;
    IF v_unit IS NULL THEN
      IF (v_line->>'product_id') IS NULL THEN RAISE EXCEPTION 'Line without product_id must carry unit_price_cents'; END IF;
      SELECT r.price_cents, r.pricelist_id INTO v_resolved
      FROM public.resolve_pricelist_price((v_line->>'product_id')::uuid, p_customer_id, NULL,
        COALESCE((v_line->>'quantity')::numeric, 1), CURRENT_DATE, v_register_currency) r;
      v_unit := v_resolved.price_cents;
      IF v_unit IS NULL THEN RAISE EXCEPTION 'Could not resolve a price for product %', v_line->>'product_id'; END IF;
      v_line := v_line || jsonb_build_object('unit_price_cents', v_unit, 'pricelist_id', v_resolved.pricelist_id);
    END IF;
    IF (v_line->>'product_name') IS NULL THEN
      IF NULLIF(v_line->>'product_id','') IS NOT NULL THEN
        SELECT name INTO v_pname FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      ELSE
        v_pname := NULL;
      END IF;
      v_line := v_line || jsonb_build_object('product_name', COALESCE(v_pname, v_line->>'description', 'Item'));
    END IF;
    IF NULLIF(v_line->>'product_id','') IS NOT NULL THEN
      SELECT id, name, available_in_pos INTO v_product FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', v_line->>'product_id'; END IF;
      IF NOT v_product.available_in_pos THEN RAISE EXCEPTION 'Product % is not available in POS', v_product.name; END IF;
    END IF;
    v_lines := v_lines || jsonb_build_array(v_line);
  END LOOP;

  -- The sale-level discount lands on the lines BEFORE tax.
  v_lines := public.pos_spread_discount(v_lines, COALESCE(p_discount_cents, 0));

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_line_subtotal := ((v_line->>'unit_price_cents')::integer * (v_line->>'quantity')::numeric)::integer - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;
    v_subtotal := v_subtotal + v_line_subtotal; v_tax := v_tax + v_line_tax;
  END LOOP;
  v_total := v_subtotal + v_tax;

  -- A tender without amount_cents is "exact" — the whole total on that method.
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments) LOOP
    v_amount := COALESCE((v_payment->>'amount_cents')::integer, v_total);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'Tender amount must be positive'; END IF;
    v_payments := v_payments || jsonb_build_array(v_payment || jsonb_build_object('amount_cents', v_amount));
    v_paid := v_paid + v_amount;
  END LOOP;
  IF v_paid < v_total THEN RAISE EXCEPTION 'Insufficient payment: paid %, total %', v_paid, v_total; END IF;
  v_change := v_paid - v_total;
  IF v_change > 0 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_payments) p WHERE p->>'method' = 'cash') THEN
    RAISE EXCEPTION 'Overpayment of % on a sale with no cash tender — change can only be given in cash', v_change;
  END IF;

  v_receipt := 'R-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.pos_receipt_seq')::text, 6, '0');
  IF jsonb_array_length(v_payments) > 1 THEN v_payment_summary := 'split'; ELSE v_payment_summary := COALESCE(v_payments->0->>'method', 'cash'); END IF;

  INSERT INTO public.pos_sales (receipt_number, register_id, session_id, cashier_id, customer_id, customer_email, subtotal_cents, tax_cents, discount_cents, total_cents, currency, payment_method, status, metadata)
  VALUES (v_receipt, p_register_id, p_session_id, auth.uid(), p_customer_id, p_customer_email, v_subtotal, v_tax, COALESCE(p_discount_cents, 0), v_total, v_register_currency, v_payment_summary, 'completed', p_metadata)
  RETURNING id INTO v_sale_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_line_subtotal := ((v_line->>'unit_price_cents')::integer * (v_line->>'quantity')::numeric)::integer - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;
    INSERT INTO public.pos_sale_lines (sale_id, product_id, product_name, sku, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents)
    VALUES (v_sale_id, NULLIF(v_line->>'product_id','')::uuid, v_line->>'product_name', v_line->>'sku', (v_line->>'quantity')::numeric, (v_line->>'unit_price_cents')::integer, COALESCE((v_line->>'discount_cents')::integer, 0), v_tax_rate, v_line_subtotal + v_line_tax);
    IF NULLIF(v_line->>'product_id','') IS NOT NULL THEN
      PERFORM public.emit_platform_event('stock.movement',
        jsonb_build_object('product_id', v_line->>'product_id', 'quantity', -((v_line->>'quantity')::numeric), 'reason', 'pos_sale', 'reference_type', 'pos_sale', 'reference_id', v_sale_id, 'sku', v_line->>'sku'), 'pos');
    END IF;
  END LOOP;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(v_payments)
  LOOP
    INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference, metadata)
    VALUES (v_sale_id, v_payment->>'method', (v_payment->>'amount_cents')::integer, v_payment->>'reference', COALESCE(v_payment->'metadata', '{}'::jsonb));
  END LOOP;
  -- Change leaves the drawer: a negative cash payment, so the Z-report's cash sum is the drawer.
  IF v_change > 0 THEN
    INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference) VALUES (v_sale_id, 'cash', -v_change, 'change');
  END IF;

  UPDATE public.pos_sessions SET total_sales_cents = total_sales_cents + v_total, sales_count = sales_count + 1 WHERE id = p_session_id;

  BEGIN
    PERFORM public.emit_platform_event('pos.sale_completed',
      jsonb_build_object('sale_id', v_sale_id, 'total_cents', v_total, 'register_id', p_register_id), 'pos');
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object('sale_id', v_sale_id, 'receipt_number', v_receipt, 'subtotal_cents', v_subtotal, 'tax_cents', v_tax, 'discount_cents', COALESCE(p_discount_cents, 0), 'total_cents', v_total, 'change_cents', v_change);
END;
$function$;

-- v1 är EN väg in: samma lager, samma betalningsrad, samma rabattregel.
CREATE OR REPLACE FUNCTION public.record_pos_sale(p_register_id uuid, p_session_id uuid, p_lines jsonb, p_payment_method text DEFAULT 'cash'::text, p_customer_email text DEFAULT NULL::text, p_discount_cents integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'pos')) THEN
    RAISE EXCEPTION 'Recording a POS sale requires the POS module' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'p_session_id is required — a sale belongs to an open session (open_pos_session) so its cash is counted at close';
  END IF;
  IF p_payment_method = 'split' THEN
    RAISE EXCEPTION 'Use record_pos_sale_v2 with p_payments for a split tender';
  END IF;
  RETURN public.record_pos_sale_v2(p_register_id, p_session_id, p_lines,
    jsonb_build_array(jsonb_build_object('method', COALESCE(p_payment_method, 'cash'))),
    NULL, p_customer_email, COALESCE(p_discount_cents, 0), '{}'::jsonb);
END;
$function$;

-- Återbetalning: kvittonummer ur sekvensen; raderna bär redan rabatten.
CREATE OR REPLACE FUNCTION public.refund_pos_sale(p_sale_id uuid, p_lines jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.pos_sales%ROWTYPE;
  v_line public.pos_sale_lines%ROWTYPE;
  v_qty numeric;
  v_already numeric;
  v_refund_id uuid;
  v_receipt text;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer := 0;
  v_line_subtotal integer;
  v_line_tax integer;
  v_method text;
  v_refunded_before integer;
  v_count int := 0;
  v_session uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'pos')) THEN
    RAISE EXCEPTION 'Only staff can refund POS sales';
  END IF;

  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  IF v_sale.refund_of IS NOT NULL THEN RAISE EXCEPTION 'Sale % is itself a refund', p_sale_id; END IF;
  IF v_sale.status NOT IN ('completed','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'Only completed sales can be refunded (status %)', v_sale.status;
  END IF;

  -- A refund is booked on the OPEN session of the register, so the drawer count sees it.
  v_session := p_session_id;
  IF v_session IS NULL THEN
    SELECT id INTO v_session FROM public.pos_sessions WHERE register_id = v_sale.register_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  END IF;
  IF v_session IS NULL THEN
    RAISE EXCEPTION 'No open session on register % — open_pos_session before refunding, so the cash leaving the drawer is counted', v_sale.register_id;
  END IF;

  v_method := COALESCE(p_method, CASE WHEN v_sale.payment_method = 'split' THEN 'cash' ELSE v_sale.payment_method END, 'cash');
  v_receipt := 'RF-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.pos_receipt_seq')::text, 6, '0');

  SELECT COALESCE(-SUM(total_cents), 0) INTO v_refunded_before FROM public.pos_sales WHERE refund_of = p_sale_id;

  INSERT INTO public.pos_sales
    (receipt_number, register_id, session_id, cashier_id, customer_id, customer_email,
     subtotal_cents, tax_cents, discount_cents, total_cents, currency,
     payment_method, status, refund_of, refund_reason, metadata)
  VALUES
    (v_receipt, v_sale.register_id, v_session, auth.uid(), v_sale.customer_id, v_sale.customer_email,
     0, 0, 0, 0, v_sale.currency, v_method, 'completed', p_sale_id, p_reason,
     jsonb_build_object('original_receipt', v_sale.receipt_number))
  RETURNING id INTO v_refund_id;

  FOR v_line IN SELECT * FROM public.pos_sale_lines WHERE sale_id = p_sale_id
  LOOP
    v_qty := NULL;
    IF p_lines IS NULL THEN
      v_qty := v_line.quantity;
    ELSE
      SELECT (r->>'quantity')::numeric INTO v_qty FROM jsonb_array_elements(p_lines) r WHERE (r->>'sale_line_id')::uuid = v_line.id;
    END IF;
    CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

    SELECT COALESCE(-SUM(rl.quantity), 0) INTO v_already
      FROM public.pos_sale_lines rl JOIN public.pos_sales rs ON rs.id = rl.sale_id
     WHERE rs.refund_of = p_sale_id
       AND rl.product_name = v_line.product_name
       AND COALESCE(rl.product_id::text,'') = COALESCE(v_line.product_id::text,'')
       AND rl.sale_id <> v_refund_id;
    IF v_qty > v_line.quantity - v_already THEN
      RAISE EXCEPTION 'Refund quantity % exceeds remaining % for line "%"', v_qty, v_line.quantity - v_already, v_line.product_name;
    END IF;

    -- The line's discount (its own + its share of the sale discount) follows the quantity.
    v_line_subtotal := -round((v_line.unit_price_cents * v_qty) - (COALESCE(v_line.discount_cents,0) * v_qty / v_line.quantity))::integer;
    v_line_tax := round(v_line_subtotal * COALESCE(v_line.tax_rate,0) / 100.0)::integer;

    INSERT INTO public.pos_sale_lines
      (sale_id, product_id, product_name, sku, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents)
    VALUES
      (v_refund_id, v_line.product_id, v_line.product_name, v_line.sku, -v_qty,
       v_line.unit_price_cents, -round(COALESCE(v_line.discount_cents,0) * v_qty / v_line.quantity)::integer, v_line.tax_rate, v_line_subtotal + v_line_tax);

    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_subtotal + v_line_tax;
    v_count := v_count + 1;

    IF v_line.product_id IS NOT NULL THEN
      PERFORM public.emit_platform_event('stock.movement',
        jsonb_build_object('product_id', v_line.product_id, 'qty_delta', v_qty, 'quantity', v_qty,
          'reason', 'pos_refund', 'reference_type', 'pos_sale', 'reference_id', v_refund_id, 'sku', v_line.sku), 'pos');
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nothing to refund — no matching lines (already fully refunded?)';
  END IF;
  -- Rounding across lines may leave an öre: a full refund of every remaining unit closes on the sale total exactly.
  IF v_refunded_before - v_total > v_sale.total_cents THEN
    IF v_refunded_before - v_total - v_sale.total_cents <= v_count THEN
      v_total := -(v_sale.total_cents - v_refunded_before);
    ELSE
      RAISE EXCEPTION 'Refund exceeds original sale total: original %, already refunded %, this refund %', v_sale.total_cents, v_refunded_before, -v_total;
    END IF;
  END IF;

  UPDATE public.pos_sales SET subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_total WHERE id = v_refund_id;

  INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference)
  VALUES (v_refund_id, v_method, v_total, 'refund of ' || v_sale.receipt_number);

  UPDATE public.loyalty_accounts a
     SET points_balance = points_balance - floor(-v_total / 1000.0)::integer, updated_at = now()
   WHERE lower(a.customer_email) = lower(COALESCE(v_sale.customer_email,'')) AND floor(-v_total / 1000.0)::integer > 0;

  UPDATE public.pos_sales
     SET status = CASE WHEN v_refunded_before - v_total >= total_cents THEN 'refunded' ELSE 'partially_refunded' END
   WHERE id = p_sale_id;

  UPDATE public.pos_sessions SET total_sales_cents = total_sales_cents + v_total WHERE id = v_session AND status = 'open';

  RETURN jsonb_build_object(
    'success', true, 'refund_sale_id', v_refund_id, 'receipt_number', v_receipt,
    'refund_total_cents', v_total, 'original_sale_id', p_sale_id,
    'original_status', (SELECT status FROM public.pos_sales WHERE id = p_sale_id),
    'session_id', v_session, 'lines_refunded', v_count);
END;
$function$;

-- Dagsavslutet läser LÅDAN: varje betalningsrad i skiftet — försäljning,
-- återbetalning, dricks och växel — oavsett vad försäljningen sedan blev.
CREATE OR REPLACE FUNCTION public.pos_session_drawer(p_session_id uuid)
RETURNS TABLE (payments_by_method jsonb, cash_in_drawer_cents integer, total_sales_cents integer, total_tax_cents integer, refunds_cents integer, tips_cents integer, change_cents integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  -- Plain SQL, no SECURITY DEFINER: it only runs inside the guarded close functions.
  WITH sales AS (
    SELECT * FROM public.pos_sales WHERE session_id = p_session_id AND status <> 'voided'
  ), pay AS (
    SELECT pp.* FROM public.pos_payments pp JOIN sales s ON s.id = pp.sale_id
  )
  SELECT
    COALESCE((SELECT jsonb_object_agg(method, amt) FROM (SELECT method, SUM(amount_cents) amt FROM pay GROUP BY method) t), '{}'::jsonb),
    COALESCE((SELECT SUM(amount_cents) FROM pay WHERE method = 'cash'), 0)::int,
    COALESCE((SELECT SUM(total_cents) FROM sales), 0)::int,
    COALESCE((SELECT SUM(tax_cents) FROM sales), 0)::int,
    COALESCE((SELECT -SUM(total_cents) FROM sales WHERE refund_of IS NOT NULL), 0)::int,
    COALESCE((SELECT SUM(amount_cents) FROM pay WHERE reference = 'tip'), 0)::int,
    COALESCE((SELECT -SUM(amount_cents) FROM pay WHERE reference = 'change'), 0)::int;
$fn$;
REVOKE EXECUTE ON FUNCTION public.pos_session_drawer(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.close_pos_session_v2(p_session_id uuid, p_closing_cash_cents integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_register record;
  v_d record;
  v_expected_cash integer;
  v_variance integer;
  v_z_report jsonb;
BEGIN
  -- staff-guard 20260917100000
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'pos')) THEN
    RAISE EXCEPTION 'Closing a POS session requires the POS module' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_session FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Session % is not open', p_session_id; END IF;

  SELECT * INTO v_register FROM public.pos_registers WHERE id = v_session.register_id;
  SELECT * INTO v_d FROM public.pos_session_drawer(p_session_id);

  v_expected_cash := COALESCE(v_session.opening_cash_cents, 0) + v_d.cash_in_drawer_cents;
  v_variance := p_closing_cash_cents - v_expected_cash;

  v_z_report := jsonb_build_object(
    'session_id', p_session_id,
    'register', v_register.name,
    'cashier', v_session.cashier_name,
    'opened_at', v_session.opened_at,
    'closed_at', now(),
    'opening_cash_cents', v_session.opening_cash_cents,
    'closing_cash_cents', p_closing_cash_cents,
    'expected_cash_cents', v_expected_cash,
    'cash_variance_cents', v_variance,
    'sales_count', v_session.sales_count,
    'total_sales_cents', v_d.total_sales_cents,
    'total_tax_cents', v_d.total_tax_cents,
    'refunds_cents', v_d.refunds_cents,
    'tips_cents', v_d.tips_cents,
    'change_given_cents', v_d.change_cents,
    'payments_by_method', v_d.payments_by_method,
    'currency', v_register.currency
  );

  UPDATE public.pos_sessions
     SET status = 'closed', closed_at = now(),
         closing_cash_cents = p_closing_cash_cents,
         expected_cash_cents = v_expected_cash,
         cash_variance_cents = v_variance,
         total_sales_cents = v_d.total_sales_cents,
         notes = COALESCE(p_notes, notes),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('z_report', v_z_report)
   WHERE id = p_session_id;

  PERFORM public.emit_platform_event('pos.session.closed', v_z_report, 'pos');
  RETURN v_z_report;
END;
$function$;

-- v1-avslutet läser samma låda.
CREATE OR REPLACE FUNCTION public.close_pos_session(p_session_id uuid, p_closing_cash_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_z jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'pos')) THEN
    RAISE EXCEPTION 'Closing a POS session requires the POS module' USING ERRCODE = '42501';
  END IF;
  v_z := public.close_pos_session_v2(p_session_id, p_closing_cash_cents, NULL);
  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'expected_cash_cents', v_z->'expected_cash_cents',
    'closing_cash_cents', p_closing_cash_cents,
    'variance_cents', v_z->'cash_variance_cents',
    'z_report', v_z);
END;
$function$;

-- Fakturan ur kassan: samma tal som kvittot, betald när kvittot var betalt.
CREATE OR REPLACE FUNCTION public.pos_sale_to_invoice(p_sale_id uuid, p_customer_name text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_due_in_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.pos_sales%ROWTYPE;
  v_email text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_lines jsonb;
  v_settled integer;
  v_status text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Only staff can create invoices from POS sales';
  END IF;
  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  IF v_sale.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'invoice_id', v_sale.invoice_id, 'already_linked', true,
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_sale.invoice_id));
  END IF;
  IF v_sale.refund_of IS NOT NULL THEN RAISE EXCEPTION 'Cannot invoice a refund sale'; END IF;

  v_email := COALESCE(p_customer_email, v_sale.customer_email);
  IF v_email IS NULL THEN RAISE EXCEPTION 'customer_email is required (sale has none on record)'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description', l.product_name || CASE WHEN l.sku IS NOT NULL THEN ' (' || l.sku || ')' ELSE '' END,
      'quantity', l.quantity,
      'unit_price_cents', l.unit_price_cents,
      'discount_cents', COALESCE(l.discount_cents, 0),
      'tax_rate', l.tax_rate,
      'total_cents', l.line_total_cents
    )), '[]'::jsonb)
  INTO v_lines FROM public.pos_sale_lines l WHERE l.sale_id = p_sale_id;

  -- Settled at the till (every tender but 'invoice', tips and change excluded) → the invoice is a paid receipt.
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_settled
    FROM public.pos_payments WHERE sale_id = p_sale_id AND method <> 'invoice' AND COALESCE(reference, '') <> 'tip';
  v_status := CASE WHEN v_settled >= v_sale.total_cents THEN 'paid' ELSE 'sent' END;

  v_invoice_number := 'POS-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('public.pos_receipt_seq')::text, 6, '0');

  INSERT INTO public.invoices
    (invoice_number, customer_email, customer_name, status, line_items,
     subtotal_cents, tax_rate, tax_cents, total_cents, currency,
     due_date, issue_date, payment_terms, notes, paid_at)
  VALUES
    (v_invoice_number, v_email, p_customer_name, v_status::invoice_status, v_lines,
     v_sale.subtotal_cents, CASE WHEN v_sale.subtotal_cents > 0 THEN round(v_sale.tax_cents::numeric / v_sale.subtotal_cents, 4) ELSE 0 END,
     v_sale.tax_cents, v_sale.total_cents, COALESCE(v_sale.currency,'SEK'),
     CASE WHEN v_status = 'paid' THEN CURRENT_DATE ELSE CURRENT_DATE + COALESCE(p_due_in_days,30) END, CURRENT_DATE,
     CASE WHEN v_status = 'paid' THEN 'Paid at the till' ELSE 'Net ' || COALESCE(p_due_in_days,30) || ' days' END,
     'Generated from POS receipt ' || v_sale.receipt_number,
     CASE WHEN v_status = 'paid' THEN v_sale.created_at ELSE NULL END)
  RETURNING id INTO v_invoice_id;

  UPDATE public.pos_sales SET invoice_id = v_invoice_id WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_number', v_invoice_number,
    'sale_id', p_sale_id, 'status', v_status, 'total_cents', v_sale.total_cents);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Bevisar sig själv — i en subtransaktion som alltid rullas tillbaka.
-- ═══════════════════════════════════════════════════════════════════════════
DO $proof$
DECLARE
  v_prod uuid; v_order uuid; v_oi uuid; v_ret uuid; v_ret2 uuid; v_r jsonb;
  v_reg uuid; v_sess uuid; v_sale jsonb; v_z jsonb; v_inv uuid; v_cn jsonb;
  v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- ── returns ──
    INSERT INTO public.products (name, price_cents, stock_quantity, track_inventory, available_in_pos, is_active)
      VALUES ('proof-item', 50000, 20, true, true, true) RETURNING id INTO v_prod;
    INSERT INTO public.orders (customer_email, status, total_cents, currency)
      VALUES ('proof@example.test', 'paid', 150000, 'SEK') RETURNING id INTO v_order;
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents)
      VALUES (v_order, v_prod, 'proof-item', 3, 50000) RETURNING id INTO v_oi;
    INSERT INTO public.returns (order_id, status, reason) VALUES (v_order, 'requested', 'proof') RETURNING id INTO v_ret;

    BEGIN
      INSERT INTO public.return_items (return_id, product_id, quantity, unit_refund_cents, condition) VALUES (v_ret, v_prod, 10, 90000, 'unopened');
      RAISE EXCEPTION 'proof: a return line beyond the order line was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Return quantity%' THEN RAISE; END IF;
    END;
    BEGIN
      INSERT INTO public.return_items (return_id, product_id, quantity, unit_refund_cents, condition) VALUES (v_ret, v_prod, 1, 90000, 'unopened');
      RAISE EXCEPTION 'proof: a unit refund above the unit price was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'unit_refund_cents%' THEN RAISE; END IF;
    END;
    INSERT INTO public.return_items (return_id, product_id, quantity, condition, restock) VALUES (v_ret, v_prod, 2, 'unopened', false);
    SELECT unit_refund_cents INTO v_n FROM public.return_items WHERE return_id = v_ret;
    IF v_n <> 50000 THEN RAISE EXCEPTION 'proof: unit_refund_cents should default to the unit price, got %', v_n; END IF;
    IF (SELECT suggested_action FROM public.return_items WHERE return_id = v_ret) = 'restock' THEN
      RAISE EXCEPTION 'proof: restock=false still suggested restock';
    END IF;
    -- a second RMA on the same order may take the last unit, not two
    INSERT INTO public.returns (order_id, status, reason) VALUES (v_order, 'requested', 'proof2') RETURNING id INTO v_ret2;
    BEGIN
      INSERT INTO public.return_items (return_id, product_id, quantity, condition) VALUES (v_ret2, v_prod, 2, 'unopened');
      RAISE EXCEPTION 'proof: the order line was returned twice over';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE 'Return quantity%' THEN RAISE; END IF;
    END;
    UPDATE public.returns SET status = 'approved' WHERE id = v_ret;
    v_r := public.refund_return(v_ret, 100000, 'manual', false);
    IF (v_r->>'status') <> 'refunded' THEN RAISE EXCEPTION 'proof: 2 × 50000 should close the RMA, got %', v_r; END IF;

    -- ── credit note ──
    INSERT INTO public.invoices (invoice_number, invoice_type, customer_email, subtotal_cents, tax_cents, total_cents, currency, status, issue_date, due_date)
      VALUES ('PROOF-1', 'invoice', 'proof@example.test', 420000, 105000, 525000, 'SEK', 'sent', CURRENT_DATE, CURRENT_DATE) RETURNING id INTO v_inv;
    v_cn := public.create_credit_note(v_inv, 'proof', 125000);
    IF (v_cn->>'tax_cents')::int <> -25000 THEN RAISE EXCEPTION 'proof: partial credit should carry 25000 VAT, got %', v_cn; END IF;
    v_cn := public.create_credit_note(v_inv, 'proof', NULL);
    IF (v_cn->>'tax_cents')::int <> -80000 OR (v_cn->>'total_cents')::int <> -400000 THEN
      RAISE EXCEPTION 'proof: the rest should reverse the remaining 80000 VAT, got %', v_cn;
    END IF;

    -- ── POS ──
    INSERT INTO public.pos_registers (name, currency, default_tax_rate, active) VALUES ('proof-till', 'SEK', 25, true) RETURNING id INTO v_reg;
    INSERT INTO public.pos_sessions (register_id, cashier_name, status, opening_cash_cents) VALUES (v_reg, 'proof', 'open', 50000) RETURNING id INTO v_sess;
    -- v1: 2 × 10000, line discount 1000, sale discount 500, cash → goods 18500, tax 4625, total 23125; stock moves; payment row
    v_sale := public.record_pos_sale(v_reg, v_sess,
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'product_name', 'proof-item', 'quantity', 2, 'unit_price_cents', 10000, 'discount_cents', 1000)),
      'cash', NULL, 500);
    IF (v_sale->>'subtotal_cents')::int <> 18500 OR (v_sale->>'tax_cents')::int <> 4625 OR (v_sale->>'total_cents')::int <> 23125 THEN
      RAISE EXCEPTION 'proof: v1 totals wrong: %', v_sale;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pos_payments WHERE sale_id = (v_sale->>'sale_id')::uuid AND method = 'cash' AND amount_cents = 23125) THEN
      RAISE EXCEPTION 'proof: v1 wrote no payment row';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.agent_events WHERE event_name = 'stock.movement' AND payload->>'reference_id' = v_sale->>'sale_id') THEN
      RAISE EXCEPTION 'proof: v1 moved no stock';
    END IF;
    -- full refund of a sale with a sale-level discount closes exactly
    v_r := public.refund_pos_sale((v_sale->>'sale_id')::uuid, NULL, 'proof', NULL, v_sess);
    IF (v_r->>'refund_total_cents')::int <> -23125 OR (v_r->>'original_status') <> 'refunded' THEN
      RAISE EXCEPTION 'proof: full refund of a discounted sale did not close on the total: %', v_r;
    END IF;
    -- v2 with change: 30000 cash on a 23125 sale → change 6875 leaves the drawer
    v_sale := public.record_pos_sale_v2(v_reg, v_sess,
      jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 2, 'unit_price_cents', 10000, 'discount_cents', 1000)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount_cents', 30000)), NULL, NULL, 500, '{}'::jsonb);
    IF (v_sale->>'change_cents')::int <> 6875 THEN RAISE EXCEPTION 'proof: change should be 6875: %', v_sale; END IF;
    -- drawer: 50000 + 23125 − 23125 + 30000 − 6875 = 73125
    v_z := public.close_pos_session_v2(v_sess, 73125, NULL);
    IF (v_z->>'expected_cash_cents')::int <> 73125 OR (v_z->>'cash_variance_cents')::int <> 0 THEN
      RAISE EXCEPTION 'proof: drawer count wrong: %', v_z;
    END IF;
    IF (v_z->>'total_sales_cents')::int <> 23125 THEN RAISE EXCEPTION 'proof: net sales should be 23125: %', v_z; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $proof$;
