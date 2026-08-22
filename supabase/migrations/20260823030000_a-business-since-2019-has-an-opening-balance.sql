-- A business since 2019 has an opening balance — and the count that sets it
-- has to actually move the world.
--
-- The three chains (P2P, O2C, RMA) build Nordbrygg AB by RUNNING its processes,
-- and everything they produce is earned: every unit on the shelf arrived on a
-- goods receipt that ran. That is the right rule and it is not negotiable.
--
-- But it produces a company that opened for business a fortnight ago. Nordbrygg
-- has traded since 2019, and a testbed that demos "what a business going
-- forward looks like" needs a past: opening stock that predates the window, and
-- closed business behind it so a trend has a slope.
--
-- Odoo's convention for that past is an OPENING INVENTORY ADJUSTMENT, not a run
-- of invented purchase orders — and it is the honest one. A fabricated 2019 PO
-- claims a vendor, a price and a receipt that never happened; an opening count
-- claims only "this is what was on the shelf on the day we started counting",
-- which is exactly true. So: the history goes in through inventory_counts, the
-- platform's own physical-count process, and it carries its provenance in the
-- count's own notes.
--
-- Which is how this was found: adjust_quant — the thing manage_inventory_count
-- posts through, and an MCP skill in its own right — moved stock_quants and
-- NOTHING ELSE.
--
--   · products.stock_quantity, the mirror the storefront, the low-stock alert
--     and the reorder loop all read, did not move. Post a count of 3 machines
--     and the product page still says none.
--   · No stock_valuation_layer was written, because the valuation trigger skips
--     any move_type outside ('in','out','mo_production','mo_consumption') and
--     adjust_quant writes 'adjustment'. Stock on the shelf, zero in the books.
--   · The move recorded ABS(delta) with the location always in to_location_id,
--     so a decrease of 5 and an increase of 5 are the same row. The ledger could
--     not tell you which way the goods went.
--
-- Same class as the goods-receipt bug this whole exercise exists to catch: a
-- call that returns success while the world stands still. Fixed here, because
-- the opening balance is unbuildable until it is.
--
-- Idempotent (CREATE OR REPLACE only) and forward-dated so managed instances
-- actually apply it.

-- ── 1. The adjustment moves all three mirrors, and records its direction ─────
CREATE OR REPLACE FUNCTION public.adjust_quant(
  p_product_id uuid,
  p_location_id uuid,
  p_qty_delta numeric,
  p_lot_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT 'manual_adjustment'::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_move uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role))
       OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;
  IF p_qty_delta = 0 THEN RAISE EXCEPTION 'Delta cannot be zero'; END IF;

  PERFORM _upsert_quant(p_product_id, p_location_id, p_lot_id, p_qty_delta);

  -- The mirror the storefront, the low-stock alert and the reorder loop read.
  -- Same reasoning as apply_goods_receipt_stock: a count is a physical fact, so
  -- the mirror moves whether or not the product is flagged track_inventory.
  -- Without this an adjustment was invisible everywhere except the quant table.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + p_qty_delta::int,
         updated_at = now()
   WHERE id = p_product_id;

  -- Signed quantity and a directional location pair, so the ledger says which
  -- way the goods went. The sign is what the valuation trigger below reads.
  INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id,
                           lot_id, notes, created_by, state)
  VALUES (p_product_id, p_qty_delta::int, 'adjustment',
          CASE WHEN p_qty_delta < 0 THEN p_location_id END,
          CASE WHEN p_qty_delta > 0 THEN p_location_id END,
          p_lot_id, p_reason, auth.uid(), 'done')
  RETURNING id INTO v_move;

  RETURN v_move;
END; $function$;

-- ── 2. Valuation sees adjustments ───────────────────────────────────────────
-- Body carried forward unchanged except for the two lines that admit
-- 'adjustment' and read its sign. adjust_quant is the only writer of that
-- move_type, and it now always writes a signed quantity — so a positive
-- adjustment layers in at the running average (or the product's standing cost
-- when nothing is on hand) and a negative one consumes layers like any issue.
CREATE OR REPLACE FUNCTION public.process_stock_move_valuation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_qty numeric := abs(COALESCE(NEW.quantity,0));
  v_is_in boolean;
  v_method text;
  v_unit_cost bigint;
  v_total_cost bigint := 0;
  v_layer RECORD;
  v_take numeric;
  v_remaining numeric;
  v_avg numeric;
  v_je uuid;
  v_is_purchase boolean;
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption','adjustment') THEN RETURN NEW; END IF;
  -- 'adjustment' carries its direction in the SIGN (adjust_quant), the same way
  -- 'in' does. Stock that appears on a count is stock the books must carry.
  v_is_in := (NEW.move_type IN ('in','mo_production','adjustment')) AND COALESCE(NEW.quantity,0) > 0;
  v_is_purchase := NEW.reference_type IN ('purchase_order','po','goods_receipt');

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));

    -- Goods coming back that the warehouse already carries re-enter at what it
    -- carries them at. Only when nothing else supplied a cost — a receipt's PO
    -- price and an explicit unit_cost_cents both still win.
    IF COALESCE(v_unit_cost, 0) = 0 THEN
      SELECT CASE WHEN sum(remaining_qty) > 0
                  THEN round(sum(remaining_qty * unit_cost_cents) / sum(remaining_qty)) END
        INTO v_unit_cost
        FROM stock_valuation_layers
       WHERE product_id = NEW.product_id AND remaining_qty > 0;
      -- Still nothing on hand to average against: the product's standing cost.
      IF COALESCE(v_unit_cost, 0) = 0 THEN
        SELECT cost_cents INTO v_unit_cost FROM products WHERE id = NEW.product_id;
      END IF;
      v_unit_cost := COALESCE(v_unit_cost, 0);
    END IF;

    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;

    -- What was paid for it is what it costs. Learned once, from the receipt
    -- that knew; never overwritten, so a standard cost an operator set stands.
    IF v_is_purchase AND v_unit_cost > 0 THEN
      UPDATE products
         SET cost_cents = v_unit_cost, updated_at = now()
       WHERE id = NEW.product_id AND cost_cents IS NULL;
    END IF;

    IF v_is_purchase AND v_unit_cost > 0 THEN
      BEGIN
        INSERT INTO journal_entries (entry_date, description, source, status)
        VALUES (CURRENT_DATE, 'Inventory receipt '||COALESCE(NEW.reference_id,''), 'inventory_receipt', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, '1460', round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, '2441', 0, round(v_qty*v_unit_cost), 'GRNI — ej fakturerade leveranser');
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'inventory_receipt JE skipped: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(pc.costing_method,'average') INTO v_method
  FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE p.id = NEW.product_id;
  v_method := COALESCE(v_method,'average');

  IF v_method = 'average' THEN
    SELECT CASE WHEN sum(remaining_qty) > 0
                THEN sum(remaining_qty * unit_cost_cents) / sum(remaining_qty) END
    INTO v_avg FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0;
  END IF;

  v_remaining := v_qty;
  FOR v_layer IN
    SELECT id, remaining_qty, unit_cost_cents FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_layer.remaining_qty, v_remaining);
    v_total_cost := v_total_cost + round(v_take * CASE WHEN v_method='average' THEN v_avg ELSE v_layer.unit_cost_cents END);
    UPDATE stock_valuation_layers SET remaining_qty = remaining_qty - v_take WHERE id = v_layer.id;
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

  IF NEW.reference_type IN ('order','pos_sale') AND v_total_cost > 0 THEN
    BEGIN
      INSERT INTO journal_entries (entry_date, description, source, status)
      VALUES (CURRENT_DATE, 'COGS '||NEW.reference_type||' '||COALESCE(NEW.reference_id,''), 'inventory_cogs', 'posted')
      RETURNING id INTO v_je;
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je, '4990', v_total_cost, 0, 'Kostnad sålda varor'),
             (v_je, '1460', 0, v_total_cost, 'Lager av handelsvaror');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'inventory_cogs JE skipped: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $function$;

-- ── 3. The past, as its own clearly-marked function ──────────────────────────
-- NOT folded into the three chains, deliberately. The chains assert that state
-- was EARNED by a process that ran; this one plants what happened before the
-- window opened. Two different claims, and mixing them would let a future
-- reader believe the 2019 stock came off a goods receipt.
--
-- Everything it writes is tagged 'seed:history:%' so the teardown, the auditor
-- and the next person can all tell it apart from the earned rows.
CREATE OR REPLACE FUNCTION public.seed_trading_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mode text;
  v_loc uuid;
  v_machine uuid;
  v_count_id uuid;
  v_line_id uuid;
  v_res jsonb;
  v_opening_qty int := 3;
  v_opening_cost bigint := 3200000;  -- 32 000 SEK per machine against 48 900 list
  v_opening_value bigint;
  v_applied_cost bigint;
  v_stock int;
  v_quant numeric;
  v_valued numeric;
  v_month date;
  v_i int;
  v_amount bigint;
  v_sub bigint;
  v_tax bigint;
  v_num text;
  v_cust text;
  v_mail text;
  v_invoices int := 0;
  v_revenue bigint := 0;
  v_report jsonb := '{}'::jsonb;
  CUSTOMERS text[] := ARRAY['Hotell Norrsken AB','Café Ekot AB','Kontorshuset Vasa AB'];
  EMAILS    text[] := ARRAY['inkop@hotellnorrsken.example','hej@cafeekot.example','faktura@kontorshusetvasa.example'];
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can seed trading history';
  END IF;

  -- The same gate as the chains, and no looser: an instance that is neither a
  -- sandbox, a demo nor a testbed gets nothing.
  v_mode := public.seed_chain_mode();
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'seed_trading_history refused: this instance is not a sandbox, demo or testbed (site_settings.sandbox_mode / demo_mode.enabled / testbed_mode.enabled)';
  END IF;

  -- History sits BEHIND the chains, so the chains have to have run. Planting a
  -- past for a company that has no present is how a seed produces scenery.
  SELECT id INTO v_machine FROM public.products WHERE name LIKE 'Milano Due%';
  IF v_machine IS NULL THEN
    RAISE EXCEPTION 'seed_trading_history refused: run sandbox_seed_p2p() first — there is no catalogue to have a history of';
  END IF;

  SELECT id INTO v_loc FROM public.stock_locations
   WHERE location_type = 'internal' AND COALESCE(is_active, true) LIMIT 1;
  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'seed_trading_history: no internal stock location — run seed_stock_locations()';
  END IF;

  -- ── A. Opening inventory: machines that were on the shelf before us ───────
  -- Odoo's convention, and the honest one. The machines are imported on long
  -- lead times and the only PO for them in the window is still in flight, so
  -- without this the company sells a product it has never had. An opening count
  -- claims exactly what is true: this is what was there when we started
  -- counting.
  IF NOT EXISTS (SELECT 1 FROM public.inventory_counts WHERE notes LIKE 'seed:history:opening%') THEN
    -- A cost to value the opening stock at. Set once, never overwritten — the
    -- same rule the receipt path follows, so an operator's standard cost stands.
    UPDATE public.products
       SET cost_cents = v_opening_cost, updated_at = now()
     WHERE id = v_machine AND cost_cents IS NULL;

    v_res := public.manage_inventory_count(
      'create', NULL, v_loc, NULL, NULL, NULL, NULL,
      'seed:history:opening — ingående lagerbehållning, maskiner på hyllan sedan före mätfönstret');
    v_count_id := (v_res ->> 'count_id')::uuid;

    v_res := public.manage_inventory_count('add_line', v_count_id, NULL, v_machine, NULL, v_opening_qty);
    v_line_id := (v_res ->> 'line_id')::uuid;

    v_res := public.manage_inventory_count('post', v_count_id);

    -- The invariant this whole function exists to be able to state: what the
    -- shelf says, what the quant says and what the books say are one number.
    SELECT COALESCE(stock_quantity, 0) INTO v_stock FROM public.products WHERE id = v_machine;
    SELECT COALESCE(sum(quantity), 0) INTO v_quant FROM public.stock_quants WHERE product_id = v_machine;
    SELECT COALESCE(sum(remaining_qty), 0) INTO v_valued FROM public.stock_valuation_layers WHERE product_id = v_machine;

    IF v_stock <> v_opening_qty OR v_quant <> v_opening_qty OR v_valued <> v_opening_qty THEN
      RAISE EXCEPTION 'seed_trading_history: opening count of % left products.stock_quantity=%, quants=%, valued=% — the count did not move the world',
        v_opening_qty, v_stock, v_quant, v_valued;
    END IF;

    -- Report what the books ACTUALLY carry, not the constant above. When the
    -- product already had a standing cost this seed did not overwrite it, and a
    -- report that echoed its own input would quietly misstate the opening value.
    SELECT COALESCE(sum(value_cents), 0), COALESCE(round(sum(value_cents) / NULLIF(sum(quantity), 0)), 0)
      INTO v_opening_value, v_applied_cost
      FROM public.stock_valuation_layers WHERE product_id = v_machine;

    v_report := v_report || jsonb_build_object('opening_inventory', jsonb_build_object(
      'count_id', v_count_id, 'product', 'Milano Due', 'counted', v_opening_qty,
      'unit_cost_cents', v_applied_cost, 'value_cents', v_opening_value,
      'cost_source', CASE WHEN v_applied_cost = v_opening_cost
                          THEN 'set by this seed (product had none)'
                          ELSE 'the product''s standing cost, left alone' END,
      'convention', 'inventory adjustment, not a fabricated purchase order'));
  END IF;

  -- ── B. Closed business behind us ─────────────────────────────────────────
  -- Service-agreement revenue, twenty-four months of it, settled and done. It
  -- is deliberately NOT goods: a paid service invoice needs no stock, so the
  -- past can have a slope without inventing units no receipt ever earned.
  -- Amounts grow ~3.5% a month, which is what "a business going forward" looks
  -- like on a chart.
  FOR v_i IN REVERSE 24..1 LOOP
    v_month := (date_trunc('month', current_date) - (v_i || ' months')::interval)::date;
    v_num := 'F-' || to_char(v_month, 'YYYY') || '-H' || to_char(v_month, 'MM');
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = v_num);

    -- 62 000 SEK ex VAT in the oldest month, compounding ~3.5%/month to roughly
    -- 140 000 by the newest: a service book that has roughly doubled in two
    -- years. Öre throughout, like every other money column in the schema.
    v_amount := round(6200000 * power(1.035, 24 - v_i))::bigint;
    v_sub := v_amount;
    v_tax := round(v_sub * 0.25)::bigint;
    v_cust := CUSTOMERS[1 + (v_i % 3)];
    v_mail := EMAILS[1 + (v_i % 3)];

    INSERT INTO public.invoices (
      invoice_number, customer_name, customer_email, status, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency,
      issue_date, due_date, paid_at, paid_amount_cents, notes)
    VALUES (
      v_num, v_cust, v_mail, 'paid',
      jsonb_build_array(jsonb_build_object(
        'description', 'Serviceavtal kaffemaskiner — ' || to_char(v_month, 'YYYY-MM'),
        'qty', 1, 'unit_price_cents', v_sub)),
      v_sub, 0.25, v_tax, v_sub + v_tax, 'SEK',
      v_month + 4, v_month + 34, (v_month + 26)::timestamptz, v_sub + v_tax,
      'seed:history:invoice:' || to_char(v_month, 'YYYY-MM'));

    v_invoices := v_invoices + 1;
    v_revenue := v_revenue + v_sub;
  END LOOP;

  IF v_invoices > 0 THEN
    v_report := v_report || jsonb_build_object('closed_business', jsonb_build_object(
      'invoices', v_invoices,
      'months', 24,
      'revenue_ex_vat_cents', v_revenue,
      'kind', 'service agreements — settled, paid, and touching no stock'));
  END IF;

  RETURN jsonb_build_object(
    'seeded', true,
    'instance_kind', v_mode,
    'chain', 'trading-history',
    'detail', v_report,
    'note', 'The past is an opening balance and closed business, tagged seed:history:%. The present is still earned by the chains.');
END; $function$;

REVOKE ALL ON FUNCTION public.seed_trading_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_trading_history() TO service_role;

COMMENT ON FUNCTION public.seed_trading_history() IS
  'Plants what happened BEFORE the seed window: an opening inventory count (Odoo convention — not fabricated purchase orders) and 24 months of settled service-agreement invoices. Separate from the P2P/O2C/RMA chains on purpose: those assert state was earned by a process that ran, this one states an opening position. Idempotent; gated by seed_chain_mode().';
