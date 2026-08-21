-- The picking chain has never once moved a unit of stock.
--
-- Found by trying to run it. `sandbox_seed_o2c()` sells 30 kg of coffee out of
-- the 120 kg that `sandbox_seed_p2p()` received, and asserted that the balance
-- fell. It did not — and the three reasons are all the same shape: a call that
-- cannot resolve, wrapped in a handler that reports success.
--
--   1. allocate_picking → reserve_stock(..., 'picking_order', v_picking_id)
--      p_reference_id is text; v_picking_id is uuid. There is no implicit
--      uuid→text cast, so Postgres raises 42883 "function ... does not exist".
--      `EXCEPTION WHEN OTHERS` counted it as short stock. Every picking line
--      ever allocated, on every instance, came out `status='short'` with
--      reservation_id NULL — and the envelope said {"success": true}.
--
--   2. ship_picking → consume_reservation(v_line.reservation_id, v_line.qty_picked)
--      The second parameter is `p_to_location_code text`, a LOCATION CODE, not a
--      quantity. numeric→text does not cast implicitly either, so this is 42883
--      as well, swallowed into an audit row nobody reads. `consumed_lines` came
--      back 0 and the order flipped to 'shipped' regardless.
--
--   3. Even repaired, the two calls would have double-counted: the AFTER INSERT
--      trigger on order_items (trg_order_item_stock_decrement, 20260820210005)
--      already writes the outbound move and the quant delta at order-entry time.
--      A second delta at shipment would take 30 units off the books twice while
--      30 sat on the shelf.
--
-- 1 and 2 are unambiguous: the functions could not work as written. 3 is a
-- decision, so it is made explicitly here rather than absorbed — see the
-- ownership rule on consume_reservation below.
--
-- The class this belongs to: a guard that reports success while the world did
-- not change. `EXCEPTION WHEN OTHERS` cannot tell "there is not enough stock"
-- (a business outcome, and a real one) from "that function does not exist" (a
-- defect). Conflating them is what let this survive from the baseline until a
-- process was run against it for real. Both handlers below now re-raise the
-- undefined-object class and keep the business outcome.
--
-- Idempotent, and forward-dated so managed instances actually apply it.

-- ---------------------------------------------------------------------------
-- consume_reservation: who owns the balance
-- ---------------------------------------------------------------------------
-- p_move_stock says whether this call is the one that takes the goods off the
-- shelf. It is true by default, which is the standalone case (an MO consuming
-- components, an agent shipping a reservation it made itself) and preserves
-- every existing caller and the `consume_reservation` skill unchanged.
--
-- ship_picking passes false for an order-linked picking, because order entry
-- already moved those goods. One writer per balance: order_items owns the
-- quantity, the picking chain owns the reservation lifecycle and the shipment
-- record. That is a divergence from Odoo, where the delivery order's validation
-- is what moves stock and the sales order only reserves — noted so the next
-- person meets the decision instead of re-deriving it from a discrepancy.
-- The two-argument form must go, or the new one is an overload and every
-- existing two-argument call becomes ambiguous (42725). Dropping first is the
-- only way to widen a signature that carries a default.
DROP FUNCTION IF EXISTS public.consume_reservation(uuid, text);

CREATE OR REPLACE FUNCTION public.consume_reservation(
  p_reservation_id uuid,
  p_to_location_code text DEFAULT 'WH/CUSTOMERS'::text,
  p_move_stock boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r stock_reservations%ROWTYPE; v_to uuid; v_move uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(auth.uid(), 'writer'::app_role)
          OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  SELECT * INTO r FROM stock_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.state <> 'reserved' THEN RAISE EXCEPTION 'Reservation not in reserved state'; END IF;

  SELECT id INTO v_to FROM stock_locations WHERE code = p_to_location_code;
  IF v_to IS NULL THEN RAISE EXCEPTION 'Destination location % not found', p_to_location_code; END IF;

  -- Releasing the hold happens either way: the reservation is over, so the
  -- quantity must stop counting as spoken-for or it strands available stock.
  UPDATE stock_quants
     SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - r.quantity),
         updated_at = now()
   WHERE product_id = r.product_id AND location_id = r.location_id
     AND (lot_id IS NOT DISTINCT FROM r.lot_id);

  IF p_move_stock THEN
    PERFORM _upsert_quant(r.product_id, r.location_id, r.lot_id, -r.quantity);
    PERFORM _upsert_quant(r.product_id, v_to, r.lot_id, r.quantity);

    INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id,
                             lot_id, reference_type, reference_id, created_by, state)
    VALUES (r.product_id, r.quantity::int, 'reservation_consumed', r.location_id, v_to,
            r.lot_id, r.reference_type, r.reference_id, auth.uid(), 'done')
    RETURNING id INTO v_move;
  END IF;

  UPDATE stock_reservations SET state = 'consumed', consumed_at = now() WHERE id = p_reservation_id;
  RETURN v_move;
END; $function$;

-- ---------------------------------------------------------------------------
-- allocate_picking: reserve for real, and tell the truth when it fails
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_picking(
  p_order_id uuid,
  p_source_location_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_picking_id UUID;
  v_order RECORD;
  v_item RECORD;
  v_line_id UUID;
  v_reservation_id UUID;
  v_source_location UUID;
  v_short_count INT := 0;
  v_total_count INT := 0;
  v_short_reason TEXT;
  v_lines JSONB := '[]'::JSONB;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_source_location := COALESCE(
    p_source_location_id,
    (SELECT id FROM public.stock_locations
      WHERE location_type = 'internal' AND is_active = true ORDER BY created_at LIMIT 1)
  );

  -- Idempotency: reuse an open picking_order for this order if one exists.
  SELECT id INTO v_picking_id
    FROM public.picking_orders
   WHERE order_id = p_order_id AND status IN ('draft','ready','in_progress')
   LIMIT 1;

  IF v_picking_id IS NULL THEN
    INSERT INTO public.picking_orders (order_id, source_location_id, status, ship_to_name,
                                       ship_to_address, created_by, allocated_at)
    VALUES (p_order_id, v_source_location, 'ready', v_order.customer_name, NULL, auth.uid(), now())
    RETURNING id INTO v_picking_id;
  END IF;

  -- products has no `sku` column — `barcode` carries the SKU value.
  FOR v_item IN
    SELECT oi.*, p.name AS p_name, p.barcode AS p_sku
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = p_order_id
  LOOP
    v_total_count := v_total_count + 1;
    v_reservation_id := NULL;
    v_short_reason := NULL;

    BEGIN
      -- ::text — p_reference_id is text. Without the cast this call does not
      -- resolve and no line has ever been reserved.
      v_reservation_id := public.reserve_stock(
        v_item.product_id,
        v_source_location,
        v_item.quantity,
        'picking_order',
        v_picking_id::text
      );
    EXCEPTION
      -- A missing function, column or table is a defect in this function, not a
      -- statement about the warehouse. Let it out.
      WHEN undefined_function OR undefined_column OR undefined_table THEN
        RAISE;
      WHEN OTHERS THEN
        v_short_count := v_short_count + 1;
        v_short_reason := left(SQLERRM, 200);
    END;

    INSERT INTO public.picking_lines (
      picking_order_id, product_id, product_sku, product_name,
      qty_requested, reservation_id, status, notes
    )
    VALUES (
      v_picking_id, v_item.product_id, v_item.p_sku, COALESCE(v_item.p_name, 'Product'),
      v_item.quantity, v_reservation_id,
      CASE WHEN v_reservation_id IS NOT NULL THEN 'reserved' ELSE 'short' END,
      v_short_reason
    )
    RETURNING id INTO v_line_id;

    v_lines := v_lines || jsonb_build_object(
      'line_id', v_line_id,
      'product_id', v_item.product_id,
      'qty', v_item.quantity,
      'reserved', v_reservation_id IS NOT NULL,
      'short_reason', v_short_reason
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.allocated', 'picking_order', v_picking_id, auth.uid(),
    jsonb_build_object('order_id', p_order_id, 'lines', v_total_count, 'short', v_short_count));

  RETURN jsonb_build_object(
    'success', true,
    'picking_order_id', v_picking_id,
    'lines_total', v_total_count,
    'lines_short', v_short_count,
    'lines', v_lines
  );
END; $function$;

-- ---------------------------------------------------------------------------
-- ship_picking: consume with the right arity, and do not claim a shipment that
-- consumed nothing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ship_picking(
  p_picking_order_id uuid,
  p_tracking_number text DEFAULT NULL::text,
  p_carrier text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD; v_line RECORD;
  v_consumed INT := 0; v_reserved_lines INT := 0; v_failed jsonb := '[]'::jsonb;
  v_carrier_id uuid; v_carrier_code text; v_active_count int;
  v_move_stock boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_po FROM public.picking_orders WHERE id = p_picking_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking order % not found', p_picking_order_id; END IF;
  IF v_po.status = 'shipped' THEN RETURN jsonb_build_object('success', true, 'already_shipped', true); END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot ship cancelled picking_order'; END IF;

  -- 4b85909f: resolve p_carrier against the carriers table (id, code or name,
  -- case-insensitive). Unknown values are rejected while active carriers
  -- exist; when none are configured yet, free text passes (fail forward).
  IF p_carrier IS NOT NULL AND btrim(p_carrier) <> '' THEN
    SELECT c.id, c.code INTO v_carrier_id, v_carrier_code
      FROM public.carriers c
     WHERE c.is_active
       AND (c.id::text = btrim(p_carrier)
            OR lower(c.code) = lower(btrim(p_carrier))
            OR lower(c.name) = lower(btrim(p_carrier)))
     LIMIT 1;
    IF v_carrier_id IS NULL THEN
      SELECT count(*) INTO v_active_count FROM public.carriers WHERE is_active;
      IF v_active_count > 0 THEN
        RAISE EXCEPTION 'Unknown carrier "%" — pass an active carrier id, code or name. Active carriers: %',
          p_carrier, (SELECT string_agg(code, ', ' ORDER BY code) FROM public.carriers WHERE is_active);
      END IF;
    END IF;
  END IF;

  -- Order entry already took these goods off the shelf (trg_order_item_stock_decrement).
  -- A picking with no order behind it — an agent's own reservation — has not.
  v_move_stock := (v_po.order_id IS NULL);

  FOR v_line IN
    SELECT * FROM public.picking_lines
     WHERE picking_order_id = p_picking_order_id AND status = 'picked'
  LOOP
    IF v_line.reservation_id IS NOT NULL THEN
      v_reserved_lines := v_reserved_lines + 1;
      BEGIN
        -- Two arguments, not three: the second is a LOCATION CODE. Passing
        -- qty_picked here is what made this call unresolvable.
        PERFORM public.consume_reservation(v_line.reservation_id, 'WH/CUSTOMERS', v_move_stock);
        v_consumed := v_consumed + 1;
      EXCEPTION
        WHEN undefined_function OR undefined_column OR undefined_table THEN
          RAISE;
        WHEN OTHERS THEN
          v_failed := v_failed || jsonb_build_object('line_id', v_line.id, 'error', left(SQLERRM, 200));
          INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
          VALUES ('picking.consume_failed', 'picking_line', v_line.id, auth.uid(),
                  jsonb_build_object('error', SQLERRM));
      END;
    END IF;
  END LOOP;

  UPDATE public.picking_orders
     SET status = 'shipped', shipped_at = now(),
         tracking_number = COALESCE(p_tracking_number, tracking_number),
         carrier = COALESCE(v_carrier_code, p_carrier, carrier),
         carrier_id = COALESCE(v_carrier_id, carrier_id)
   WHERE id = p_picking_order_id;

  IF v_po.order_id IS NOT NULL THEN
    UPDATE public.orders SET status = 'shipped', updated_at = now() WHERE id = v_po.order_id;
  END IF;

  BEGIN
    PERFORM public.emit_platform_event('picking.shipped', jsonb_build_object(
      'picking_order_id', p_picking_order_id, 'order_id', v_po.order_id,
      'tracking_number', p_tracking_number, 'carrier_id', v_carrier_id,
      'consumed_lines', v_consumed), 'pick_pack');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.shipped', 'picking_order', p_picking_order_id, auth.uid(),
          jsonb_build_object('order_id', v_po.order_id, 'tracking_number', p_tracking_number,
                             'carrier_id', v_carrier_id, 'consumed', v_consumed));

  -- reserved_lines vs consumed is the whole point: a caller that reads only
  -- `success` cannot tell a shipment from a status change. Now it can.
  RETURN jsonb_build_object(
    'success', true,
    'picking_order_id', p_picking_order_id,
    'reserved_lines', v_reserved_lines,
    'consumed_lines', v_consumed,
    'stock_moved', v_move_stock,
    'failed_lines', v_failed,
    'carrier_id', v_carrier_id,
    'carrier_code', v_carrier_code
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.consume_reservation(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_picking(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ship_picking(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.consume_reservation(uuid, text, boolean) IS
  'Ends a reservation. Always releases the hold; moves the quants only when p_move_stock (default true). ship_picking passes false for order-linked pickings because trg_order_item_stock_decrement already moved those goods.';

-- ---------------------------------------------------------------------------
-- Grants: DROP + recreate re-arms the PUBLIC default
-- ---------------------------------------------------------------------------
-- Widening consume_reservation's signature meant dropping the old one, and a
-- freshly created function is EXECUTE-able by PUBLIC unless something says
-- otherwise. That silently re-opened an anon-reachable SECURITY DEFINER
-- function that moves stock — the exact class fb7d9e5/dd322e6 had just closed.
-- ALTER DEFAULT PRIVILEGES covers this going forward, but a migration must not
-- depend on having been applied after that one.
--
-- allocate_picking and ship_picking were anon-reachable before this commit too
-- (=X/postgres and an explicit anon grant, straight from the baseline). Same
-- revoke, same reason: three functions that mutate the warehouse have no
-- business being callable without a session.
DO $revoke$
DECLARE v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('consume_reservation', 'allocate_picking', 'ship_picking')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn.sig);
  END LOOP;
END $revoke$;
