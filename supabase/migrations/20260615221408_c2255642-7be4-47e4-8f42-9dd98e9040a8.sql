-- Fix: allocate_picking referenced TWO non-existent columns and crashed on every order.
--
-- 1. orders.shipping_address — does not exist (orders has only customer_name/email), so
--    "record v_order has no field shipping_address" fired before any work was done.
-- 2. products.sku — does not exist (products has name/barcode), so the order_items loop
--    then threw "column p.sku does not exist".
-- Both surfaced by an external MCP sweep (Hermes, P0); verified on demo after each fix.
--
-- Fix: ship_to_name ← orders.customer_name; ship_to_address ← NULL (orders has no
-- structured shipping address — a separate data-model gap); product_sku ← products.barcode.
-- Idempotent CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.allocate_picking(p_order_id uuid, p_source_location_id uuid DEFAULT NULL::uuid)
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
  v_lines JSONB := '[]'::JSONB;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee')) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Pick default source location if not given
  v_source_location := COALESCE(
    p_source_location_id,
    (SELECT id FROM public.stock_locations WHERE location_type = 'internal' AND is_active = true ORDER BY created_at LIMIT 1)
  );

  -- Idempotency: reuse open picking_order for this order if exists
  SELECT id INTO v_picking_id
  FROM public.picking_orders
  WHERE order_id = p_order_id AND status IN ('draft','ready','in_progress')
  LIMIT 1;

  IF v_picking_id IS NULL THEN
    INSERT INTO public.picking_orders (order_id, source_location_id, status, ship_to_name, ship_to_address, created_by, allocated_at)
    VALUES (
      p_order_id,
      v_source_location,
      'ready',
      v_order.customer_name,
      NULL,
      auth.uid(),
      now()
    )
    RETURNING id INTO v_picking_id;
  END IF;

  -- Iterate order_items (products has no `sku` column — use `barcode` as the SKU value)
  FOR v_item IN
    SELECT oi.*, p.name AS p_name, p.barcode AS p_sku
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_total_count := v_total_count + 1;
    v_reservation_id := NULL;

    -- Try reserve
    BEGIN
      v_reservation_id := public.reserve_stock(
        v_item.product_id,
        v_source_location,
        v_item.quantity,
        'picking_order',
        v_picking_id
      );
    EXCEPTION WHEN OTHERS THEN
      v_short_count := v_short_count + 1;
    END;

    INSERT INTO public.picking_lines (
      picking_order_id, product_id, product_sku, product_name,
      qty_requested, reservation_id, status
    )
    VALUES (
      v_picking_id, v_item.product_id, v_item.p_sku, COALESCE(v_item.p_name, 'Product'),
      v_item.quantity, v_reservation_id,
      CASE WHEN v_reservation_id IS NOT NULL THEN 'reserved' ELSE 'short' END
    )
    RETURNING id INTO v_line_id;

    v_lines := v_lines || jsonb_build_object(
      'line_id', v_line_id,
      'product_id', v_item.product_id,
      'qty', v_item.quantity,
      'reserved', v_reservation_id IS NOT NULL
    );
  END LOOP;

  -- Audit
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
END;
$function$;
