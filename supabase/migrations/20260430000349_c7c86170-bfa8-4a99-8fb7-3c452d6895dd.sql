
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'internal'
    CHECK (location_type IN ('internal','vendor','customer','transit','scrap','production','view')),
  parent_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_locations_parent ON public.stock_locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_stock_locations_type ON public.stock_locations(location_type);
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view locations" ON public.stock_locations;
CREATE POLICY "Authenticated can view locations" ON public.stock_locations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage locations" ON public.stock_locations;
CREATE POLICY "Admins manage locations" ON public.stock_locations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.stock_locations (code, name, location_type) VALUES
  ('WH/MAIN','Main Warehouse','internal'),
  ('WH/TRANSIT','In Transit','transit'),
  ('WH/SCRAP','Scrap','scrap'),
  ('WH/VENDORS','Vendors','vendor'),
  ('WH/CUSTOMERS','Customers','customer'),
  ('WH/PRODUCTION','Production','production')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  lot_type text NOT NULL DEFAULT 'lot' CHECK (lot_type IN ('lot','serial')),
  expiry_date date, manufactured_at timestamptz, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, lot_number)
);
CREATE INDEX IF NOT EXISTS idx_stock_lots_product ON public.stock_lots(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_lots_expiry ON public.stock_lots(expiry_date) WHERE expiry_date IS NOT NULL;
ALTER TABLE public.stock_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view lots" ON public.stock_lots;
CREATE POLICY "Authenticated can view lots" ON public.stock_lots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Writers manage lots" ON public.stock_lots;
CREATE POLICY "Writers manage lots" ON public.stock_lots FOR ALL TO authenticated
  USING (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.stock_quants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 0,
  reserved_quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_id, lot_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_quants_product ON public.stock_quants(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_quants_location ON public.stock_quants(location_id);
ALTER TABLE public.stock_quants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view quants" ON public.stock_quants;
CREATE POLICY "Authenticated can view quants" ON public.stock_quants FOR SELECT TO authenticated USING (true);

ALTER TABLE public.stock_moves
  ADD COLUMN IF NOT EXISTS from_location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'done' CHECK (state IN ('draft','done','cancelled'));
CREATE INDEX IF NOT EXISTS idx_stock_moves_from_loc ON public.stock_moves(from_location_id) WHERE from_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_moves_to_loc ON public.stock_moves(to_location_id) WHERE to_location_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','consumed','cancelled')),
  reference_type text, reference_id text, reserved_by uuid,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz, cancelled_at timestamptz, notes text
);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product ON public.stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_state ON public.stock_reservations(state);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_ref ON public.stock_reservations(reference_type, reference_id) WHERE reference_id IS NOT NULL;
ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view reservations" ON public.stock_reservations;
CREATE POLICY "Authenticated can view reservations" ON public.stock_reservations FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.reorder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  min_qty numeric NOT NULL DEFAULT 0,
  max_qty numeric NOT NULL DEFAULT 0,
  reorder_qty numeric, lead_time_days integer NOT NULL DEFAULT 7,
  preferred_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  procurement_method text NOT NULL DEFAULT 'buy' CHECK (procurement_method IN ('buy','manufacture')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_product ON public.reorder_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_reorder_rules_active ON public.reorder_rules(is_active) WHERE is_active;
ALTER TABLE public.reorder_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view reorder rules" ON public.reorder_rules;
CREATE POLICY "Authenticated can view reorder rules" ON public.reorder_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage reorder rules" ON public.reorder_rules;
CREATE POLICY "Admins manage reorder rules" ON public.reorder_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.procurement_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  suggested_qty numeric NOT NULL,
  procurement_method text NOT NULL CHECK (procurement_method IN ('buy','manufacture')),
  preferred_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  needed_by date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','materialized')),
  source text NOT NULL DEFAULT 'procurement_run',
  reasoning jsonb,
  materialized_ref_type text, materialized_ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by uuid
);
CREATE INDEX IF NOT EXISTS idx_proc_sugg_status ON public.procurement_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_proc_sugg_product ON public.procurement_suggestions(product_id);
ALTER TABLE public.procurement_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view suggestions" ON public.procurement_suggestions;
CREATE POLICY "Authenticated can view suggestions" ON public.procurement_suggestions FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public._upsert_quant(_product_id uuid, _location_id uuid, _lot_id uuid, _delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.stock_quants (product_id, location_id, lot_id, quantity, updated_at)
  VALUES (_product_id, _location_id, _lot_id, _delta, now())
  ON CONFLICT (product_id, location_id, lot_id)
  DO UPDATE SET quantity = stock_quants.quantity + _delta, updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_stock(p_product_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity numeric, p_lot_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_move_id uuid; v_available numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  SELECT COALESCE(quantity,0) INTO v_available FROM stock_quants
    WHERE product_id = p_product_id AND location_id = p_from_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  IF COALESCE(v_available,0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock at source (have %, need %)', COALESCE(v_available,0), p_quantity;
  END IF;
  PERFORM _upsert_quant(p_product_id, p_from_location_id, p_lot_id, -p_quantity);
  PERFORM _upsert_quant(p_product_id, p_to_location_id, p_lot_id, p_quantity);
  INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, notes, created_by, state)
  VALUES (p_product_id, p_quantity::int, 'transfer', p_from_location_id, p_to_location_id, p_lot_id, p_notes, auth.uid(), 'done')
  RETURNING id INTO v_move_id;
  RETURN v_move_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_stock(p_product_id uuid, p_location_id uuid, p_quantity numeric, p_reference_type text DEFAULT NULL, p_reference_id text DEFAULT NULL, p_lot_id uuid DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_avail numeric; v_reserved numeric;
BEGIN
  IF NOT (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  SELECT COALESCE(quantity,0), COALESCE(reserved_quantity,0) INTO v_avail, v_reserved
    FROM stock_quants WHERE product_id = p_product_id AND location_id = p_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  IF (COALESCE(v_avail,0) - COALESCE(v_reserved,0)) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient available stock to reserve (free %, need %)', (COALESCE(v_avail,0) - COALESCE(v_reserved,0)), p_quantity;
  END IF;
  INSERT INTO stock_reservations (product_id, location_id, lot_id, quantity, reference_type, reference_id, reserved_by, notes)
  VALUES (p_product_id, p_location_id, p_lot_id, p_quantity, p_reference_type, p_reference_id, auth.uid(), p_notes) RETURNING id INTO v_id;
  UPDATE stock_quants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_quantity, updated_at = now()
    WHERE product_id = p_product_id AND location_id = p_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r stock_reservations%ROWTYPE;
BEGIN
  IF NOT (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  SELECT * INTO r FROM stock_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.state <> 'reserved' THEN RAISE EXCEPTION 'Reservation not in reserved state (%)', r.state; END IF;
  UPDATE stock_reservations SET state='cancelled', cancelled_at=now() WHERE id=p_reservation_id;
  UPDATE stock_quants SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - r.quantity), updated_at = now()
    WHERE product_id = r.product_id AND location_id = r.location_id AND (lot_id IS NOT DISTINCT FROM r.lot_id);
END; $$;

CREATE OR REPLACE FUNCTION public.consume_reservation(p_reservation_id uuid, p_to_location_code text DEFAULT 'WH/CUSTOMERS')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r stock_reservations%ROWTYPE; v_to uuid; v_move uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  SELECT * INTO r FROM stock_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.state <> 'reserved' THEN RAISE EXCEPTION 'Reservation not in reserved state'; END IF;
  SELECT id INTO v_to FROM stock_locations WHERE code = p_to_location_code;
  IF v_to IS NULL THEN RAISE EXCEPTION 'Destination location % not found', p_to_location_code; END IF;
  UPDATE stock_quants SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - r.quantity), updated_at = now()
    WHERE product_id = r.product_id AND location_id = r.location_id AND (lot_id IS NOT DISTINCT FROM r.lot_id);
  PERFORM _upsert_quant(r.product_id, r.location_id, r.lot_id, -r.quantity);
  PERFORM _upsert_quant(r.product_id, v_to, r.lot_id, r.quantity);
  INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, reference_type, reference_id, created_by, state)
  VALUES (r.product_id, r.quantity::int, 'reservation_consumed', r.location_id, v_to, r.lot_id, r.reference_type, r.reference_id, auth.uid(), 'done')
  RETURNING id INTO v_move;
  UPDATE stock_reservations SET state='consumed', consumed_at=now() WHERE id=p_reservation_id;
  RETURN v_move;
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_quant(p_product_id uuid, p_location_id uuid, p_qty_delta numeric, p_lot_id uuid DEFAULT NULL, p_reason text DEFAULT 'manual_adjustment')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_move uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_qty_delta = 0 THEN RAISE EXCEPTION 'Delta cannot be zero'; END IF;
  PERFORM _upsert_quant(p_product_id, p_location_id, p_lot_id, p_qty_delta);
  INSERT INTO stock_moves (product_id, quantity, move_type, to_location_id, lot_id, notes, created_by, state)
  VALUES (p_product_id, ABS(p_qty_delta)::int, 'adjustment', p_location_id, p_lot_id, p_reason, auth.uid(), 'done')
  RETURNING id INTO v_move;
  RETURN v_move;
END; $$;

CREATE OR REPLACE FUNCTION public.procurement_run()
RETURNS TABLE(suggestions_created integer, rules_evaluated integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rule record; v_on_hand numeric; v_reserved numeric; v_incoming numeric; v_virtual numeric; v_qty_to_order numeric; v_count integer := 0; v_evaluated integer := 0;
BEGIN
  IF NOT (has_role(auth.uid(),'writer'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  FOR v_rule IN SELECT * FROM reorder_rules WHERE is_active = true LOOP
    v_evaluated := v_evaluated + 1;
    SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(reserved_quantity),0) INTO v_on_hand, v_reserved
      FROM stock_quants WHERE product_id = v_rule.product_id AND location_id = v_rule.location_id;
    SELECT COALESCE(SUM(pol.quantity - COALESCE(pol.received_quantity,0)),0) INTO v_incoming
      FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE pol.product_id = v_rule.product_id AND po.status IN ('draft','sent','confirmed','partial');
    v_virtual := v_on_hand - v_reserved + COALESCE(v_incoming,0);
    IF v_virtual < v_rule.min_qty THEN
      v_qty_to_order := COALESCE(NULLIF(v_rule.reorder_qty,0), v_rule.max_qty - v_virtual);
      IF v_qty_to_order <= 0 THEN v_qty_to_order := v_rule.min_qty - v_virtual; END IF;
      IF NOT EXISTS (SELECT 1 FROM procurement_suggestions WHERE product_id = v_rule.product_id AND location_id = v_rule.location_id AND status = 'pending') THEN
        INSERT INTO procurement_suggestions (product_id, location_id, suggested_qty, procurement_method, preferred_vendor_id, needed_by, reasoning)
        VALUES (v_rule.product_id, v_rule.location_id, v_qty_to_order, v_rule.procurement_method, v_rule.preferred_vendor_id,
          (CURRENT_DATE + (v_rule.lead_time_days || ' days')::interval)::date,
          jsonb_build_object('on_hand', v_on_hand, 'reserved', v_reserved, 'incoming', v_incoming, 'virtual', v_virtual, 'min_qty', v_rule.min_qty, 'max_qty', v_rule.max_qty));
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_count, v_evaluated;
END; $$;

CREATE OR REPLACE FUNCTION public.approve_procurement_suggestion(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s procurement_suggestions%ROWTYPE; v_po_id uuid; v_po_number text; v_unit_price integer; v_total integer; v_bom uuid; v_mo uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Only admins can approve procurement suggestions'; END IF;
  SELECT * INTO s FROM procurement_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Suggestion already %', s.status; END IF;
  IF s.procurement_method = 'buy' THEN
    IF s.preferred_vendor_id IS NULL THEN RAISE EXCEPTION 'No preferred vendor; cannot create PO'; END IF;
    v_po_number := 'PO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);
    SELECT COALESCE(price_cents,0) INTO v_unit_price FROM products WHERE id = s.product_id;
    v_total := COALESCE(v_unit_price,0) * s.suggested_qty::int;
    INSERT INTO purchase_orders (po_number, vendor_id, status, order_date, expected_delivery, subtotal_cents, total_cents, created_by)
    VALUES (v_po_number, s.preferred_vendor_id, 'draft', CURRENT_DATE, s.needed_by, v_total, v_total, auth.uid())
    RETURNING id INTO v_po_id;
    INSERT INTO purchase_order_lines (purchase_order_id, product_id, quantity, unit_price_cents, total_cents)
    VALUES (v_po_id, s.product_id, s.suggested_qty::int, COALESCE(v_unit_price,0), v_total);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='purchase_order', materialized_ref_id=v_po_id WHERE id=p_id;
    RETURN jsonb_build_object('type','purchase_order','id',v_po_id,'po_number',v_po_number);
  ELSIF s.procurement_method = 'manufacture' THEN
    SELECT id INTO v_bom FROM bom_headers WHERE product_id = s.product_id AND is_active = true LIMIT 1;
    IF v_bom IS NULL THEN RAISE EXCEPTION 'No active BOM for product %', s.product_id; END IF;
    v_mo := create_manufacturing_order(v_bom, s.suggested_qty::int, s.needed_by);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='manufacturing_order', materialized_ref_id=v_mo WHERE id=p_id;
    RETURN jsonb_build_object('type','manufacturing_order','id',v_mo);
  END IF;
  RAISE EXCEPTION 'Unknown procurement_method %', s.procurement_method;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_procurement_suggestion(p_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'Only admins can reject suggestions'; END IF;
  UPDATE procurement_suggestions SET status='rejected', resolved_at=now(), resolved_by=auth.uid(),
    reasoning = COALESCE(reasoning,'{}'::jsonb) || jsonb_build_object('rejection_reason', p_reason)
    WHERE id = p_id AND status = 'pending';
END; $$;

DROP TRIGGER IF EXISTS trg_stock_locations_updated ON public.stock_locations;
CREATE TRIGGER trg_stock_locations_updated BEFORE UPDATE ON public.stock_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_stock_lots_updated ON public.stock_lots;
CREATE TRIGGER trg_stock_lots_updated BEFORE UPDATE ON public.stock_lots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_reorder_rules_updated ON public.reorder_rules;
CREATE TRIGGER trg_reorder_rules_updated BEFORE UPDATE ON public.reorder_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
