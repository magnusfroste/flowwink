CREATE OR REPLACE FUNCTION public.revalue_open_balances(p_revaluation_date date DEFAULT CURRENT_DATE, p_fx_gain_account text DEFAULT '3960'::text, p_fx_loss_account text DEFAULT '7960'::text, p_ar_account text DEFAULT '1510'::text, p_ap_account text DEFAULT '2440'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_base TEXT; v_total_gain NUMERIC := 0; v_total_loss NUMERIC := 0; v_ar_lines INT := 0; v_ap_lines INT := 0; v_ar_delta NUMERIC := 0; v_ap_delta NUMERIC := 0; v_je_id UUID; rec RECORD; v_current_rate NUMERIC; v_delta NUMERIC;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'revalue_open_balances: admin role required'; END IF;
  SELECT code INTO v_base FROM public.currencies WHERE is_base = true LIMIT 1;
  IF v_base IS NULL THEN RAISE EXCEPTION 'No base currency configured'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    FOR rec IN SELECT id, currency, exchange_rate, total_cents, status FROM public.invoices WHERE currency <> v_base AND COALESCE(status::text, 'draft') NOT IN ('paid', 'cancelled', 'void') LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      v_ar_delta := v_ar_delta + v_delta; v_ar_lines := v_ar_lines + 1;
    END LOOP;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    FOR rec IN SELECT id, currency, exchange_rate, COALESCE(total_cents, 0) as total_cents, status FROM public.purchase_orders WHERE currency <> v_base AND COALESCE(status::text, 'draft') NOT IN ('paid', 'cancelled', 'closed') LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      v_ap_delta := v_ap_delta - v_delta; v_ap_lines := v_ap_lines + 1;
    END LOOP;
  END IF;
  IF v_ar_delta > 0 THEN v_total_gain := v_total_gain + v_ar_delta; ELSE v_total_loss := v_total_loss + ABS(v_ar_delta); END IF;
  IF v_ap_delta > 0 THEN v_total_gain := v_total_gain + v_ap_delta; ELSE v_total_loss := v_total_loss + ABS(v_ap_delta); END IF;
  IF (v_total_gain > 0.01 OR v_total_loss > 0.01) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status) VALUES (p_revaluation_date, format('FX revaluation %s — AR %s lines, AP %s lines', p_revaluation_date, v_ar_lines, v_ap_lines), 'fx_revaluation', 'posted') RETURNING id INTO v_je_id;
    IF ABS(v_ar_delta) > 0.01 THEN
      IF v_ar_delta > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description) VALUES (v_je_id, p_ar_account, ROUND(v_ar_delta * 100), 0, 'FX revaluation AR'), (v_je_id, p_fx_gain_account, 0, ROUND(v_ar_delta * 100), 'Unrealized FX gain on AR');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description) VALUES (v_je_id, p_fx_loss_account, ROUND(ABS(v_ar_delta) * 100), 0, 'Unrealized FX loss on AR'), (v_je_id, p_ar_account, 0, ROUND(ABS(v_ar_delta) * 100), 'FX revaluation AR');
      END IF;
    END IF;
    IF ABS(v_ap_delta) > 0.01 THEN
      IF v_ap_delta > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description) VALUES (v_je_id, p_ap_account, ROUND(v_ap_delta * 100), 0, 'FX revaluation AP'), (v_je_id, p_fx_gain_account, 0, ROUND(v_ap_delta * 100), 'Unrealized FX gain on AP');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description) VALUES (v_je_id, p_fx_loss_account, ROUND(ABS(v_ap_delta) * 100), 0, 'Unrealized FX loss on AP'), (v_je_id, p_ap_account, 0, ROUND(ABS(v_ap_delta) * 100), 'FX revaluation AP');
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'revaluation_date', p_revaluation_date, 'base_currency', v_base, 'ar_lines', v_ar_lines, 'ap_lines', v_ap_lines, 'ar_delta', v_ar_delta, 'ap_delta', v_ap_delta, 'total_gain', v_total_gain, 'total_loss', v_total_loss, 'journal_entry_id', v_je_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.start_mo(p_mo_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status public.mo_status;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT status INTO v_status FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_status = 'in_progress' THEN RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already in_progress'); END IF;
  IF v_status <> 'confirmed' THEN RAISE EXCEPTION 'MO must be confirmed before starting (current: %)', v_status; END IF;
  UPDATE public.manufacturing_orders SET status = 'in_progress', started_at = now(), updated_at = now() WHERE id = p_mo_id;
  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', 'in_progress');
END; $function$;

CREATE OR REPLACE FUNCTION public.start_webinar(p_webinar_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE webinars SET status='live', updated_at=now() WHERE id=p_webinar_id AND status IN ('draft','published') RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % cannot be started', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.live', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $function$;

CREATE OR REPLACE FUNCTION public.transfer_stock(p_product_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity numeric, p_lot_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_move_id uuid; v_available numeric;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  SELECT COALESCE(quantity,0) INTO v_available FROM stock_quants WHERE product_id = p_product_id AND location_id = p_from_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  IF COALESCE(v_available,0) < p_quantity THEN RAISE EXCEPTION 'Insufficient stock at source (have %, need %)', COALESCE(v_available,0), p_quantity; END IF;
  PERFORM _upsert_quant(p_product_id, p_from_location_id, p_lot_id, -p_quantity);
  PERFORM _upsert_quant(p_product_id, p_to_location_id, p_lot_id, p_quantity);
  INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, notes, created_by, state)
  VALUES (p_product_id, p_quantity::int, 'transfer', p_from_location_id, p_to_location_id, p_lot_id, p_notes, auth.uid(), 'done')
  RETURNING id INTO v_move_id;
  RETURN v_move_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.trigger_procurement_for_mo(p_mo_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_short record; v_po_ids jsonb := '[]'::jsonb; v_skipped int := 0; v_short_qty numeric; v_existing uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  PERFORM public.check_mo_availability(p_mo_id);
  FOR v_short IN
    SELECT mc.component_product_id, mc.qty_required, COALESCE(ps.quantity_on_hand, 0) AS on_hand
      FROM public.mo_components mc
      LEFT JOIN public.product_stock ps ON ps.product_id = mc.component_product_id
     WHERE mc.mo_id = p_mo_id AND mc.availability = 'short'
  LOOP
    v_short_qty := v_short.qty_required - v_short.on_hand;
    SELECT po.id INTO v_existing FROM public.purchase_orders po
      JOIN public.purchase_order_lines pol ON pol.po_id = po.id
     WHERE po.source_type = 'manufacturing' AND po.source_id = p_mo_id AND pol.product_id = v_short.component_product_id AND po.status IN ('draft', 'sent', 'confirmed') LIMIT 1;
    IF v_existing IS NOT NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    UPDATE public.mo_components SET availability = 'awaiting_po' WHERE mo_id = p_mo_id AND component_product_id = v_short.component_product_id;
    v_po_ids := v_po_ids || jsonb_build_object('component_product_id', v_short.component_product_id, 'qty_short', v_short_qty, 'note', 'PO creation deferred — call create_purchase_order skill with source_type=manufacturing, source_id=' || p_mo_id::text);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'requests', v_po_ids, 'skipped_existing', v_skipped);
END; $function$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
