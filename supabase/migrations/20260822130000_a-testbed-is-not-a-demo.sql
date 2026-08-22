-- A testbed is a third kind of instance, and it must not be swept.
--
-- The chains (P2P, O2C, RMA) refuse to run unless the instance is a sandbox or
-- a demo. That was right while those were the only two kinds. A long-lived
-- testbed — Nordbrygg AB left standing for weeks so processes that unfold over
-- TIME can be observed and acted on by agents — is neither.
--
-- The trap this closes: the obvious way to make the chains run on a testbed is
-- to set demo_mode.enabled. But demo-cycle keys on exactly that setting, so the
-- instance would be destroyed and rebuilt every night at 03:00 — erasing the
-- accumulated history that is the testbed's entire reason to exist. The one
-- flag that unlocks seeding is also the flag that schedules demolition.
--
-- So: a third value, read by the chains and NOT by demo-cycle. Setting
-- testbed_mode without demo_mode means the chains may seed and the nightly
-- rebuild never touches the instance.
--
-- Why sandbox reset works and a testbed cannot use it:
--
--   sandbox   nightly destroy-and-rebuild · one cycle · "did something break
--             last night?" · visitors welcome
--   testbed   no reset · months · "what happens when an invoice is left to age
--             60 days and nobody touches it?" · agents act
--
-- One reader instead of three copies of the same COALESCE — the same reason
-- resolveSiteUrl exists. A fourth chain will want this guard too, and three
-- divergent copies is how a guard ends up binding to a flag one instance does
-- not set (which is exactly what happened when the first chain bound to
-- sandbox_mode alone and sandbox.flowwink.com carried demo_mode).
--
-- Idempotent, and forward-dated so managed instances actually apply it.

CREATE OR REPLACE FUNCTION public.seed_chain_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN (SELECT (value #>> '{}')::boolean FROM public.site_settings WHERE key = 'sandbox_mode') THEN 'sandbox'
    WHEN (SELECT (value ->> 'enabled')::boolean FROM public.site_settings WHERE key = 'demo_mode') THEN 'demo'
    WHEN (SELECT (value ->> 'enabled')::boolean FROM public.site_settings WHERE key = 'testbed_mode') THEN 'testbed'
    ELSE NULL
  END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.seed_chain_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_chain_mode() TO authenticated, service_role;

COMMENT ON FUNCTION public.seed_chain_mode() IS
  'Which kind of non-production instance this is: sandbox (nightly reset), demo (nightly reset via demo-cycle), testbed (never reset — long-lived, agents act on it), or NULL for a real customer site where the seed chains must refuse. demo-cycle reads demo_mode only, so testbed_mode unlocks seeding without scheduling demolition.';

-- ---------------------------------------------------------------------------
-- The three chains adopt it, and report which kind of instance they ran on
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sandbox_seed_p2p()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_loc_in uuid;
  v_vendor_machines uuid;
  v_vendor_roastery uuid;
  v_vendor_parts uuid;
  v_machine uuid;
  v_beans uuid;
  v_filter uuid;
  v_po_full uuid;
  v_po_partial uuid;
  v_po_awaiting uuid;
  v_line uuid;
  v_bill uuid;
  v_before numeric;
  v_after numeric;
  v_moves_before int;
  v_moves_after int;
  v_report jsonb := '{}'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can seed the sandbox';
  END IF;

  -- Either flag, because the fleet uses both and a guard that binds to the
  -- wrong one is a guard that never binds. sandbox.flowwink.com carries
  -- demo_mode.enabled and NOT sandbox_mode — the nightly rebuild there runs
  -- through demo-cycle, not sandbox_reset_wipe. Checking only the latter would
  -- have made this function unrunnable on the one instance it exists for.
  -- One reader for the three instance kinds (20260822130000). A testbed is
  -- neither a sandbox nor a demo: it is never reset, so demo-cycle — which
  -- keys on demo_mode alone — must never see it.
  v_mode := public.seed_chain_mode();
  IF v_mode IS NULL THEN
    RAISE EXCEPTION '% refused: this instance is not a sandbox, demo or testbed (site_settings.sandbox_mode / demo_mode.enabled / testbed_mode.enabled)', 'sandbox_seed_p2p';
  END IF;

  -- ── 1. The ground ────────────────────────────────────────────────────────
  -- The reset truncates every table outside its KEEP list, and stock_locations
  -- is not on it — so the warehouse layout is gone every morning and goods
  -- receipt refuses with "no active internal destination location". Asserting
  -- it here means the seed cannot run on empty ground, which is exactly the
  -- property that makes the platform-config class disappear.
  PERFORM public.seed_stock_locations();
  SELECT id INTO v_loc_in FROM public.stock_locations
   WHERE location_type = 'internal' AND COALESCE(is_active, true) LIMIT 1;
  IF v_loc_in IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_p2p: no internal stock location after seeding — the ground is broken, not the seed';
  END IF;

  -- ── 2. Master data ───────────────────────────────────────────────────────
  -- Three vendors, deliberately different, so currency, cadence and 3-way match
  -- each have a reason to exist rather than being asserted about.
  INSERT INTO public.vendors (name, email, currency, payment_terms, is_active)
  SELECT 'Caffè Milano S.r.l.', 'ordini@caffemilano.example', 'EUR', 30, true
   WHERE NOT EXISTS (SELECT 1 FROM public.vendors WHERE name = 'Caffè Milano S.r.l.');
  INSERT INTO public.vendors (name, email, currency, payment_terms, is_active)
  SELECT 'Söderberg Rosteri AB', 'order@soderbergrosteri.example', 'SEK', 20, true
   WHERE NOT EXISTS (SELECT 1 FROM public.vendors WHERE name = 'Söderberg Rosteri AB');
  INSERT INTO public.vendors (name, email, currency, payment_terms, is_active)
  SELECT 'Nordic Parts Distribution AB', 'sales@nordicparts.example', 'SEK', 30, true
   WHERE NOT EXISTS (SELECT 1 FROM public.vendors WHERE name = 'Nordic Parts Distribution AB');

  SELECT id INTO v_vendor_machines FROM public.vendors WHERE name = 'Caffè Milano S.r.l.';
  SELECT id INTO v_vendor_roastery FROM public.vendors WHERE name = 'Söderberg Rosteri AB';
  SELECT id INTO v_vendor_parts    FROM public.vendors WHERE name = 'Nordic Parts Distribution AB';

  -- Physical goods. The old catalogue had none, which is why inventory,
  -- picking and returns had never run a single time.
  INSERT INTO public.products (name, description, type, price_cents, currency, is_active, track_inventory, low_stock_threshold)
  SELECT 'Milano Due — espressomaskin, 2 grupper',
         'Halvautomatisk espressomaskin i två grupper. Serienummermärkt, två års garanti.',
         'one_time', 4890000, 'SEK', true, true, 2
   WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name LIKE 'Milano Due%');
  INSERT INTO public.products (name, description, type, price_cents, currency, is_active, track_inventory, low_stock_threshold)
  SELECT 'Söderberg Mörkrost — 1 kg',
         'Mörkrostade bönor för espresso. Levereras veckovis.',
         'one_time', 34900, 'SEK', true, true, 40
   WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name LIKE 'Söderberg Mörkrost%');
  INSERT INTO public.products (name, description, type, price_cents, currency, is_active, track_inventory, low_stock_threshold)
  SELECT 'Vattenfilter FX-200', 'Utbytesfilter, rekommenderat byte var sjätte månad.',
         'one_time', 89900, 'SEK', true, true, 15
   WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name LIKE 'Vattenfilter FX-200%');

  SELECT id INTO v_machine FROM public.products WHERE name LIKE 'Milano Due%';
  SELECT id INTO v_beans   FROM public.products WHERE name LIKE 'Söderberg Mörkrost%';
  SELECT id INTO v_filter  FROM public.products WHERE name LIKE 'Vattenfilter FX-200%';

  -- ── 3. Live P2P: fully received ──────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE notes = 'seed:p2p:full') THEN
    SELECT COALESCE(stock_quantity, 0) INTO v_before FROM public.products WHERE id = v_beans;
    SELECT count(*) INTO v_moves_before FROM public.stock_moves WHERE product_id = v_beans;

    INSERT INTO public.purchase_orders (vendor_id, status, currency, order_date, expected_delivery, notes)
    VALUES (v_vendor_roastery, 'confirmed', 'SEK', current_date - 9, current_date - 7, 'seed:p2p:full')
    RETURNING id INTO v_po_full;
    INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po_full, v_beans, 'Söderberg Mörkrost 1 kg', 120, 18500, 0.25, 120 * 18500)
    RETURNING id INTO v_line;

    PERFORM public.receive_purchase_order(
      v_po_full,
      jsonb_build_array(jsonb_build_object('po_line_id', v_line, 'quantity_received', 120)),
      v_loc_in);

    SELECT COALESCE(stock_quantity, 0) INTO v_after FROM public.products WHERE id = v_beans;
    SELECT count(*) INTO v_moves_after FROM public.stock_moves WHERE product_id = v_beans;

    -- The invariant, asserted where it is cheapest to assert: the receipt said
    -- 120, so the balance moved 120 and the journal grew. A receipt that
    -- returns success while the world stands still is the failure this whole
    -- exercise exists to catch.
    IF (v_after - v_before) <> 120 THEN
      RAISE EXCEPTION 'sandbox_seed_p2p: received 120 but balance moved % (from % to %)',
        (v_after - v_before), v_before, v_after;
    END IF;
    IF v_moves_after <= v_moves_before THEN
      RAISE EXCEPTION 'sandbox_seed_p2p: balance moved but no stock_move was written';
    END IF;

    v_report := v_report || jsonb_build_object('po_full', jsonb_build_object(
      'received', 120, 'balance_before', v_before, 'balance_after', v_after));
  END IF;

  -- ── 4. Live P2P: partially received, backorder standing ──────────────────
  -- Odoo calls the remainder a backorder. The middles are where the bugs live,
  -- so the seed leaves one standing on purpose.
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE notes = 'seed:p2p:partial') THEN
    INSERT INTO public.purchase_orders (vendor_id, status, currency, order_date, expected_delivery, notes)
    VALUES (v_vendor_parts, 'confirmed', 'SEK', current_date - 5, current_date - 2, 'seed:p2p:partial')
    RETURNING id INTO v_po_partial;
    INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po_partial, v_filter, 'Vattenfilter FX-200', 40, 42000, 0.25, 40 * 42000)
    RETURNING id INTO v_line;

    PERFORM public.receive_purchase_order(
      v_po_partial,
      jsonb_build_array(jsonb_build_object('po_line_id', v_line, 'quantity_received', 25)),
      v_loc_in);

    IF (SELECT status FROM public.purchase_orders WHERE id = v_po_partial) <> 'partially_received' THEN
      RAISE EXCEPTION 'sandbox_seed_p2p: 25 of 40 received but PO status is %, expected partially_received',
        (SELECT status FROM public.purchase_orders WHERE id = v_po_partial);
    END IF;

    v_report := v_report || jsonb_build_object('po_partial',
      jsonb_build_object('ordered', 40, 'received', 25, 'backorder', 15));
  END IF;

  -- ── 5. In flight: confirmed, awaiting delivery ───────────────────────────
  -- The long-lead-time import. An agent arriving to work has something to
  -- follow up.
  IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE notes = 'seed:p2p:awaiting') THEN
    INSERT INTO public.purchase_orders (vendor_id, status, currency, order_date, expected_delivery, notes)
    VALUES (v_vendor_machines, 'confirmed', 'EUR', current_date - 12, current_date + 9, 'seed:p2p:awaiting')
    RETURNING id INTO v_po_awaiting;
    INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
    VALUES (v_po_awaiting, v_machine, 'Milano Due, 2 grupper', 2, 285000, 0.25, 2 * 285000);

    v_report := v_report || jsonb_build_object('po_awaiting',
      jsonb_build_object('vendor', 'Caffè Milano S.r.l.', 'currency', 'EUR', 'due_in_days', 9));
  END IF;

  -- ── 6. Vendor bill awaiting 3-way match ──────────────────────────────────
  IF v_po_full IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendor_invoices WHERE notes = 'seed:p2p:bill') THEN
    INSERT INTO public.vendor_invoices (
      invoice_number, vendor_id, purchase_order_id, invoice_date, due_date,
      subtotal_cents, tax_cents, total_cents, currency, status, notes)
    VALUES ('SR-2026-0413', v_vendor_roastery, v_po_full, current_date - 6, current_date + 14,
            120 * 18500, (120 * 18500 * 0.25)::bigint, (120 * 18500 * 1.25)::bigint,
            'SEK', 'received', 'seed:p2p:bill')
    RETURNING id INTO v_bill;
    v_report := v_report || jsonb_build_object('vendor_bill', 'SR-2026-0413');
  END IF;

  RETURN jsonb_build_object(
    'seeded', true,
    'instance_kind', v_mode,
    'chain', 'procure-to-pay',
    'detail', v_report,
    'note', 'Stock in this instance is earned: every unit arrived on a goods receipt that ran.');
END; $function$;

CREATE OR REPLACE FUNCTION public.sandbox_seed_o2c()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
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

  -- One reader for the three instance kinds (20260822130000). A testbed is
  -- neither a sandbox nor a demo: it is never reset, so demo-cycle — which
  -- keys on demo_mode alone — must never see it.
  v_mode := public.seed_chain_mode();
  IF v_mode IS NULL THEN
    RAISE EXCEPTION '% refused: this instance is not a sandbox, demo or testbed (site_settings.sandbox_mode / demo_mode.enabled / testbed_mode.enabled)', 'sandbox_seed_o2c';
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
    'instance_kind', v_mode,
    'chain', 'order-to-cash',
    'detail', v_report,
    'note', 'Every order carries its quote, every invoice carries its order, and the stock it shipped was earned.');
END; $function$;

CREATE OR REPLACE FUNCTION public.sandbox_seed_rma()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_beans uuid;
  v_beans_name text;
  v_loc uuid;
  v_order uuid;
  v_order_item uuid;
  v_rma uuid;
  v_line uuid;
  v_refund1 jsonb;
  v_refund2 jsonb;
  v_mirror_before numeric;
  v_mirror_after numeric;
  v_quant_before numeric;
  v_quant_after numeric;
  v_qty int := 5;
  v_unit bigint := 34900;
  v_fee bigint := 2000;
  v_expected bigint;
  v_first bigint := 100000;
  v_valued_qty numeric;
  v_valued_cents numeric;
  v_layer_cost bigint;
  v_report jsonb := '{}'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can seed the sandbox';
  END IF;

  -- One reader for the three instance kinds (20260822130000). A testbed is
  -- neither a sandbox nor a demo: it is never reset, so demo-cycle — which
  -- keys on demo_mode alone — must never see it.
  v_mode := public.seed_chain_mode();
  IF v_mode IS NULL THEN
    RAISE EXCEPTION '% refused: this instance is not a sandbox, demo or testbed (site_settings.sandbox_mode / demo_mode.enabled / testbed_mode.enabled)', 'sandbox_seed_rma';
  END IF;

  -- A return needs something that was sold. Refusing beats inventing an RMA
  -- against an order that never existed — that is the scenery this replaces.
  SELECT o.id INTO v_order
    FROM public.orders o
   WHERE o.quote_id IS NOT NULL AND o.metadata ->> 'seed' = 'o2c:order'
   LIMIT 1;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'sandbox_seed_rma: run sandbox_seed_o2c() first — there is no order to return against';
  END IF;

  SELECT oi.id, oi.product_id INTO v_order_item, v_beans
    FROM public.order_items oi WHERE oi.order_id = v_order LIMIT 1;
  SELECT name INTO v_beans_name FROM public.products WHERE id = v_beans;

  SELECT id INTO v_loc FROM public.stock_locations
   WHERE code = 'WH/MAIN' AND COALESCE(is_active, true) LIMIT 1;
  IF v_loc IS NULL THEN
    SELECT id INTO v_loc FROM public.stock_locations
     WHERE location_type = 'internal' AND COALESCE(is_active, true) LIMIT 1;
  END IF;

  -- ── 1. The RMA that went all the way: goods back, money out ──────────────
  IF NOT EXISTS (SELECT 1 FROM public.returns WHERE internal_notes LIKE 'seed:rma:full%') THEN
    SELECT COALESCE(stock_quantity, 0) INTO v_mirror_before FROM public.products WHERE id = v_beans;
    SELECT COALESCE(quantity, 0) INTO v_quant_before
      FROM public.stock_quants WHERE product_id = v_beans AND location_id = v_loc AND lot_id IS NULL;

    INSERT INTO public.returns (order_id, status, reason, reason_code, customer_notes, internal_notes)
    VALUES (v_order, 'requested', 'Beställde för mycket till konferensveckan',
            'changed_mind', 'Oöppnade påsar, ligger kvar i originalkartongen.',
            'seed:rma:full')
    RETURNING id INTO v_rma;

    -- condition drives suggested_action via trg_return_item_action:
    -- 'unopened' → 'restock'. `restock` is the field receive_return actually
    -- reads, so it is set here, where the line is created.
    INSERT INTO public.return_items (
      return_id, order_item_id, product_id, quantity, unit_refund_cents, condition, restock, notes)
    VALUES (v_rma, v_order_item, v_beans, v_qty, v_unit, 'unopened', true,
            'Obruten försegling, bäst före 2027-03.')
    RETURNING id INTO v_line;

    PERFORM public.approve_return(v_rma, 'Inom 14 dagar, oöppnat — godkänt.');

    -- Receiving is what books the goods back in: it emits a stock.movement
    -- event whose trigger mirrors products.stock_quantity AND the quant.
    PERFORM public.receive_return(v_rma);

    SELECT COALESCE(stock_quantity, 0) INTO v_mirror_after FROM public.products WHERE id = v_beans;
    SELECT COALESCE(quantity, 0) INTO v_quant_after
      FROM public.stock_quants WHERE product_id = v_beans AND location_id = v_loc AND lot_id IS NULL;

    -- Goods came back. An RMA that refunds without restocking is a warehouse
    -- that pays for coffee it never got — the mirror image of the picking
    -- chain that shipped without deducting.
    IF (COALESCE(v_mirror_after, 0) - v_mirror_before) <> v_qty THEN
      RAISE EXCEPTION 'sandbox_seed_rma: products.stock_quantity moved by % on a % unit return (% → %)',
        COALESCE(v_mirror_after, 0) - v_mirror_before, v_qty, v_mirror_before, v_mirror_after;
    END IF;
    IF (COALESCE(v_quant_after, 0) - v_quant_before) <> v_qty THEN
      RAISE EXCEPTION 'sandbox_seed_rma: the quant moved by % on a % unit return (% → %)',
        COALESCE(v_quant_after, 0) - v_quant_before, v_qty, v_quant_before, v_quant_after;
    END IF;
    -- And the two still agree, as they must after any physical movement.
    IF COALESCE(v_quant_after, 0) <> COALESCE(v_mirror_after, 0) THEN
      RAISE EXCEPTION 'sandbox_seed_rma: stock_quants says % and products.stock_quantity says %',
        v_quant_after, v_mirror_after;
    END IF;

    -- Goods that came back must come back at a COST, not just as a count.
    -- Before 20260822105000 this layer was booked at zero: the shelf held 95 kg
    -- and the books valued 90. Selling those 5 kg would then have posted a COGS
    -- of nothing and overstated the margin by the whole cost.
    SELECT l.unit_cost_cents INTO v_layer_cost
      FROM public.stock_valuation_layers l
      JOIN public.stock_moves m ON m.id = l.move_id
     WHERE l.product_id = v_beans AND m.notes = 'rma_restock'
     ORDER BY l.created_at DESC LIMIT 1;
    IF COALESCE(v_layer_cost, 0) <= 0 THEN
      RAISE EXCEPTION 'sandbox_seed_rma: % kg came back valued at % — zero is not a cost',
        v_qty, COALESCE(v_layer_cost, 0);
    END IF;

    -- The whole point, stated once: every unit on the shelf is a unit in the
    -- books. A quantity the valuation does not know about is stock that shows
    -- up in the warehouse and vanishes from the balance sheet.
    SELECT COALESCE(SUM(remaining_qty), 0), COALESCE(SUM(remaining_qty * unit_cost_cents), 0)
      INTO v_valued_qty, v_valued_cents
      FROM public.stock_valuation_layers WHERE product_id = v_beans;
    IF v_valued_qty <> COALESCE(v_mirror_after, 0) THEN
      RAISE EXCEPTION 'sandbox_seed_rma: % units on hand but % valued', v_mirror_after, v_valued_qty;
    END IF;

    -- QC sets the restocking fee. Only valid in status 'received'.
    PERFORM public.inspect_return(v_rma, 'Fem påsar, obrutna. 2 % hanteringsavgift.', v_fee);

    -- The payout, in two calls, because the platform supports partial refunds
    -- and a seed that only ever pays in one go never exercises the running
    -- total or its ceiling.
    v_expected := v_qty * v_unit - v_fee;
    v_refund1 := public.refund_return(v_rma, v_first::int, 'bank_transfer', false);
    IF (v_refund1 ->> 'status') = 'refunded' THEN
      RAISE EXCEPTION 'sandbox_seed_rma: a partial refund of % closed an RMA expecting %', v_first, v_expected;
    END IF;
    v_refund2 := public.refund_return(v_rma, (v_expected - v_first)::int, 'bank_transfer', true);

    IF (SELECT refund_amount_cents FROM public.returns WHERE id = v_rma) <> v_expected THEN
      RAISE EXCEPTION 'sandbox_seed_rma: refunded % but expected % (% lines − % fee)',
        (SELECT refund_amount_cents FROM public.returns WHERE id = v_rma),
        v_expected, v_qty * v_unit, v_fee;
    END IF;
    IF (SELECT status FROM public.returns WHERE id = v_rma) <> 'refunded' THEN
      RAISE EXCEPTION 'sandbox_seed_rma: RMA paid in full but status is %',
        (SELECT status FROM public.returns WHERE id = v_rma);
    END IF;

    v_report := v_report || jsonb_build_object('full', jsonb_build_object(
      'rma', (SELECT rma_number FROM public.returns WHERE id = v_rma),
      'qty', v_qty,
      'stock_before', v_mirror_before, 'stock_after', v_mirror_after,
      'quant_before', v_quant_before, 'quant_after', v_quant_after,
      'gross_cents', v_qty * v_unit, 'fee_cents', v_fee,
      'refunded_cents', v_expected,
      'restocked_at_cost_cents', v_layer_cost,
      'inventory_valued_qty', v_valued_qty,
      'inventory_value_cents', v_valued_cents,
      'refunds', jsonb_build_array(v_refund1, v_refund2)));
  END IF;

  -- ── 2. Damaged in transit: received, and deliberately NOT restocked ──────
  IF NOT EXISTS (SELECT 1 FROM public.returns WHERE internal_notes LIKE 'seed:rma:damaged%') THEN
    SELECT COALESCE(stock_quantity, 0) INTO v_mirror_before FROM public.products WHERE id = v_beans;

    INSERT INTO public.returns (order_id, status, reason, reason_code, customer_notes, internal_notes)
    VALUES (v_order, 'requested', 'Två påsar spruckna vid leverans',
            'damaged_in_transit', 'Kartongen var blöt när den kom.',
            'seed:rma:damaged')
    RETURNING id INTO v_rma;

    -- 'damaged' → suggested_action 'rtv'. restock stays false: goods that came
    -- back broken must not reappear as sellable stock. This is the half of the
    -- flow an assertion is worth on — a restock that fires when it should not
    -- is as wrong as one that does not fire when it should.
    INSERT INTO public.return_items (
      return_id, order_item_id, product_id, quantity, unit_refund_cents, condition, restock, notes)
    VALUES (v_rma, v_order_item, v_beans, 2, v_unit, 'damaged', false,
            'Fuktskadade, reklameras mot transportör.');

    PERFORM public.approve_return(v_rma, 'Transportskada — ersätts, varan skrotas.');
    PERFORM public.receive_return(v_rma);

    SELECT COALESCE(stock_quantity, 0) INTO v_mirror_after FROM public.products WHERE id = v_beans;
    IF COALESCE(v_mirror_after, 0) <> v_mirror_before THEN
      RAISE EXCEPTION 'sandbox_seed_rma: damaged goods were booked back in (% → %)',
        v_mirror_before, v_mirror_after;
    END IF;

    -- Parked at 'received', un-inspected on purpose: this is the RMA that has
    -- work waiting for a human, and the state an empty demo never shows.
    v_report := v_report || jsonb_build_object('damaged', jsonb_build_object(
      'rma', (SELECT rma_number FROM public.returns WHERE id = v_rma),
      'qty', 2, 'restocked', false, 'awaiting', 'inspection',
      'stock_unchanged_at', v_mirror_after));
  END IF;

  -- ── 3. In flight: requested, waiting for someone to approve it ───────────
  IF NOT EXISTS (SELECT 1 FROM public.returns WHERE internal_notes LIKE 'seed:rma:open%') THEN
    INSERT INTO public.returns (order_id, status, reason, reason_code, customer_notes, internal_notes)
    VALUES (v_order, 'requested', 'Fel malningsgrad — ville ha bryggmalet',
            'wrong_item', 'Kan jag byta mot bryggmalet i stället?', 'seed:rma:open')
    RETURNING id INTO v_rma;

    INSERT INTO public.return_items (
      return_id, order_item_id, product_id, quantity, unit_refund_cents, condition, restock)
    VALUES (v_rma, v_order_item, v_beans, 1, v_unit, 'unopened', true);

    v_report := v_report || jsonb_build_object('open', jsonb_build_object(
      'rma', (SELECT rma_number FROM public.returns WHERE id = v_rma),
      'qty', 1, 'awaiting', 'approval'));
  END IF;

  RETURN jsonb_build_object(
    'seeded', true,
    'instance_kind', v_mode,
    'chain', 'return-to-refund',
    'detail', v_report,
    'note', 'Goods that came back are on the shelf again, the money that went out matches the lines minus the fee, and the broken ones stayed off it.');
END; $function$;
