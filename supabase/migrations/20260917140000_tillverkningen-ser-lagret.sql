-- Tillverkningen ser lagret.
--
-- Processtestet 2026-09-17 körde plan-to-produce från BOM till färdig vara:
--
--   check_mo_availability, confirm_mo, complete_mo och trigger_procurement_for_mo
--   läste och skrev product_stock — en tabell som varumottagningen sedan
--   augusti kallar "tom på varje instans" och som inget annat använder. 100
--   skruvar på hyllan (stock_quants) var "0 på hand" för MO:n; en färdig
--   tillverkningsorder rörde varken quants eller produktspegeln, och de två
--   färdiga skåpen hamnade i product_stock där ingen läser dem. Värderingen
--   av den färdiga varan: 0 kr — komponenter för 2 820 och arbete för 750 kr
--   försvann.
--
--   trigger_procurement_for_mo kraschade alltid: "column pol.po_id does not
--   exist" (kolumnen heter purchase_order_id) och purchase_orders saknade
--   source_type/source_id som funktionen och skillens instruktioner lovade.
--
--   complete_mo kontrollerade ingenting: klar med öppna arbetsordrar och
--   komponenter markerade short. generate_mo_work_orders raderade en färdig
--   MO:s registrerade tider. cancel_mo lämnade reservationer och arbetsordrar
--   kvar; progress_work_order bokade arbete på en avbruten MO.
--
-- Fix: EN lagermodell. Tillgänglighet räknas ur stock_quants (spegeln på
-- produkten när ingen quant-rad finns — samma regel som stock_virtual_available),
-- minus andras reservationer. confirm reserverar. complete kräver stängda
-- arbetsordrar och täckta komponenter, förbrukar via FEFO ur WH/MAIN till
-- WH/PRODUCTION (mo_consumption-moves som värderingstriggern prissätter ur
-- lagren), och producerar till WH/MAIN med styckkostnad = material + arbete
-- (mo_production-move som skapar värderingslagret). cancel släpper. Inköp får
-- source_type/source_id.
--
-- Idempotent: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, bevis som rullas tillbaka.

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS source_id uuid;
COMMENT ON COLUMN public.purchase_orders.source_type IS 'What raised the order: manufacturing (source_id = manufacturing_orders.id), reorder, manual';

-- ── Free stock for an MO's component: physical on hand, minus what OTHERS hold ──
CREATE OR REPLACE FUNCTION public.mo_component_free(p_product_id uuid, p_mo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  WITH q AS (
    SELECT COUNT(*) AS rows_, COALESCE(SUM(quantity), 0) AS qty, COALESCE(SUM(reserved_quantity), 0) AS res
      FROM public.stock_quants WHERE product_id = p_product_id
  ), mine AS (
    SELECT COALESCE(SUM(quantity), 0) AS qty FROM public.stock_reservations
     WHERE product_id = p_product_id AND state = 'reserved'
       AND reference_type = 'manufacturing_order' AND reference_id = p_mo_id::text
  )
  SELECT CASE WHEN q.rows_ > 0 THEN q.qty
              ELSE COALESCE((SELECT p.stock_quantity::numeric FROM public.products p WHERE p.id = p_product_id), 0) END
         - q.res + mine.qty
  FROM q, mine;
$fn$;

-- ── Availability ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_mo_availability(p_mo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shortages jsonb := '[]'::jsonb;
  v_overall   text := 'ok';
  v_n int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_n FROM public.mo_components WHERE mo_id = p_mo_id;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('mo_id', p_mo_id, 'overall', 'no_components', 'shortages', '[]'::jsonb,
      'note', 'The MO has no component snapshot yet — confirm_manufacturing_order copies the BOM and checks availability.');
  END IF;

  WITH updated AS (
    UPDATE public.mo_components mc
       SET availability = CASE WHEN COALESCE(p.track_inventory, false) = false THEN 'ok'
                               WHEN s.free >= mc.qty_required THEN 'ok'
                               ELSE 'short' END
      FROM (SELECT mc2.id, public.mo_component_free(mc2.component_product_id, p_mo_id) AS free
              FROM public.mo_components mc2 WHERE mc2.mo_id = p_mo_id) s
      LEFT JOIN public.products p ON p.id = (SELECT component_product_id FROM public.mo_components WHERE id = s.id)
     WHERE mc.id = s.id
     RETURNING mc.component_product_id, mc.qty_required, mc.availability, s.free AS on_hand
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'component_product_id', component_product_id,
           'qty_required', qty_required,
           'qty_on_hand', on_hand,
           'qty_short', GREATEST(qty_required - on_hand, 0))), '[]'::jsonb)
    INTO v_shortages
    FROM updated WHERE availability = 'short';

  IF jsonb_array_length(v_shortages) > 0 THEN v_overall := 'short'; END IF;
  IF v_overall = 'short' THEN
    BEGIN
      PERFORM public.emit_platform_event('mo.shortage_detected',
        jsonb_build_object('mo_id', p_mo_id, 'components', v_shortages), 'manufacturing');
    EXCEPTION WHEN undefined_function THEN NULL; END;
  END IF;
  RETURN jsonb_build_object('mo_id', p_mo_id, 'overall', v_overall, 'shortages', v_shortages);
END;
$function$;

-- ── Reservations for an MO: take, release ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mo_release_reservations(p_mo_id uuid, p_final_state text)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.stock_reservations
     WHERE reference_type = 'manufacturing_order' AND reference_id = p_mo_id::text AND state = 'reserved'
     FOR UPDATE
  LOOP
    UPDATE public.stock_quants SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - r.quantity, 0), updated_at = now()
     WHERE product_id = r.product_id AND location_id = r.location_id AND (lot_id IS NOT DISTINCT FROM r.lot_id);
    UPDATE public.stock_reservations
       SET state = p_final_state,
           consumed_at = CASE WHEN p_final_state = 'consumed' THEN now() ELSE consumed_at END,
           cancelled_at = CASE WHEN p_final_state = 'cancelled' THEN now() ELSE cancelled_at END
     WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $fn$;

CREATE OR REPLACE FUNCTION public.confirm_mo(p_mo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mo         public.manufacturing_orders%ROWTYPE;
  v_bom_id     uuid;
  v_bom_qty    numeric;
  v_factor     numeric;
  v_shortages  jsonb := '[]'::jsonb;
  v_loc        uuid;
  v_c          record;
  v_reserved   int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;

  IF v_mo.status NOT IN ('draft', 'planned') THEN
    PERFORM public.check_mo_availability(p_mo_id);
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', v_mo.status, 'note', 'already confirmed');
  END IF;

  v_bom_id := v_mo.bom_id;
  IF v_bom_id IS NULL THEN
    SELECT id, quantity_produced INTO v_bom_id, v_bom_qty
      FROM public.bom_headers WHERE product_id = v_mo.product_id AND is_active = true LIMIT 1;
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

  -- Confirming commits the components: reserve what is available, in the
  -- warehouse the goods will leave from. A component that cannot be reserved
  -- there simply stays unreserved — availability already says short.
  v_loc := public.default_internal_location();
  IF v_loc IS NOT NULL THEN
    FOR v_c IN
      SELECT mc.component_product_id, mc.qty_required
        FROM public.mo_components mc JOIN public.products p ON p.id = mc.component_product_id
       WHERE mc.mo_id = p_mo_id AND mc.availability = 'ok' AND p.track_inventory = true
         AND NOT EXISTS (SELECT 1 FROM public.stock_reservations r
                          WHERE r.product_id = mc.component_product_id AND r.state = 'reserved'
                            AND r.reference_type = 'manufacturing_order' AND r.reference_id = p_mo_id::text)
    LOOP
      BEGIN
        PERFORM public.reserve_stock(v_c.component_product_id, v_loc, v_c.qty_required, 'manufacturing_order', p_mo_id::text, NULL, 'MO ' || v_mo.mo_number);
        v_reserved := v_reserved + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'confirm_mo: could not reserve % for MO % (%)', v_c.component_product_id, v_mo.mo_number, SQLERRM;
      END;
    END LOOP;
  END IF;

  BEGIN
    PERFORM public.emit_platform_event('mo.confirmed', jsonb_build_object('mo_id', p_mo_id, 'shortages', v_shortages), 'manufacturing');
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'bom_id', v_bom_id,
    'shortages', v_shortages, 'components_reserved', v_reserved);
END;
$function$;

-- ── Complete: consume from stock, produce into stock, at cost ────────────────
DROP FUNCTION IF EXISTS public.complete_mo(uuid, numeric);
CREATE OR REPLACE FUNCTION public.complete_mo(p_mo_id uuid, p_actual_qty numeric DEFAULT NULL::numeric, p_close_open_work_orders boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mo        public.manufacturing_orders%ROWTYPE;
  v_qty       numeric;
  v_consumed  int := 0;
  v_comp      record;
  v_from      uuid;
  v_to        uuid;
  v_avail     jsonb;
  v_open      int;
  v_fefo      jsonb;
  v_alloc     jsonb;
  v_rest      numeric;
  v_move      uuid;
  v_material  bigint := 0;
  v_labor     bigint := 0;
  v_unit_cost bigint;
  v_prod_move uuid;
  v_tracked   boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.status = 'done' THEN
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already done');
  END IF;
  IF v_mo.status <> 'in_progress' THEN
    RAISE EXCEPTION 'MO must be in_progress to complete (current: %)', v_mo.status;
  END IF;

  v_qty := COALESCE(p_actual_qty, v_mo.quantity);
  IF v_qty <= 0 THEN RAISE EXCEPTION 'actual quantity must be positive'; END IF;

  -- Work orders: the labor on the finished good comes from them.
  SELECT count(*) INTO v_open FROM public.mo_work_orders WHERE mo_id = p_mo_id AND status NOT IN ('done', 'cancelled');
  IF v_open > 0 THEN
    IF NOT p_close_open_work_orders THEN
      RAISE EXCEPTION '% work order(s) still open on MO % — finish them with progress_work_order (action=done) or pass p_close_open_work_orders=true to close them at planned time', v_open, v_mo.mo_number;
    END IF;
    UPDATE public.mo_work_orders
       SET status = 'done', started_at = COALESCE(started_at, now()), completed_at = now(),
           actual_minutes = COALESCE(actual_minutes, planned_minutes),
           actual_labor_cost_cents = COALESCE(actual_labor_cost_cents, planned_labor_cost_cents)
     WHERE mo_id = p_mo_id AND status NOT IN ('done', 'cancelled');
  END IF;

  -- Components must be there, in stock terms, now.
  v_avail := public.check_mo_availability(p_mo_id);
  IF v_avail->>'overall' = 'short' THEN
    RAISE EXCEPTION 'Components short for MO %: % — receive goods or reduce the quantity before completing', v_mo.mo_number, v_avail->'shortages';
  END IF;

  v_from := public.default_internal_location();
  SELECT id INTO v_to FROM public.stock_locations WHERE code = 'WH/PRODUCTION' AND is_active = true LIMIT 1;
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'No active internal stock location — run SELECT public.seed_stock_locations()';
  END IF;

  -- Reservations turn into consumption.
  PERFORM public.mo_release_reservations(p_mo_id, 'consumed');

  FOR v_comp IN
    SELECT mc.component_product_id, mc.qty_required, p.track_inventory
      FROM public.mo_components mc JOIN public.products p ON p.id = mc.component_product_id
     WHERE mc.mo_id = p_mo_id
  LOOP
    IF COALESCE(v_comp.track_inventory, false) THEN
      -- FEFO out of the warehouse; each allocation is its own move so the lot
      -- is on record, and the valuation trigger prices every move from the layers.
      v_fefo := public.consume_stock_fefo(v_comp.component_product_id, v_from, v_comp.qty_required, NULL);
      UPDATE public.products SET stock_quantity = COALESCE(stock_quantity, 0) - ROUND(v_comp.qty_required)::int, updated_at = now()
       WHERE id = v_comp.component_product_id;
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(v_fefo->'allocated', '[]'::jsonb)) LOOP
        INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, from_location_id, to_location_id, lot_id, state, created_by, notes)
        VALUES (v_comp.component_product_id, -ROUND((v_alloc->>'qty')::numeric)::int, 'mo_consumption', 'manufacturing_order', p_mo_id::text, p_mo_id,
                v_from, v_to, (v_alloc->>'lot_id')::uuid, 'done', auth.uid(), 'Consumed for MO ' || v_mo.mo_number || ' — lot ' || COALESCE(v_alloc->>'lot_number', '?'))
        RETURNING id INTO v_move;
        v_material := v_material + COALESCE((SELECT value_cents FROM public.stock_moves WHERE id = v_move), 0);
      END LOOP;
      v_rest := COALESCE((v_fefo->>'unattributed')::numeric, 0);
      IF v_rest > 0 THEN
        INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, from_location_id, to_location_id, state, created_by, notes)
        VALUES (v_comp.component_product_id, -ROUND(v_rest)::int, 'mo_consumption', 'manufacturing_order', p_mo_id::text, p_mo_id,
                v_from, v_to, 'done', auth.uid(), 'Consumed for MO ' || v_mo.mo_number)
        RETURNING id INTO v_move;
        v_material := v_material + COALESCE((SELECT value_cents FROM public.stock_moves WHERE id = v_move), 0);
      END IF;
    END IF;
    UPDATE public.mo_components SET qty_consumed = v_comp.qty_required
     WHERE mo_id = p_mo_id AND component_product_id = v_comp.component_product_id;
    v_consumed := v_consumed + 1;
  END LOOP;

  SELECT COALESCE(SUM(actual_labor_cost_cents), 0) INTO v_labor FROM public.mo_work_orders WHERE mo_id = p_mo_id AND status = 'done';
  v_unit_cost := ROUND((v_material + v_labor) / v_qty)::bigint;

  -- The finished good enters the warehouse at what it cost to make.
  SELECT track_inventory INTO v_tracked FROM public.products WHERE id = v_mo.product_id;
  IF COALESCE(v_tracked, false) THEN
    INSERT INTO public.stock_moves (product_id, quantity, move_type, reference_type, reference_id, mo_id, from_location_id, to_location_id, state, created_by, notes, unit_cost_cents)
    VALUES (v_mo.product_id, ROUND(v_qty)::int, 'mo_production', 'manufacturing_order', p_mo_id::text, p_mo_id,
            v_to, v_from, 'done', auth.uid(), 'Produced by MO ' || v_mo.mo_number, v_unit_cost)
    RETURNING id INTO v_prod_move;
    PERFORM public.upsert_stock_quant(v_mo.product_id, v_from, v_qty, NULL);
    UPDATE public.products SET stock_quantity = COALESCE(stock_quantity, 0) + ROUND(v_qty)::int, updated_at = now() WHERE id = v_mo.product_id;
  END IF;

  UPDATE public.manufacturing_orders SET status = 'done', completed_at = now(), updated_at = now() WHERE id = p_mo_id;

  BEGIN
    PERFORM public.emit_platform_event('mo.completed',
      jsonb_build_object('mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed,
                         'material_cost_cents', v_material, 'labor_cost_cents', v_labor, 'unit_cost_cents', v_unit_cost),
      'manufacturing');
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed,
    'material_cost_cents', v_material, 'labor_cost_cents', v_labor, 'unit_cost_cents', v_unit_cost,
    'production_move_id', v_prod_move);
END;
$function$;

-- ── Cancel releases what confirm took ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_mo(p_mo_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status public.mo_status;
  v_released int;
  v_wos int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM public.manufacturing_orders WHERE id = p_mo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_status IN ('done', 'cancelled') THEN
    RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'note', 'already terminal: ' || v_status);
  END IF;

  v_released := public.mo_release_reservations(p_mo_id, 'cancelled');
  UPDATE public.mo_work_orders SET status = 'cancelled' WHERE mo_id = p_mo_id AND status NOT IN ('done', 'cancelled');
  GET DIAGNOSTICS v_wos = ROW_COUNT;

  UPDATE public.manufacturing_orders
     SET status = 'cancelled', cancelled_at = now(),
         notes = COALESCE(notes, '') || E'\n[cancelled] ' || COALESCE(p_reason, 'no reason'),
         updated_at = now()
   WHERE id = p_mo_id;

  BEGIN
    PERFORM public.emit_platform_event('mo.cancelled', jsonb_build_object('mo_id', p_mo_id, 'reason', p_reason), 'manufacturing');
  EXCEPTION WHEN undefined_function THEN NULL; END;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'status', 'cancelled',
    'reservations_released', v_released, 'work_orders_cancelled', v_wos);
END;
$function$;

-- ── Work orders: no regeneration over actuals, no work on a closed MO ────────
CREATE OR REPLACE FUNCTION public.generate_mo_work_orders(p_mo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role()='service_role' OR can_access_module(auth.uid(),'manufacturing'));
  v_mo RECORD; v_created int := 0; v_total_cost int := 0; v_total_min numeric := 0; v_touched int;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions'; END IF;
  SELECT id, bom_id, quantity, status, mo_number INTO v_mo FROM manufacturing_orders WHERE id = p_mo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'MO % is % — its work orders are the record of what was done and are not regenerated', v_mo.mo_number, v_mo.status;
  END IF;
  IF v_mo.bom_id IS NULL THEN RAISE EXCEPTION 'MO % has no BOM to route from', p_mo_id; END IF;
  SELECT count(*) INTO v_touched FROM mo_work_orders WHERE mo_id = p_mo_id AND (status <> 'pending' OR started_at IS NOT NULL OR COALESCE(actual_minutes, 0) > 0);
  IF v_touched > 0 THEN
    RAISE EXCEPTION 'MO % has % work order(s) with recorded work — regeneration would erase actual minutes and cost', v_mo.mo_number, v_touched;
  END IF;
  DELETE FROM mo_work_orders WHERE mo_id = p_mo_id;
  INSERT INTO mo_work_orders (mo_id, routing_operation_id, sequence, name, work_center_id, planned_minutes, planned_labor_cost_cents)
  SELECT p_mo_id, o.id, o.sequence, o.name, o.work_center_id,
         o.duration_minutes * v_mo.quantity,
         ROUND(o.duration_minutes * v_mo.quantity / 60.0 * wc.cost_per_hour_cents)::int
  FROM routing_operations o JOIN work_centers wc ON wc.id = o.work_center_id
  WHERE o.bom_id = v_mo.bom_id;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  SELECT COALESCE(SUM(planned_labor_cost_cents),0), COALESCE(SUM(planned_minutes),0)
    INTO v_total_cost, v_total_min FROM mo_work_orders WHERE mo_id = p_mo_id;
  RETURN jsonb_build_object('success',true,'work_orders_created',v_created,
    'total_planned_minutes',v_total_min,'total_planned_labor_cost_cents',v_total_cost);
END; $function$;

CREATE OR REPLACE FUNCTION public.progress_work_order(p_work_order_id uuid, p_action text, p_actual_minutes numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'manufacturing'));
  v_wo RECORD;
  v_mo_status public.mo_status;
  v_rate int := 0;
  v_minutes numeric;
  v_cost int;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions'; END IF;

  SELECT * INTO v_wo FROM mo_work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order % not found', p_work_order_id; END IF;
  SELECT status INTO v_mo_status FROM manufacturing_orders WHERE id = v_wo.mo_id;
  IF p_action IN ('start', 'done', 'pause') AND v_mo_status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'The manufacturing order is % — no more work can be booked on it', v_mo_status;
  END IF;

  SELECT COALESCE(wc.cost_per_hour_cents, 0) INTO v_rate FROM work_centers wc WHERE wc.id = v_wo.work_center_id;
  v_rate := COALESCE(v_rate, 0);

  IF p_action = 'start' THEN
    IF v_wo.status = 'done' THEN RAISE EXCEPTION 'Work order already done'; END IF;
    UPDATE mo_work_orders SET status = 'in_progress', started_at = COALESCE(started_at, now()) WHERE id = p_work_order_id;
  ELSIF p_action = 'pause' THEN
    IF v_wo.status <> 'in_progress' THEN RAISE EXCEPTION 'Only an in-progress work order can be paused'; END IF;
    v_minutes := COALESCE(p_actual_minutes,
      COALESCE(v_wo.actual_minutes, 0) + EXTRACT(EPOCH FROM (now() - COALESCE(v_wo.started_at, now()))) / 60.0);
    UPDATE mo_work_orders SET status = 'pending', actual_minutes = ROUND(v_minutes, 2), actual_labor_cost_cents = ROUND(v_minutes / 60.0 * v_rate)::int
     WHERE id = p_work_order_id;
  ELSIF p_action = 'done' THEN
    v_minutes := COALESCE(p_actual_minutes, v_wo.actual_minutes,
      CASE WHEN v_wo.started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (now() - v_wo.started_at)) / 60.0 ELSE v_wo.planned_minutes END);
    v_cost := ROUND(v_minutes / 60.0 * v_rate)::int;
    UPDATE mo_work_orders SET status = 'done', started_at = COALESCE(started_at, now()), completed_at = now(),
           actual_minutes = ROUND(v_minutes, 2), actual_labor_cost_cents = v_cost
     WHERE id = p_work_order_id;
  ELSIF p_action = 'cancel' THEN
    UPDATE mo_work_orders SET status = 'cancelled' WHERE id = p_work_order_id;
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use start|pause|done|cancel', p_action;
  END IF;

  SELECT * INTO v_wo FROM mo_work_orders WHERE id = p_work_order_id;
  RETURN jsonb_build_object(
    'success', true, 'work_order_id', p_work_order_id, 'mo_id', v_wo.mo_id, 'status', v_wo.status,
    'actual_minutes', v_wo.actual_minutes, 'actual_labor_cost_cents', v_wo.actual_labor_cost_cents,
    -- No actuals yet: no variance, not "minus the plan".
    'variance_minutes', CASE WHEN v_wo.actual_minutes IS NULL THEN NULL ELSE v_wo.actual_minutes - v_wo.planned_minutes END,
    'mo_open_work_orders', (SELECT COUNT(*) FROM mo_work_orders WHERE mo_id = v_wo.mo_id AND status NOT IN ('done', 'cancelled')));
END; $function$;

-- ── Procurement for shortages ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_procurement_for_mo(p_mo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_short  record;
  v_reqs   jsonb := '[]'::jsonb;
  v_skipped int := 0;
  v_existing uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;

  PERFORM public.check_mo_availability(p_mo_id);

  FOR v_short IN
    SELECT mc.component_product_id, mc.qty_required,
           public.mo_component_free(mc.component_product_id, p_mo_id) AS on_hand
      FROM public.mo_components mc
     WHERE mc.mo_id = p_mo_id AND mc.availability IN ('short', 'awaiting_po')
  LOOP
    -- An open PO raised for this MO and component already covers it.
    SELECT po.id INTO v_existing
      FROM public.purchase_orders po
      JOIN public.purchase_order_lines pol ON pol.purchase_order_id = po.id
     WHERE po.source_type = 'manufacturing' AND po.source_id = p_mo_id
       AND pol.product_id = v_short.component_product_id
       AND po.status::text IN ('draft', 'sent', 'confirmed', 'partially_received')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      UPDATE public.mo_components SET availability = 'awaiting_po' WHERE mo_id = p_mo_id AND component_product_id = v_short.component_product_id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.mo_components SET availability = 'awaiting_po' WHERE mo_id = p_mo_id AND component_product_id = v_short.component_product_id;
    v_reqs := v_reqs || jsonb_build_object(
      'component_product_id', v_short.component_product_id,
      'qty_short', GREATEST(v_short.qty_required - v_short.on_hand, 0),
      'note', 'Raise it with create_purchase_order (vendor_id, lines[{product_id, quantity, unit_price_cents}], source_type="manufacturing", source_id="' || p_mo_id::text || '")');
  END LOOP;

  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'requests', v_reqs, 'skipped_existing', v_skipped);
END;
$function$;

-- ── Bevisar sig själv (rullas alltid tillbaka) ──────────────────────────────
DO $proof$
DECLARE
  v_comp uuid; v_fin uuid; v_bom uuid; v_mo uuid; v_mo2 uuid; v_r jsonb; v_loc uuid;
  v_q numeric; v_layer record; v_res int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_loc := public.default_internal_location();
  IF v_loc IS NULL THEN
    RAISE NOTICE 'tillverkningen-ser-lagret: no internal stock location on this instance — proof skipped';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.products (name, price_cents, cost_cents, stock_quantity, track_inventory, is_active) VALUES ('proof-screw', 100, 500, 0, true, true) RETURNING id INTO v_comp;
    INSERT INTO public.products (name, price_cents, stock_quantity, track_inventory, is_active) VALUES ('proof-cabinet', 90000, 0, true, true) RETURNING id INTO v_fin;
    -- 10 screws arrive at 5 kr each (a valued 'in' move + quant + mirror)
    PERFORM public.apply_stock_movement_event(jsonb_build_object('product_id', v_comp, 'quantity', 10, 'reason', 'proof receipt'));
    INSERT INTO public.bom_headers (product_id, version, is_active, quantity_produced) VALUES (v_fin, 'v1', true, 1) RETURNING id INTO v_bom;
    INSERT INTO public.bom_lines (bom_id, component_product_id, quantity, scrap_pct) VALUES (v_bom, v_comp, 4, 0);
    INSERT INTO public.manufacturing_orders (product_id, bom_id, quantity, status) VALUES (v_fin, v_bom, 2, 'draft') RETURNING id INTO v_mo;

    v_r := public.confirm_mo(v_mo);
    IF jsonb_array_length(v_r->'shortages') <> 0 THEN RAISE EXCEPTION 'proof: 10 screws on hand read as short: %', v_r; END IF;
    IF (v_r->>'components_reserved')::int <> 1 THEN RAISE EXCEPTION 'proof: confirm did not reserve: %', v_r; END IF;
    SELECT reserved_quantity INTO v_q FROM public.stock_quants WHERE product_id = v_comp AND location_id = v_loc AND lot_id IS NULL;
    IF v_q <> 8 THEN RAISE EXCEPTION 'proof: expected 8 reserved, got %', v_q; END IF;

    -- a second MO cannot see the reserved 8: only 2 free
    INSERT INTO public.manufacturing_orders (product_id, bom_id, quantity, status) VALUES (v_fin, v_bom, 1, 'draft') RETURNING id INTO v_mo2;
    v_r := public.confirm_mo(v_mo2);
    IF jsonb_array_length(v_r->'shortages') <> 1 THEN RAISE EXCEPTION 'proof: second MO should be short (2 free, 4 needed): %', v_r; END IF;
    v_r := public.cancel_mo(v_mo2, 'proof');
    IF (v_r->>'reservations_released')::int <> 0 THEN RAISE EXCEPTION 'proof: a short MO had nothing to release: %', v_r; END IF;

    PERFORM public.start_mo(v_mo);
    v_r := public.complete_mo(v_mo, NULL, false);
    IF (v_r->>'components_consumed')::int <> 1 THEN RAISE EXCEPTION 'proof: complete did not consume: %', v_r; END IF;
    SELECT quantity, reserved_quantity INTO v_q, v_res FROM public.stock_quants WHERE product_id = v_comp AND location_id = v_loc AND lot_id IS NULL;
    IF v_q <> 2 OR v_res <> 0 THEN RAISE EXCEPTION 'proof: screws should be 2 on hand / 0 reserved, got % / %', v_q, v_res; END IF;
    IF (SELECT stock_quantity FROM public.products WHERE id = v_comp) <> 2 THEN RAISE EXCEPTION 'proof: component mirror not updated'; END IF;
    SELECT quantity INTO v_q FROM public.stock_quants WHERE product_id = v_fin AND location_id = v_loc AND lot_id IS NULL;
    IF v_q <> 2 THEN RAISE EXCEPTION 'proof: cabinets should be 2 in stock, got %', v_q; END IF;
    IF (SELECT stock_quantity FROM public.products WHERE id = v_fin) <> 2 THEN RAISE EXCEPTION 'proof: finished mirror not updated'; END IF;
    SELECT * INTO v_layer FROM public.stock_valuation_layers WHERE product_id = v_fin ORDER BY created_at DESC LIMIT 1;
    -- 8 screws × 500 = 4 000 material, no labor → 2 000 per cabinet
    IF v_layer.unit_cost_cents <> 2000 OR v_layer.value_cents <> 4000 THEN
      RAISE EXCEPTION 'proof: finished good should be valued 2 × 2000 = 4000, got % × %', v_layer.quantity, v_layer.unit_cost_cents;
    END IF;
    IF (SELECT count(*) FROM public.product_stock WHERE product_id IN (v_comp, v_fin)) > 0 THEN
      RAISE EXCEPTION 'proof: product_stock was written';
    END IF;
    BEGIN
      PERFORM public.generate_mo_work_orders(v_mo);
      RAISE EXCEPTION 'proof: work orders regenerated on a done MO';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%not regenerated%' THEN RAISE; END IF;
    END;
    -- procurement on a short MO no longer crashes
    INSERT INTO public.manufacturing_orders (product_id, bom_id, quantity, status) VALUES (v_fin, v_bom, 5, 'draft') RETURNING id INTO v_mo2;
    PERFORM public.confirm_mo(v_mo2);
    v_r := public.trigger_procurement_for_mo(v_mo2);
    IF jsonb_array_length(v_r->'requests') <> 1 OR (v_r->'requests'->0->>'qty_short')::numeric <> 18 THEN
      RAISE EXCEPTION 'proof: expected one request for 18 screws, got %', v_r;
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $proof$;
