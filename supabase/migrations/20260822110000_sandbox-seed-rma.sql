-- Nordbrygg AB's returns, seeded by RUNNING them — and putting goods back on
-- the shelf they were actually taken from.
--
-- The third chain. P2P earned the stock, O2C sold it, this brings some of it
-- back. Returns are where the two directions meet, so it is the first chain
-- that can contradict itself: a refund is money leaving against goods arriving,
-- and either half can silently fail to happen.
--
-- Called through the real surface — approve_return, receive_return,
-- inspect_return, refund_return are all RPCs and all get called. return_items
-- are written directly (manage_return_item is an edge skill and cannot be
-- reached from SQL), with the fields the skill would set.
--
-- Sandbox/demo only. Idempotent. See docs/concepts/sandbox-company.md.

CREATE OR REPLACE FUNCTION public.sandbox_seed_rma()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_sandbox boolean;
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

  SELECT COALESCE(
           (SELECT (value #>> '{}')::boolean FROM public.site_settings WHERE key = 'sandbox_mode'),
           (SELECT (value ->> 'enabled')::boolean FROM public.site_settings WHERE key = 'demo_mode'),
           false)
    INTO v_is_sandbox;
  IF NOT COALESCE(v_is_sandbox, false) THEN
    RAISE EXCEPTION 'sandbox_seed_rma refused: this instance is neither a sandbox nor a demo';
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
    'chain', 'return-to-refund',
    'detail', v_report,
    'note', 'Goods that came back are on the shelf again, the money that went out matches the lines minus the fee, and the broken ones stayed off it.');
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.sandbox_seed_rma() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sandbox_seed_rma() FROM anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_rma() TO authenticated, service_role;

COMMENT ON FUNCTION public.sandbox_seed_rma() IS
  'Seeds Nordbrygg AB''s returns on top of the order sandbox_seed_o2c() shipped. Refuses if O2C has not run. Asserts that restocked goods come back, damaged goods do not, and the refund equals lines minus the restocking fee. Sandbox/demo only.';
