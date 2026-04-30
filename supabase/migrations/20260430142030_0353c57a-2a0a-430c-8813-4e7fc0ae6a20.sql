-- ─────────────────────────────────────────────────────────────
-- Pick & Pack flow for Inventory v2
-- ─────────────────────────────────────────────────────────────

-- 1. picking_orders
CREATE TABLE IF NOT EXISTS public.picking_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  picking_number TEXT NOT NULL UNIQUE DEFAULT ('PICK-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6)),
  order_id UUID,
  source_location_id UUID REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','in_progress','picked','shipped','cancelled')),
  assigned_to UUID,
  ship_to_name TEXT,
  ship_to_address JSONB,
  tracking_number TEXT,
  carrier TEXT,
  notes TEXT,
  allocated_at TIMESTAMPTZ,
  picked_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_picking_orders_order ON public.picking_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_picking_orders_status ON public.picking_orders(status);
CREATE INDEX IF NOT EXISTS idx_picking_orders_assigned ON public.picking_orders(assigned_to);

ALTER TABLE public.picking_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage picking_orders" ON public.picking_orders;
CREATE POLICY "Admins manage picking_orders"
ON public.picking_orders FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Employees view picking_orders" ON public.picking_orders;
CREATE POLICY "Employees view picking_orders"
ON public.picking_orders FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'employee') OR assigned_to = auth.uid());

DROP POLICY IF EXISTS "Employees update assigned picking_orders" ON public.picking_orders;
CREATE POLICY "Employees update assigned picking_orders"
ON public.picking_orders FOR UPDATE TO authenticated
USING (assigned_to = auth.uid());

-- 2. picking_lines
CREATE TABLE IF NOT EXISTS public.picking_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  picking_order_id UUID NOT NULL REFERENCES public.picking_orders(id) ON DELETE CASCADE,
  product_id UUID,
  product_sku TEXT,
  product_name TEXT NOT NULL,
  qty_requested NUMERIC NOT NULL CHECK (qty_requested > 0),
  qty_picked NUMERIC NOT NULL DEFAULT 0 CHECK (qty_picked >= 0),
  lot_id UUID REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  reservation_id UUID REFERENCES public.stock_reservations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reserved','picked','short','cancelled')),
  notes TEXT,
  picked_at TIMESTAMPTZ,
  picked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_picking_lines_order ON public.picking_lines(picking_order_id);
CREATE INDEX IF NOT EXISTS idx_picking_lines_status ON public.picking_lines(status);
CREATE INDEX IF NOT EXISTS idx_picking_lines_product ON public.picking_lines(product_id);

ALTER TABLE public.picking_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage picking_lines" ON public.picking_lines;
CREATE POLICY "Admins manage picking_lines"
ON public.picking_lines FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Employees view picking_lines" ON public.picking_lines;
CREATE POLICY "Employees view picking_lines"
ON public.picking_lines FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'employee')
  OR EXISTS (SELECT 1 FROM public.picking_orders po WHERE po.id = picking_order_id AND po.assigned_to = auth.uid())
);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_picking_orders_updated ON public.picking_orders;
CREATE TRIGGER trg_picking_orders_updated
BEFORE UPDATE ON public.picking_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_picking_lines_updated ON public.picking_lines;
CREATE TRIGGER trg_picking_lines_updated
BEFORE UPDATE ON public.picking_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- 3. RPC: allocate_picking
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.allocate_picking(
  p_order_id UUID,
  p_source_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee') OR auth.uid() IS NULL) THEN
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
      COALESCE(v_order.customer_name, v_order.shipping_address->>'name'),
      v_order.shipping_address,
      auth.uid(),
      now()
    )
    RETURNING id INTO v_picking_id;
  END IF;

  -- Iterate order_items
  FOR v_item IN
    SELECT oi.*, p.name AS p_name, p.sku AS p_sku
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
$$;

GRANT EXECUTE ON FUNCTION public.allocate_picking(UUID, UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: confirm_pick
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_pick(
  p_line_id UUID,
  p_qty_picked NUMERIC,
  p_lot_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line RECORD;
  v_picking_id UUID;
  v_all_done BOOLEAN;
BEGIN
  SELECT * INTO v_line FROM public.picking_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking line % not found', p_line_id; END IF;

  v_picking_id := v_line.picking_order_id;

  UPDATE public.picking_lines
  SET qty_picked = p_qty_picked,
      lot_id = COALESCE(p_lot_id, lot_id),
      status = CASE
        WHEN p_qty_picked >= qty_requested THEN 'picked'
        WHEN p_qty_picked > 0 THEN 'short'
        ELSE 'pending'
      END,
      picked_at = now(),
      picked_by = auth.uid()
  WHERE id = p_line_id;

  -- If picking_order was draft/ready, move to in_progress
  UPDATE public.picking_orders
  SET status = 'in_progress'
  WHERE id = v_picking_id AND status IN ('draft','ready');

  -- If ALL lines are picked or short, mark picking_order picked
  SELECT NOT EXISTS (
    SELECT 1 FROM public.picking_lines
    WHERE picking_order_id = v_picking_id
      AND status NOT IN ('picked','short','cancelled')
  ) INTO v_all_done;

  IF v_all_done THEN
    UPDATE public.picking_orders SET status = 'picked', picked_at = now()
    WHERE id = v_picking_id AND status NOT IN ('shipped','cancelled');
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.picked', 'picking_line', p_line_id, auth.uid(),
    jsonb_build_object('picking_order_id', v_picking_id, 'qty_picked', p_qty_picked, 'lot_id', p_lot_id));

  RETURN jsonb_build_object('success', true, 'line_id', p_line_id, 'all_done', v_all_done);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pick(UUID, NUMERIC, UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. RPC: ship_picking
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ship_picking(
  p_picking_order_id UUID,
  p_tracking_number TEXT DEFAULT NULL,
  p_carrier TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po RECORD;
  v_line RECORD;
  v_consumed INT := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_po FROM public.picking_orders WHERE id = p_picking_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking order % not found', p_picking_order_id; END IF;
  IF v_po.status = 'shipped' THEN
    RETURN jsonb_build_object('success', true, 'already_shipped', true);
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot ship cancelled picking_order';
  END IF;

  -- Consume each reserved line
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND status = 'picked' LOOP
    IF v_line.reservation_id IS NOT NULL THEN
      BEGIN
        PERFORM public.consume_reservation(v_line.reservation_id, v_line.qty_picked);
        v_consumed := v_consumed + 1;
      EXCEPTION WHEN OTHERS THEN
        -- log but continue
        INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
        VALUES ('picking.consume_failed', 'picking_line', v_line.id, auth.uid(),
          jsonb_build_object('error', SQLERRM));
      END;
    END IF;
  END LOOP;

  UPDATE public.picking_orders
  SET status = 'shipped',
      shipped_at = now(),
      tracking_number = COALESCE(p_tracking_number, tracking_number),
      carrier = COALESCE(p_carrier, carrier)
  WHERE id = p_picking_order_id;

  -- Update underlying order status
  IF v_po.order_id IS NOT NULL THEN
    UPDATE public.orders SET status = 'shipped', updated_at = now()
    WHERE id = v_po.order_id;
  END IF;

  -- Emit platform event if helper exists
  BEGIN
    PERFORM public.emit_platform_event(
      'picking.shipped',
      jsonb_build_object(
        'picking_order_id', p_picking_order_id,
        'order_id', v_po.order_id,
        'tracking_number', p_tracking_number,
        'consumed_lines', v_consumed
      ),
      'pick_pack'
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.shipped', 'picking_order', p_picking_order_id, auth.uid(),
    jsonb_build_object('order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'consumed', v_consumed));

  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id, 'consumed_lines', v_consumed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ship_picking(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. RPC: cancel_picking
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_picking(
  p_picking_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Release reservations
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND reservation_id IS NOT NULL LOOP
    BEGIN
      PERFORM public.cancel_reservation(v_line.reservation_id);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  UPDATE public.picking_lines
  SET status = 'cancelled'
  WHERE picking_order_id = p_picking_order_id AND status NOT IN ('picked','cancelled');

  UPDATE public.picking_orders
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  WHERE id = p_picking_order_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.cancelled', 'picking_order', p_picking_order_id, auth.uid(),
    jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_picking(UUID, TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 7. Trigger: on order paid, emit event for auto-allocation
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tr_orders_emit_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    BEGIN
      PERFORM public.emit_platform_event(
        'order.paid',
        jsonb_build_object('order_id', NEW.id, 'total', NEW.total_amount, 'customer_id', NEW.customer_id),
        'orders'
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_emit_paid ON public.orders;
CREATE TRIGGER trg_orders_emit_paid
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tr_orders_emit_paid();