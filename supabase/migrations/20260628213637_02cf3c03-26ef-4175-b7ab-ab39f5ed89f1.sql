-- Chunk 3/6

CREATE OR REPLACE FUNCTION public.bulk_invoice_from_timesheets(p_project_id uuid, p_start_date date, p_end_date date, p_group_by text DEFAULT 'entry'::text, p_due_days integer DEFAULT 30)
 RETURNS TABLE(invoice_id uuid, invoice_number text, line_count integer, total_cents bigint, hours_billed numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_project public.projects; v_invoice_id UUID; v_invoice_num TEXT; v_line_items JSONB := '[]'::jsonb; v_subtotal BIGINT := 0; v_tax_rate NUMERIC := 0.25; v_tax_cents BIGINT; v_total_hours NUMERIC := 0; v_line_count INTEGER := 0; v_count INTEGER; v_entry RECORD; v_entry_ids UUID[] := '{}';
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver'::public.app_role))) THEN RAISE EXCEPTION 'Only admins/approvers can bulk-invoice timesheets'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF v_project.id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT v_project.is_billable THEN RAISE EXCEPTION 'Project is not billable'; END IF;
  IF COALESCE(v_project.hourly_rate_cents, 0) <= 0 THEN RAISE EXCEPTION 'Project has no hourly rate set'; END IF;
  IF p_group_by = 'user' THEN
    FOR v_entry IN SELECT te.user_id, COALESCE(e.name, 'User') AS user_name, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te LEFT JOIN public.employees e ON e.user_id = te.user_id
      WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false GROUP BY te.user_id, e.name LOOP
      v_line_items := v_line_items || jsonb_build_object('description', v_entry.user_name || ' — hours ' || to_char(p_start_date,'YYYY-MM-DD') || ' to ' || to_char(p_end_date,'YYYY-MM-DD'), 'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.total_hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSIF p_group_by = 'week' THEN
    FOR v_entry IN SELECT date_trunc('week', te.entry_date)::date AS week_start, SUM(te.hours) AS total_hours, ARRAY_AGG(te.id) AS ids
      FROM public.time_entries te WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false GROUP BY date_trunc('week', te.entry_date) ORDER BY week_start LOOP
      v_line_items := v_line_items || jsonb_build_object('description', 'Week of ' || to_char(v_entry.week_start, 'YYYY-MM-DD'), 'qty', v_entry.total_hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.total_hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.total_hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.ids;
    END LOOP;
  ELSE
    FOR v_entry IN SELECT te.id, te.entry_date, te.hours, te.description FROM public.time_entries te WHERE te.project_id = p_project_id AND te.entry_date BETWEEN p_start_date AND p_end_date AND te.is_billable = true AND te.is_invoiced = false ORDER BY te.entry_date LOOP
      v_line_items := v_line_items || jsonb_build_object('description', to_char(v_entry.entry_date,'YYYY-MM-DD') || ' — ' || COALESCE(v_entry.description, 'Hours'), 'qty', v_entry.hours, 'unit_price_cents', v_project.hourly_rate_cents);
      v_subtotal := v_subtotal + ROUND(v_entry.hours * v_project.hourly_rate_cents); v_total_hours := v_total_hours + v_entry.hours; v_line_count := v_line_count + 1; v_entry_ids := v_entry_ids || v_entry.id;
    END LOOP;
  END IF;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'No billable, uninvoiced hours found for project in given period'; END IF;
  v_tax_cents := ROUND(v_subtotal * v_tax_rate);
  SELECT COUNT(*) INTO v_count FROM public.invoices;
  v_invoice_num := 'INV-' || LPAD((v_count + 1)::TEXT, 5, '0');
  INSERT INTO public.invoices (invoice_number, customer_name, project_id, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, issue_date, due_date, status, created_by, notes)
  VALUES (v_invoice_num, COALESCE(v_project.client_name, v_project.name), p_project_id, v_line_items, v_subtotal, v_tax_rate, v_tax_cents, v_subtotal + v_tax_cents, v_project.currency, CURRENT_DATE, CURRENT_DATE + p_due_days, 'draft', auth.uid(), 'Auto-generated from timesheets ' || p_start_date || ' → ' || p_end_date)
  RETURNING id INTO v_invoice_id;
  UPDATE public.time_entries SET is_invoiced = true, invoice_id = v_invoice_id, updated_at = now() WHERE id = ANY(v_entry_ids);
  invoice_id := v_invoice_id; invoice_number := v_invoice_num; line_count := v_line_count; total_cents := v_subtotal + v_tax_cents; hours_billed := v_total_hours;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.cancel_manual_subscription(_subscription_id uuid, _reason text DEFAULT NULL::text, _effective_date date DEFAULT NULL::date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _eff date := COALESCE(_effective_date, CURRENT_DATE);
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can cancel manual subscriptions'; END IF;
  UPDATE public.subscriptions
  SET status = 'canceled'::subscription_status, canceled_at = now(), ended_at = _eff::timestamptz, cancel_at = _eff::timestamptz, next_invoice_date = NULL,
      metadata = metadata || jsonb_build_object('cancel_reason', _reason, 'canceled_by', auth.uid()), updated_at = now()
  WHERE id = _subscription_id AND provider = 'manual';
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual subscription % not found', _subscription_id; END IF;
  PERFORM public.emit_platform_event('subscription.canceled', jsonb_build_object('subscription_id', _subscription_id, 'reason', _reason, 'effective_date', _eff), 'cancel_manual_subscription');
  RETURN jsonb_build_object('ok', true, 'subscription_id', _subscription_id, 'effective_date', _eff);
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_mo(p_mo_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_status public.mo_status;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT status INTO v_status FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_status IN ('done', 'cancelled') THEN RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already terminal: ' || v_status); END IF;
  UPDATE public.manufacturing_orders SET status = 'cancelled', cancelled_at = now(), notes = COALESCE(notes, '') || E'\n[cancelled] ' || COALESCE(p_reason, 'no reason'), updated_at = now() WHERE id = p_mo_id;
  BEGIN PERFORM public.emit_platform_event('mo.cancelled', jsonb_build_object('mo_id', p_mo_id, 'reason', p_reason), 'manufacturing');
  EXCEPTION WHEN undefined_function THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', 'cancelled');
END; $function$;

CREATE OR REPLACE FUNCTION public.cancel_picking(p_picking_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_line RECORD;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee'))) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND reservation_id IS NOT NULL LOOP
    BEGIN PERFORM public.cancel_reservation(v_line.reservation_id); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  UPDATE public.picking_lines SET status = 'cancelled' WHERE picking_order_id = p_picking_order_id AND status NOT IN ('picked','cancelled');
  UPDATE public.picking_orders SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason WHERE id = p_picking_order_id;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata) VALUES ('picking.cancelled', 'picking_order', p_picking_order_id, auth.uid(), jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.cancel_reservation(p_reservation_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r stock_reservations%ROWTYPE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  SELECT * INTO r FROM stock_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF r.state <> 'reserved' THEN RAISE EXCEPTION 'Reservation not in reserved state (%)', r.state; END IF;
  UPDATE stock_reservations SET state='cancelled', cancelled_at=now() WHERE id=p_reservation_id;
  UPDATE stock_quants SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - r.quantity), updated_at = now()
    WHERE product_id = r.product_id AND location_id = r.location_id AND (lot_id IS NOT DISTINCT FROM r.lot_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.cancel_webinar(p_webinar_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE webinars SET status='cancelled', updated_at=now() WHERE id=p_webinar_id AND status NOT IN ('completed','cancelled') RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % cannot be cancelled', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.cancelled', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title,'reason',p_reason), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $function$;

CREATE OR REPLACE FUNCTION public.close_accounting_period(p_year integer, p_month integer, p_notes text DEFAULT NULL::text)
 RETURNS accounting_periods LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.accounting_periods; v_start DATE; v_end DATE; v_total_debit BIGINT; v_total_credit BIGINT; v_count INTEGER; v_unposted INTEGER;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) THEN RAISE EXCEPTION 'Only admins can close accounting periods'; END IF;
  IF p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Invalid month: %', p_month; END IF;
  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  SELECT COUNT(*) INTO v_unposted FROM public.journal_entries WHERE entry_date BETWEEN v_start AND v_end AND status <> 'posted';
  IF v_unposted > 0 THEN RAISE EXCEPTION 'Cannot close: % unposted journal entries in %-%', v_unposted, p_year, p_month; END IF;
  SELECT COALESCE(SUM(jel.debit_cents), 0), COALESCE(SUM(jel.credit_cents), 0), COUNT(DISTINCT je.id)
  INTO v_total_debit, v_total_credit, v_count
  FROM public.journal_entries je LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.entry_date BETWEEN v_start AND v_end;
  INSERT INTO public.accounting_periods (fiscal_year, period_month, status, closed_by, closed_at, total_debit_cents, total_credit_cents, entry_count, notes)
  VALUES (p_year, p_month, 'closed', auth.uid(), now(), v_total_debit, v_total_credit, v_count, p_notes)
  ON CONFLICT (fiscal_year, period_month) DO UPDATE
  SET status = 'closed', closed_by = auth.uid(), closed_at = now(), reopened_by = NULL, reopened_at = NULL,
      total_debit_cents = EXCLUDED.total_debit_cents, total_credit_cents = EXCLUDED.total_credit_cents, entry_count = EXCLUDED.entry_count,
      notes = COALESCE(EXCLUDED.notes, public.accounting_periods.notes), updated_at = now()
  WHERE public.accounting_periods.status <> 'locked'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Period %-% is locked and cannot be closed again', p_year, p_month; END IF;
  RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_mo(p_mo_id uuid, p_actual_qty numeric DEFAULT NULL::numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mo public.manufacturing_orders%ROWTYPE; v_qty numeric; v_consumed int := 0; v_comp record;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.status = 'done' THEN RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already done'); END IF;
  IF v_mo.status <> 'in_progress' THEN RAISE EXCEPTION 'MO must be in_progress to complete (current: %)', v_mo.status; END IF;
  v_qty := COALESCE(p_actual_qty, v_mo.quantity);
  FOR v_comp IN SELECT component_product_id, qty_required FROM public.mo_components WHERE mo_id = p_mo_id LOOP
    INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, created_by, notes)
    VALUES (v_comp.component_product_id, -CEIL(v_comp.qty_required)::int, 'mo_consumption', 'manufacturing_order', p_mo_id::text, p_mo_id, auth.uid(), 'Consumed for MO ' || v_mo.mo_number);
    UPDATE public.product_stock SET quantity_on_hand = GREATEST(quantity_on_hand - CEIL(v_comp.qty_required)::int, 0), updated_at = now() WHERE product_id = v_comp.component_product_id;
    UPDATE public.mo_components SET qty_consumed = v_comp.qty_required WHERE mo_id = p_mo_id AND component_product_id = v_comp.component_product_id;
    v_consumed := v_consumed + 1;
  END LOOP;
  INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, created_by, notes)
  VALUES (v_mo.product_id, CEIL(v_qty)::int, 'mo_production', 'manufacturing_order', p_mo_id::text, p_mo_id, auth.uid(), 'Produced by MO ' || v_mo.mo_number);
  INSERT INTO public.product_stock (product_id, quantity_on_hand) VALUES (v_mo.product_id, CEIL(v_qty)::int)
  ON CONFLICT (product_id) DO UPDATE SET quantity_on_hand = public.product_stock.quantity_on_hand + EXCLUDED.quantity_on_hand, updated_at = now();
  UPDATE public.manufacturing_orders SET status = 'done', completed_at = now(), updated_at = now() WHERE id = p_mo_id;
  BEGIN PERFORM public.emit_platform_event('mo.completed', jsonb_build_object('mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed), 'manufacturing');
  EXCEPTION WHEN undefined_function THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed);
END; $function$;

NOTIFY pgrst, 'reload schema';
