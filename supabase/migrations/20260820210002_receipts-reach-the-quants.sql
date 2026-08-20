-- A goods receipt that never reached the stock.
--
-- QA received 100 units against a confirmed PO. receive_purchase_order returned
-- success, the PO advanced to `received`, goods_receipt_lines were written, a
-- stock_move was written — and products.stock_quantity stayed at 0. Three
-- separate reasons, all silent:
--
--   (a) it wrote stock_moves (the journal) but never stock_quants (the balance).
--       Nothing else derives quants from moves, so the ledger had entries and no
--       account.
--   (b) it "synced" on-hand into `product_stock`, a legacy table that is EMPTY
--       on every instance. `UPDATE product_stock … WHERE product_id = …` matched
--       zero rows: a no-op by construction, reporting nothing.
--   (c) with stock_locations empty (see 20260820210001) both the destination and
--       the vendor source resolved to NULL and the function carried on happily,
--       writing a move that came from nowhere and went nowhere.
--
-- This migration gives the chain one balance primitive and makes the receipt
-- fail loudly instead of succeeding emptily.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Make stock_quants actually upsertable.
--
-- The table's only unique constraint is (product_id, location_id, lot_id).
-- lot_id is nullable and Postgres treats NULLs as distinct, so that constraint
-- cannot dedupe the no-lot case — and `ON CONFLICT (product_id, location_id,
-- lot_id) WHERE lot_id IS NULL` (what apply_stock_movement_event uses) has no
-- matching index at all and raises at runtime. Two partial unique indexes fix
-- both halves.
-- ─────────────────────────────────────────────────────────────────────────────

-- Collapse any pre-existing duplicates before the unique index can reject them.
WITH ranked AS (
  SELECT id, product_id, location_id, quantity, reserved_quantity,
         row_number() OVER (PARTITION BY product_id, location_id ORDER BY updated_at, id) AS rn,
         sum(quantity) OVER (PARTITION BY product_id, location_id) AS tot_qty,
         sum(reserved_quantity) OVER (PARTITION BY product_id, location_id) AS tot_res
  FROM public.stock_quants
  WHERE lot_id IS NULL
)
UPDATE public.stock_quants q
   SET quantity = r.tot_qty, reserved_quantity = r.tot_res, updated_at = now()
  FROM ranked r
 WHERE q.id = r.id AND r.rn = 1
   AND EXISTS (SELECT 1 FROM ranked d WHERE d.product_id = r.product_id
                 AND d.location_id = r.location_id AND d.rn > 1);

DELETE FROM public.stock_quants q
 USING (
   SELECT id, row_number() OVER (PARTITION BY product_id, location_id ORDER BY updated_at, id) AS rn
     FROM public.stock_quants WHERE lot_id IS NULL
 ) d
 WHERE q.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS stock_quants_product_location_nolot_uq
  ON public.stock_quants (product_id, location_id) WHERE lot_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_quants_product_location_lot_uq
  ON public.stock_quants (product_id, location_id, lot_id) WHERE lot_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One balance primitive. Every stock writer goes through it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_stock_quant(
  p_product_id uuid,
  p_location_id uuid,
  p_qty_delta numeric,
  p_lot_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_product_id IS NULL OR p_location_id IS NULL OR COALESCE(p_qty_delta, 0) = 0 THEN
    RETURN;
  END IF;

  IF p_lot_id IS NULL THEN
    INSERT INTO public.stock_quants (product_id, location_id, lot_id, quantity)
    VALUES (p_product_id, p_location_id, NULL, p_qty_delta)
    ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
    DO UPDATE SET quantity = stock_quants.quantity + EXCLUDED.quantity,
                  updated_at = now();
  ELSE
    INSERT INTO public.stock_quants (product_id, location_id, lot_id, quantity)
    VALUES (p_product_id, p_location_id, p_lot_id, p_qty_delta)
    ON CONFLICT (product_id, location_id, lot_id) WHERE lot_id IS NOT NULL
    DO UPDATE SET quantity = stock_quants.quantity + EXCLUDED.quantity,
                  updated_at = now();
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.upsert_stock_quant(uuid, uuid, numeric, uuid) IS
  'The one place a stock balance changes. Adds a signed delta to the quant for (product, location, lot). Callers keep the products.stock_quantity mirror.';

CREATE OR REPLACE FUNCTION public.default_internal_location()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.stock_locations
   WHERE location_type = 'internal' AND is_active = true
   ORDER BY (code = 'WH/MAIN') DESC, created_at
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.default_internal_location() IS
  'The warehouse everything lands in when a caller names no location. WH/MAIN wins when present, otherwise the oldest active internal location.';

-- Receipt-side entry point: resolves the destination, refuses to pretend, and
-- moves both the quant and the products.stock_quantity mirror the storefront
-- reads. Returns the location actually used.
CREATE OR REPLACE FUNCTION public.apply_goods_receipt_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_location_id uuid DEFAULT NULL,
  p_lot_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc uuid := p_location_id;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR auth.uid() IS NULL
          OR has_role(auth.uid(), 'admin'::public.app_role)
          OR public.can_access_module(auth.uid(), 'inventory')
          OR public.can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Not allowed to book stock receipts';
  END IF;

  IF p_product_id IS NULL OR COALESCE(p_quantity, 0) = 0 THEN
    RETURN NULL;
  END IF;

  IF v_loc IS NULL THEN
    v_loc := public.default_internal_location();
  END IF;

  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'No active internal stock location exists — cannot receive goods. Run SELECT public.seed_stock_locations() to restore the canonical warehouse layout.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM public.upsert_stock_quant(p_product_id, v_loc, p_quantity, p_lot_id);

  -- The storefront, low-stock alerts and the reorder loop all read
  -- products.stock_quantity. A receipt is a physical fact, so the mirror moves
  -- whether or not the product is flagged track_inventory.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + p_quantity::int,
         updated_at = now()
   WHERE id = p_product_id;

  RETURN v_loc;
END;
$function$;

COMMENT ON FUNCTION public.apply_goods_receipt_stock(uuid, numeric, uuid, uuid) IS
  'Books received goods into stock: quant + products.stock_quantity mirror. Raises when no internal location exists rather than succeeding with nothing.';

REVOKE ALL ON FUNCTION public.upsert_stock_quant(uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_goods_receipt_stock(uuid, numeric, uuid, uuid) FROM PUBLIC;
-- upsert_stock_quant is a primitive, never a public verb: the SECURITY DEFINER
-- callers above run as the owner, so they keep working without this grant.
GRANT EXECUTE ON FUNCTION public.upsert_stock_quant(uuid, uuid, numeric, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_goods_receipt_stock(uuid, numeric, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.default_internal_location() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. receive_purchase_order — same body as live, with the three holes closed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_to_location_id uuid DEFAULT NULL::uuid,
  p_received_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_receipt_id uuid;
  v_po record;
  v_vendor_loc uuid;
  v_to_loc uuid := p_to_location_id;
  v_line jsonb;
  v_pol record;
  v_lot_id uuid;
  v_all_received boolean;
  v_some_received boolean;
  v_new_status purchase_order_status;
  v_lines_inserted int := 0;
  v_total_qty int := 0;
BEGIN
  -- Validate PO
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_purchase_order_id;
  END IF;

  IF v_po.status NOT IN ('sent', 'confirmed', 'partially_received') THEN
    RAISE EXCEPTION 'Cannot receive PO in status %', v_po.status;
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No lines provided';
  END IF;

  -- Resolve default destination location (first internal)
  IF v_to_loc IS NULL THEN
    v_to_loc := public.default_internal_location();
  END IF;

  -- Vendor source location
  SELECT id INTO v_vendor_loc FROM stock_locations
    WHERE location_type = 'vendor' AND is_active = true
    ORDER BY created_at LIMIT 1;

  -- Fail loud. Receiving into NULL used to "succeed" and move nothing; with
  -- seed_stock_locations() asserted these are present on every instance, so a
  -- NULL here is a real misconfiguration and must surface.
  IF v_to_loc IS NULL OR v_vendor_loc IS NULL THEN
    RAISE EXCEPTION 'Cannot receive goods — %. Run SELECT public.seed_stock_locations() to restore the canonical warehouse layout.',
      CASE
        WHEN v_to_loc IS NULL AND v_vendor_loc IS NULL THEN 'there is no active internal destination location and no active vendor location'
        WHEN v_to_loc IS NULL THEN 'there is no active internal destination location'
        ELSE 'there is no active vendor source location'
      END
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Create receipt header
  INSERT INTO goods_receipts (purchase_order_id, received_date, notes, created_by)
  VALUES (p_purchase_order_id, p_received_date, p_notes, auth.uid())
  RETURNING id INTO v_receipt_id;

  -- Process each line
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    SELECT * INTO v_pol FROM purchase_order_lines
      WHERE id = (v_line->>'po_line_id')::uuid
        AND purchase_order_id = p_purchase_order_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO line % does not belong to PO %', v_line->>'po_line_id', p_purchase_order_id;
    END IF;

    DECLARE
      v_qty int := (v_line->>'quantity_received')::int;
    BEGIN
      IF v_qty <= 0 THEN CONTINUE; END IF;

      -- Cap at remaining quantity to prevent over-receipt
      IF v_pol.received_quantity + v_qty > v_pol.quantity THEN
        v_qty := v_pol.quantity - v_pol.received_quantity;
        IF v_qty <= 0 THEN CONTINUE; END IF;
      END IF;

      -- Insert receipt line
      INSERT INTO goods_receipt_lines (goods_receipt_id, po_line_id, quantity_received)
      VALUES (v_receipt_id, v_pol.id, v_qty);

      -- Update PO line cumulative received
      UPDATE purchase_order_lines
        SET received_quantity = received_quantity + v_qty
        WHERE id = v_pol.id;

      -- Stock move (vendor → internal) for tracked products
      IF v_pol.product_id IS NOT NULL THEN
        -- Optional lot creation
        v_lot_id := NULL;
        IF v_line ? 'lot_number' AND length(coalesce(v_line->>'lot_number','')) > 0 THEN
          INSERT INTO stock_lots (product_id, lot_number, expiration_date)
          VALUES (v_pol.product_id, v_line->>'lot_number', NULLIF(v_line->>'expiration_date','')::date)
          ON CONFLICT (product_id, lot_number) DO UPDATE SET lot_number = excluded.lot_number
          RETURNING id INTO v_lot_id;
        END IF;

        INSERT INTO stock_moves (
          product_id, quantity, move_type, reference_type, reference_id,
          from_location_id, to_location_id, lot_id, state, notes, created_by
        ) VALUES (
          v_pol.product_id, v_qty, 'in', 'goods_receipt', v_receipt_id::text,
          v_vendor_loc, v_to_loc, v_lot_id, 'done',
          format('Goods receipt for PO %s', v_po.po_number), auth.uid()
        );

        -- The balance the journal entry above was always missing: the quant at
        -- the receiving location plus the products.stock_quantity mirror.
        -- (The old legacy `product_stock` sync is gone — that table is empty on
        -- every instance, so the UPDATE matched nothing and reported success.)
        PERFORM public.apply_goods_receipt_stock(v_pol.product_id, v_qty, v_to_loc, v_lot_id);
      END IF;

      v_lines_inserted := v_lines_inserted + 1;
      v_total_qty := v_total_qty + v_qty;
    END;
  END LOOP;

  IF v_lines_inserted = 0 THEN
    RAISE EXCEPTION 'No valid lines received (all zero or already fully received)';
  END IF;

  -- Update PO status
  SELECT
    bool_and(received_quantity >= quantity),
    bool_or(received_quantity > 0)
  INTO v_all_received, v_some_received
  FROM purchase_order_lines WHERE purchase_order_id = p_purchase_order_id;

  v_new_status := CASE
    WHEN v_all_received THEN 'received'::purchase_order_status
    WHEN v_some_received THEN 'partially_received'::purchase_order_status
    ELSE v_po.status
  END;

  UPDATE purchase_orders SET status = v_new_status, updated_at = now()
    WHERE id = p_purchase_order_id;

  -- Emit platform event
  PERFORM public.emit_platform_event(
    'goods.received',
    jsonb_build_object(
      'receipt_id', v_receipt_id,
      'purchase_order_id', p_purchase_order_id,
      'po_number', v_po.po_number,
      'vendor_id', v_po.vendor_id,
      'lines_received', v_lines_inserted,
      'total_quantity', v_total_qty,
      'po_status', v_new_status
    ),
    'receive_purchase_order'
  );

  RETURN jsonb_build_object(
    'success', true,
    'receipt_id', v_receipt_id,
    'purchase_order_id', p_purchase_order_id,
    'po_status', v_new_status,
    'lines_received', v_lines_inserted,
    'total_quantity', v_total_qty,
    'to_location_id', v_to_loc
  );
END;
$function$;
