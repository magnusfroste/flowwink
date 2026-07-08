
-- =============================================================
-- INVENTORY PARITY R12 — receiving, transfers, expiry, ABC
-- =============================================================

CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL DEFAULT ('RCP-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,8)),
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','quality_check','putaway','done','cancelled')),
  received_at timestamptz NOT NULL DEFAULT now(),
  qc_at timestamptz, putaway_at timestamptz, done_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_receipts TO authenticated;
GRANT ALL ON public.inventory_receipts TO service_role;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view receipts" ON public.inventory_receipts;
DROP POLICY IF EXISTS "Writers manage receipts" ON public.inventory_receipts;
CREATE POLICY "Authenticated view receipts" ON public.inventory_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers manage receipts" ON public.inventory_receipts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'));

CREATE TABLE IF NOT EXISTS public.inventory_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.inventory_receipts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  qc_status text NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending','passed','failed')),
  qc_notes text,
  target_location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  putaway_move_id uuid REFERENCES public.stock_moves(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_receipt_lines TO authenticated;
GRANT ALL ON public.inventory_receipt_lines TO service_role;
ALTER TABLE public.inventory_receipt_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view receipt lines" ON public.inventory_receipt_lines;
DROP POLICY IF EXISTS "Writers manage receipt lines" ON public.inventory_receipt_lines;
CREATE POLICY "Authenticated view receipt lines" ON public.inventory_receipt_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers manage receipt lines" ON public.inventory_receipt_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'));

CREATE INDEX IF NOT EXISTS idx_inv_receipt_lines_receipt ON public.inventory_receipt_lines(receipt_id);

CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL DEFAULT ('TR-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,8)),
  from_location_id uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  to_location_id   uuid NOT NULL REFERENCES public.stock_locations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_transit','done','cancelled')),
  scheduled_date date,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_location_id <> to_location_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfers TO authenticated;
GRANT ALL ON public.inventory_transfers TO service_role;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view transfers" ON public.inventory_transfers;
DROP POLICY IF EXISTS "Writers manage transfers" ON public.inventory_transfers;
CREATE POLICY "Authenticated view transfers" ON public.inventory_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers manage transfers" ON public.inventory_transfers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'));

CREATE TABLE IF NOT EXISTS public.inventory_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.stock_lots(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  move_id uuid REFERENCES public.stock_moves(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transfer_lines TO authenticated;
GRANT ALL ON public.inventory_transfer_lines TO service_role;
ALTER TABLE public.inventory_transfer_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view transfer lines" ON public.inventory_transfer_lines;
DROP POLICY IF EXISTS "Writers manage transfer lines" ON public.inventory_transfer_lines;
CREATE POLICY "Authenticated view transfer lines" ON public.inventory_transfer_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Writers manage transfer lines" ON public.inventory_transfer_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer'));

CREATE INDEX IF NOT EXISTS idx_inv_transfer_lines_transfer ON public.inventory_transfer_lines(transfer_id);

CREATE OR REPLACE FUNCTION public.complete_inventory_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tr public.inventory_transfers%ROWTYPE;
  v_line record;
  v_move_id uuid;
  v_moves int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO v_tr FROM public.inventory_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
  IF v_tr.status = 'done' THEN RETURN jsonb_build_object('ok',true,'already_done',true); END IF;
  IF v_tr.status = 'cancelled' THEN RAISE EXCEPTION 'transfer_cancelled'; END IF;

  FOR v_line IN SELECT * FROM public.inventory_transfer_lines WHERE transfer_id = p_transfer_id LOOP
    INSERT INTO public.stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, reference_type, reference_id, state, notes)
    VALUES (v_line.product_id, v_line.quantity::int, 'transfer', v_tr.from_location_id, v_tr.to_location_id, v_line.lot_id, 'inventory_transfer', p_transfer_id::text, 'done', 'Transfer ' || v_tr.reference)
    RETURNING id INTO v_move_id;
    UPDATE public.inventory_transfer_lines SET move_id = v_move_id WHERE id = v_line.id;
    v_moves := v_moves + 1;
  END LOOP;

  UPDATE public.inventory_transfers SET status='done', completed_at=now(), updated_at=now() WHERE id = p_transfer_id;
  RETURN jsonb_build_object('ok',true,'transfer_id',p_transfer_id,'moves_posted',v_moves);
END $$;
GRANT EXECUTE ON FUNCTION public.complete_inventory_transfer(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.advance_inventory_receipt(p_receipt_id uuid, p_to_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rcp public.inventory_receipts%ROWTYPE;
  v_line record; v_move_id uuid; v_posted int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_to_status NOT IN ('quality_check','putaway','done','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT * INTO v_rcp FROM public.inventory_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found'; END IF;

  IF p_to_status = 'putaway' THEN
    FOR v_line IN SELECT * FROM public.inventory_receipt_lines WHERE receipt_id = p_receipt_id AND qc_status <> 'failed' LOOP
      IF v_line.target_location_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.stock_moves (product_id, quantity, move_type, to_location_id, lot_id, reference_type, reference_id, state, notes)
      VALUES (v_line.product_id, v_line.quantity::int, 'in', v_line.target_location_id, v_line.lot_id, 'inventory_receipt', p_receipt_id::text, 'done', 'Putaway ' || v_rcp.reference)
      RETURNING id INTO v_move_id;
      UPDATE public.inventory_receipt_lines SET putaway_move_id = v_move_id WHERE id = v_line.id;
      v_posted := v_posted + 1;
    END LOOP;
  END IF;

  UPDATE public.inventory_receipts
     SET status = p_to_status,
         qc_at      = CASE WHEN p_to_status='quality_check' THEN now() ELSE qc_at END,
         putaway_at = CASE WHEN p_to_status='putaway' THEN now() ELSE putaway_at END,
         done_at    = CASE WHEN p_to_status='done' THEN now() ELSE done_at END,
         updated_at = now()
   WHERE id = p_receipt_id;

  RETURN jsonb_build_object('ok',true,'receipt_id',p_receipt_id,'status',p_to_status,'putaway_moves',v_posted);
END $$;
GRANT EXECUTE ON FUNCTION public.advance_inventory_receipt(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_expiring_lots AS
SELECT l.id AS lot_id, l.product_id, l.lot_number, l.expiry_date,
       p.name AS product_name,
       (l.expiry_date - CURRENT_DATE) AS days_until_expiry,
       COALESCE(SUM(q.quantity),0) AS on_hand_qty
  FROM public.stock_lots l
  JOIN public.products p ON p.id = l.product_id
  LEFT JOIN public.stock_quants q ON q.lot_id = l.id
 WHERE l.expiry_date IS NOT NULL
 GROUP BY l.id, l.product_id, l.lot_number, l.expiry_date, p.name;
GRANT SELECT ON public.v_expiring_lots TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_expiring_lots(p_within_days int DEFAULT 60)
RETURNS SETOF public.v_expiring_lots LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.v_expiring_lots
   WHERE days_until_expiry <= p_within_days AND on_hand_qty > 0
   ORDER BY expiry_date NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.list_expiring_lots(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fefo_suggest_lot(p_product_id uuid, p_location_id uuid DEFAULT NULL)
RETURNS TABLE(lot_id uuid, lot_number text, expiry_date date, on_hand_qty numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.lot_number, l.expiry_date, COALESCE(SUM(q.quantity),0)::numeric
    FROM public.stock_lots l
    LEFT JOIN public.stock_quants q ON q.lot_id = l.id
      AND (p_location_id IS NULL OR q.location_id = p_location_id)
   WHERE l.product_id = p_product_id AND l.expiry_date IS NOT NULL
   GROUP BY l.id, l.lot_number, l.expiry_date
  HAVING COALESCE(SUM(q.quantity),0) > 0
   ORDER BY l.expiry_date ASC;
$$;
GRANT EXECUTE ON FUNCTION public.fefo_suggest_lot(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.abc_analysis_report(p_days int DEFAULT 90)
RETURNS TABLE(product_id uuid, product_name text, units_out numeric, value_out_cents bigint, abc_class text, is_slow_mover boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH moves AS (
    SELECT m.product_id,
           SUM(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE m.quantity END)::numeric AS units_out,
           SUM(COALESCE(m.value_cents,0))::bigint AS value_out_cents
      FROM public.stock_moves m
     WHERE m.move_type = 'out'
       AND m.created_at >= now() - (p_days || ' days')::interval
     GROUP BY m.product_id
  ), ranked AS (
    SELECT m.product_id, m.units_out, m.value_out_cents,
           SUM(m.value_out_cents) OVER () AS total_val,
           SUM(m.value_out_cents) OVER (ORDER BY m.value_out_cents DESC ROWS UNBOUNDED PRECEDING) AS cum_val
      FROM moves m
  )
  SELECT p.id, p.name,
         COALESCE(r.units_out,0),
         COALESCE(r.value_out_cents,0),
         CASE
           WHEN r.total_val IS NULL OR r.total_val = 0 THEN 'C'
           WHEN r.cum_val::numeric / r.total_val <= 0.80 THEN 'A'
           WHEN r.cum_val::numeric / r.total_val <= 0.95 THEN 'B'
           ELSE 'C'
         END,
         (r.units_out IS NULL OR r.units_out = 0)
    FROM public.products p
    LEFT JOIN ranked r ON r.product_id = p.id
   WHERE p.is_active
   ORDER BY r.value_out_cents DESC NULLS LAST, p.name;
END $$;
GRANT EXECUTE ON FUNCTION public.abc_analysis_report(int) TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_inv_receipts_updated ON public.inventory_receipts;
CREATE TRIGGER trg_inv_receipts_updated BEFORE UPDATE ON public.inventory_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_inv_transfers_updated ON public.inventory_transfers;
CREATE TRIGGER trg_inv_transfers_updated BEFORE UPDATE ON public.inventory_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
