-- Operationen säger vad som faktiskt kom ut.
--
-- Paritetsrunda 6, manufacturing (72 %). Två förmågor saknades, och de hör ihop:
-- en tillverkningsorder antog att allt som påbörjades blev en hel produkt.
--
--   1. KASSATION PER OPERATION. Det som kasseras vid en operation registreras på
--      arbetsordern (qty_scrapped + orsak) och räknas av från det som kan bli
--      färdigt. complete_mo producerar som standard ordern minus kassationen,
--      och vägrar producera mer än så. Materialet och arbetet som gick åt är
--      redan förbrukat — det stannar i kostnadspoolen, så styckkostnaden för de
--      återstående enheterna stiger. Det är vad som faktiskt hände; svaret
--      säger det rakt ut (scrapped_qty och unit_cost_includes_scrap).
--
--   2. KVALITETSKONTROLL. En routningsoperation kan kräva kontroll
--      (requires_inspection + inspection_name). Regeln bor på tabellen: en
--      arbetsorder vars operation kräver kontroll kan inte bli 'done' utan en
--      GODKÄND kontroll — vare sig via progress_work_order, via complete_mo:s
--      p_close_open_work_orders, via generisk CRUD eller som service-roll.
--      En underkänd kontroll står kvar som ett faktum; en ny, godkänd kontroll
--      på samma arbetsorder öppnar den (omarbetning), och historiken ligger kvar.
--
-- Flottan förkontrollerad läsande 2026-09-20: ankaret i complete_mo finns på alla
-- sju instanser. Kropparna är INTE identiska — nordbrygg har gårdagens
-- arbetsbokning (#556), de fem forkarna får den vid nattens synk — och det är
-- just därför patchen är ankrad i stället för att ersätta hela funktionen:
-- den lägger till sitt utan att rulla tillbaka någon annans.

ALTER TABLE public.mo_work_orders
  ADD COLUMN IF NOT EXISTS qty_scrapped numeric NOT NULL DEFAULT 0 CHECK (qty_scrapped >= 0),
  ADD COLUMN IF NOT EXISTS scrap_reason text;

ALTER TABLE public.routing_operations
  ADD COLUMN IF NOT EXISTS requires_inspection boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspection_name text;

CREATE TABLE IF NOT EXISTS public.mo_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.mo_work_orders(id) ON DELETE CASCADE,
  mo_id uuid NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  result text NOT NULL CHECK (result IN ('pass', 'fail')),
  measured_value text,
  note text,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mo_quality_checks_work_order ON public.mo_quality_checks (work_order_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS mo_quality_checks_mo ON public.mo_quality_checks (mo_id);

ALTER TABLE public.mo_quality_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manufacturing module manages quality checks" ON public.mo_quality_checks;
CREATE POLICY "Manufacturing module manages quality checks" ON public.mo_quality_checks
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'manufacturing'))
  WITH CHECK (can_access_module(auth.uid(), 'manufacturing'));
REVOKE ALL ON public.mo_quality_checks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mo_quality_checks TO authenticated, service_role;

-- En kontroll är ett faktum: den rättas med en ny kontroll, inte genom att skrivas om.
CREATE OR REPLACE FUNCTION public.quality_check_is_a_fact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.result IS DISTINCT FROM OLD.result
                           OR NEW.measured_value IS DISTINCT FROM OLD.measured_value
                           OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id) THEN
    RAISE EXCEPTION 'Quality check % is on record — record a new check on the work order instead of rewriting this one.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Quality check % is on record and is not deleted — a later check supersedes it.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS quality_check_is_a_fact ON public.mo_quality_checks;
CREATE TRIGGER quality_check_is_a_fact
  BEFORE UPDATE OR DELETE ON public.mo_quality_checks
  FOR EACH ROW EXECUTE FUNCTION public.quality_check_is_a_fact();

-- Senaste kontrollen per arbetsorder och kontrollnamn.
CREATE OR REPLACE FUNCTION public.work_order_inspection_state(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo record;
  v_required boolean := false;
  v_name text;
  v_last record;
BEGIN
  SELECT wo.id, wo.mo_id, wo.name, wo.routing_operation_id INTO v_wo
    FROM public.mo_work_orders wo WHERE wo.id = p_work_order_id;
  IF v_wo.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work order not found');
  END IF;
  SELECT COALESCE(ro.requires_inspection, false), COALESCE(NULLIF(btrim(ro.inspection_name), ''), 'Quality check')
    INTO v_required, v_name
    FROM public.routing_operations ro WHERE ro.id = v_wo.routing_operation_id;
  SELECT c.result, c.checked_at, c.measured_value, c.note INTO v_last
    FROM public.mo_quality_checks c WHERE c.work_order_id = p_work_order_id
   ORDER BY c.checked_at DESC, c.id DESC LIMIT 1;
  RETURN jsonb_build_object('success', true, 'work_order_id', p_work_order_id, 'work_order', v_wo.name,
    'requires_inspection', COALESCE(v_required, false), 'inspection_name', v_name,
    'last_result', v_last.result, 'last_checked_at', v_last.checked_at,
    'last_measured_value', v_last.measured_value, 'last_note', v_last.note,
    'passed', COALESCE(v_last.result = 'pass', false),
    'checks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'result', c.result,
                                 'measured_value', c.measured_value, 'note', c.note, 'checked_at', c.checked_at)
                               ORDER BY c.checked_at DESC)
                          FROM public.mo_quality_checks c WHERE c.work_order_id = p_work_order_id), '[]'::jsonb));
END;
$function$;

-- Regeln på tabellen: en arbetsorder som kräver kontroll blir inte klar utan en godkänd.
CREATE OR REPLACE FUNCTION public.work_order_done_needs_its_inspection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_required boolean;
  v_name text;
  v_last text;
BEGIN
  IF NEW.status <> 'done' OR OLD.status = 'done' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(ro.requires_inspection, false), COALESCE(NULLIF(btrim(ro.inspection_name), ''), 'Quality check')
    INTO v_required, v_name
    FROM public.routing_operations ro WHERE ro.id = NEW.routing_operation_id;
  IF NOT COALESCE(v_required, false) THEN
    RETURN NEW;
  END IF;
  SELECT c.result INTO v_last FROM public.mo_quality_checks c
   WHERE c.work_order_id = NEW.id ORDER BY c.checked_at DESC, c.id DESC LIMIT 1;
  IF v_last IS DISTINCT FROM 'pass' THEN
    RAISE EXCEPTION 'Work order "%" needs its quality check ("%") to pass before it is done — %. Record it with record_quality_check.',
      NEW.name, v_name,
      CASE WHEN v_last = 'fail' THEN 'the last check failed' ELSE 'no check has been recorded' END
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS work_order_done_needs_its_inspection ON public.mo_work_orders;
CREATE TRIGGER work_order_done_needs_its_inspection
  BEFORE UPDATE OF status ON public.mo_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.work_order_done_needs_its_inspection();

CREATE OR REPLACE FUNCTION public.record_quality_check(
  p_work_order_id uuid,
  p_result text,
  p_name text DEFAULT NULL,
  p_measured_value text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo record;
  v_name text;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_result NOT IN ('pass', 'fail') THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_result is "pass" or "fail".');
  END IF;
  SELECT wo.id, wo.mo_id, wo.name, wo.status, wo.routing_operation_id INTO v_wo
    FROM public.mo_work_orders wo WHERE wo.id = p_work_order_id FOR UPDATE;
  IF v_wo.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work order not found');
  END IF;
  IF v_wo.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'The work order is cancelled — there is nothing to inspect.');
  END IF;
  SELECT COALESCE(NULLIF(btrim(p_name), ''), NULLIF(btrim(ro.inspection_name), ''), 'Quality check') INTO v_name
    FROM public.routing_operations ro WHERE ro.id = v_wo.routing_operation_id;
  v_name := COALESCE(v_name, COALESCE(NULLIF(btrim(p_name), ''), 'Quality check'));

  INSERT INTO public.mo_quality_checks (work_order_id, mo_id, name, result, measured_value, note, checked_by)
  VALUES (p_work_order_id, v_wo.mo_id, v_name, p_result, p_measured_value, p_note, auth.uid())
  RETURNING id INTO v_id;

  -- En underkänd kontroll på en klar arbetsorder öppnar den för omarbetning.
  IF p_result = 'fail' AND v_wo.status = 'done' THEN
    UPDATE public.mo_work_orders SET status = 'in_progress', completed_at = NULL WHERE id = p_work_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'quality_check_id', v_id, 'work_order_id', p_work_order_id,
    'mo_id', v_wo.mo_id, 'name', v_name, 'result', p_result,
    'work_order_status', (SELECT status FROM public.mo_work_orders WHERE id = p_work_order_id),
    'note', CASE WHEN p_result = 'fail' AND v_wo.status = 'done'
                 THEN 'The work order was done — a failed check reopens it for rework.'
                 WHEN p_result = 'fail' THEN 'The work order cannot be finished until a check passes.' END);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Kassation per operation
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_operation_scrap(
  p_work_order_id uuid,
  p_qty numeric,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wo record;
  v_mo public.manufacturing_orders;
  v_scrapped numeric;
  v_other numeric;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_qty must be positive — it is what was scrapped at this operation.');
  END IF;
  SELECT wo.id, wo.mo_id, wo.name, wo.status, wo.qty_scrapped INTO v_wo
    FROM public.mo_work_orders wo WHERE wo.id = p_work_order_id FOR UPDATE;
  IF v_wo.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work order not found');
  END IF;
  SELECT * INTO v_mo FROM public.manufacturing_orders WHERE id = v_wo.mo_id FOR UPDATE;
  IF v_mo.status IN ('done', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('The manufacturing order is %s — scrap is recorded while it is being made.', v_mo.status));
  END IF;

  SELECT COALESCE(SUM(qty_scrapped), 0) INTO v_other FROM public.mo_work_orders
   WHERE mo_id = v_wo.mo_id AND id <> p_work_order_id;
  IF v_other + COALESCE(v_wo.qty_scrapped, 0) + p_qty > v_mo.quantity THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Scrapping %s would exceed the order: %s of %s already scrapped on this order.',
             p_qty, v_other + COALESCE(v_wo.qty_scrapped, 0), v_mo.quantity));
  END IF;

  UPDATE public.mo_work_orders
     SET qty_scrapped = COALESCE(qty_scrapped, 0) + p_qty,
         scrap_reason = COALESCE(NULLIF(btrim(p_reason), ''), scrap_reason)
   WHERE id = p_work_order_id
   RETURNING qty_scrapped INTO v_scrapped;

  RETURN jsonb_build_object('success', true, 'work_order_id', p_work_order_id, 'mo_id', v_wo.mo_id,
    'operation', v_wo.name, 'scrapped_at_operation', v_scrapped,
    'scrapped_on_order', v_other + v_scrapped,
    'good_quantity_left', v_mo.quantity - (v_other + v_scrapped),
    'note', 'The material and labour already spent stay in the cost pool, so the units that survive carry them: the unit cost rises. complete_mo produces the order quantity minus the scrap.');
END;
$function$;

CREATE OR REPLACE FUNCTION public.mo_scrapped_quantity(p_mo_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(qty_scrapped), 0)::numeric FROM public.mo_work_orders WHERE mo_id = p_mo_id;
$function$;

-- complete_mo: det som kom ut är ordern minus kassationen.
DO $patch$
DECLARE
  v_def text;
  v_anchor text := $a$  v_qty := COALESCE(p_actual_qty, v_mo.quantity);
  IF v_qty <= 0 THEN RAISE EXCEPTION 'actual quantity must be positive'; END IF;$a$;
BEGIN
  v_def := pg_get_functiondef('public.complete_mo(uuid, numeric, boolean)'::regprocedure);
  IF position('scrap-aware 20260920060000' in v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_anchor in v_def) = 0 THEN
    RAISE EXCEPTION 'anchor missing in complete_mo — read the live body before patching';
  END IF;
  v_def := replace(v_def, v_anchor,
    $r$  -- scrap-aware 20260920060000
  -- Kassation vid en operation är enheter som aldrig blir färdiga. Det som kom
  -- ut är ordern minus kassationen; mer än så finns inte att producera.
  v_scrapped := public.mo_scrapped_quantity(p_mo_id);
  v_qty := COALESCE(p_actual_qty, v_mo.quantity - v_scrapped);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Nothing left to produce on MO %: % of % scrapped at the operations', v_mo.mo_number, v_scrapped, v_mo.quantity
      USING ERRCODE = 'P0001';
  END IF;
  IF v_qty > v_mo.quantity - v_scrapped THEN
    RAISE EXCEPTION 'MO %: % were scrapped at the operations, so at most % can be produced (asked for %)', v_mo.mo_number, v_scrapped, v_mo.quantity - v_scrapped, v_qty
      USING ERRCODE = 'P0001';
  END IF;$r$);
  v_def := replace(v_def,
    $a$  v_tracked   boolean;$a$,
    $a$  v_tracked   boolean;
  v_scrapped  numeric := 0;$a$);
  v_def := replace(v_def,
    $a$  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed,$a$,
    $a$  RETURN jsonb_build_object('success', true, 'mo_id', p_mo_id, 'qty_produced', v_qty, 'components_consumed', v_consumed,
    'qty_scrapped', v_scrapped,
    'unit_cost_includes_scrap', v_scrapped > 0,$a$);
  EXECUTE v_def;
END
$patch$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.record_quality_check(uuid, text, text, text, text)',
    'public.work_order_inspection_state(uuid)',
    'public.work_order_done_needs_its_inspection()',
    'public.record_operation_scrap(uuid, numeric, text)',
    'public.mo_scrapped_quantity(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;

REVOKE ALL ON FUNCTION public.record_quality_check(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_quality_check(uuid, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_order_inspection_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_order_inspection_state(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_order_done_needs_its_inspection() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_order_done_needs_its_inspection() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.quality_check_is_a_fact() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quality_check_is_a_fact() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_operation_scrap(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_operation_scrap(uuid, numeric, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mo_scrapped_quantity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_scrapped_quantity(uuid) TO authenticated, service_role;

-- Routningsoperationen får bära kravet på kontroll. Samma signatur plus två
-- parametrar: en ny signatur bredvid den gamla skulle ge PGRST203 (tvetydig).
DROP FUNCTION IF EXISTS public.manage_routing_operation(text, uuid, uuid, integer, text, uuid, numeric);
CREATE OR REPLACE FUNCTION public.manage_routing_operation(
  p_action text,
  p_id uuid DEFAULT NULL,
  p_bom_id uuid DEFAULT NULL,
  p_sequence integer DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_work_center_id uuid DEFAULT NULL,
  p_duration_minutes numeric DEFAULT NULL,
  p_requires_inspection boolean DEFAULT NULL,
  p_inspection_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role()='service_role' OR can_access_module(auth.uid(),'manufacturing')); v_id uuid; v_res jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'sequence',o.sequence,'name',o.name,
      'work_center_id',o.work_center_id,'duration_minutes',o.duration_minutes,
      'requires_inspection',COALESCE(o.requires_inspection,false),'inspection_name',o.inspection_name) ORDER BY o.sequence),'[]'::jsonb)
    INTO v_res FROM routing_operations o WHERE o.bom_id = p_bom_id;
    RETURN jsonb_build_object('success',true,'operations',v_res);
  ELSIF p_action='create' THEN
    IF p_bom_id IS NULL OR p_name IS NULL OR p_work_center_id IS NULL THEN
      RAISE EXCEPTION 'bom_id, name and work_center_id required'; END IF;
    INSERT INTO routing_operations(bom_id,sequence,name,work_center_id,duration_minutes,requires_inspection,inspection_name)
      VALUES (p_bom_id,COALESCE(p_sequence,10),p_name,p_work_center_id,COALESCE(p_duration_minutes,0),
              COALESCE(p_requires_inspection,false),NULLIF(btrim(COALESCE(p_inspection_name,'')),'')) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'operation_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE routing_operations SET sequence=COALESCE(p_sequence,sequence), name=COALESCE(p_name,name),
      work_center_id=COALESCE(p_work_center_id,work_center_id), duration_minutes=COALESCE(p_duration_minutes,duration_minutes),
      requires_inspection=COALESCE(p_requires_inspection,requires_inspection),
      inspection_name=COALESCE(NULLIF(btrim(COALESCE(p_inspection_name,'')),''),inspection_name)
      WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operation % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'operation_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM routing_operations WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.manage_routing_operation(text, uuid, uuid, integer, text, uuid, numeric, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_routing_operation(text, uuid, uuid, integer, text, uuid, numeric, boolean, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_prod uuid; v_comp uuid; v_bom uuid; v_op uuid; v_mo uuid; v_wo uuid; v_r jsonb; v_loc uuid; v_unit bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_loc := public.default_internal_location();
  IF v_loc IS NULL THEN
    RAISE NOTICE 'proof skipped: no internal stock location on this instance.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.products (name, price_cents, cost_cents, track_inventory)
    VALUES ('Proof 060000 widget', 100000, 0, true) RETURNING id INTO v_prod;
    INSERT INTO public.products (name, price_cents, cost_cents, track_inventory)
    VALUES ('Proof 060000 part', 10000, 5000, true) RETURNING id INTO v_comp;
    PERFORM public.adjust_quant(v_comp, v_loc, 100, NULL, 'proof');

    INSERT INTO public.bom_headers (product_id, version, is_active, quantity_produced)
    VALUES (v_prod, 'proof', true, 1) RETURNING id INTO v_bom;
    INSERT INTO public.bom_lines (bom_id, component_product_id, quantity) VALUES (v_bom, v_comp, 1);
    INSERT INTO public.work_centers (code, name, cost_per_hour_cents, capacity_per_hour, is_active)
    VALUES ('PROOF-WC-060000', 'Proof line', 60000, 1, true);
    INSERT INTO public.routing_operations (bom_id, sequence, name, work_center_id, duration_minutes, requires_inspection, inspection_name)
    VALUES (v_bom, 10, 'Assembly', (SELECT id FROM public.work_centers WHERE code = 'PROOF-WC-060000'), 60, true, 'Torque test')
    RETURNING id INTO v_op;

    INSERT INTO public.manufacturing_orders (mo_number, product_id, bom_id, quantity, status)
    VALUES ('PROOF-MO-060000', v_prod, v_bom, 10, 'confirmed') RETURNING id INTO v_mo;
    INSERT INTO public.mo_components (mo_id, component_product_id, qty_required) VALUES (v_mo, v_comp, 10);
    INSERT INTO public.mo_work_orders (mo_id, routing_operation_id, sequence, name, work_center_id, status, planned_minutes, planned_labor_cost_cents)
    VALUES (v_mo, v_op, 10, 'Assembly', (SELECT id FROM public.work_centers WHERE code = 'PROOF-WC-060000'), 'pending', 60, 60000)
    RETURNING id INTO v_wo;
    PERFORM public.start_mo(v_mo);

    -- Kvalitetskontroll: utan godkänd kontroll blir arbetsordern inte klar.
    BEGIN
      UPDATE public.mo_work_orders SET status = 'done' WHERE id = v_wo;
      RAISE EXCEPTION 'proof failed: a work order that requires inspection was finished without one';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;
    PERFORM public.record_quality_check(v_wo, 'fail', NULL, '82 Nm', 'below spec');
    BEGIN
      UPDATE public.mo_work_orders SET status = 'done' WHERE id = v_wo;
      RAISE EXCEPTION 'proof failed: a failed check let the work order finish';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;

    -- Kassation: två av tio blev aldrig hela.
    v_r := public.record_operation_scrap(v_wo, 2, 'cracked housing');
    IF (v_r->>'good_quantity_left')::numeric <> 8 THEN
      RAISE EXCEPTION 'proof failed: eight should be left → %', v_r;
    END IF;
    v_r := public.record_operation_scrap(v_wo, 9, 'too many');
    IF (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'proof failed: more was scrapped than the order holds';
    END IF;

    PERFORM public.record_quality_check(v_wo, 'pass', NULL, '95 Nm', 'reworked');
    UPDATE public.mo_work_orders SET status = 'done' WHERE id = v_wo;

    v_r := public.complete_mo(v_mo);
    IF (v_r->>'qty_produced')::numeric <> 8 OR (v_r->>'qty_scrapped')::numeric <> 2 THEN
      RAISE EXCEPTION 'proof failed: eight good of ten, two scrapped → %', v_r;
    END IF;
    IF NOT (v_r->>'unit_cost_includes_scrap')::boolean THEN
      RAISE EXCEPTION 'proof failed: the answer hides that scrap is carried by the survivors';
    END IF;
    -- Tio delar förbrukades, åtta enheter bär kostnaden: styckkostnaden är högre än en del.
    v_unit := (v_r->>'unit_cost_cents')::bigint;
    IF v_unit <= (v_r->>'material_cost_cents')::bigint / 10 THEN
      RAISE EXCEPTION 'proof failed: the unit cost should carry the scrapped units → %', v_r;
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: no done without a passing check, a failed check holds the operation, scrap is capped by the order, and what comes out is the order minus the scrap with its cost on the survivors.';
END
$proof$;
