-- The inspector's restock decision now does something.
--
-- `return_items` carried three fields for one decision:
--
--   restock (bool)     set when the LINE IS CREATED, from the customer's own
--                      return request — before anyone has looked at the goods.
--                      The only field receive_return ever read.
--   suggested_action   computed from `condition` by a trigger. Read by nothing.
--   chosen_action      set by set_return_item_action — the inspector's RPC.
--                      Read by NOTHING in the database. Its entire effect was a
--                      dropdown and a toast saying "Item action: restock".
--
-- So an inspector chose "restock", got a green confirmation, and the goods were
-- never booked in. And the sequence made it unfixable by wiring alone:
--
--   receive_return   booked in restock = true          ← the only moment anything happened
--   inspect_return   requires status 'received', so AFTER   ← where the decision is made
--
-- The decision was made after the only moment that acted on it.
--
-- ── What changes ──────────────────────────────────────────────────────────
-- Receiving stops booking stock. INSPECTION books it, which is Odoo's order and
-- the one that matches reality: you do not know whether goods are sellable until
-- you have looked at them.
--
-- The disposition is COALESCE(chosen_action, suggested_action). suggested_action
-- is already derived from `condition` by trg_return_item_action ('unopened' →
-- restock, 'damaged' → rtv), so an operator who never calls
-- set_return_item_action still gets sensible automatic behaviour at inspection —
-- this does not require anyone to start clicking a dropdown.
--
-- ── The behaviour change, stated plainly ─────────────────────────────────
-- An RMA that is received and refunded WITHOUT being inspected no longer books
-- its goods back in. That is a real change. It is also the honest one: before,
-- damaged goods a customer described as "unopened" went straight back onto the
-- sellable shelf with nobody having looked. Un-booked lines are findable —
-- see the view at the bottom — where silently-wrong stock was not.
--
-- ── restocked_at: booking exactly once ────────────────────────────────────
-- Nothing could previously say whether a line had been booked in. With the
-- decision movable (an inspector can change their mind, or set the action after
-- inspecting), exactly-once needs a marker, and reversal needs to know there is
-- something to reverse.
--
-- Idempotent, and forward-dated so managed instances actually apply it.

ALTER TABLE public.return_items
  ADD COLUMN IF NOT EXISTS restocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS restocked_qty numeric;

COMMENT ON COLUMN public.return_items.restocked_at IS
  'When this line was booked back into stock, by inspect_return or set_return_item_action. NULL means the goods are physically back but not yet in inventory — normal between receiving and inspection.';
COMMENT ON COLUMN public.return_items.restock IS
  'The CUSTOMER''S claim at request time, kept as the pre-inspection hint. It is not the disposition: that is COALESCE(chosen_action, suggested_action), decided at inspection.';

-- ---------------------------------------------------------------------------
-- One writer for the movement, so booking and reversing cannot drift apart
-- ---------------------------------------------------------------------------
-- p_direction +1 books goods in, -1 takes them back out (an inspector who
-- restocked a line and then condemned it must not leave the warehouse holding
-- goods it has decided to scrap).
--
-- The event shape is the one handle_stock_movement_event already understands,
-- and apply_stock_movement_event mirrors products.stock_quantity AND the quant
-- and writes the stock_move. Emitting rather than writing directly keeps this on
-- the same path as every other stock movement in the platform.
CREATE OR REPLACE FUNCTION public.apply_return_line_stock(p_item_id uuid, p_direction int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_item public.return_items%ROWTYPE;
  v_qty numeric;
BEGIN
  IF p_direction NOT IN (1, -1) THEN
    RAISE EXCEPTION 'apply_return_line_stock: direction must be 1 or -1, got %', p_direction;
  END IF;

  SELECT * INTO v_item FROM public.return_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return item % not found', p_item_id; END IF;
  IF v_item.product_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'line has no product');
  END IF;

  IF p_direction = 1 THEN
    IF v_item.restocked_at IS NOT NULL THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'already restocked',
                                'restocked_at', v_item.restocked_at);
    END IF;
    v_qty := COALESCE(v_item.quantity, 0);
  ELSE
    IF v_item.restocked_at IS NULL THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'was never restocked');
    END IF;
    -- Reverse exactly what was booked, not what the line says now.
    v_qty := COALESCE(v_item.restocked_qty, v_item.quantity, 0);
  END IF;

  IF v_qty <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'zero quantity');
  END IF;

  INSERT INTO public.agent_events (event_name, payload, source)
  VALUES ('stock.movement',
          jsonb_build_object('lines', jsonb_build_array(jsonb_build_object(
            'product_id', v_item.product_id,
            'qty', p_direction * v_qty,
            'reason', CASE WHEN p_direction = 1 THEN 'rma_restock' ELSE 'rma_restock_reversed' END,
            'reference_id', v_item.return_id::text))),
          'returns');

  UPDATE public.return_items
     SET restocked_at  = CASE WHEN p_direction = 1 THEN now() ELSE NULL END,
         restocked_qty = CASE WHEN p_direction = 1 THEN v_qty ELSE NULL END
   WHERE id = p_item_id;

  RETURN jsonb_build_object('booked', true, 'direction', p_direction, 'qty', v_qty);
END; $fn$;

-- ---------------------------------------------------------------------------
-- receive_return: the goods arrive. Nothing is booked yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receive_return(p_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lines int;
BEGIN
  UPDATE public.returns SET status = 'received', received_at = now()
   WHERE id = p_return_id AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Return must be approved before receiving'; END IF;

  SELECT count(*) INTO v_lines FROM public.return_items WHERE return_id = p_return_id;

  -- No stock movement here any more. The goods are on the receiving bench, not
  -- on the sellable shelf, and which one they belong on is what inspection is
  -- for. (Until 20260822140000 this booked in every line the CUSTOMER had
  -- claimed was restockable, sight unseen.)
  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'lines', v_lines,
    'awaiting', 'inspection',
    'note', 'Goods received. Nothing is booked into stock until inspect_return decides each line.');
END; $function$;

-- ---------------------------------------------------------------------------
-- inspect_return: the QC step, and now the moment goods enter inventory
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inspect_return(
  p_return_id uuid,
  p_notes text DEFAULT NULL::text,
  p_restocking_fee_cents bigint DEFAULT NULL::bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gross bigint;
  v_already bigint;
  v_line RECORD;
  v_restocked int := 0;
  v_held int := 0;
  v_detail jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Requires the returns module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_restocking_fee_cents IS NOT NULL THEN
    IF p_restocking_fee_cents < 0 THEN
      RAISE EXCEPTION 'restocking_fee_cents must not be negative';
    END IF;

    SELECT COALESCE(SUM(quantity * unit_refund_cents), 0) INTO v_gross
      FROM return_items WHERE return_id = p_return_id;
    SELECT COALESCE(refund_amount_cents, 0) INTO v_already
      FROM returns WHERE id = p_return_id;

    -- A fee is a deduction from a payout that may already have started. If it
    -- deducts past what was paid, the RMA can never be reconciled: refund_return
    -- would reject every remaining call and the return stays open forever.
    IF v_gross - p_restocking_fee_cents < v_already THEN
      RAISE EXCEPTION 'Restocking fee % would drop the expected refund total to % (lines % − fee %), below the % already refunded on this RMA — lower the fee to at most %',
        p_restocking_fee_cents, v_gross - p_restocking_fee_cents, v_gross,
        p_restocking_fee_cents, v_already, GREATEST(v_gross - v_already, 0);
    END IF;
  END IF;

  UPDATE returns
     SET inspected_at = now(),
         inspection_notes = COALESCE(p_notes, inspection_notes),
         restocking_fee_cents = COALESCE(p_restocking_fee_cents, restocking_fee_cents)
   WHERE id = p_return_id AND status = 'received';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found or not in received state', p_return_id;
  END IF;

  -- The disposition, and the effect. chosen_action is the inspector's explicit
  -- call; suggested_action is what `condition` implies and is what an operator
  -- who never touches the dropdown gets. Only 'restock' puts goods back on the
  -- sellable shelf — refurbish, rtv and scrap deliberately do not.
  FOR v_line IN
    SELECT id, COALESCE(chosen_action, suggested_action, 'scrap') AS action, restocked_at
      FROM public.return_items WHERE return_id = p_return_id
  LOOP
    IF v_line.action = 'restock' THEN
      PERFORM public.apply_return_line_stock(v_line.id, 1);
      IF v_line.restocked_at IS NULL THEN v_restocked := v_restocked + 1; END IF;
    ELSE
      v_held := v_held + 1;
    END IF;
    v_detail := v_detail || jsonb_build_object('item_id', v_line.id, 'action', v_line.action);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'return_id', p_return_id, 'inspected', true,
    'lines_restocked', v_restocked,
    'lines_held_out_of_stock', v_held,
    'lines', v_detail);
END $function$;

-- ---------------------------------------------------------------------------
-- set_return_item_action: the decision takes effect when it is made
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_return_item_action(p_return_item_id uuid, p_action text)
RETURNS return_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.return_items;
  v_status text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Only staff can set item action';
  END IF;
  IF p_action NOT IN ('restock','refurbish','rtv','scrap') THEN
    RAISE EXCEPTION 'Invalid action % — expected restock, refurbish, rtv or scrap', p_action;
  END IF;

  UPDATE public.return_items SET chosen_action = p_action
   WHERE id = p_return_item_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Return item % not found', p_return_item_id; END IF;

  SELECT status INTO v_status FROM public.returns WHERE id = v_row.return_id;

  -- Before the goods are here, this records an intention and inspection will act
  -- on it. Once they are here, the decision is the act — including changing your
  -- mind: a line restocked and then condemned comes back OUT, or the warehouse
  -- holds goods it has decided to scrap.
  IF v_status IN ('received', 'refunded') THEN
    IF p_action = 'restock' THEN
      PERFORM public.apply_return_line_stock(p_return_item_id, 1);
    ELSIF v_row.restocked_at IS NOT NULL THEN
      PERFORM public.apply_return_line_stock(p_return_item_id, -1);
    END IF;
    SELECT * INTO v_row FROM public.return_items WHERE id = p_return_item_id;
  END IF;

  RETURN v_row;
END $function$;

-- ---------------------------------------------------------------------------
-- The goods nobody has decided about
-- ---------------------------------------------------------------------------
-- The behaviour change above trades a silent wrong (unseen goods on the sellable
-- shelf) for a visible gap (goods physically back, not yet in inventory). A gap
-- is only better than a wrong if someone can see it.
CREATE OR REPLACE VIEW public.returns_awaiting_inspection AS
  SELECT r.id AS return_id, r.rma_number, r.received_at,
         now() - r.received_at AS waiting,
         count(ri.id) AS lines,
         count(ri.id) FILTER (WHERE ri.restocked_at IS NULL) AS lines_not_in_stock,
         COALESCE(sum(ri.quantity) FILTER (WHERE ri.restocked_at IS NULL), 0) AS qty_off_the_books
    FROM public.returns r
    JOIN public.return_items ri ON ri.return_id = r.id
   WHERE r.status = 'received' AND r.inspected_at IS NULL
   GROUP BY r.id, r.rma_number, r.received_at;

COMMENT ON VIEW public.returns_awaiting_inspection IS
  'RMAs whose goods have arrived but which nobody has inspected, so the goods are not in inventory yet. qty_off_the_books is the physical stock the books do not know about.';

REVOKE EXECUTE ON FUNCTION public.apply_return_line_stock(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_return_line_stock(uuid, int) TO authenticated, service_role;
GRANT SELECT ON public.returns_awaiting_inspection TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The seed follows the new order — and asserts the NON-movement too
-- ---------------------------------------------------------------------------
-- sandbox_seed_rma caught this change the moment it was applied:
--
--   sandbox_seed_rma: products.stock_quantity moved by 0 on a 5 unit return (90 → 90)
--
-- which is the regression harness (20260822120000) doing its job on its first
-- real behaviour change. The chain now runs approve → receive → **inspect** →
-- assert, and asserts both directions: that receiving books nothing, and that
-- inspection books exactly the lines whose disposition says restock.
--
-- Asserting the non-movement matters as much as the movement. Without it, a
-- future change that quietly made receiving book stock again would leave every
-- other assertion passing.
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

    -- Receiving is not booking. Since 20260822140000 the goods are on the
    -- receiving bench, not the sellable shelf — which shelf they belong on is
    -- what inspection is for. Asserting the NON-movement is the half that would
    -- otherwise rot silently: if receiving quietly started booking again, every
    -- assertion below would still pass and nobody would notice.
    SELECT COALESCE(stock_quantity, 0) INTO v_mirror_after FROM public.products WHERE id = v_beans;
    IF COALESCE(v_mirror_after, 0) <> v_mirror_before THEN
      RAISE EXCEPTION 'sandbox_seed_rma: receiving moved stock % → % — inspection is what books goods in',
        v_mirror_before, v_mirror_after;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.returns_awaiting_inspection WHERE return_id = v_rma) THEN
      RAISE EXCEPTION 'sandbox_seed_rma: received goods are off the books and invisible — returns_awaiting_inspection does not list %', v_rma;
    END IF;

    -- QC. Sets the restocking fee AND books each line according to its
    -- disposition: COALESCE(chosen_action, suggested_action). 'unopened' gives
    -- suggested_action 'restock', so this is where the five bags land.
    PERFORM public.inspect_return(v_rma, 'Fem påsar, obrutna. 2 % hanteringsavgift.', v_fee);

    IF NOT EXISTS (SELECT 1 FROM public.return_items
                    WHERE return_id = v_rma AND restocked_at IS NOT NULL) THEN
      RAISE EXCEPTION 'sandbox_seed_rma: inspection did not book the line back in';
    END IF;

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

    -- Inspected, and the disposition holds them out: condition 'damaged' gives
    -- suggested_action 'rtv'. This is the direction that matters most — a
    -- restock that fires when it must not is worse than one that does not fire,
    -- because it puts unsellable goods back on the shelf as sellable.
    PERFORM public.inspect_return(v_rma, 'Fuktskadade. Reklameras mot transportör, återgår ej till lager.');

    SELECT COALESCE(stock_quantity, 0) INTO v_mirror_after FROM public.products WHERE id = v_beans;
    IF COALESCE(v_mirror_after, 0) <> v_mirror_before THEN
      RAISE EXCEPTION 'sandbox_seed_rma: damaged goods were booked back in (% → %)',
        v_mirror_before, v_mirror_after;
    END IF;
    IF EXISTS (SELECT 1 FROM public.return_items
                WHERE return_id = v_rma AND restocked_at IS NOT NULL) THEN
      RAISE EXCEPTION 'sandbox_seed_rma: a damaged line was stamped as restocked';
    END IF;

    -- Parked at 'received', un-inspected on purpose: this is the RMA that has
    -- work waiting for a human, and the state an empty demo never shows.
    v_report := v_report || jsonb_build_object('damaged', jsonb_build_object(
      'rma', (SELECT rma_number FROM public.returns WHERE id = v_rma),
      'qty', 2, 'restocked', false, 'disposition', 'rtv',
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
