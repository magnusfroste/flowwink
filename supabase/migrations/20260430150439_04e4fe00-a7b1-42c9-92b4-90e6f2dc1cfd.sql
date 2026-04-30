-- ============================================================
-- Goods Receipt + 3-Way Matching (Procure-to-Pay closure)
-- ============================================================

-- 1. RECEIVE PURCHASE ORDER
-- Atomically: insert goods_receipt + lines, update PO line received_quantity,
-- create stock_moves (vendor → internal location), update PO status, emit event.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_lines jsonb,                 -- [{po_line_id, quantity_received, lot_number?, location_id?}]
  p_to_location_id uuid DEFAULT NULL,
  p_received_date date DEFAULT CURRENT_DATE,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_id uuid;
  v_po record;
  v_vendor_loc uuid;
  v_to_loc uuid := p_to_location_id;
  v_line jsonb;
  v_pol record;
  v_new_received int;
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
    SELECT id INTO v_to_loc FROM stock_locations
      WHERE location_type = 'internal' AND is_active = true
      ORDER BY created_at LIMIT 1;
  END IF;

  -- Vendor source location
  SELECT id INTO v_vendor_loc FROM stock_locations
    WHERE location_type = 'vendor' AND is_active = true
    ORDER BY created_at LIMIT 1;

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

        -- Legacy product_stock fallback (keep on-hand in sync if row exists)
        UPDATE product_stock
          SET quantity_on_hand = quantity_on_hand + v_qty,
              updated_at = now()
          WHERE product_id = v_pol.product_id;
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
    'total_quantity', v_total_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid, date, text) TO authenticated, service_role;

-- 2. MATCH INVOICE TO RECEIPT (3-way matching: PO ↔ Receipt ↔ Invoice)
-- Sets match_status: matched | partial | over_invoiced | variance
CREATE OR REPLACE FUNCTION public.match_invoice_to_receipt(
  p_invoice_id uuid,
  p_tolerance_pct numeric DEFAULT 2.0  -- ±2% tolerance is typical
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_po_total bigint;
  v_received_value bigint;
  v_variance bigint;
  v_variance_pct numeric;
  v_match_status text;
  v_notes text;
BEGIN
  SELECT * INTO v_inv FROM vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;

  IF v_inv.purchase_order_id IS NULL THEN
    UPDATE vendor_invoices
      SET match_status = 'no_po', variance_cents = 0,
          variance_notes = 'Invoice not linked to any PO', updated_at = now()
      WHERE id = p_invoice_id;
    RETURN jsonb_build_object('success', true, 'match_status', 'no_po');
  END IF;

  -- Sum the value of received goods on this PO
  SELECT
    COALESCE(SUM(grl.quantity_received * pol.unit_price_cents), 0)::bigint
  INTO v_received_value
  FROM goods_receipt_lines grl
  JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
  JOIN purchase_order_lines pol ON pol.id = grl.po_line_id
  WHERE gr.purchase_order_id = v_inv.purchase_order_id;

  SELECT total_cents INTO v_po_total FROM purchase_orders WHERE id = v_inv.purchase_order_id;

  -- Variance = invoice - received (positive = over-invoiced)
  v_variance := v_inv.subtotal_cents - v_received_value;
  v_variance_pct := CASE WHEN v_received_value > 0
    THEN abs(v_variance)::numeric / v_received_value * 100
    ELSE 100 END;

  IF v_received_value = 0 THEN
    v_match_status := 'no_receipt';
    v_notes := 'No goods received yet against this PO';
  ELSIF v_variance_pct <= p_tolerance_pct THEN
    v_match_status := 'matched';
    v_notes := format('Within %.2f%% tolerance', p_tolerance_pct);
  ELSIF v_variance > 0 THEN
    v_match_status := 'over_invoiced';
    v_notes := format('Invoice %s cents > received value %s cents (%.2f%% variance)',
                       v_inv.subtotal_cents, v_received_value, v_variance_pct);
  ELSE
    v_match_status := 'under_invoiced';
    v_notes := format('Invoice %s cents < received value %s cents (%.2f%% variance)',
                       v_inv.subtotal_cents, v_received_value, v_variance_pct);
  END IF;

  UPDATE vendor_invoices
    SET match_status = v_match_status,
        variance_cents = v_variance,
        variance_notes = v_notes,
        updated_at = now()
    WHERE id = p_invoice_id;

  -- Emit event for downstream automation (FlowPilot can auto-approve matched, escalate variance)
  PERFORM public.emit_platform_event(
    'invoice.matched',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_inv.purchase_order_id,
      'match_status', v_match_status,
      'variance_cents', v_variance,
      'variance_pct', round(v_variance_pct, 2)
    ),
    'match_invoice_to_receipt'
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'match_status', v_match_status,
    'variance_cents', v_variance,
    'variance_pct', round(v_variance_pct, 2),
    'received_value_cents', v_received_value,
    'po_total_cents', v_po_total,
    'notes', v_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_invoice_to_receipt(uuid, numeric) TO authenticated, service_role;

-- 3. AUTO-APPROVE MATCHED INVOICES (called by automation)
CREATE OR REPLACE FUNCTION public.auto_approve_vendor_invoice(
  p_invoice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT * INTO v_inv FROM vendor_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;

  IF v_inv.match_status <> 'matched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', format('Invoice match_status=%s, only "matched" can auto-approve', v_inv.match_status)
    );
  END IF;

  IF v_inv.approved_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true);
  END IF;

  UPDATE vendor_invoices
    SET status = 'approved',
        approved_at = now(),
        approved_by = auth.uid(),
        updated_at = now()
    WHERE id = p_invoice_id;

  PERFORM public.emit_platform_event(
    'invoice.approved',
    jsonb_build_object('invoice_id', p_invoice_id, 'auto', true),
    'auto_approve_vendor_invoice'
  );

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'status', 'approved');
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_approve_vendor_invoice(uuid) TO authenticated, service_role;