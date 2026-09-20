-- Maskinen som är nere tar inget arbete.
--
-- Paritetsrunda 7, maintenance (65 %). Odoos idé är att utrustningen hänger på
-- ett ARBETSSTÄLLE: en maskin som är nere stoppar arbetet den matar. Den idén
-- gick inte att låna förrän i går, när arbetsordrar och arbetsställen blev
-- riktiga (#563) — kortet sa själv "depends on community work-centers track".
--
--   1. equipment.work_center_id. En arbetsorder kan inte STARTAS på ett
--      arbetsställe vars utrustning är nere. Regeln bor på tabellen, så den
--      gäller progress_work_order, generisk CRUD och service-rollen lika.
--      Vägran namnger maskinen och det öppna ärendet.
--
--   2. Ärendet säger själv om det stoppar maskinen (blocks_equipment) i stället
--      för att prioriteten 'critical' gör det som bieffekt. Förvalet bevarar
--      dagens beteende (critical stoppar), men nu som ett uttalat faktum. EN
--      skrivare av utrustningens status: sync_equipment_status, anropad av en
--      trigger — så statusen följer ärendena oavsett vem som skriver dem.
--
--   3. MTBF/MTTR ur de tider som redan finns. Med färre än två haverier finns
--      inget medelvärde: funktionen svarar då 'insufficient data' i stället för
--      att trycka fram en siffra ur ett enda fel.
--
--   4. Anläggningskopplingen får sitt flöde. Kolumnen fanns; ingen dörr satte
--      den, och ingen läsning visade den. Nu båda — och en anläggningstillgång
--      hör till högst en utrustning.
--
-- Flottan förkontrollerad läsande 2026-09-20: manage_equipment och
-- manage_maintenance_request har identiska kroppar på alla sju instanser
-- (md5 2b764039… / 67b46ba4…), och ingen instans har någon utrustning eller
-- något underhållsärende alls — ersättningen berör inget befintligt data.

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS work_center_id uuid REFERENCES public.work_centers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS equipment_work_center ON public.equipment (work_center_id) WHERE work_center_id IS NOT NULL;
-- En anläggningstillgång är en sak i böckerna och hör till högst en maskin.
CREATE UNIQUE INDEX IF NOT EXISTS equipment_one_per_fixed_asset
  ON public.equipment (fixed_asset_id) WHERE fixed_asset_id IS NOT NULL;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS blocks_equipment boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. EN skrivare av utrustningens status
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_equipment_status(p_equipment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_blocked boolean;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.equipment WHERE id = p_equipment_id;
  IF v_status IS NULL OR v_status = 'retired' THEN
    RETURN v_status;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.maintenance_requests r
                  WHERE r.equipment_id = p_equipment_id AND r.blocks_equipment
                    AND r.status IN ('new', 'in_progress')) INTO v_blocked;
  -- 'broken' är ett mänskligt omdöme om maskinen: ett stängt ärende lyfter det inte.
  IF v_blocked AND v_status = 'operational' THEN
    UPDATE public.equipment SET status = 'under_maintenance', updated_at = now() WHERE id = p_equipment_id;
    RETURN 'under_maintenance';
  ELSIF NOT v_blocked AND v_status = 'under_maintenance' THEN
    UPDATE public.equipment SET status = 'operational', updated_at = now() WHERE id = p_equipment_id;
    RETURN 'operational';
  END IF;
  RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_sync_equipment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_equipment_status(COALESCE(NEW.equipment_id, OLD.equipment_id));
  IF TG_OP = 'UPDATE' AND NEW.equipment_id IS DISTINCT FROM OLD.equipment_id THEN
    PERFORM public.sync_equipment_status(OLD.equipment_id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS tg_sync_equipment_status ON public.maintenance_requests;
CREATE TRIGGER tg_sync_equipment_status
  AFTER INSERT OR UPDATE OR DELETE ON public.maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_equipment_status();

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Arbetsstället
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.work_center_availability(p_work_center_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_down jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'equipment_id', e.id, 'equipment', e.name, 'status', e.status,
           'open_request', (SELECT jsonb_build_object('id', r.id, 'title', r.title, 'priority', r.priority, 'due_date', r.due_date)
                              FROM public.maintenance_requests r
                             WHERE r.equipment_id = e.id AND r.status IN ('new', 'in_progress')
                             ORDER BY r.blocks_equipment DESC, r.created_at LIMIT 1))
         ORDER BY e.name), '[]'::jsonb)
    INTO v_down
    FROM public.equipment e
   WHERE e.work_center_id = p_work_center_id AND e.status IN ('under_maintenance', 'broken');
  RETURN jsonb_build_object('success', true, 'work_center_id', p_work_center_id,
    'available', jsonb_array_length(v_down) = 0, 'down', v_down);
END;
$function$;

CREATE OR REPLACE FUNCTION public.work_order_needs_a_working_machine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_down record;
BEGIN
  IF NEW.status <> 'in_progress' OR OLD.status = 'in_progress' OR NEW.work_center_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.name, e.status, r.title INTO v_down
    FROM public.equipment e
    LEFT JOIN public.maintenance_requests r
      ON r.equipment_id = e.id AND r.status IN ('new', 'in_progress') AND r.blocks_equipment
   WHERE e.work_center_id = NEW.work_center_id AND e.status IN ('under_maintenance', 'broken')
   ORDER BY r.created_at NULLS LAST LIMIT 1;
  IF v_down.name IS NOT NULL THEN
    RAISE EXCEPTION 'Work order "%" cannot start: % at this work center is % (%). Finish the maintenance request, or move the work to another work center.',
      NEW.name, v_down.name, replace(v_down.status, '_', ' '), COALESCE(v_down.title, 'no open request')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS work_order_needs_a_working_machine ON public.mo_work_orders;
CREATE TRIGGER work_order_needs_a_working_machine
  BEFORE UPDATE OF status ON public.mo_work_orders
  FOR EACH ROW EXECUTE FUNCTION public.work_order_needs_a_working_machine();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. MTBF / MTTR
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.maintenance_stats(p_equipment_id uuid DEFAULT NULL, p_months integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_months integer := GREATEST(1, LEAST(COALESCE(p_months, 12), 60));
  v_from timestamptz := now() - make_interval(months => v_months);
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'maintenance')) THEN
    RAISE EXCEPTION 'Requires the maintenance module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'from', v_from::date, 'months', v_months,
    'equipment', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.name)
        FROM (
          SELECT e.id AS equipment_id, e.name, e.status,
                 wc.name AS work_center,
                 f.failures,
                 f.repairs,
                 f.downtime_hours,
                 -- Observerad tid: från när maskinen började följas, inte från tidernas början.
                 round(EXTRACT(epoch FROM (now() - GREATEST(v_from, COALESCE(e.purchase_date::timestamptz, e.created_at)))) / 3600.0, 1) AS observed_hours,
                 CASE WHEN f.repairs > 0 THEN round(f.downtime_hours / f.repairs, 1) END AS mttr_hours,
                 -- Ett medelvärde mellan haverier kräver minst två haverier. Annars finns det inget.
                 CASE WHEN f.failures >= 2
                      THEN round((EXTRACT(epoch FROM (now() - GREATEST(v_from, COALESCE(e.purchase_date::timestamptz, e.created_at)))) / 3600.0 - f.downtime_hours) / f.failures, 1) END AS mtbf_hours,
                 CASE WHEN f.failures < 2 THEN 'insufficient data: a mean between failures needs at least two failures' END AS mtbf_note,
                 CASE WHEN EXTRACT(epoch FROM (now() - GREATEST(v_from, COALESCE(e.purchase_date::timestamptz, e.created_at)))) > 0
                      THEN round(100.0 * (1 - f.downtime_hours / (EXTRACT(epoch FROM (now() - GREATEST(v_from, COALESCE(e.purchase_date::timestamptz, e.created_at)))) / 3600.0)), 2) END AS availability_pct,
                 f.open_requests
            FROM public.equipment e
            LEFT JOIN public.work_centers wc ON wc.id = e.work_center_id
            CROSS JOIN LATERAL (
              SELECT count(*) FILTER (WHERE r.kind = 'corrective' AND r.created_at >= v_from) AS failures,
                     count(*) FILTER (WHERE r.kind = 'corrective' AND r.status = 'done' AND r.completed_at IS NOT NULL AND r.created_at >= v_from) AS repairs,
                     COALESCE(round(SUM(EXTRACT(epoch FROM (r.completed_at - r.created_at)) / 3600.0)
                                    FILTER (WHERE r.kind = 'corrective' AND r.status = 'done' AND r.completed_at IS NOT NULL AND r.created_at >= v_from), 1), 0) AS downtime_hours,
                     count(*) FILTER (WHERE r.status IN ('new', 'in_progress')) AS open_requests
                FROM public.maintenance_requests r WHERE r.equipment_id = e.id) f
           WHERE p_equipment_id IS NULL OR e.id = p_equipment_id
        ) x), '[]'::jsonb),
    'note', 'MTTR is the time from the request being raised until it was completed — the machine was unusable for that whole time, not only while someone had a wrench on it. MTBF counts operating time (observed time minus downtime) per failure.');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Dörrarna
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.manage_equipment(text, uuid, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.manage_equipment(
  p_action text,
  p_equipment_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_work_center_id uuid DEFAULT NULL,
  p_fixed_asset_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'maintenance'));
  v_id uuid; v_rows jsonb;
BEGIN
  -- staff-guard 20260917100000
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'maintenance')) THEN
    RAISE EXCEPTION 'Reading equipment requires the maintenance module' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'list' THEN
    -- Maskinen läses med det den hänger på: arbetsstället den matar och posten i böckerna.
    SELECT COALESCE(jsonb_agg(to_jsonb(e) || jsonb_build_object(
             'work_center', (SELECT wc.name FROM work_centers wc WHERE wc.id = e.work_center_id),
             'fixed_asset', (SELECT jsonb_build_object('id', a.id, 'name', a.name, 'cost_cents', a.cost_cents,
                                                       'accumulated_cents', a.accumulated_cents, 'status', a.status)
                               FROM fixed_assets a WHERE a.id = e.fixed_asset_id),
             'open_requests', (SELECT count(*) FROM maintenance_requests r
                                WHERE r.equipment_id = e.id AND r.status IN ('new','in_progress')))
           ORDER BY e.name), '[]'::jsonb) INTO v_rows
    FROM equipment e
    WHERE (p_status IS NULL OR e.status = p_status)
      AND (p_work_center_id IS NULL OR e.work_center_id = p_work_center_id);
    RETURN jsonb_build_object('success', true, 'equipment', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the maintenance module — an admin can grant it under Users → Role Permissions'; END IF;

  IF p_work_center_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_centers WHERE id = p_work_center_id) THEN
    RAISE EXCEPTION 'Work center % not found — list them with manage_work_center', p_work_center_id USING ERRCODE = 'P0001';
  END IF;
  IF p_fixed_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fixed_assets WHERE id = p_fixed_asset_id) THEN
    RAISE EXCEPTION 'Fixed asset % not found — register it with manage_fixed_asset first', p_fixed_asset_id USING ERRCODE = 'P0001';
  END IF;

  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    INSERT INTO equipment (name, serial_number, category, location, status, notes, work_center_id, fixed_asset_id)
    VALUES (p_name, p_serial_number, p_category, p_location, COALESCE(p_status,'operational'), p_notes, p_work_center_id, p_fixed_asset_id)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'equipment_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;
    UPDATE equipment SET
      name = COALESCE(p_name, name), serial_number = COALESCE(p_serial_number, serial_number),
      category = COALESCE(p_category, category), location = COALESCE(p_location, location),
      status = COALESCE(p_status, status), notes = COALESCE(p_notes, notes),
      work_center_id = COALESCE(p_work_center_id, work_center_id),
      fixed_asset_id = COALESCE(p_fixed_asset_id, fixed_asset_id),
      updated_at = now()
    WHERE id = p_equipment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Equipment % not found', p_equipment_id; END IF;
    RETURN jsonb_build_object('success', true, 'equipment_id', p_equipment_id,
      'status', (SELECT status FROM equipment WHERE id = p_equipment_id));
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $function$;

DROP FUNCTION IF EXISTS public.manage_maintenance_request(text, uuid, uuid, text, text, text, text, text, date, integer);
CREATE OR REPLACE FUNCTION public.manage_maintenance_request(
  p_action text,
  p_request_id uuid DEFAULT NULL,
  p_equipment_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_duration_minutes integer DEFAULT NULL,
  p_blocks_equipment boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'maintenance'));
  v_id uuid; v_rows jsonb; v_equipment uuid; v_blocks boolean;
BEGIN
  -- staff-guard 20260917100000
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.can_access_module(auth.uid(), 'maintenance')) THEN
    RAISE EXCEPTION 'Reading maintenance requests requires the maintenance module' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object(
             'equipment', (SELECT e.name FROM equipment e WHERE e.id = r.equipment_id))
           ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM maintenance_requests r
    WHERE (p_status IS NULL OR r.status = p_status)
      AND (p_equipment_id IS NULL OR r.equipment_id = p_equipment_id);
    RETURN jsonb_build_object('success', true, 'requests', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the maintenance module — an admin can grant it under Users → Role Permissions'; END IF;

  IF p_action = 'create' THEN
    IF p_equipment_id IS NULL OR p_title IS NULL THEN
      RAISE EXCEPTION 'equipment_id and title are required';
    END IF;
    -- Stoppar ärendet maskinen? Förvalet bevarar det gamla beteendet — ett
    -- kritiskt ärende gör det — men nu står det på raden i stället för att
    -- följa av prioriteten någon annanstans.
    v_blocks := COALESCE(p_blocks_equipment, COALESCE(p_priority,'medium') = 'critical');
    INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date, created_by, blocks_equipment)
    VALUES (p_equipment_id, p_title, p_description, COALESCE(p_kind,'corrective'),
            COALESCE(p_priority,'medium'), p_due_date, auth.uid(), v_blocks)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'request_id', v_id, 'blocks_equipment', v_blocks,
      'equipment_status', (SELECT status FROM equipment WHERE id = p_equipment_id),
      'note', CASE WHEN v_blocks THEN 'The machine is down while this request is open — work orders at its work center cannot start.' END);
  ELSIF p_action = 'update' THEN
    IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
    UPDATE maintenance_requests SET
      title = COALESCE(p_title, title), description = COALESCE(p_description, description),
      priority = COALESCE(p_priority, priority), status = COALESCE(p_status, status),
      due_date = COALESCE(p_due_date, due_date),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      blocks_equipment = COALESCE(p_blocks_equipment, blocks_equipment),
      completed_at = CASE WHEN p_status = 'done' THEN COALESCE(completed_at, now()) ELSE completed_at END,
      updated_at = now()
    WHERE id = p_request_id
    RETURNING equipment_id INTO v_equipment;
    IF v_equipment IS NULL THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    RETURN jsonb_build_object('success', true, 'request_id', p_request_id,
      'equipment_status', (SELECT status FROM equipment WHERE id = v_equipment));
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $function$;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.manage_equipment(text, uuid, text, text, text, text, text, text, uuid, uuid)',
    'public.manage_maintenance_request(text, uuid, uuid, text, text, text, text, text, date, integer, boolean)',
    'public.maintenance_stats(uuid, integer)',
    'public.work_center_availability(uuid)',
    'public.sync_equipment_status(uuid)',
    'public.tg_sync_equipment_status()',
    'public.work_order_needs_a_working_machine()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;

REVOKE ALL ON FUNCTION public.sync_equipment_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_equipment_status(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tg_sync_equipment_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tg_sync_equipment_status() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_order_needs_a_working_machine() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_order_needs_a_working_machine() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.work_center_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_center_availability(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.maintenance_stats(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_stats(uuid, integer) TO authenticated, service_role;

-- Anläggningstillgångar som ännu inte är någon maskin — plus den här maskinens egen.
-- Utan den här läsningen skulle formuläret bara kunna erbjuda ett fritt uuid-fält.
CREATE OR REPLACE FUNCTION public.list_linkable_fixed_assets(p_include_asset_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'maintenance')) THEN
    RAISE EXCEPTION 'Requires the maintenance module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'assets', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'cost_cents', a.cost_cents, 'status', a.status) ORDER BY a.name)
      FROM public.fixed_assets a
     WHERE a.status <> 'disposed'
       AND (a.id = p_include_asset_id
            OR NOT EXISTS (SELECT 1 FROM public.equipment e WHERE e.fixed_asset_id = a.id))), '[]'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.list_linkable_fixed_assets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_linkable_fixed_assets(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_wc uuid; v_eq uuid; v_req uuid; v_r jsonb; v_wo uuid; v_mo uuid; v_prod uuid; v_bom uuid; v_stats jsonb; v_row jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.work_centers (code, name, cost_per_hour_cents, capacity_per_hour, is_active)
    VALUES ('PROOF-WC-070000', 'Proof line', 30000, 1, true) RETURNING id INTO v_wc;
    v_r := public.manage_equipment('create', NULL, 'Proof press', NULL, NULL, NULL, NULL, NULL, v_wc, NULL);
    v_eq := (v_r->>'equipment_id')::uuid;

    -- En maskin på ett arbetsställe stoppar arbetet där när den är nere.
    INSERT INTO public.products (name, price_cents, track_inventory) VALUES ('Proof 070000 good', 1000, false) RETURNING id INTO v_prod;
    INSERT INTO public.bom_headers (product_id, version, is_active, quantity_produced) VALUES (v_prod, 'proof', true, 1) RETURNING id INTO v_bom;
    INSERT INTO public.manufacturing_orders (mo_number, product_id, bom_id, quantity, status)
    VALUES ('PROOF-MO-070000', v_prod, v_bom, 1, 'in_progress') RETURNING id INTO v_mo;
    INSERT INTO public.mo_work_orders (mo_id, sequence, name, work_center_id, status, planned_minutes, planned_labor_cost_cents)
    VALUES (v_mo, 10, 'Press', v_wc, 'pending', 30, 15000) RETURNING id INTO v_wo;

    UPDATE public.mo_work_orders SET status = 'in_progress' WHERE id = v_wo;  -- fungerar: maskinen är hel
    UPDATE public.mo_work_orders SET status = 'pending' WHERE id = v_wo;

    v_r := public.manage_maintenance_request('create', NULL, v_eq, 'Broken ram', NULL, 'corrective', 'critical');
    v_req := (v_r->>'request_id')::uuid;
    IF NOT (v_r->>'blocks_equipment')::boolean OR (v_r->>'equipment_status') <> 'under_maintenance' THEN
      RAISE EXCEPTION 'proof failed: a critical request should take the machine down → %', v_r;
    END IF;
    IF (public.work_center_availability(v_wc)->>'available')::boolean THEN
      RAISE EXCEPTION 'proof failed: the work center reads as available while its machine is down';
    END IF;
    BEGIN
      UPDATE public.mo_work_orders SET status = 'in_progress' WHERE id = v_wo;
      RAISE EXCEPTION 'proof failed: work started on a machine that is down';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;

    -- Ett ärende som inte stoppar maskinen stoppar inte arbetet heller.
    v_r := public.manage_maintenance_request('update', v_req, NULL, NULL, NULL, NULL, NULL, 'done', NULL, 45);
    IF (v_r->>'equipment_status') <> 'operational' THEN
      RAISE EXCEPTION 'proof failed: closing the last blocking request should bring the machine back → %', v_r;
    END IF;
    PERFORM public.manage_maintenance_request('create', NULL, v_eq, 'Grease the rails', NULL, 'preventive', 'low');
    IF (SELECT status FROM public.equipment WHERE id = v_eq) <> 'operational' THEN
      RAISE EXCEPTION 'proof failed: a non-blocking request took the machine down';
    END IF;
    UPDATE public.mo_work_orders SET status = 'in_progress' WHERE id = v_wo;

    -- MTBF behöver två haverier; med ett svarar funktionen att den inte vet.
    v_stats := public.maintenance_stats(v_eq, 12);
    v_row := v_stats->'equipment'->0;
    IF v_row->>'mtbf_hours' IS NOT NULL OR v_row->>'mtbf_note' IS NULL THEN
      RAISE EXCEPTION 'proof failed: one failure is not a mean → %', v_row;
    END IF;
    IF (v_row->>'mttr_hours')::numeric IS NULL OR (v_row->>'failures')::int <> 1 THEN
      RAISE EXCEPTION 'proof failed: one repair should give an MTTR → %', v_row;
    END IF;
    v_r := public.manage_maintenance_request('create', NULL, v_eq, 'Broken again', NULL, 'corrective', 'high');
    PERFORM public.manage_maintenance_request('update', (v_r->>'request_id')::uuid, NULL, NULL, NULL, NULL, NULL, 'done');
    v_row := public.maintenance_stats(v_eq, 12)->'equipment'->0;
    IF v_row->>'mtbf_hours' IS NULL OR (v_row->>'failures')::int <> 2 THEN
      RAISE EXCEPTION 'proof failed: two failures make a mean → %', v_row;
    END IF;
    IF v_row->>'work_center' <> 'Proof line' THEN
      RAISE EXCEPTION 'proof failed: the stats should name the work center the machine feeds';
    END IF;

    -- Anläggningskopplingen: en tillgång hör till högst en maskin, och listan visar bara lediga.
    DECLARE v_asset uuid; v_eq2 uuid; v_list jsonb;
    BEGIN
      INSERT INTO public.fixed_assets (name, cost_cents, purchase_date, in_service_date, useful_life_months, status)
      VALUES ('Proof 070000 press', 50000000, CURRENT_DATE, CURRENT_DATE, 60, 'active') RETURNING id INTO v_asset;
      v_list := public.list_linkable_fixed_assets(NULL);
      IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list->'assets') a WHERE (a->>'id')::uuid = v_asset) THEN
        RAISE EXCEPTION 'proof failed: a free asset should be offered';
      END IF;
      PERFORM public.manage_equipment('update', v_eq, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_asset);
      v_list := public.list_linkable_fixed_assets(NULL);
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_list->'assets') a WHERE (a->>'id')::uuid = v_asset) THEN
        RAISE EXCEPTION 'proof failed: an asset that is already a machine is still offered';
      END IF;
      v_r := public.manage_equipment('create', NULL, 'Proof twin', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
      v_eq2 := (v_r->>'equipment_id')::uuid;
      BEGIN
        PERFORM public.manage_equipment('update', v_eq2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_asset);
        RAISE EXCEPTION 'proof failed: two machines took the same asset';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      IF (public.manage_equipment('list')->'equipment'->0->'fixed_asset'->>'name') IS NULL
         AND (public.manage_equipment('list')->'equipment'->1->'fixed_asset'->>'name') IS NULL THEN
        RAISE EXCEPTION 'proof failed: the listing does not carry the asset';
      END IF;
    END;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: a machine that is down blocks its work center, a non-blocking request does not, closing the last one brings it back, MTBF waits for a second failure, and an asset belongs to at most one machine.';
END
$proof$;
