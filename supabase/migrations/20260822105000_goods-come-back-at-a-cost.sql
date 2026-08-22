-- Returned goods re-entered the warehouse valued at nothing.
--
-- Found by running the RMA chain. sandbox_seed_rma() sends 5 kg of coffee back
-- from a customer; the quantity came back correctly (90 → 95, both mirrors),
-- and the valuation layer it created reads:
--
--   quantity 5.000 · unit_cost_cents 0 · value_cents 0
--
-- against the receipt layer beside it, which reads 120 @ 18 500. So the shelf
-- holds 95 kg and the books say it is worth 90 kg — and when those 5 kg are
-- sold, COGS for them is zero and the gross margin on that sale is overstated
-- by the whole cost.
--
-- Two absences, both filled here with a number the system already had.
--
-- ── 1. A receipt never taught the product what it cost ─────────────────────
-- resolve_inbound_unit_cost reads the PO line directly for a goods_receipt, so
-- receipts are valued correctly. Every OTHER inbound movement — a customer
-- return, a manual adjustment, an event-driven restock — falls through to
-- products.cost_cents, which no code path has ever written. On this sandbox:
-- 7 products, 7 without a cost, including two that had been received against
-- priced purchase orders minutes earlier.
--
-- Purchasing knew the price. Valuation knew the price. The product did not.
--
-- Filling it only when NULL is deliberate: this learns a cost, it does not
-- impose a costing policy. An operator's standard cost is never overwritten.
--
-- ── 2. Zero is not a cost, it is the absence of one ───────────────────────
-- When nothing supplies a unit cost, the inbound branch booked 0 and moved on.
-- For goods coming back that the warehouse already carries, the answer is
-- sitting in the layers: the weighted average of what is still on hand. That
-- is the standard treatment of a customer return under average costing, and
-- the same figure the outbound branch computes for COGS twenty lines below.
--
-- Idempotent, and forward-dated so managed instances actually apply it.

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
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption') THEN RETURN NEW; END IF;
  v_is_in := (NEW.move_type IN ('in','mo_production')) AND COALESCE(NEW.quantity,0) > 0;
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

-- Backfill: products that have been received against a priced purchase order
-- but never learned the price. Fills blanks only — an operator's standard cost
-- is left alone, and re-running changes nothing.
--
-- Historical zero-valued layers are deliberately NOT rewritten. Restating an
-- inventory valuation that has already been posted to the journal is an
-- accounting act, not a migration; see the issue this ships with.
UPDATE public.products p
   SET cost_cents = src.unit_price_cents, updated_at = now()
  FROM (
    SELECT DISTINCT ON (pol.product_id)
           pol.product_id, pol.unit_price_cents
      FROM public.purchase_order_lines pol
      JOIN public.purchase_orders po ON po.id = pol.purchase_order_id
     WHERE pol.unit_price_cents > 0
       AND COALESCE(pol.received_quantity, 0) > 0
     ORDER BY pol.product_id, po.created_at DESC
  ) src
 WHERE p.id = src.product_id AND p.cost_cents IS NULL;
