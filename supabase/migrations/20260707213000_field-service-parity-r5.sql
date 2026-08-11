-- Field Service: parity round 5 (docs/parity/capabilities/field-service.json)
-- Adds: technician availability check, visit clock-in/out (actual times),
-- signature/photo proof capture, service SLA targets, reusable service
-- packages, recurring service orders (+ daily cron), and contract/project/deal
-- linking. Also repairs two pieces of stock-deduction drift found on dev:
--
--   1. emit_service_order_event on dev was the pre-20260614010000 body (the
--      backdated repo migration was silently skipped by the managed migrate
--      runner) — completed orders never emitted stock.movement for material
--      lines. Re-created here, forward-dated.
--   2. The live consumer apply_stock_movement_event(jsonb) only reads
--      `qty_delta`, but both record_pos_sale_v2 and the field-service emitter
--      send `quantity` — every deduction silently no-opped (the COALESCE fell
--      through to 0 and the line was skipped). The consumer now accepts
--      qty_delta | quantity_delta | quantity | qty.
--
-- Idempotent DDL. Forward-dated for the Lovable-managed migrate runner
-- (backdated files are silently skipped).

-- ── 1. Schema additions ──────────────────────────────────────────────────────
ALTER TABLE public.service_visits
  ADD COLUMN IF NOT EXISTS proof_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS signed_by text;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS sla_response_due timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_due timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS recurrence_until date,
  ADD COLUMN IF NOT EXISTS next_occurrence_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL;

ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_recurrence_rule_check;
ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_recurrence_rule_check
  CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('weekly','biweekly','monthly','quarterly','yearly'));

CREATE TABLE IF NOT EXISTS public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  default_priority text NOT NULL DEFAULT 'medium',
  -- [{kind, description, quantity, unit_price, product_id}]
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage service_packages" ON public.service_packages;
CREATE POLICY "Admins manage service_packages" ON public.service_packages
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Staff view service_packages" ON public.service_packages;
CREATE POLICY "Staff view service_packages" ON public.service_packages
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'approver'::app_role)
      OR has_role(auth.uid(), 'writer'::app_role));

-- ── 2. Stock-deduction drift fixes ───────────────────────────────────────────
-- 2a. Consumer accepts all field-name variants emitters actually use.
CREATE OR REPLACE FUNCTION public.apply_stock_movement_event(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
  v_qty_delta numeric;
  v_location_id uuid;
  v_location_code text;
  v_reason text;
BEGIN
  v_product_id := NULLIF(p_payload->>'product_id','')::uuid;
  -- Accept qty_delta | quantity_delta | quantity | qty — emitters disagree
  -- (record_pos_sale_v2 + emit_service_order_event send `quantity`) and the
  -- old single-name read made every deduction a silent no-op.
  v_qty_delta := COALESCE(
    (p_payload->>'qty_delta')::numeric,
    (p_payload->>'quantity_delta')::numeric,
    (p_payload->>'quantity')::numeric,
    (p_payload->>'qty')::numeric,
    0);
  v_location_code := COALESCE(p_payload->>'location_code', 'WH/MAIN');
  v_reason := COALESCE(p_payload->>'reason', 'event:stock.movement');

  -- Skip if no product or zero delta (e.g. POS line with custom product_name only)
  IF v_product_id IS NULL OR v_qty_delta = 0 THEN
    RETURN;
  END IF;

  -- Resolve location
  SELECT id INTO v_location_id
    FROM public.stock_locations
   WHERE code = v_location_code AND is_active = true
   LIMIT 1;

  IF v_location_id IS NULL THEN
    SELECT id INTO v_location_id
      FROM public.stock_locations
     WHERE location_type = 'internal' AND is_active = true
     ORDER BY created_at LIMIT 1;
  END IF;

  IF v_location_id IS NULL THEN
    RAISE NOTICE 'apply_stock_movement_event: no internal location found, skipping';
    RETURN;
  END IF;

  -- Upsert quant
  INSERT INTO public.stock_quants (product_id, location_id, quantity, lot_id)
  VALUES (v_product_id, v_location_id, v_qty_delta, NULL)
  ON CONFLICT (product_id, location_id, lot_id) WHERE lot_id IS NULL
  DO UPDATE SET quantity = stock_quants.quantity + EXCLUDED.quantity, updated_at = now();

  -- Best-effort: keep products.stock_quantity mirror in sync for low_stock alerts
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + v_qty_delta::int,
         updated_at = now()
   WHERE id = v_product_id AND track_inventory = true;

  -- Log a stock_move row for traceability
  BEGIN
    INSERT INTO public.stock_moves
      (product_id, source_location_id, destination_location_id, quantity, state, notes)
    SELECT
      v_product_id,
      CASE WHEN v_qty_delta < 0 THEN v_location_id ELSE (SELECT id FROM stock_locations WHERE code='WH/CUSTOMERS' LIMIT 1) END,
      CASE WHEN v_qty_delta > 0 THEN v_location_id ELSE (SELECT id FROM stock_locations WHERE code='WH/CUSTOMERS' LIMIT 1) END,
      abs(v_qty_delta), 'done', v_reason
    WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stock_moves');
  EXCEPTION WHEN others THEN
    NULL;
  END;
END;
$function$;

-- 2b. Emitter: material lines draw stock down on completion (repo intent from
-- 20260614010000, stranded below the managed runner's ledger HEAD).
CREATE OR REPLACE FUNCTION public.emit_service_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_platform_event('service_order.created',
      jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'customer_name', NEW.customer_name, 'priority', NEW.priority),
      'service_orders');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      PERFORM public.emit_platform_event('service_order.completed',
        jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'customer_name', NEW.customer_name, 'customer_email', NEW.customer_email, 'total_amount', NEW.total_amount),
        'service_orders');
      -- Deduct consumed parts: one stock.movement per material line with a product.
      -- Only on the transition to completed, so re-saving does not double-deduct.
      FOR v_line IN
        SELECT product_id, quantity, description
        FROM public.service_order_lines
        WHERE service_order_id = NEW.id AND kind = 'material' AND product_id IS NOT NULL
      LOOP
        PERFORM public.emit_platform_event(
          'stock.movement',
          jsonb_build_object(
            'product_id', v_line.product_id,
            'qty_delta', -(v_line.quantity),
            'quantity', -(v_line.quantity),
            'reason', 'field_service',
            'reference_type', 'service_order',
            'reference_id', NEW.id,
            'description', v_line.description
          ),
          'service_orders');
      END LOOP;
    ELSIF NEW.status = 'scheduled' THEN
      PERFORM public.emit_platform_event('service_order.scheduled',
        jsonb_build_object('id', NEW.id, 'order_number', NEW.order_number, 'scheduled_start', NEW.scheduled_start),
        'service_orders');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 3. Technician availability ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_technician_availability(
  p_technician_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_visit_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conflicts jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
    RAISE EXCEPTION 'Only staff can check technician availability';
  END IF;
  IF p_technician_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'technician_id, start and end are required';
  END IF;
  IF p_end <= p_start THEN
    RAISE EXCEPTION 'end must be after start';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'visit_id', v.id,
      'service_order_id', v.service_order_id,
      'order_number', o.order_number,
      'order_title', o.title,
      'scheduled_start', v.scheduled_start,
      'scheduled_end', v.scheduled_end,
      'status', v.status
    ) ORDER BY v.scheduled_start), '[]'::jsonb)
  INTO v_conflicts
  FROM public.service_visits v
  JOIN public.service_orders o ON o.id = v.service_order_id
  WHERE v.technician_id = p_technician_id
    AND COALESCE(v.status,'scheduled') NOT IN ('cancelled','done','no_show')
    AND (p_exclude_visit_id IS NULL OR v.id <> p_exclude_visit_id)
    AND v.scheduled_start < p_end
    AND v.scheduled_end > p_start;

  RETURN jsonb_build_object(
    'success', true,
    'available', jsonb_array_length(v_conflicts) = 0,
    'conflicts', v_conflicts,
    'technician_id', p_technician_id,
    'window', jsonb_build_object('start', p_start, 'end', p_end)
  );
END;
$function$;

-- ── 4. Visit clock-in/out ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_visit_time(
  p_visit_id uuid,
  p_action text,
  p_at timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visit public.service_visits%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can record visit time';
  END IF;
  SELECT * INTO v_visit FROM public.service_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit % not found', p_visit_id; END IF;

  IF p_action = 'start' THEN
    IF v_visit.actual_start IS NOT NULL THEN
      RAISE EXCEPTION 'Visit already started at %', v_visit.actual_start;
    END IF;
    UPDATE public.service_visits
       SET actual_start = COALESCE(p_at, now()), status = 'in_progress', updated_at = now()
     WHERE id = p_visit_id;
    -- Bubble to the order: first on-site activity = in_progress + first response
    UPDATE public.service_orders
       SET status = CASE WHEN status IN ('draft','scheduled') THEN 'in_progress' ELSE status END,
           first_response_at = COALESCE(first_response_at, COALESCE(p_at, now())),
           updated_at = now()
     WHERE id = v_visit.service_order_id;
    RETURN jsonb_build_object('success', true, 'visit_id', p_visit_id, 'actual_start', COALESCE(p_at, now()));

  ELSIF p_action = 'stop' THEN
    IF v_visit.actual_start IS NULL THEN
      RAISE EXCEPTION 'Visit has not been started — call with p_action=start first';
    END IF;
    IF v_visit.actual_end IS NOT NULL THEN
      RAISE EXCEPTION 'Visit already ended at %', v_visit.actual_end;
    END IF;
    IF COALESCE(p_at, now()) <= v_visit.actual_start THEN
      RAISE EXCEPTION 'end time must be after start time %', v_visit.actual_start;
    END IF;
    UPDATE public.service_visits
       SET actual_end = COALESCE(p_at, now()), status = 'done', updated_at = now()
     WHERE id = p_visit_id;
    RETURN jsonb_build_object(
      'success', true, 'visit_id', p_visit_id,
      'actual_start', v_visit.actual_start,
      'actual_end', COALESCE(p_at, now()),
      'duration_minutes', round(EXTRACT(EPOCH FROM (COALESCE(p_at, now()) - v_visit.actual_start)) / 60.0)
    );
  ELSE
    RAISE EXCEPTION 'action must be start or stop (got %)', p_action;
  END IF;
END;
$function$;

-- ── 5. Signature / photo proof ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_visit_proof(
  p_visit_id uuid,
  p_signature_url text DEFAULT NULL,
  p_photo_urls jsonb DEFAULT NULL,
  p_signed_by text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visit public.service_visits%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can record visit proof';
  END IF;
  IF p_signature_url IS NULL AND p_photo_urls IS NULL AND p_signed_by IS NULL THEN
    RAISE EXCEPTION 'Provide at least one of signature_url, photo_urls, signed_by';
  END IF;
  IF p_photo_urls IS NOT NULL AND jsonb_typeof(p_photo_urls) <> 'array' THEN
    RAISE EXCEPTION 'photo_urls must be a JSON array of URLs';
  END IF;
  SELECT * INTO v_visit FROM public.service_visits WHERE id = p_visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit % not found', p_visit_id; END IF;

  UPDATE public.service_visits
     SET signature_url = COALESCE(p_signature_url, signature_url),
         signed_by     = COALESCE(p_signed_by, signed_by),
         signed_at     = CASE WHEN p_signature_url IS NOT NULL OR p_signed_by IS NOT NULL
                              THEN COALESCE(signed_at, now()) ELSE signed_at END,
         proof_photos  = CASE WHEN p_photo_urls IS NOT NULL
                              THEN COALESCE(proof_photos,'[]'::jsonb) || p_photo_urls
                              ELSE proof_photos END,
         technician_notes = CASE WHEN p_notes IS NOT NULL
                                 THEN COALESCE(technician_notes || E'\n', '') || p_notes
                                 ELSE technician_notes END,
         updated_at = now()
   WHERE id = p_visit_id;

  SELECT * INTO v_visit FROM public.service_visits WHERE id = p_visit_id;
  RETURN jsonb_build_object(
    'success', true, 'visit_id', p_visit_id,
    'signature_url', v_visit.signature_url,
    'signed_by', v_visit.signed_by,
    'signed_at', v_visit.signed_at,
    'proof_photos', v_visit.proof_photos
  );
END;
$function$;

-- ── 6. Service SLA targets ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_service_sla(
  p_action text,
  p_order_id uuid DEFAULT NULL,
  p_response_hours numeric DEFAULT NULL,
  p_resolution_hours numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
    RAISE EXCEPTION 'Only staff can manage service SLAs';
  END IF;

  IF p_action = 'set' THEN
    IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id is required'; END IF;
    IF p_response_hours IS NULL AND p_resolution_hours IS NULL THEN
      RAISE EXCEPTION 'Provide response_hours and/or resolution_hours';
    END IF;
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;
    UPDATE public.service_orders
       SET sla_response_due   = CASE WHEN p_response_hours   IS NOT NULL THEN created_at + (p_response_hours   || ' hours')::interval ELSE sla_response_due END,
           sla_resolution_due = CASE WHEN p_resolution_hours IS NOT NULL THEN created_at + (p_resolution_hours || ' hours')::interval ELSE sla_resolution_due END,
           updated_at = now()
     WHERE id = p_order_id;
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id,
      'sla_response_due', v_order.sla_response_due,
      'sla_resolution_due', v_order.sla_resolution_due);

  ELSIF p_action = 'status' THEN
    IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id is required'; END IF;
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;
    RETURN jsonb_build_object(
      'success', true, 'order_id', p_order_id, 'status', v_order.status,
      'sla_response_due', v_order.sla_response_due,
      'sla_resolution_due', v_order.sla_resolution_due,
      'first_response_at', v_order.first_response_at,
      'completed_at', v_order.completed_at,
      'response_met', CASE
        WHEN v_order.sla_response_due IS NULL THEN NULL
        WHEN v_order.first_response_at IS NOT NULL THEN v_order.first_response_at <= v_order.sla_response_due
        WHEN now() > v_order.sla_response_due THEN false
        ELSE NULL END,
      'resolution_met', CASE
        WHEN v_order.sla_resolution_due IS NULL THEN NULL
        WHEN v_order.completed_at IS NOT NULL THEN v_order.completed_at <= v_order.sla_resolution_due
        WHEN now() > v_order.sla_resolution_due THEN false
        ELSE NULL END
    );

  ELSIF p_action = 'list_breaches' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'order_id', o.id, 'order_number', o.order_number, 'title', o.title,
        'status', o.status,
        'sla_response_due', o.sla_response_due, 'first_response_at', o.first_response_at,
        'sla_resolution_due', o.sla_resolution_due, 'completed_at', o.completed_at,
        'response_breached', (o.sla_response_due IS NOT NULL AND o.first_response_at IS NULL AND now() > o.sla_response_due),
        'resolution_breached', (o.sla_resolution_due IS NOT NULL AND o.completed_at IS NULL AND now() > o.sla_resolution_due)
      ) ORDER BY COALESCE(o.sla_resolution_due, o.sla_response_due)), '[]'::jsonb)
    INTO v_rows
    FROM public.service_orders o
    WHERE o.status NOT IN ('completed','invoiced','cancelled')
      AND ((o.sla_response_due IS NOT NULL AND o.first_response_at IS NULL AND now() > o.sla_response_due)
        OR (o.sla_resolution_due IS NOT NULL AND now() > o.sla_resolution_due));
    RETURN jsonb_build_object('success', true, 'breaches', v_rows);

  ELSE
    RAISE EXCEPTION 'action must be set | status | list_breaches (got %)', p_action;
  END IF;
END;
$function$;

-- ── 7. Service package templates ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_service_package(
  p_action text,
  p_package_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_lines jsonb DEFAULT NULL,
  p_active boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg public.service_packages%ROWTYPE;
  v_line jsonb;
  v_count int := 0;
  v_rows jsonb;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can manage service packages';
  END IF;

  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    IF p_lines IS NOT NULL AND jsonb_typeof(p_lines) <> 'array' THEN
      RAISE EXCEPTION 'lines must be a JSON array of {kind, description, quantity, unit_price, product_id}';
    END IF;
    INSERT INTO public.service_packages (name, description, lines, created_by)
    VALUES (p_name, p_description, COALESCE(p_lines,'[]'::jsonb), auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'package_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_package_id IS NULL THEN RAISE EXCEPTION 'package_id is required'; END IF;
    UPDATE public.service_packages
       SET name = COALESCE(p_name, name),
           description = COALESCE(p_description, description),
           lines = COALESCE(p_lines, lines),
           active = COALESCE(p_active, active),
           updated_at = now()
     WHERE id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Package % not found', p_package_id; END IF;
    RETURN jsonb_build_object('success', true, 'package_id', p_package_id);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(sp) ORDER BY sp.name), '[]'::jsonb) INTO v_rows
    FROM public.service_packages sp
    WHERE (p_active IS NULL OR sp.active = p_active);
    RETURN jsonb_build_object('success', true, 'packages', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_package_id IS NULL THEN RAISE EXCEPTION 'package_id is required'; END IF;
    SELECT * INTO v_pkg FROM public.service_packages WHERE id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Package % not found', p_package_id; END IF;
    RETURN jsonb_build_object('success', true, 'package', to_jsonb(v_pkg));

  ELSIF p_action = 'delete' THEN
    IF p_package_id IS NULL THEN RAISE EXCEPTION 'package_id is required'; END IF;
    DELETE FROM public.service_packages WHERE id = p_package_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Package % not found', p_package_id; END IF;
    RETURN jsonb_build_object('success', true, 'deleted', p_package_id);

  ELSIF p_action = 'apply' THEN
    IF p_package_id IS NULL OR p_order_id IS NULL THEN
      RAISE EXCEPTION 'package_id and order_id are required for apply';
    END IF;
    SELECT * INTO v_pkg FROM public.service_packages WHERE id = p_package_id AND active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Active package % not found', p_package_id; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.service_orders WHERE id = p_order_id) THEN
      RAISE EXCEPTION 'Service order % not found', p_order_id;
    END IF;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_pkg.lines)
    LOOP
      INSERT INTO public.service_order_lines (service_order_id, kind, description, quantity, unit_price, product_id)
      VALUES (
        p_order_id,
        COALESCE(v_line->>'kind','labor'),
        COALESCE(v_line->>'description', v_pkg.name),
        COALESCE((v_line->>'quantity')::numeric, 1),
        COALESCE((v_line->>'unit_price')::numeric, 0),
        NULLIF(v_line->>'product_id','')::uuid
      );
      v_count := v_count + 1;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id,
      'package_id', p_package_id, 'lines_added', v_count,
      'order_total', (SELECT total_amount FROM public.service_orders WHERE id = p_order_id));

  ELSE
    RAISE EXCEPTION 'action must be create | update | list | get | delete | apply (got %)', p_action;
  END IF;
END;
$function$;

-- ── 8. Contract / project / deal linking ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_service_order(
  p_order_id uuid,
  p_contract_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_deal_id uuid DEFAULT NULL,
  p_unlink text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.service_orders%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can link service orders';
  END IF;
  SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;

  IF p_contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id) THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;
  IF p_project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'Project % not found', p_project_id;
  END IF;
  IF p_deal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.deals WHERE id = p_deal_id) THEN
    RAISE EXCEPTION 'Deal % not found', p_deal_id;
  END IF;

  UPDATE public.service_orders
     SET contract_id = CASE WHEN p_unlink = 'contract' THEN NULL ELSE COALESCE(p_contract_id, contract_id) END,
         project_id  = CASE WHEN p_unlink = 'project'  THEN NULL ELSE COALESCE(p_project_id, project_id) END,
         deal_id     = CASE WHEN p_unlink = 'deal'     THEN NULL ELSE COALESCE(p_deal_id, deal_id) END,
         updated_at = now()
   WHERE id = p_order_id;

  SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'order_id', p_order_id,
    'contract_id', v_order.contract_id, 'project_id', v_order.project_id, 'deal_id', v_order.deal_id);
END;
$function$;

-- ── 9. Recurring service orders ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_recurring_service_order(
  p_action text,
  p_order_id uuid DEFAULT NULL,
  p_rule text DEFAULT NULL,
  p_until date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_src RECORD;
  v_new_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_interval interval;
  v_next timestamptz;
  v_rows jsonb;
BEGIN
  -- generate may run from cron (no auth context); writes are only clones of
  -- already-configured recurrences. set/clear/list require staff.
  IF p_action <> 'generate'
     AND NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Only staff can manage recurring service orders';
  END IF;
  IF p_action = 'generate'
     AND NOT (auth.role() = 'service_role' OR auth.uid() IS NULL OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_action = 'set' THEN
    IF p_order_id IS NULL OR p_rule IS NULL THEN
      RAISE EXCEPTION 'order_id and rule are required (rule: weekly|biweekly|monthly|quarterly|yearly)';
    END IF;
    IF p_rule NOT IN ('weekly','biweekly','monthly','quarterly','yearly') THEN
      RAISE EXCEPTION 'rule must be weekly|biweekly|monthly|quarterly|yearly (got %)', p_rule;
    END IF;
    SELECT * INTO v_order FROM public.service_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;
    v_interval := CASE p_rule
      WHEN 'weekly' THEN interval '7 days'
      WHEN 'biweekly' THEN interval '14 days'
      WHEN 'monthly' THEN interval '1 month'
      WHEN 'quarterly' THEN interval '3 months'
      WHEN 'yearly' THEN interval '1 year' END;
    v_next := COALESCE(v_order.scheduled_start, now()) + v_interval;
    UPDATE public.service_orders
       SET recurrence_rule = p_rule, recurrence_until = p_until,
           next_occurrence_at = v_next, updated_at = now()
     WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id,
      'recurrence_rule', p_rule, 'recurrence_until', p_until, 'next_occurrence_at', v_next);

  ELSIF p_action = 'clear' THEN
    IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id is required'; END IF;
    UPDATE public.service_orders
       SET recurrence_rule = NULL, recurrence_until = NULL, next_occurrence_at = NULL, updated_at = now()
     WHERE id = p_order_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service order % not found', p_order_id; END IF;
    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'recurrence_rule', NULL);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'order_id', o.id, 'order_number', o.order_number, 'title', o.title,
        'recurrence_rule', o.recurrence_rule, 'recurrence_until', o.recurrence_until,
        'next_occurrence_at', o.next_occurrence_at
      ) ORDER BY o.next_occurrence_at), '[]'::jsonb) INTO v_rows
    FROM public.service_orders o WHERE o.recurrence_rule IS NOT NULL;
    RETURN jsonb_build_object('success', true, 'recurring_orders', v_rows);

  ELSIF p_action = 'generate' THEN
    FOR v_src IN
      SELECT * FROM public.service_orders
      WHERE recurrence_rule IS NOT NULL
        AND next_occurrence_at IS NOT NULL
        AND next_occurrence_at <= now()
        AND (recurrence_until IS NULL OR recurrence_until >= CURRENT_DATE)
        AND status <> 'cancelled'
      ORDER BY next_occurrence_at
      LIMIT 25
      FOR UPDATE SKIP LOCKED
    LOOP
      v_interval := CASE v_src.recurrence_rule
        WHEN 'weekly' THEN interval '7 days'
        WHEN 'biweekly' THEN interval '14 days'
        WHEN 'monthly' THEN interval '1 month'
        WHEN 'quarterly' THEN interval '3 months'
        WHEN 'yearly' THEN interval '1 year' END;
      INSERT INTO public.service_orders
        (title, description, customer_name, customer_email, customer_phone,
         service_address, priority, status, contract_id, project_id, deal_id,
         parent_order_id, notes, currency)
      VALUES
        (v_src.title, v_src.description, v_src.customer_name, v_src.customer_email, v_src.customer_phone,
         v_src.service_address, v_src.priority, 'draft', v_src.contract_id, v_src.project_id, v_src.deal_id,
         v_src.id, 'Auto-generated from recurring order ' || v_src.order_number, v_src.currency)
      RETURNING id INTO v_new_id;
      INSERT INTO public.service_order_lines (service_order_id, kind, description, quantity, unit_price, product_id)
      SELECT v_new_id, kind, description, quantity, unit_price, product_id
      FROM public.service_order_lines WHERE service_order_id = v_src.id;
      UPDATE public.service_orders
         SET next_occurrence_at = v_src.next_occurrence_at + v_interval, updated_at = now()
       WHERE id = v_src.id;
      v_created := v_created || jsonb_build_object('source_order_id', v_src.id, 'new_order_id', v_new_id);
    END LOOP;
    RETURN jsonb_build_object('success', true, 'generated', v_created,
      'count', jsonb_array_length(v_created));

  ELSE
    RAISE EXCEPTION 'action must be set | clear | list | generate (got %)', p_action;
  END IF;
END;
$function$;

-- ── 10. Daily cron: spawn due recurring orders ────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'service-recurring-orders') THEN
      PERFORM cron.schedule(
        'service-recurring-orders',
        '10 5 * * *',
        $cron$SELECT public.manage_recurring_service_order('generate');$cron$
      );
    END IF;
  END IF;
END $$;

-- Fresh-replay quiescence (2026-08-11): jobs must not fire into a half-built
-- schema. A from-scratch replay deadlocked (SQLSTATE 40P01) on the very first
-- GitHub-integration run. Every migration that schedules cron jobs at replay
-- time now ends by deactivating ALL jobs; the always-last finalizer
-- (99999999999999) activates everything once the schema is complete. Existing
-- instances never re-run this file (ledger), so they are unaffected.
DO $quiesce$
DECLARE r record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    -- cron.alter_job, not UPDATE: on fresh (PG17) projects the postgres role
    -- has no table UPDATE privilege on cron.job — the API function is the
    -- portable path. Verified live on ypkhjjkywgnqhuyiilcz 2026-08-11.
    FOR r IN SELECT jobid FROM cron.job LOOP
      PERFORM cron.alter_job(r.jobid, active => false);
    END LOOP;
  END IF;
END $quiesce$;
