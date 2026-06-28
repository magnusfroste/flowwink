-- Chunk 5/6

CREATE OR REPLACE FUNCTION public.lock_timesheet_period(p_fiscal_year integer, p_period_month integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _lock_id uuid; _entry_count integer;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'Only admins can lock timesheet periods'; END IF;
  IF p_fiscal_year IS NULL OR p_period_month IS NULL THEN RAISE EXCEPTION 'fiscal_year and period_month are required'; END IF;
  IF p_period_month < 1 OR p_period_month > 12 THEN RAISE EXCEPTION 'period_month must be 1-12 (got %)', p_period_month; END IF;
  INSERT INTO public.timesheet_period_locks (fiscal_year, period_month, notes, locked_by)
  VALUES (p_fiscal_year, p_period_month, p_notes, auth.uid())
  ON CONFLICT (fiscal_year, period_month) DO UPDATE SET notes = COALESCE(EXCLUDED.notes, public.timesheet_period_locks.notes), locked_at = now(), locked_by = auth.uid()
  RETURNING id INTO _lock_id;
  SELECT count(*) INTO _entry_count FROM public.time_entries WHERE date_part('year', entry_date) = p_fiscal_year AND date_part('month', entry_date) = p_period_month;
  PERFORM public.emit_platform_event('timesheet.period_locked', jsonb_build_object('fiscal_year', p_fiscal_year, 'period_month', p_period_month, 'entries_locked', _entry_count), 'lock_timesheet_period');
  RETURN jsonb_build_object('ok', true, 'lock_id', _lock_id, 'fiscal_year', p_fiscal_year, 'period_month', p_period_month, 'entries_locked', _entry_count);
END $function$;

CREATE OR REPLACE FUNCTION public.mark_webinar_attendance(p_registration_id uuid, p_attended boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_reg webinar_registrations%ROWTYPE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE webinar_registrations SET attended=p_attended WHERE id=p_registration_id RETURNING * INTO v_reg;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration % not found', p_registration_id; END IF;
  IF p_attended AND v_reg.lead_id IS NOT NULL THEN UPDATE leads SET score = COALESCE(score,0) + 10, updated_at=now() WHERE id = v_reg.lead_id; END IF;
  PERFORM emit_platform_event('webinar.attended', jsonb_build_object('webinar_id',v_reg.webinar_id,'registration_id',v_reg.id,'lead_id',v_reg.lead_id,'attended',p_attended), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_reg.id,'attended',p_attended);
END $function$;

CREATE OR REPLACE FUNCTION public.procurement_run()
 RETURNS TABLE(suggestions_created integer, rules_evaluated integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rule record; v_on_hand numeric; v_reserved numeric; v_incoming numeric; v_virtual numeric; v_qty_to_order numeric; v_count integer := 0; v_evaluated integer := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  FOR v_rule IN SELECT * FROM reorder_rules WHERE is_active = true LOOP
    v_evaluated := v_evaluated + 1;
    SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(reserved_quantity),0) INTO v_on_hand, v_reserved FROM stock_quants WHERE product_id = v_rule.product_id AND location_id = v_rule.location_id;
    SELECT COALESCE(SUM(pol.quantity - COALESCE(pol.received_quantity,0)),0) INTO v_incoming FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.purchase_order_id WHERE pol.product_id = v_rule.product_id AND po.status IN ('draft','sent','confirmed','partial');
    v_virtual := v_on_hand - v_reserved + COALESCE(v_incoming,0);
    IF v_virtual < v_rule.min_qty THEN
      v_qty_to_order := COALESCE(NULLIF(v_rule.reorder_qty,0), v_rule.max_qty - v_virtual);
      IF v_qty_to_order <= 0 THEN v_qty_to_order := v_rule.min_qty - v_virtual; END IF;
      IF NOT EXISTS (SELECT 1 FROM procurement_suggestions WHERE product_id = v_rule.product_id AND location_id = v_rule.location_id AND status = 'pending') THEN
        INSERT INTO procurement_suggestions (product_id, location_id, suggested_qty, procurement_method, preferred_vendor_id, needed_by, reasoning)
        VALUES (v_rule.product_id, v_rule.location_id, v_qty_to_order, v_rule.procurement_method, v_rule.preferred_vendor_id, (CURRENT_DATE + (v_rule.lead_time_days || ' days')::interval)::date,
          jsonb_build_object('on_hand', v_on_hand, 'reserved', v_reserved, 'incoming', v_incoming, 'virtual', v_virtual, 'min_qty', v_rule.min_qty, 'max_qty', v_rule.max_qty));
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_count, v_evaluated;
END; $function$;

CREATE OR REPLACE FUNCTION public.publish_webinar(p_webinar_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE webinars SET status='published', updated_at=now() WHERE id=p_webinar_id AND status='draft' RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % not found or not in draft', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.published', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title,'date',v_row.date), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $function$;

CREATE OR REPLACE FUNCTION public.reject_procurement_suggestion(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can reject suggestions'; END IF;
  UPDATE procurement_suggestions SET status='rejected', resolved_at=now(), resolved_by=auth.uid(),
    reasoning = COALESCE(reasoning,'{}'::jsonb) || jsonb_build_object('rejection_reason', p_reason)
    WHERE id = p_id AND status = 'pending';
END; $function$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(p_year integer, p_month integer, p_reason text DEFAULT NULL::text)
 RETURNS accounting_periods LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row public.accounting_periods;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) THEN RAISE EXCEPTION 'Only admins can reopen accounting periods'; END IF;
  UPDATE public.accounting_periods
  SET status = 'open', reopened_by = auth.uid(), reopened_at = now(),
      notes = CASE WHEN p_reason IS NOT NULL THEN COALESCE(notes, '') || E'\n[reopened] ' || p_reason ELSE notes END,
      updated_at = now()
  WHERE fiscal_year = p_year AND period_month = p_month AND status = 'closed'
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Period %-% not found, already open, or permanently locked', p_year, p_month; END IF;
  RETURN v_row;
END; $function$;

CREATE OR REPLACE FUNCTION public.reserve_stock(p_product_id uuid, p_location_id uuid, p_quantity numeric, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_lot_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_avail numeric; v_reserved numeric;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  SELECT COALESCE(quantity,0), COALESCE(reserved_quantity,0) INTO v_avail, v_reserved FROM stock_quants WHERE product_id = p_product_id AND location_id = p_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  IF (COALESCE(v_avail,0) - COALESCE(v_reserved,0)) < p_quantity THEN RAISE EXCEPTION 'Insufficient available stock to reserve (free %, need %)', (COALESCE(v_avail,0) - COALESCE(v_reserved,0)), p_quantity; END IF;
  INSERT INTO stock_reservations (product_id, location_id, lot_id, quantity, reference_type, reference_id, reserved_by, notes)
  VALUES (p_product_id, p_location_id, p_lot_id, p_quantity, p_reference_type, p_reference_id, auth.uid(), p_notes) RETURNING id INTO v_id;
  UPDATE stock_quants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_quantity, updated_at = now()
    WHERE product_id = p_product_id AND location_id = p_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.reset_module_data(p_module text, p_dry_run boolean DEFAULT true, p_run_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE PROTECTED_TABLES text[] := ARRAY['pages','agent_skills','agent_objectives','agent_memory','site_settings','contract_templates','quote_templates','locale_packs','user_roles','profiles'];
  v_module text; v_counts jsonb := '{}'::jsonb; v_tbl text; v_count int; v_total int := 0; v_sql text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can reset demo data'; END IF;
  v_module := lower(trim(p_module));
  FOR v_tbl, v_count IN
    SELECT i.table_name, count(*)::int FROM public.demo_run_items i JOIN public.demo_runs r ON r.id = i.run_id
    WHERE (v_module = 'all' OR r.module = v_module) AND (p_run_id IS NULL OR r.id = p_run_id) GROUP BY i.table_name
  LOOP
    IF v_tbl = ANY(PROTECTED_TABLES) THEN CONTINUE; END IF;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_count);
    v_total := v_total + v_count;
    IF NOT p_dry_run THEN
      v_sql := format('DELETE FROM public.%I WHERE id IN (SELECT i.row_id FROM public.demo_run_items i JOIN public.demo_runs r ON r.id = i.run_id WHERE i.table_name = %L AND (%L = ''all'' OR r.module = %L) AND (%L::uuid IS NULL OR r.id = %L::uuid))', v_tbl, v_tbl, v_module, v_module, p_run_id, p_run_id);
      EXECUTE v_sql;
    END IF;
  END LOOP;
  IF NOT p_dry_run THEN DELETE FROM public.demo_runs r WHERE (v_module = 'all' OR r.module = v_module) AND (p_run_id IS NULL OR r.id = p_run_id); END IF;
  RETURN jsonb_build_object('success', true, 'dry_run', p_dry_run, 'module', v_module, 'run_id', p_run_id, 'total_rows', v_total, 'counts_by_table', v_counts);
END $function$;

CREATE OR REPLACE FUNCTION public.send_dunning_reminders(p_dry_run boolean DEFAULT false)
 RETURNS TABLE(invoice_id uuid, invoice_number text, customer_email text, days_overdue integer, dunning_step text, total_cents bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_inv RECORD; v_step TEXT; v_days INTEGER;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver'::public.app_role))) THEN RAISE EXCEPTION 'Only admins/approvers can send dunning reminders'; END IF;
  FOR v_inv IN SELECT i.id, i.invoice_number, i.customer_email, i.due_date, i.total_cents, i.status
    FROM public.invoices i WHERE i.status IN ('sent', 'overdue') AND i.due_date < CURRENT_DATE AND i.paid_at IS NULL ORDER BY i.due_date ASC LOOP
    v_days := (CURRENT_DATE - v_inv.due_date)::INTEGER;
    v_step := CASE WHEN v_days >= 30 THEN 'final_notice' WHEN v_days >= 14 THEN 'formal_reminder' WHEN v_days >= 7 THEN 'friendly_reminder' ELSE 'pre_reminder' END;
    IF NOT p_dry_run THEN
      UPDATE public.invoices SET status = 'overdue', updated_at = now() WHERE id = v_inv.id AND status = 'sent';
      INSERT INTO public.dunning_actions (invoice_id, step_name, action_type, status, executed_at, metadata)
      SELECT v_inv.id, v_step, 'email', 'sent', now(), jsonb_build_object('days_overdue', v_days, 'auto', true)
      WHERE NOT EXISTS (SELECT 1 FROM public.dunning_actions WHERE invoice_id = v_inv.id AND step_name = v_step AND executed_at::date = CURRENT_DATE);
    END IF;
    invoice_id := v_inv.id; invoice_number := v_inv.invoice_number; customer_email := v_inv.customer_email; days_overdue := v_days; dunning_step := v_step; total_cents := v_inv.total_cents;
    RETURN NEXT;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.ship_picking(p_picking_order_id uuid, p_tracking_number text DEFAULT NULL::text, p_carrier text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_po RECORD; v_line RECORD; v_consumed INT := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee'))) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_po FROM public.picking_orders WHERE id = p_picking_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking order % not found', p_picking_order_id; END IF;
  IF v_po.status = 'shipped' THEN RETURN jsonb_build_object('success', true, 'already_shipped', true); END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot ship cancelled picking_order'; END IF;
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND status = 'picked' LOOP
    IF v_line.reservation_id IS NOT NULL THEN
      BEGIN PERFORM public.consume_reservation(v_line.reservation_id, v_line.qty_picked); v_consumed := v_consumed + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata) VALUES ('picking.consume_failed', 'picking_line', v_line.id, auth.uid(), jsonb_build_object('error', SQLERRM));
      END;
    END IF;
  END LOOP;
  UPDATE public.picking_orders SET status = 'shipped', shipped_at = now(), tracking_number = COALESCE(p_tracking_number, tracking_number), carrier = COALESCE(p_carrier, carrier) WHERE id = p_picking_order_id;
  IF v_po.order_id IS NOT NULL THEN UPDATE public.orders SET status = 'shipped', updated_at = now() WHERE id = v_po.order_id; END IF;
  BEGIN PERFORM public.emit_platform_event('picking.shipped', jsonb_build_object('picking_order_id', p_picking_order_id, 'order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'consumed_lines', v_consumed), 'pick_pack');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.shipped', 'picking_order', p_picking_order_id, auth.uid(), jsonb_build_object('order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'consumed', v_consumed));
  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id, 'consumed_lines', v_consumed);
END; $function$;

NOTIFY pgrst, 'reload schema';
