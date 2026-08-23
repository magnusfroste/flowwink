-- Partiet som aldrig kunde registreras.
--
-- receive_purchase_order() skrev stock_lots.expiration_date. Kolumnen heter
-- expiry_date och har hetat så sedan baseline. Felstavningen är oskadlig ända
-- tills någon faktiskt anger ett partinummer — och då avbryts HELA
-- godsmottagningen:
--   column "expiration_date" of relation "stock_lots" does not exist
-- Ingen goods_receipt, ingen lagerrörelse, inget värderingslager, ingen
-- verifikation. En kafferostare som anger rostdatum, eller en teknikhandlare
-- som anger maskinens serienummer, får alltså ingen leverans registrerad alls.
--
-- Skillens tool_definition lovar parametern 'expiration_date', så det namnet
-- är kontraktet utåt. Funktionen tar emot båda stavningarna och skriver till
-- den kolumn som finns.
--
-- Övrig kropp oförändrad (hämtad ur den levande definitionen och återlagd
-- omskriven, så inget annat fynd i den här funktionen ändras i smyg).

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_purchase_order_id uuid, p_lines jsonb, p_to_location_id uuid DEFAULT NULL::uuid, p_received_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text)
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
          -- Kolumnen heter expiry_date. Anropskontraktet säger expiration_date,
          -- så båda stavningarna tas emot och skrivs till rätt kolumn.
          INSERT INTO stock_lots (product_id, lot_number, expiry_date)
          VALUES (
            v_pol.product_id,
            v_line->>'lot_number',
            COALESCE(
              NULLIF(v_line->>'expiration_date','')::date,
              NULLIF(v_line->>'expiry_date','')::date
            )
          )
          ON CONFLICT (product_id, lot_number) DO UPDATE
            SET expiry_date = COALESCE(excluded.expiry_date, stock_lots.expiry_date),
                updated_at  = now()
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
