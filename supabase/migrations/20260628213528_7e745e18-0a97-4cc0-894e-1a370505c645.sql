-- Chunk 2/6

CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(p_period_date date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets; v_amount BIGINT; v_je_id UUID; v_total_amount BIGINT := 0; v_processed INT := 0; v_skipped INT := 0; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'run_monthly_depreciation: admin role required'; END IF;
  v_period := date_trunc('month', p_period_date)::DATE;
  FOR v_asset IN SELECT * FROM public.fixed_assets WHERE status = 'active' AND in_service_date <= (v_period + INTERVAL '1 month - 1 day')::DATE LOOP
    IF EXISTS (SELECT 1 FROM public.depreciation_entries WHERE asset_id = v_asset.id AND period_date = v_period) THEN
      v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_amount := public.compute_monthly_depreciation(v_asset);
    IF v_amount <= 0 THEN UPDATE public.fixed_assets SET status='fully_depreciated' WHERE id=v_asset.id; v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_je_id := NULL;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES ((v_period + INTERVAL '1 month - 1 day')::DATE, format('Depreciation %s — %s', to_char(v_period,'YYYY-MM'), v_asset.name), 'fixed_asset_depreciation', 'posted') RETURNING id INTO v_je_id;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.depreciation_account, v_amount, 0, format('Depreciation: %s', v_asset.name)),
             (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum depr: %s', v_asset.name));
    END IF;
    INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id) VALUES (v_asset.id, v_period, v_amount, v_je_id);
    UPDATE public.fixed_assets SET accumulated_cents = accumulated_cents + v_amount,
      status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
      WHERE id = v_asset.id;
    v_total_amount := v_total_amount + v_amount; v_processed := v_processed + 1;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'period', v_period, 'processed', v_processed, 'skipped', v_skipped, 'total_depreciation_cents', v_total_amount);
END; $function$;

CREATE OR REPLACE FUNCTION public.set_exchange_rate(p_base text, p_quote text, p_rate numeric, p_rate_date date DEFAULT CURRENT_DATE, p_source text DEFAULT 'manual'::text)
 RETURNS exchange_rates LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.exchange_rates;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'set_exchange_rate: admin role required'; END IF;
  INSERT INTO public.exchange_rates (base_currency, quote_currency, rate, rate_date, source)
  VALUES (p_base, p_quote, p_rate, p_rate_date, p_source)
  ON CONFLICT (base_currency, quote_currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
  RETURNING * INTO v_row;
  RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.adjust_quant(p_product_id uuid, p_location_id uuid, p_qty_delta numeric, p_lot_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'manual_adjustment'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_move uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_qty_delta = 0 THEN RAISE EXCEPTION 'Delta cannot be zero'; END IF;
  PERFORM _upsert_quant(p_product_id, p_location_id, p_lot_id, p_qty_delta);
  INSERT INTO stock_moves (product_id, quantity, move_type, to_location_id, lot_id, notes, created_by, state)
  VALUES (p_product_id, ABS(p_qty_delta)::int, 'adjustment', p_location_id, p_lot_id, p_reason, auth.uid(), 'done')
  RETURNING id INTO v_move;
  RETURN v_move;
END; $function$;

CREATE OR REPLACE FUNCTION public.allocate_picking(p_order_id uuid, p_source_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_picking_id UUID; v_order RECORD; v_item RECORD; v_line_id UUID; v_reservation_id UUID; v_source_location UUID; v_short_count INT := 0; v_total_count INT := 0; v_lines JSONB := '[]'::JSONB;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee')) OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  v_source_location := COALESCE(p_source_location_id, (SELECT id FROM public.stock_locations WHERE location_type = 'internal' AND is_active = true ORDER BY created_at LIMIT 1));
  SELECT id INTO v_picking_id FROM public.picking_orders WHERE order_id = p_order_id AND status IN ('draft','ready','in_progress') LIMIT 1;
  IF v_picking_id IS NULL THEN
    INSERT INTO public.picking_orders (order_id, source_location_id, status, ship_to_name, ship_to_address, created_by, allocated_at)
    VALUES (p_order_id, v_source_location, 'ready', v_order.customer_name, NULL, auth.uid(), now()) RETURNING id INTO v_picking_id;
  END IF;
  FOR v_item IN SELECT oi.*, p.name AS p_name, p.barcode AS p_sku FROM public.order_items oi LEFT JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = p_order_id LOOP
    v_total_count := v_total_count + 1; v_reservation_id := NULL;
    BEGIN v_reservation_id := public.reserve_stock(v_item.product_id, v_source_location, v_item.quantity, 'picking_order', v_picking_id);
    EXCEPTION WHEN OTHERS THEN v_short_count := v_short_count + 1; END;
    INSERT INTO public.picking_lines (picking_order_id, product_id, product_sku, product_name, qty_requested, reservation_id, status)
    VALUES (v_picking_id, v_item.product_id, v_item.p_sku, COALESCE(v_item.p_name, 'Product'), v_item.quantity, v_reservation_id, CASE WHEN v_reservation_id IS NOT NULL THEN 'reserved' ELSE 'short' END)
    RETURNING id INTO v_line_id;
    v_lines := v_lines || jsonb_build_object('line_id', v_line_id, 'product_id', v_item.product_id, 'qty', v_item.quantity, 'reserved', v_reservation_id IS NOT NULL);
  END LOOP;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata) VALUES ('picking.allocated', 'picking_order', v_picking_id, auth.uid(), jsonb_build_object('order_id', p_order_id, 'lines', v_total_count, 'short', v_short_count));
  RETURN jsonb_build_object('success', true, 'picking_order_id', v_picking_id, 'lines_total', v_total_count, 'lines_short', v_short_count, 'lines', v_lines);
END; $function$;

CREATE OR REPLACE FUNCTION public.approve_procurement_suggestion(p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s procurement_suggestions%ROWTYPE; v_po_id uuid; v_po_number text; v_unit_price integer; v_total integer; v_bom uuid; v_mo uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can approve procurement suggestions'; END IF;
  SELECT * INTO s FROM procurement_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Suggestion already %', s.status; END IF;
  IF s.procurement_method = 'buy' THEN
    IF s.preferred_vendor_id IS NULL THEN RAISE EXCEPTION 'No preferred vendor; cannot create PO'; END IF;
    v_po_number := 'PO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);
    SELECT COALESCE(price_cents,0) INTO v_unit_price FROM products WHERE id = s.product_id;
    v_total := COALESCE(v_unit_price,0) * s.suggested_qty::int;
    INSERT INTO purchase_orders (po_number, vendor_id, status, order_date, expected_delivery, subtotal_cents, total_cents, created_by)
    VALUES (v_po_number, s.preferred_vendor_id, 'draft', CURRENT_DATE, s.needed_by, v_total, v_total, auth.uid()) RETURNING id INTO v_po_id;
    INSERT INTO purchase_order_lines (purchase_order_id, product_id, quantity, unit_price_cents, total_cents)
    VALUES (v_po_id, s.product_id, s.suggested_qty::int, COALESCE(v_unit_price,0), v_total);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(), materialized_ref_type='purchase_order', materialized_ref_id=v_po_id WHERE id=p_id;
    RETURN jsonb_build_object('type','purchase_order','id',v_po_id,'po_number',v_po_number);
  ELSIF s.procurement_method = 'manufacture' THEN
    SELECT id INTO v_bom FROM bom_headers WHERE product_id = s.product_id AND is_active = true LIMIT 1;
    IF v_bom IS NULL THEN RAISE EXCEPTION 'No active BOM for product %', s.product_id; END IF;
    v_mo := create_manufacturing_order(v_bom, s.suggested_qty::int, s.needed_by);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(), materialized_ref_type='manufacturing_order', materialized_ref_id=v_mo WHERE id=p_id;
    RETURN jsonb_build_object('type','manufacturing_order','id',v_mo);
  END IF;
  RAISE EXCEPTION 'Unknown procurement_method %', s.procurement_method;
END; $function$;

CREATE OR REPLACE FUNCTION public.auto_allocate_vacation(p_year integer, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(employee_id uuid, employee_name text, allocated_days integer, carried_over_days numeric, action text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_emp RECORD; v_days INTEGER; v_max_carry INTEGER; v_prev_remaining NUMERIC; v_carry NUMERIC; v_existing UUID; v_action TEXT; v_run_id UUID := gen_random_uuid(); v_total INTEGER := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can auto-allocate vacation'; END IF;
  FOR v_emp IN SELECT id, name FROM public.employees WHERE status = 'active' ORDER BY name LOOP
    v_days := public.calculate_vacation_days(v_emp.id, p_year);
    SELECT max_carry_over_days INTO v_max_carry FROM public.vacation_policies WHERE is_active = true ORDER BY priority DESC LIMIT 1;
    v_max_carry := COALESCE(v_max_carry, 5);
    SELECT GREATEST(0, COALESCE(la.allocated_days, 0) + COALESCE(la.carried_over_days, 0)
      - COALESCE((SELECT SUM(days) FROM public.leave_requests WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND status = 'approved' AND EXTRACT(YEAR FROM start_date)::INTEGER = p_year - 1), 0))
    INTO v_prev_remaining FROM public.leave_allocations la WHERE la.employee_id = v_emp.id AND la.leave_type = 'vacation' AND la.year = p_year - 1;
    v_carry := LEAST(COALESCE(v_prev_remaining, 0), v_max_carry);
    SELECT id INTO v_existing FROM public.leave_allocations WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND year = p_year;
    v_action := CASE WHEN v_existing IS NOT NULL THEN (CASE WHEN p_dry_run THEN 'would_update' ELSE 'updated' END) ELSE (CASE WHEN p_dry_run THEN 'would_create' ELSE 'created' END) END;
    IF NOT p_dry_run THEN
      INSERT INTO public.leave_allocations (employee_id, leave_type, year, allocated_days, carried_over_days, notes)
      VALUES (v_emp.id, 'vacation', p_year, v_days, v_carry, 'Auto-allocated ' || to_char(now(), 'YYYY-MM-DD'))
      ON CONFLICT (employee_id, leave_type, year) DO UPDATE SET allocated_days = EXCLUDED.allocated_days, carried_over_days = EXCLUDED.carried_over_days, notes = EXCLUDED.notes, updated_at = now();
      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
      VALUES ('vacation.auto_allocated', 'employee', v_emp.id, auth.uid(), jsonb_build_object('run_id', v_run_id, 'year', p_year, 'employee_name', v_emp.name, 'allocated_days', v_days, 'carried_over_days', v_carry, 'max_carry_over_cap', v_max_carry, 'previous_year_remaining', v_prev_remaining, 'action', v_action));
      v_total := v_total + 1;
    END IF;
    employee_id := v_emp.id; employee_name := v_emp.name; allocated_days := v_days; carried_over_days := v_carry; action := v_action;
    RETURN NEXT;
  END LOOP;
  IF NOT p_dry_run AND v_total > 0 THEN
    INSERT INTO public.audit_logs (action, entity_type, user_id, metadata) VALUES ('vacation.auto_allocate_run', 'leave_allocation', auth.uid(), jsonb_build_object('run_id', v_run_id, 'year', p_year, 'employees_processed', v_total));
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.auto_generate_purchase_orders(p_dry_run boolean DEFAULT false)
 RETURNS TABLE(po_id uuid, po_number text, vendor_id uuid, vendor_name text, line_count integer, total_cents bigint, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_vendor RECORD; v_line RECORD; v_po_id UUID; v_po_number TEXT; v_subtotal BIGINT; v_tax BIGINT; v_line_count INTEGER; v_skipped_count INTEGER;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver'::public.app_role))) THEN RAISE EXCEPTION 'Only admins/approvers can auto-generate purchase orders'; END IF;
  SELECT COUNT(*) INTO v_skipped_count FROM public.list_reorder_candidates() c WHERE c.vendor_id IS NULL;
  IF v_skipped_count > 0 THEN
    po_id := NULL; po_number := NULL; vendor_id := NULL; vendor_name := v_skipped_count::TEXT || ' product(s) skipped — no preferred vendor';
    line_count := 0; total_cents := 0; status := 'skipped'; RETURN NEXT;
  END IF;
  FOR v_vendor IN SELECT c.vendor_id AS v_id, MAX(c.vendor_name) AS v_name FROM public.list_reorder_candidates() c WHERE c.vendor_id IS NOT NULL GROUP BY c.vendor_id LOOP
    v_subtotal := 0; v_tax := 0; v_line_count := 0;
    IF NOT p_dry_run THEN
      INSERT INTO public.purchase_orders (vendor_id, status, order_date, notes, created_by) VALUES (v_vendor.v_id, 'draft', CURRENT_DATE, 'Auto-generated by inventory reorder loop on ' || CURRENT_DATE, auth.uid()) RETURNING id, purchase_orders.po_number INTO v_po_id, v_po_number;
      FOR v_line IN SELECT * FROM public.list_reorder_candidates() c WHERE c.vendor_id = v_vendor.v_id LOOP
        INSERT INTO public.purchase_order_lines (purchase_order_id, product_id, description, quantity, unit_price_cents, tax_rate, total_cents)
        VALUES (v_po_id, v_line.product_id, v_line.product_name, v_line.reorder_quantity, v_line.unit_price_cents, 25.00, v_line.reorder_quantity * v_line.unit_price_cents);
        v_subtotal := v_subtotal + v_line.estimated_cost_cents; v_line_count := v_line_count + 1;
      END LOOP;
      v_tax := ROUND(v_subtotal * 0.25);
      UPDATE public.purchase_orders SET subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_subtotal + v_tax, updated_at = now() WHERE id = v_po_id;
    ELSE
      v_po_id := NULL; v_po_number := '(dry-run)';
      SELECT COUNT(*), COALESCE(SUM(c.estimated_cost_cents), 0) INTO v_line_count, v_subtotal FROM public.list_reorder_candidates() c WHERE c.vendor_id = v_vendor.v_id;
      v_tax := ROUND(v_subtotal * 0.25);
    END IF;
    po_id := v_po_id; po_number := v_po_number; vendor_id := v_vendor.v_id; vendor_name := v_vendor.v_name; line_count := v_line_count; total_cents := v_subtotal + v_tax; status := CASE WHEN p_dry_run THEN 'preview' ELSE 'created' END;
    RETURN NEXT;
  END LOOP;
END; $function$;

NOTIFY pgrst, 'reload schema';
