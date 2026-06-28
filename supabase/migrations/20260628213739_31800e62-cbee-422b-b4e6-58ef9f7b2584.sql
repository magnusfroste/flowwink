-- Chunk 4/6

CREATE OR REPLACE FUNCTION public.complete_webinar(p_webinar_id uuid, p_recording_url text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_row webinars%ROWTYPE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE webinars SET status='completed', recording_url=COALESCE(p_recording_url,recording_url), updated_at=now() WHERE id=p_webinar_id AND status IN ('live','published') RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'webinar % cannot be completed', p_webinar_id; END IF;
  PERFORM emit_platform_event('webinar.completed', jsonb_build_object('webinar_id',v_row.id,'title',v_row.title,'recording_url',v_row.recording_url), 'webinars');
  RETURN jsonb_build_object('success',true,'id',v_row.id,'status',v_row.status);
END $function$;

CREATE OR REPLACE FUNCTION public.confirm_mo(p_mo_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_mo public.manufacturing_orders%ROWTYPE; v_bom_id uuid; v_bom_qty numeric; v_factor numeric; v_shortages jsonb := '[]'::jsonb;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.status NOT IN ('draft', 'planned') THEN
    PERFORM public.check_mo_availability(p_mo_id);
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', v_mo.status, 'note', 'already confirmed');
  END IF;
  v_bom_id := v_mo.bom_id;
  IF v_bom_id IS NULL THEN
    SELECT id, quantity_produced INTO v_bom_id, v_bom_qty FROM public.bom_headers WHERE product_id = v_mo.product_id AND is_active = true LIMIT 1;
    IF v_bom_id IS NULL THEN RAISE EXCEPTION 'No active BOM for product %', v_mo.product_id; END IF;
    UPDATE public.manufacturing_orders SET bom_id = v_bom_id WHERE id = p_mo_id;
  ELSE
    SELECT quantity_produced INTO v_bom_qty FROM public.bom_headers WHERE id = v_bom_id;
  END IF;
  v_factor := v_mo.quantity / NULLIF(v_bom_qty, 0);
  DELETE FROM public.mo_components WHERE mo_id = p_mo_id;
  INSERT INTO public.mo_components (mo_id, component_product_id, qty_required, availability)
  SELECT p_mo_id, bl.component_product_id, ROUND(bl.quantity * v_factor * (1 + bl.scrap_pct / 100.0), 4), 'unknown'
  FROM public.bom_lines bl WHERE bl.bom_id = v_bom_id;
  UPDATE public.manufacturing_orders SET status = 'confirmed', updated_at = now() WHERE id = p_mo_id;
  v_shortages := (public.check_mo_availability(p_mo_id))->'shortages';
  BEGIN PERFORM public.emit_platform_event('mo.confirmed', jsonb_build_object('mo_id', p_mo_id, 'shortages', v_shortages), 'manufacturing');
  EXCEPTION WHEN undefined_function THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'bom_id', v_bom_id, 'shortages', v_shortages);
END; $function$;

CREATE OR REPLACE FUNCTION public.consume_reservation(p_reservation_id uuid, p_to_location_code text DEFAULT 'WH/CUSTOMERS'::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r stock_reservations%ROWTYPE; v_to uuid; v_move uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.create_bom(p_product_id uuid, p_lines jsonb, p_version text DEFAULT NULL::text, p_quantity_produced numeric DEFAULT 1, p_routing_notes text DEFAULT NULL::text, p_activate boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_bom_id uuid; v_version text; v_line jsonb; v_pos int := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN RAISE EXCEPTION 'Permission denied'; END IF;
  IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'lines must contain at least one component'; END IF;
  IF p_version IS NULL OR trim(p_version) = '' THEN
    SELECT 'v' || (COALESCE(COUNT(*), 0) + 1)::text INTO v_version FROM public.bom_headers WHERE product_id = p_product_id;
  ELSE v_version := p_version; END IF;
  IF p_activate THEN UPDATE public.bom_headers SET is_active = false WHERE product_id = p_product_id AND is_active = true; END IF;
  INSERT INTO public.bom_headers (product_id, version, is_active, quantity_produced, routing_notes, created_by)
  VALUES (p_product_id, v_version, p_activate, COALESCE(p_quantity_produced, 1), p_routing_notes, auth.uid()) RETURNING id INTO v_bom_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.bom_lines (bom_id, component_product_id, quantity, unit, scrap_pct, position)
    VALUES (v_bom_id, (v_line->>'component_product_id')::uuid, (v_line->>'quantity')::numeric, v_line->>'unit', COALESCE((v_line->>'scrap_pct')::numeric, 0), COALESCE((v_line->>'position')::int, v_pos));
  END LOOP;
  RETURN jsonb_build_object('success', true, 'bom_id', v_bom_id, 'version', v_version, 'line_count', jsonb_array_length(p_lines));
END; $function$;

CREATE OR REPLACE FUNCTION public.generate_subscription_invoice(_subscription_id uuid, _tax_rate numeric DEFAULT NULL::numeric, _due_in_days integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _sub public.subscriptions%ROWTYPE; _invoice_id uuid; _invoice_number text; _subtotal integer; _tax integer; _total integer; _rate numeric; _due integer; _due_date date; _next date; _line jsonb; _status invoice_status;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'Only admins or system can generate subscription invoices'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'generate_subscription_invoice only applies to manual subscriptions (got %)', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot invoice subscription in status %', _sub.status; END IF;
  _subtotal := _sub.unit_amount_cents * COALESCE(_sub.quantity, 1);
  _rate := COALESCE(_tax_rate, 0.25);
  _tax := round(_subtotal * _rate)::integer;
  _total := _subtotal + _tax;
  _due := COALESCE(_due_in_days, CASE _sub.payment_terms WHEN 'invoice_30' THEN 30 WHEN 'invoice_14' THEN 14 WHEN 'invoice_7' THEN 7 ELSE 30 END);
  _due_date := CURRENT_DATE + _due;
  _invoice_number := 'SUB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
  _line := jsonb_build_array(jsonb_build_object('description', _sub.product_name || ' (' || to_char(COALESCE(_sub.current_period_start, now()), 'YYYY-MM-DD') || ' → ' || to_char(COALESCE(_sub.current_period_end, now()), 'YYYY-MM-DD') || ')', 'quantity', _sub.quantity, 'unit_price_cents', _sub.unit_amount_cents, 'total_cents', _subtotal));
  _status := CASE WHEN COALESCE(_sub.auto_finalize, false) THEN 'sent'::invoice_status ELSE 'draft'::invoice_status END;
  INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, sent_at)
  VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, _status, _line, _subtotal, _rate, _tax, _total, upper(_sub.currency), _due_date, CURRENT_DATE, 'Net ' || _due || ' days', 'Generated from subscription ' || _sub.id::text || CASE WHEN _sub.po_number IS NOT NULL THEN E'\nPO: ' || _sub.po_number ELSE '' END, CASE WHEN _status = 'sent'::invoice_status THEN now() ELSE NULL END)
  RETURNING id INTO _invoice_id;
  _next := advance_billing_date(CURRENT_DATE, _sub.billing_interval, _sub.billing_interval_count);
  UPDATE public.subscriptions SET last_invoice_id = _invoice_id, current_period_start = COALESCE(current_period_end, now()), current_period_end = _next::timestamptz, next_invoice_date = _next, updated_at = now() WHERE id = _subscription_id;
  PERFORM public.emit_platform_event('subscription.invoiced', jsonb_build_object('subscription_id', _subscription_id, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'total_cents', _total, 'currency', upper(_sub.currency), 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'status', _status), 'generate_subscription_invoice');
  IF _status = 'sent'::invoice_status THEN
    PERFORM public.emit_platform_event('invoice.finalized', jsonb_build_object('invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'subscription_id', _subscription_id, 'total_cents', _total, 'currency', upper(_sub.currency), 'source', 'subscription_auto_finalize'), 'generate_subscription_invoice');
  END IF;
  RETURN jsonb_build_object('ok', true, 'invoice_id', _invoice_id, 'invoice_number', _invoice_number, 'status', _status, 'auto_finalized', COALESCE(_sub.auto_finalize, false), 'total_cents', _total, 'next_invoice_date', _next);
END $function$;

CREATE OR REPLACE FUNCTION public.hire_application(p_application_id uuid, p_start_date date DEFAULT NULL::date, p_monthly_salary_cents bigint DEFAULT NULL::bigint, p_contract_template_id uuid DEFAULT NULL::uuid, p_onboarding_template_id uuid DEFAULT NULL::uuid, p_department text DEFAULT NULL::text, p_manager_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(application_id uuid, employee_id uuid, employment_contract_id uuid, onboarding_checklist_id uuid, contract_status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_app public.applications; v_job public.job_postings; v_emp_id UUID; v_contract_id UUID; v_onboard_id UUID; v_template public.employment_contract_templates; v_onb_template UUID; v_start_date DATE; v_salary BIGINT; v_dept TEXT; v_emp_type TEXT; v_body TEXT; v_probation_end DATE;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::public.app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'approver'::public.app_role))) THEN RAISE EXCEPTION 'Only admins/approvers can hire candidates'; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.employee_id IS NOT NULL THEN RAISE EXCEPTION 'Application already hired (employee_id=%)', v_app.employee_id; END IF;
  SELECT * INTO v_job FROM public.job_postings WHERE id = v_app.job_posting_id;
  v_start_date := COALESCE(p_start_date, CURRENT_DATE + INTERVAL '14 days');
  v_dept := COALESCE(p_department, v_job.department, 'General');
  v_emp_type := COALESCE(v_job.employment_type::TEXT, 'full_time');
  v_salary := COALESCE(p_monthly_salary_cents, NULLIF((COALESCE(v_job.salary_min_cents,0) + COALESCE(v_job.salary_max_cents,0)) / 2, 0), v_job.salary_min_cents);
  INSERT INTO public.employees (name, email, phone, title, department, employment_type, start_date, status, manager_id, created_by)
  VALUES (v_app.candidate_name, v_app.candidate_email, v_app.candidate_phone, COALESCE(v_job.title, 'Employee'), v_dept, v_emp_type, v_start_date, 'active', p_manager_id, auth.uid())
  RETURNING id INTO v_emp_id;
  IF p_contract_template_id IS NOT NULL THEN
    SELECT * INTO v_template FROM public.employment_contract_templates WHERE id = p_contract_template_id;
  ELSE
    SELECT * INTO v_template FROM public.employment_contract_templates WHERE is_active = true AND is_default = true LIMIT 1;
    IF v_template.id IS NULL THEN
      SELECT * INTO v_template FROM public.employment_contract_templates WHERE is_active = true ORDER BY created_at LIMIT 1;
    END IF;
  END IF;
  v_body := COALESCE(v_template.body_markdown, '# Employment Agreement' || E'\n\nEmployee: ' || v_app.candidate_name);
  v_body := REPLACE(v_body, '{{employee_name}}', v_app.candidate_name);
  v_body := REPLACE(v_body, '{{title}}', COALESCE(v_job.title, ''));
  v_body := REPLACE(v_body, '{{department}}', v_dept);
  v_body := REPLACE(v_body, '{{start_date}}', to_char(v_start_date, 'YYYY-MM-DD'));
  v_body := REPLACE(v_body, '{{monthly_salary}}', COALESCE((v_salary / 100)::TEXT, 'TBD'));
  v_probation_end := v_start_date + (COALESCE(v_template.default_probation_months, 6) || ' months')::INTERVAL;
  INSERT INTO public.employment_contracts (employee_id, template_id, title, employment_type, start_date, probation_end_date, notice_period_days, monthly_salary_cents, currency, body_markdown, status, created_by, metadata)
  VALUES (v_emp_id, v_template.id, 'Employment Agreement — ' || v_app.candidate_name, COALESCE(v_template.employment_type, 'permanent'), v_start_date, v_probation_end, COALESCE(v_template.default_notice_period_days, 30), v_salary, COALESCE(v_job.currency, 'SEK'), v_body, 'draft', auth.uid(), jsonb_build_object('source','auto_hire','application_id',p_application_id,'job_posting_id',v_app.job_posting_id))
  RETURNING id INTO v_contract_id;
  v_onb_template := p_onboarding_template_id;
  IF v_onb_template IS NULL THEN
    SELECT id INTO v_onb_template FROM public.onboarding_templates WHERE is_active = true AND (department IS NULL OR department = v_dept) AND (employment_type IS NULL OR employment_type = v_emp_type)
    ORDER BY (department = v_dept) DESC NULLS LAST, (employment_type = v_emp_type) DESC NULLS LAST, is_default DESC, created_at LIMIT 1;
  END IF;
  IF v_onb_template IS NOT NULL THEN
    INSERT INTO public.onboarding_checklists (employee_id, title, items, created_by) SELECT v_emp_id, name, items, auth.uid() FROM public.onboarding_templates WHERE id = v_onb_template RETURNING id INTO v_onboard_id;
  END IF;
  UPDATE public.applications SET employee_id = v_emp_id, hired_at = now(), stage = 'hired', updated_at = now() WHERE id = p_application_id;
  application_id := p_application_id; employee_id := v_emp_id; employment_contract_id := v_contract_id; onboarding_checklist_id := v_onboard_id; contract_status := 'draft';
  RETURN NEXT;
END; $function$;

NOTIFY pgrst, 'reload schema';
