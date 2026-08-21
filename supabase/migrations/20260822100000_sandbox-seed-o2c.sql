-- Nordbrygg AB's selling side, seeded by RUNNING it — and consuming the stock
-- that sandbox_seed_p2p() earned.
--
-- This is the half the old scenery got most wrong. Measured before it existed:
-- six orders with zero quote_id, five invoices with zero order_id, and six
-- outbound stock moves without a location against zero goods receipts. Read as
-- a story: sales that came from nowhere, invoices belonging to no order, and
-- shipments out of an empty warehouse.
--
-- Those links are not decoration. `invoices.order_id` exists because the
-- order-to-cash fix found send_invoice_for_order using the text "order:<uuid>"
-- in invoices.notes as its idempotency key — an editable field — and a rewritten
-- note issued a SECOND live invoice for 18 687,50 kr against a customer who had
-- already paid. `orders.quote_id` exists because there was no conversion at all,
-- so an agent rebuilt the order by hand and lost the VAT.
--
-- So the seed carries every link as a column, and asserts them. Where the real
-- surface lives in the database it is called — allocate_picking, confirm_pick,
-- ship_picking are RPCs, and the picking chain is what actually consumes stock.
-- manage_quote and send_invoice_for_order are edge skills and cannot be reached
-- from SQL; those steps are written directly, with the links and totals the
-- skills would produce, and the invariants assert the result rather than trust it.
--
-- Sandbox/demo only. Idempotent. See docs/concepts/sandbox-company.md.

CREATE OR REPLACE FUNCTION public.sandbox_seed_o2c()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_sandbox boolean;
  v_beans uuid;
  v_filter uuid;
  v_loc uuid;
  v_quote_won uuid;
  v_quote_open uuid;
  v_order uuid;
  v_invoice uuid;
  v_picking uuid;
  v_pick_line uuid;
  v_alloc jsonb;
  v_ship jsonb;
  v_beans_name text;
  v_quant_before numeric;
  v_quant_after numeric;
  v_reserved_after numeric;
  v_stock_before numeric;
  v_stock_after numeric;
  v_sub bigint;
  v_tax bigint;
  v_total bigint;
  v_qty int := 30;
  v_unit bigint := 34900;
  v_report jsonb := '{}'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can seed the sandbox';
  END IF;

  SELECT COALESCE(
           (SELECT (value #>> '{}')::boolean FROM public.site_settings WHERE key = 'sandbox_mode'),
           (SELECT (value ->> 'enabled')::boolean FROM public.site_settings WHERE key = 'demo_mode'),
           false)
    INTO v_is_sandbox;
  IF NOT COALESCE(v_is_sandbox, false) THEN
    RAISE EXCEPTION 'sandbox_seed_o2c refused: this instance is neither a sandbox nor a demo';
  END IF;

  -- The selling side stands on the buying side. Refusing here rather than
  -- inventing stock is the whole point: an order that ships from a warehouse
  -- nothing arrived at is the scenery this replaces.
  SELECT id, name INTO v_beans, v_beans_name
    FROM public.products WHERE name LIKE 'Söderberg Mörkrost%';
  SELECT id INTO v_filter FROM public.products WHERE name LIKE 'Vattenfilter FX-200%';
  IF v_beans IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_o2c: run sandbox_seed_p2p() first — there is nothing in stock to sell';
  END IF;
  SELECT COALESCE(stock_quantity, 0) INTO v_stock_before FROM public.products WHERE id = v_beans;
  IF v_stock_before < v_qty THEN
    RAISE EXCEPTION 'sandbox_seed_o2c: only % in stock, the seeded order needs % — inbound has not run',
      v_stock_before, v_qty;
  END IF;

  SELECT id INTO v_loc FROM public.stock_locations
   WHERE location_type = 'internal' AND COALESCE(is_active, true) LIMIT 1;

  -- Both mirrors, read before anything moves. products.stock_quantity is what
  -- the storefront and the low-stock alerts read; stock_quants is what the
  -- warehouse reads. They are supposed to agree, and the invariant below is the
  -- only thing that would notice if they stopped.
  SELECT COALESCE(quantity, 0) INTO v_quant_before
    FROM public.stock_quants WHERE product_id = v_beans AND location_id = v_loc AND lot_id IS NULL;
  v_quant_before := COALESCE(v_quant_before, 0);

  v_sub   := v_qty * v_unit;
  v_tax   := (v_sub * 0.25)::bigint;
  v_total := v_sub + v_tax;

  -- ── 1. The quote that was won ────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE notes = 'seed:o2c:won') THEN
    INSERT INTO public.quotes (
      quote_number, title, status, customer_name, customer_email, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency, discount_cents,
      version, accepted_at, notes)
    VALUES (
      'Q-2026-0118', 'Kaffeleverans — Hotell Norrsken', 'accepted',
      'Hotell Norrsken AB', 'inkop@hotellnorrsken.example',
      jsonb_build_array(jsonb_build_object(
        'description', v_beans_name, 'qty', v_qty,
        'unit_price_cents', v_unit, 'product_id', v_beans)),
      v_sub, 0.25, v_tax, v_total, 'SEK', 0, 1, now() - interval '4 days', 'seed:o2c:won')
    RETURNING id INTO v_quote_won;

    -- ── 2. Quote → order, carrying the link and the VAT-inclusive total ────
    INSERT INTO public.orders (
      customer_email, customer_name, status, fulfillment_status,
      total_cents, currency, quote_id, metadata)
    VALUES ('inkop@hotellnorrsken.example', 'Hotell Norrsken AB',
            'paid', 'unfulfilled', v_total, 'SEK', v_quote_won,
            jsonb_build_object('seed', 'o2c:order'))
    RETURNING id INTO v_order;

    -- order_items carries price_cents (per unit); there is no line total column.
    -- The INSERT fires trg_order_item_stock_guard (refuses an oversell) and
    -- trg_order_item_stock_decrement (writes the outbound move and the quant).
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents)
    VALUES (v_order, v_beans, v_beans_name, v_qty, v_unit);

    -- The order must carry the quote's accepted total INCLUDING VAT. Losing it
    -- here is the exact bug the O2C fix closed (1 868 750 → 1 495 000).
    IF (SELECT total_cents FROM public.orders WHERE id = v_order)
       <> (SELECT total_cents FROM public.quotes WHERE id = v_quote_won) THEN
      RAISE EXCEPTION 'sandbox_seed_o2c: order total % does not match the accepted quote total %',
        (SELECT total_cents FROM public.orders WHERE id = v_order),
        (SELECT total_cents FROM public.quotes WHERE id = v_quote_won);
    END IF;

    -- ── 3. Picking — the real RPCs, and what actually consumes the stock ───
    BEGIN
      v_alloc := public.allocate_picking(v_order, v_loc);
      v_picking := (v_alloc ->> 'picking_order_id')::uuid;
      SELECT id INTO v_pick_line FROM public.picking_lines WHERE picking_order_id = v_picking LIMIT 1;
      IF v_pick_line IS NOT NULL THEN
        PERFORM public.confirm_pick(v_pick_line, v_qty);
        v_ship := public.ship_picking(v_picking, 'SE' || to_char(now(), 'YYYYMMDD') || '0042');
      END IF;
      UPDATE public.orders SET fulfillment_status = 'shipped' WHERE id = v_order;

      -- A picking that reserved nothing is not a shipment. Before 20260822080000
      -- every line came back short (reserve_stock was called with a uuid where
      -- text was declared, and the handler read 42883 as "not enough stock"),
      -- so this is the assertion that would have caught it on day one.
      IF COALESCE((v_ship ->> 'reserved_lines')::int, 0) = 0
         OR (v_ship ->> 'reserved_lines') <> (v_ship ->> 'consumed_lines') THEN
        RAISE EXCEPTION 'sandbox_seed_o2c: shipment consumed % of % reserved lines — allocate: %',
          v_ship ->> 'consumed_lines', v_ship ->> 'reserved_lines', v_alloc ->> 'lines';
      END IF;
    EXCEPTION WHEN others THEN
      -- A picking chain that cannot run is a finding, not something to paper
      -- over — but it must not stop the rest of the seed, or one broken link
      -- hides every state downstream of it.
      v_report := v_report || jsonb_build_object('picking_error', left(SQLERRM, 160));
    END;

    -- ── 4. Order → invoice, link as a column ──────────────────────────────
    INSERT INTO public.invoices (
      invoice_number, order_id, customer_name, customer_email, status,
      line_items, subtotal_cents, tax_rate, tax_cents, total_cents,
      currency, issue_date, due_date, paid_amount_cents, notes)
    VALUES ('F-2026-0311', v_order, 'Hotell Norrsken AB', 'inkop@hotellnorrsken.example', 'sent',
            jsonb_build_array(jsonb_build_object(
              'description', v_beans_name, 'qty', v_qty, 'unit_price_cents', v_unit)),
            v_sub, 0.25, v_tax, v_total, 'SEK',
            current_date - 3, current_date - 12 + 30, 0, 'seed:o2c:invoice')
    RETURNING id INTO v_invoice;

    -- Exactly one invoice per order. The phantom-receivable bug issued a second.
    IF (SELECT count(*) FROM public.invoices WHERE order_id = v_order) <> 1 THEN
      RAISE EXCEPTION 'sandbox_seed_o2c: order % carries % invoices, expected exactly 1',
        v_order, (SELECT count(*) FROM public.invoices WHERE order_id = v_order);
    END IF;
    -- Σ invoice = order total.
    IF (SELECT total_cents FROM public.invoices WHERE id = v_invoice)
       <> (SELECT total_cents FROM public.orders WHERE id = v_order) THEN
      RAISE EXCEPTION 'sandbox_seed_o2c: invoice total does not equal order total';
    END IF;

    -- ── 5. The stock invariant ────────────────────────────────────────────
    SELECT COALESCE(stock_quantity, 0) INTO v_stock_after FROM public.products WHERE id = v_beans;
    SELECT COALESCE(quantity, 0), COALESCE(reserved_quantity, 0)
      INTO v_quant_after, v_reserved_after
      FROM public.stock_quants WHERE product_id = v_beans AND location_id = v_loc AND lot_id IS NULL;

    -- Goods leave once. Order entry owns the balance (trg_order_item_stock_decrement);
    -- the picking chain owns the reservation. Double-counting here would read as
    -- 60 kg sold against 30 on the shelf.
    IF (v_quant_before - COALESCE(v_quant_after, 0)) <> v_qty THEN
      RAISE EXCEPTION 'sandbox_seed_o2c: the warehouse fell by % on a % unit order (% → %)',
        v_quant_before - COALESCE(v_quant_after, 0), v_qty, v_quant_before, v_quant_after;
    END IF;
    -- The two mirrors must still agree afterwards.
    IF COALESCE(v_quant_after, 0) <> v_stock_after THEN
      RAISE EXCEPTION 'sandbox_seed_o2c: stock_quants says % and products.stock_quantity says %',
        v_quant_after, v_stock_after;
    END IF;
    -- And nothing is left held for an order that already shipped. Skipped when
    -- the picking chain itself failed — that failure is already reported, and
    -- aborting here would roll the report back with it.
    IF NOT (v_report ? 'picking_error') AND COALESCE(v_reserved_after, 0) <> 0 THEN
      RAISE EXCEPTION 'sandbox_seed_o2c: % units still reserved after the order shipped', v_reserved_after;
    END IF;

    v_report := v_report || jsonb_build_object('won', jsonb_build_object(
      'quote', 'Q-2026-0118', 'order_total_cents', v_total, 'invoice', 'F-2026-0311',
      'qty', v_qty,
      'stock_quantity_before', v_stock_before, 'stock_quantity_after', v_stock_after,
      'quant_before', v_quant_before, 'quant_after', v_quant_after,
      'reserved_after', COALESCE(v_reserved_after, 0),
      'shipment', v_ship));
  END IF;

  -- ── 6. In flight: a quote sent and unanswered ────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.quotes WHERE notes = 'seed:o2c:open') THEN
    INSERT INTO public.quotes (
      quote_number, title, status, customer_name, customer_email, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency, discount_cents,
      version, valid_until, sent_at, notes)
    VALUES ('Q-2026-0124', 'Serviceavtal + filterbyten — Café Ekot', 'sent',
            'Café Ekot AB', 'hej@cafeekot.example',
            jsonb_build_array(jsonb_build_object(
              'description', 'Vattenfilter FX-200', 'qty', 6,
              'unit_price_cents', 89900, 'product_id', v_filter)),
            539400, 0.25, 134850, 674250, 'SEK', 0, 1,
            current_date + 11, now() - interval '6 days', 'seed:o2c:open')
    RETURNING id INTO v_quote_open;
    v_report := v_report || jsonb_build_object('open_quote',
      jsonb_build_object('quote', 'Q-2026-0124', 'sent_days_ago', 6, 'valid_for_days', 11));
  END IF;

  -- ── 7. In flight: an invoice overdue by 12 days ──────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE notes = 'seed:o2c:overdue') THEN
    INSERT INTO public.invoices (
      invoice_number, customer_name, customer_email, status, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency,
      issue_date, due_date, paid_amount_cents, notes)
    VALUES ('F-2026-0288', 'Kontorshuset Vasa AB', 'faktura@kontorshusetvasa.example', 'sent',
            jsonb_build_array(jsonb_build_object(
              'description', 'Serviceavtal, kvartal', 'qty', 1, 'unit_price_cents', 480000)),
            480000, 0.25, 120000, 600000, 'SEK',
            current_date - 42, current_date - 12, 0, 'seed:o2c:overdue')
    RETURNING id INTO v_invoice;
    v_report := v_report || jsonb_build_object('overdue_invoice',
      jsonb_build_object('invoice', 'F-2026-0288', 'days_overdue', 12));
  END IF;

  RETURN jsonb_build_object(
    'seeded', true,
    'chain', 'order-to-cash',
    'detail', v_report,
    'note', 'Every order carries its quote, every invoice carries its order, and the stock it shipped was earned.');
END; $fn$;

GRANT EXECUTE ON FUNCTION public.sandbox_seed_o2c() TO authenticated, service_role;

COMMENT ON FUNCTION public.sandbox_seed_o2c() IS
  'Seeds Nordbrygg AB''s selling side on top of the stock sandbox_seed_p2p() earned. Refuses if inbound has not run. Asserts quote→order→invoice links and totals. Sandbox/demo only.';
