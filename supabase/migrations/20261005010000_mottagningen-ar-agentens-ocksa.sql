-- Mottagningen är agentens också.
--
-- Flerstegsmottagning (received → quality_check → putaway → done) fanns som
-- tabeller, RPC:n advance_inventory_receipt och ReceivingRoutePanel i admin —
-- men utan en skill. En agent kunde varken skapa ett mottagningskvitto, sätta
-- QC per rad eller flytta det framåt; Odoo-paritetsmatrisen stod därför på
-- inventory#multi_step_routes = partial (dual-surface-lagen: UI OCH MCP).
--
-- manage_inventory_receipt är den ena skrivaren för agentsidan: create (med
-- rader), add_line, set_qc, advance (delegerar till advance_inventory_receipt,
-- samma kod som admin-panelen kör), get, list. Samma grind som de andra
-- lagerfunktionerna: service_role eller lagermodulen i rollmatrisen.

-- ── Inlagringen ger lagersaldo ──────────────────────────────────────────────
-- Processbatteriet fann det första gången flödet kördes (2026-10-05): putaway
-- skrev en stock_move per rad men aldrig saldot — onHand var 0 efter att åtta
-- godkända enheter "lagts in". receive_purchase_order kör
-- apply_goods_receipt_stock efter sin rörelse; den här vägen gjorde det inte,
-- och admin-panelens Receiving-flöde (samma RPC) hade samma tysta lucka.
CREATE OR REPLACE FUNCTION public.advance_inventory_receipt(p_receipt_id uuid, p_to_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rcp public.inventory_receipts%ROWTYPE;
  v_line record; v_move_id uuid; v_posted int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_to_status NOT IN ('quality_check','putaway','done','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT * INTO v_rcp FROM public.inventory_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found'; END IF;
  -- A put-away receipt is stock already; doing it twice would double it.
  IF p_to_status = 'putaway' AND v_rcp.status IN ('putaway','done') THEN
    RAISE EXCEPTION 'Receipt % is already %; putaway runs once', v_rcp.reference, v_rcp.status;
  END IF;

  IF p_to_status = 'putaway' THEN
    FOR v_line IN SELECT * FROM public.inventory_receipt_lines WHERE receipt_id = p_receipt_id AND qc_status <> 'failed' LOOP
      IF v_line.target_location_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.stock_moves (product_id, quantity, move_type, to_location_id, lot_id, reference_type, reference_id, state, notes)
      VALUES (v_line.product_id, v_line.quantity::int, 'in', v_line.target_location_id, v_line.lot_id, 'inventory_receipt', p_receipt_id::text, 'done', 'Putaway ' || v_rcp.reference)
      RETURNING id INTO v_move_id;
      PERFORM public.apply_goods_receipt_stock(v_line.product_id, v_line.quantity, v_line.target_location_id, v_line.lot_id);
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
END $function$;

CREATE OR REPLACE FUNCTION public.manage_inventory_receipt(
  p_action text,
  p_receipt_id uuid DEFAULT NULL,
  p_purchase_order_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_lines jsonb DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_target_location_id uuid DEFAULT NULL,
  p_lot_id uuid DEFAULT NULL,
  p_line_id uuid DEFAULT NULL,
  p_qc_status text DEFAULT NULL,
  p_qc_notes text DEFAULT NULL,
  p_to_status text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'inventory'));
  v_id uuid; v_status text; v_line jsonb; v_count int := 0; v_out jsonb;
BEGIN
  IF p_action NOT IN ('create','add_line','set_qc','advance','get','list') THEN
    RAISE EXCEPTION 'action must be one of create, add_line, set_qc, advance, get, list';
  END IF;
  IF p_action NOT IN ('get','list') AND NOT v_writer THEN
    RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'create' THEN
    INSERT INTO inventory_receipts (purchase_order_id, vendor_id, notes, created_by)
    VALUES (p_purchase_order_id, p_vendor_id, p_notes, auth.uid())
    RETURNING id INTO v_id;
    IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) = 'array' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        IF (v_line->>'product_id') IS NULL OR COALESCE((v_line->>'quantity')::numeric, 0) <= 0 THEN
          RAISE EXCEPTION 'each line needs product_id and a positive quantity';
        END IF;
        INSERT INTO inventory_receipt_lines (receipt_id, product_id, quantity, target_location_id, lot_id)
        VALUES (v_id, (v_line->>'product_id')::uuid, (v_line->>'quantity')::numeric,
                NULLIF(v_line->>'target_location_id','')::uuid, NULLIF(v_line->>'lot_id','')::uuid);
        v_count := v_count + 1;
      END LOOP;
    END IF;
    RETURN jsonb_build_object('success', true, 'receipt_id', v_id,
      'reference', (SELECT reference FROM inventory_receipts WHERE id = v_id),
      'status', 'received', 'lines', v_count);

  ELSIF p_action = 'add_line' THEN
    IF p_receipt_id IS NULL OR p_product_id IS NULL OR COALESCE(p_quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'receipt_id, product_id and a positive quantity are required';
    END IF;
    SELECT status INTO v_status FROM inventory_receipts WHERE id = p_receipt_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found'; END IF;
    IF v_status NOT IN ('received','quality_check') THEN
      RAISE EXCEPTION 'Receipt is %; lines can only be added before putaway', v_status;
    END IF;
    INSERT INTO inventory_receipt_lines (receipt_id, product_id, quantity, target_location_id, lot_id)
    VALUES (p_receipt_id, p_product_id, p_quantity, p_target_location_id, p_lot_id)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'line_id', v_id);

  ELSIF p_action = 'set_qc' THEN
    IF p_line_id IS NULL OR p_qc_status NOT IN ('pending','passed','failed') THEN
      RAISE EXCEPTION 'line_id and qc_status (pending, passed, failed) are required';
    END IF;
    UPDATE inventory_receipt_lines
       SET qc_status = p_qc_status,
           qc_notes = COALESCE(p_qc_notes, qc_notes),
           target_location_id = COALESCE(p_target_location_id, target_location_id)
     WHERE id = p_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'line_not_found'; END IF;
    RETURN jsonb_build_object('success', true, 'line_id', p_line_id, 'qc_status', p_qc_status);

  ELSIF p_action = 'advance' THEN
    IF p_receipt_id IS NULL OR p_to_status IS NULL THEN
      RAISE EXCEPTION 'receipt_id and to_status (quality_check, putaway, done, cancelled) are required';
    END IF;
    RETURN public.advance_inventory_receipt(p_receipt_id, p_to_status);

  ELSIF p_action = 'get' THEN
    SELECT jsonb_build_object(
      'receipt', to_jsonb(r),
      'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at) FROM inventory_receipt_lines l WHERE l.receipt_id = r.id), '[]'::jsonb)
    ) INTO v_out FROM inventory_receipts r WHERE r.id = p_receipt_id;
    IF v_out IS NULL THEN RAISE EXCEPTION 'receipt_not_found'; END IF;
    RETURN v_out;

  ELSE -- list
    SELECT COALESCE(jsonb_agg(x ORDER BY x->>'received_at' DESC), '[]'::jsonb) INTO v_out FROM (
      SELECT jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status,
        'purchase_order_id', r.purchase_order_id, 'vendor_id', r.vendor_id, 'received_at', r.received_at,
        'line_count', (SELECT count(*) FROM inventory_receipt_lines l WHERE l.receipt_id = r.id),
        'failed_qc', (SELECT count(*) FROM inventory_receipt_lines l WHERE l.receipt_id = r.id AND l.qc_status = 'failed')) AS x
      FROM inventory_receipts r
      WHERE p_status IS NULL OR r.status = p_status
      ORDER BY r.received_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) s;
    RETURN jsonb_build_object('receipts', v_out);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.manage_inventory_receipt(text, uuid, uuid, uuid, jsonb, uuid, numeric, uuid, uuid, uuid, text, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_inventory_receipt(text, uuid, uuid, uuid, jsonb, uuid, numeric, uuid, uuid, uuid, text, text, text, text, text, integer) TO authenticated, service_role;
