-- Frontend-anropade SECURITY DEFINER-RPC:er lyssnar på MATRISEN.
--
-- Rollsvepets tredje varv. Klassen: RPC:er vars vakt är en HÅRDKODAD ROLLISTA
-- (has_role(uid,'admin') OR has_role(uid,'writer') …) i stället för
-- can_access_module(). De är osynliga för varje pg_policy-svep — vakten sitter
-- i funktionskroppen, inte i en RLS-policy — och agent-rälsen träffar dem
-- aldrig, eftersom agent-execute enforcar matrisen själv innan RPC:n körs.
-- Men frontend anropar dem DIREKT via supabase.rpc(): det är den obevakade
-- dörren. En roll som fått modulen i Role Permissions ser knappen, klickar,
-- och möts av "Only admins…" — matrisen var påslagen, funktionen brydde sig
-- inte.
--
-- Uppräkning: 257 funktioner i public har has_role men inte can_access_module;
-- 137 av dem anropas från src/ (manage_inventory_count döljs för en radvis
-- grep av ett flerradigt .rpc(-anrop — guardrail-testet nedan hittade den).
-- 118 konverteras här. De 19 som lämnas kvar är
-- avsiktligt admin-only och står i allowlisten
-- src/lib/admin-only-rpcs.ts (destruktiva plattformsoperationer, matrisens
-- egna reset-funktioner, dynamiska required_role-vakter, ägarskapsvakter,
-- samt fyra RPC:er vars ägarmodul `email` är core och därför saknar
-- matrisratt).
--
-- Bytet är ETT uttryck per vakt: rollistan → `auth.role() = 'service_role' OR
-- can_access_module(auth.uid(),'<modul>')`. can_access_module returnerar sant
-- för admin, så admin förlorar aldrig något; det som TILLKOMMER är de roller
-- operatören faktiskt beviljat modulen. Kropparna är hämtade ur live-schemat
-- (optic, 459/459 migrationer applicerade = identiskt med repot) så inget
-- annat än vakten ändras.
--
-- I PRAKTIKEN ETT ÖPPNANDE, INTE ETT STÄNGANDE: rollistorna namngav till stor
-- del `writer`, `approver` och `employee` — förmatrisens roller, som ingen
-- längre TILLDELAS (user_roles på fleeten bär bara admin + processrollerna
-- sales/hr/accounting/support/warehouse/marketing/purchasing/projects). Vakten
-- läste alltså "admin eller tre spöken" = admin-only i praktiken. Efter bytet
-- når varje processroll de moduler operatören faktiskt beviljat.
--
-- TRE UNDANTAG som verkligen SNÄVAR, och som operatören löser med en enda
-- grant i Role Permissions om hen vill ha kvar dagens räckvidd:
--   complete_service_order  admin|sales|support → fieldService (idag: support)
--                           → sales tappar den; grant fieldService till sales.
--   create_rtv              admin|support|warehouse|purchasing → purchasing
--   update_rtv_status       (idag: accounting,warehouse,purchasing)
--                           → support tappar dem; grant purchasing till support.
-- RTV homas på `purchasing` och inte `returns` av samma skäl som
-- fakturaskaparna homas på `invoicing`: modulen som äger EFFEKTEN (en retur TILL
-- leverantören) auktoriserar, inte den vars arbetsflöde råkade starta den.
--
-- ORÖRT MED FLIT: `auth.uid() IS NULL`-undantagen i allocate_picking,
-- change_subscription, generate_contract_invoice, mark_contract_obligation_status
-- och manage_recurring_service_order. De är en EGEN buggklass (anon-nyckeln
-- har också NULL uid) och ska inte smygas in i ett rollsvep.
--
-- ETT undantag från den regeln: clock_in, clock_out och sign_employment_contract
-- bär baseline-erans nakna `auth.uid() IS NULL -> Not authenticated`, som låser
-- ute service-nyckeln. I baseline-filen är den fryst historia; buren vidare in i
-- EN NY migration är den en levande bugg (p2p-process-guardrailen fångar den),
-- så de tre får `AND auth.role() <> 'service_role'`.

-- add_tip → pos. Före: IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: kassabiträde med `pos` i Role Permissions → svar; kundkonto utan pos → "not authorized".
CREATE OR REPLACE FUNCTION public.add_tip(p_sale_id uuid, p_tip_cents integer, p_method text DEFAULT 'card'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sale RECORD;
BEGIN
  IF NOT (auth.role()='service_role' OR can_access_module(auth.uid(),'pos')) THEN
    RAISE EXCEPTION 'Not authorized to add tips';
  END IF;
  IF p_tip_cents IS NULL OR p_tip_cents <= 0 THEN RAISE EXCEPTION 'tip_cents must be positive'; END IF;
  SELECT id, total_cents, tip_cents INTO v_sale FROM pos_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  UPDATE pos_sales SET tip_cents = tip_cents + p_tip_cents WHERE id = p_sale_id;
  INSERT INTO pos_payments (sale_id, method, amount_cents, reference)
    VALUES (p_sale_id, p_method, p_tip_cents, 'tip');
  RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id,
    'tip_cents', v_sale.tip_cents + p_tip_cents,
    'grand_total_cents', v_sale.total_cents + v_sale.tip_cents + p_tip_cents);
END; $function$;

-- advance_inventory_receipt → inventory. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.advance_inventory_receipt(p_receipt_id uuid, p_to_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rcp public.inventory_receipts%ROWTYPE;
  v_line record; v_move_id uuid; v_posted int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_to_status NOT IN ('quality_check','putaway','done','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT * INTO v_rcp FROM public.inventory_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found'; END IF;

  IF p_to_status = 'putaway' THEN
    FOR v_line IN SELECT * FROM public.inventory_receipt_lines WHERE receipt_id = p_receipt_id AND qc_status <> 'failed' LOOP
      IF v_line.target_location_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.stock_moves (product_id, quantity, move_type, to_location_id, lot_id, reference_type, reference_id, state, notes)
      VALUES (v_line.product_id, v_line.quantity::int, 'in', v_line.target_location_id, v_line.lot_id, 'inventory_receipt', p_receipt_id::text, 'done', 'Putaway ' || v_rcp.reference)
      RETURNING id INTO v_move_id;
      UPDATE public.inventory_receipt_lines SET putaway_move_id = v_move_id WHERE id = v_line.id;
      v_posted := v_posted + 1;
    END LOOP;
  END IF;

  UPDATE public.inventory_receipts
     SET status = p_to_status,
         qc_at      = CASE WHEN p_to_status='quality_check' THEN now() ELSE qc_at END,
         putaway_at = CASE WHEN p_to_status='putaway' THEN now() ELSE putaway_at END,
         done_at    = CASE WHEN p_to_status='done' THEN now() ELSE done_at END,
         updated_at = now()
   WHERE id = p_receipt_id;

  RETURN jsonb_build_object('ok',true,'receipt_id',p_receipt_id,'status',p_to_status,'putaway_moves',v_posted);
END $function$;

-- allocate_landed_cost → inventory. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.allocate_landed_cost(p_reference_type text, p_reference_id text, p_amount_cents bigint, p_method text DEFAULT 'by_value'::text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'));
  v_layers RECORD;
  v_total_basis numeric := 0;
  v_allocated bigint := 0;
  v_share bigint;
  v_count int := 0;
  v_last_id uuid;
  v_je uuid;
  v_lc uuid;
BEGIN
  IF NOT v_writer THEN
    RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;
  IF p_method NOT IN ('by_value','by_qty') THEN
    RAISE EXCEPTION 'method must be by_value or by_qty';
  END IF;
  SELECT COALESCE(SUM(CASE WHEN p_method='by_value' THEN l.value_cents ELSE l.quantity END),0)
  INTO v_total_basis
  FROM stock_valuation_layers l
  JOIN stock_moves m ON m.id = l.move_id
  WHERE m.reference_type = p_reference_type AND m.reference_id = p_reference_id;
  IF v_total_basis <= 0 THEN
    RAISE EXCEPTION 'No valuation layers found for % % (or zero basis)', p_reference_type, p_reference_id;
  END IF;
  FOR v_layers IN
    SELECT l.id, l.quantity, l.value_cents
    FROM stock_valuation_layers l
    JOIN stock_moves m ON m.id = l.move_id
    WHERE m.reference_type = p_reference_type AND m.reference_id = p_reference_id
    ORDER BY l.created_at, l.id
    FOR UPDATE OF l
  LOOP
    v_count := v_count + 1;
    v_last_id := v_layers.id;
    v_share := round(p_amount_cents *
      (CASE WHEN p_method='by_value' THEN v_layers.value_cents ELSE v_layers.quantity END)::numeric
      / v_total_basis);
    v_allocated := v_allocated + v_share;
    UPDATE stock_valuation_layers
       SET value_cents = value_cents + v_share,
           unit_cost_cents = CASE WHEN quantity > 0 THEN round((value_cents + v_share)::numeric / quantity) ELSE unit_cost_cents END
     WHERE id = v_layers.id;
  END LOOP;
  IF v_allocated <> p_amount_cents AND v_last_id IS NOT NULL THEN
    UPDATE stock_valuation_layers
       SET value_cents = value_cents + (p_amount_cents - v_allocated),
           unit_cost_cents = CASE WHEN quantity > 0 THEN round((value_cents + (p_amount_cents - v_allocated))::numeric / quantity) ELSE unit_cost_cents END
     WHERE id = v_last_id;
  END IF;
  BEGIN
    INSERT INTO journal_entries (entry_date, description, source, status)
    VALUES (CURRENT_DATE, 'Landed cost '||p_reference_type||' '||p_reference_id||COALESCE(' — '||p_description,''), 'landed_cost', 'posted')
    RETURNING id INTO v_je;
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, '1460', p_amount_cents, 0, 'Lager av handelsvaror — landed cost'),
           (v_je, '5710', 0, p_amount_cents, 'Frakter — omförd till lager');
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'landed_cost JE skipped: %', SQLERRM;
  END;
  INSERT INTO landed_costs (reference_type, reference_id, amount_cents, method, description, journal_entry_id)
  VALUES (p_reference_type, p_reference_id, p_amount_cents, p_method, p_description, v_je)
  RETURNING id INTO v_lc;
  RETURN jsonb_build_object('success', true, 'landed_cost_id', v_lc,
    'layers_adjusted', v_count, 'allocated_cents', p_amount_cents, 'journal_entry_id', v_je);
END $function$;

-- allocate_picking → inventory. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee')) OR auth.uid() IS NULL) THEN
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.allocate_picking(p_order_id uuid, p_source_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_picking_id UUID;
  v_order RECORD;
  v_item RECORD;
  v_line_id UUID;
  v_reservation_id UUID;
  v_source_location UUID;
  v_short_count INT := 0;
  v_total_count INT := 0;
  v_lines JSONB := '[]'::JSONB;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Pick default source location if not given
  v_source_location := COALESCE(
    p_source_location_id,
    (SELECT id FROM public.stock_locations WHERE location_type = 'internal' AND is_active = true ORDER BY created_at LIMIT 1)
  );

  -- Idempotency: reuse open picking_order for this order if exists
  SELECT id INTO v_picking_id
  FROM public.picking_orders
  WHERE order_id = p_order_id AND status IN ('draft','ready','in_progress')
  LIMIT 1;

  IF v_picking_id IS NULL THEN
    INSERT INTO public.picking_orders (order_id, source_location_id, status, ship_to_name, ship_to_address, created_by, allocated_at)
    VALUES (
      p_order_id,
      v_source_location,
      'ready',
      v_order.customer_name,
      NULL,
      auth.uid(),
      now()
    )
    RETURNING id INTO v_picking_id;
  END IF;

  -- Iterate order_items (products has no `sku` column — use `barcode` as the SKU value)
  FOR v_item IN
    SELECT oi.*, p.name AS p_name, p.barcode AS p_sku
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_total_count := v_total_count + 1;
    v_reservation_id := NULL;

    -- Try reserve
    BEGIN
      v_reservation_id := public.reserve_stock(
        v_item.product_id,
        v_source_location,
        v_item.quantity,
        'picking_order',
        v_picking_id
      );
    EXCEPTION WHEN OTHERS THEN
      v_short_count := v_short_count + 1;
    END;

    INSERT INTO public.picking_lines (
      picking_order_id, product_id, product_sku, product_name,
      qty_requested, reservation_id, status
    )
    VALUES (
      v_picking_id, v_item.product_id, v_item.p_sku, COALESCE(v_item.p_name, 'Product'),
      v_item.quantity, v_reservation_id,
      CASE WHEN v_reservation_id IS NOT NULL THEN 'reserved' ELSE 'short' END
    )
    RETURNING id INTO v_line_id;

    v_lines := v_lines || jsonb_build_object(
      'line_id', v_line_id,
      'product_id', v_item.product_id,
      'qty', v_item.quantity,
      'reserved', v_reservation_id IS NOT NULL
    );
  END LOOP;

  -- Audit
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.allocated', 'picking_order', v_picking_id, auth.uid(),
    jsonb_build_object('order_id', p_order_id, 'lines', v_total_count, 'short', v_short_count));

  RETURN jsonb_build_object(
    'success', true,
    'picking_order_id', v_picking_id,
    'lines_total', v_total_count,
    'lines_short', v_short_count,
    'lines', v_lines
  );
END;
$function$;

-- apply_onboarding_template → hr. Före: IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
-- Lackmus: HR med `hr` → svar; employee utan hr → "not authorized".
CREATE OR REPLACE FUNCTION public.apply_onboarding_template(p_employee_id uuid, p_template_id uuid)
 RETURNS onboarding_checklists
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tpl public.onboarding_templates;
  v_emp public.employees;
  v_row public.onboarding_checklists;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'hr')) THEN
    RAISE EXCEPTION 'Requires the hr module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_tpl FROM public.onboarding_templates WHERE id = p_template_id;
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Onboarding template not found'; END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;

  INSERT INTO public.onboarding_checklists (employee_id, title, items, created_by)
  VALUES (
    p_employee_id,
    v_tpl.name,
    v_tpl.items,
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- apply_overtime_rules → timesheets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: roll med `timesheets` → svar; roll utan timesheets → "not authorized".
CREATE OR REPLACE FUNCTION public.apply_overtime_rules(p_start_date date, p_end_date date, p_daily_threshold_hours numeric DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_day record; v_entry record; v_overtime numeric; v_take numeric;
  v_rows jsonb := '[]'::jsonb; v_total numeric := 0; v_updated int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'timesheets')) THEN
    RAISE EXCEPTION 'Requires the timesheets module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'start_date and end_date are required'; END IF;

  -- Reset previous flags in the range, then recompute (idempotent).
  UPDATE public.time_entries SET overtime_hours = 0
  WHERE entry_date BETWEEN p_start_date AND p_end_date AND overtime_hours <> 0;

  FOR v_day IN
    SELECT COALESCE(employee_id::text, user_id::text) AS person_key,
           MAX(employee_id::text) AS employee_id, MAX(user_id::text) AS user_id,
           entry_date, SUM(hours) AS total_hours
    FROM public.time_entries
    WHERE entry_date BETWEEN p_start_date AND p_end_date AND category = 'work'
    GROUP BY 1, entry_date
    HAVING SUM(hours) > p_daily_threshold_hours
  LOOP
    v_overtime := v_day.total_hours - p_daily_threshold_hours;
    v_total := v_total + v_overtime;
    v_rows := v_rows || jsonb_build_object(
      'employee_id', v_day.employee_id, 'user_id', v_day.user_id,
      'entry_date', v_day.entry_date, 'total_hours', v_day.total_hours,
      'overtime_hours', v_overtime);
    -- Allocate the overtime to that day's entries, latest first.
    FOR v_entry IN
      SELECT id, hours FROM public.time_entries
      WHERE entry_date = v_day.entry_date AND category = 'work'
        AND COALESCE(employee_id::text, user_id::text) = v_day.person_key
      ORDER BY created_at DESC
    LOOP
      EXIT WHEN v_overtime <= 0;
      v_take := LEAST(v_entry.hours, v_overtime);
      UPDATE public.time_entries SET overtime_hours = v_take WHERE id = v_entry.id;
      v_overtime := v_overtime - v_take;
      v_updated := v_updated + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('success', true,
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'daily_threshold_hours', p_daily_threshold_hours,
    'total_overtime_hours', v_total, 'entries_flagged', v_updated, 'days', v_rows);
END; $function$;

-- apply_pension → payroll. Före: IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin')) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.apply_pension(p_run_id uuid, p_employer_pct numeric, p_employee_pct numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_emp_total bigint := 0; v_ee_total bigint := 0;
BEGIN
  IF NOT (auth.role()='service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_employer_pct IS NULL OR p_employer_pct < 0 OR COALESCE(p_employee_pct,0) < 0 THEN
    RAISE EXCEPTION 'pension percentages must be non-negative';
  END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — pension can only be applied to a draft', p_run_id, v_status; END IF;

  -- Recompute per line. net is restored from the prior employee-pension value so
  -- re-running with a new pct is idempotent (no compounding).
  UPDATE payroll_lines SET
    net_cents = net_cents + pension_employee_cents - ROUND(gross_cents * COALESCE(p_employee_pct,0) / 100.0)::bigint,
    pension_employer_cents = ROUND(gross_cents * p_employer_pct / 100.0)::bigint,
    pension_employee_cents = ROUND(gross_cents * COALESCE(p_employee_pct,0) / 100.0)::bigint
  WHERE run_id = p_run_id;

  SELECT COALESCE(SUM(pension_employer_cents),0), COALESCE(SUM(pension_employee_cents),0)
    INTO v_emp_total, v_ee_total FROM payroll_lines WHERE run_id = p_run_id;

  UPDATE payroll_runs SET
    total_pension_employer_cents = v_emp_total,
    total_pension_employee_cents = v_ee_total,
    total_net_cents = (SELECT COALESCE(SUM(net_cents),0) FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id,
    'employer_pct', p_employer_pct, 'employee_pct', COALESCE(p_employee_pct,0),
    'total_pension_employer_cents', v_emp_total, 'total_pension_employee_cents', v_ee_total);
END; $function$;

-- apply_reconciliation_rules → reconciliation. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `reconciliation` → svar; roll utan reconciliation → "not authorized".
CREATE OR REPLACE FUNCTION public.apply_reconciliation_rules()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_bt RECORD; v_rule RECORD; v_tagged int := 0; v_field text; v_ok boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'reconciliation')) THEN
    RAISE EXCEPTION 'Not authorized'; END IF;
  FOR v_bt IN SELECT * FROM bank_transactions WHERE status = 'unmatched' AND matched_rule_id IS NULL LOOP
    FOR v_rule IN SELECT * FROM reconciliation_rules WHERE is_active ORDER BY priority ASC, created_at ASC LOOP
      v_field := CASE v_rule.match_field
                   WHEN 'counterparty' THEN COALESCE(v_bt.counterparty,'')
                   WHEN 'reference' THEN COALESCE(v_bt.reference,'')
                   ELSE COALESCE(v_bt.description,'') END;
      v_ok := CASE v_rule.match_type
                WHEN 'contains' THEN v_field ILIKE '%' || v_rule.pattern || '%'
                WHEN 'equals' THEN lower(v_field) = lower(v_rule.pattern)
                ELSE v_field ~* v_rule.pattern END;
      IF v_ok THEN
        UPDATE bank_transactions
          SET suggested_account_code = v_rule.suggested_account_code, matched_rule_id = v_rule.id
          WHERE id = v_bt.id;
        v_tagged := v_tagged + 1; EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'tagged', v_tagged);
END; $function$;

-- apply_sick_pay → payroll. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.apply_sick_pay(p_run_id uuid, p_employee_id uuid, p_sick_days integer, p_work_days_per_month integer DEFAULT 21)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_line public.payroll_lines%ROWTYPE;
  v_monthly bigint; v_tax_pct numeric; v_social_pct numeric;
  v_calc jsonb; v_sick bigint; v_daily numeric; v_deduction bigint;
  v_base_gross bigint; v_base_taxable bigint;
  v_gross bigint; v_taxable bigint; v_tax bigint; v_social bigint; v_net bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_sick_days IS NULL OR p_sick_days < 0 THEN
    RAISE EXCEPTION 'sick_days must be >= 0';
  END IF;
  IF COALESCE(p_work_days_per_month, 0) <= 0 THEN
    RAISE EXCEPTION 'work_days_per_month must be > 0';
  END IF;

  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Run % is % — sick pay can only be applied to a draft', p_run_id, v_status;
  END IF;

  SELECT * INTO v_line FROM payroll_lines
   WHERE run_id = p_run_id AND employee_id = p_employee_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No payroll line for employee % on run %', p_employee_id, p_run_id;
  END IF;

  SELECT COALESCE(e.monthly_salary_cents,0), COALESCE(e.tax_rate_pct,30.00),
         COALESCE(p.employer_social_pct, 31.42)
    INTO v_monthly, v_tax_pct, v_social_pct
    FROM employees e
    LEFT JOIN payroll_country_profiles p ON p.country_code = COALESCE(e.payroll_country,'SE')
    WHERE e.id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;

  v_base_gross   := v_line.gross_cents   + v_line.sick_deduction_cents - v_line.sick_pay_cents;
  v_base_taxable := v_line.taxable_cents + v_line.sick_deduction_cents - v_line.sick_pay_cents;

  v_daily := v_monthly::numeric / p_work_days_per_month;
  v_deduction := LEAST(ROUND(v_daily * p_sick_days)::bigint, v_base_gross);
  v_calc := public.calc_sick_pay(v_monthly, p_sick_days, p_work_days_per_month);
  v_sick := COALESCE((v_calc->>'sick_pay_cents')::bigint, 0);

  v_gross   := v_base_gross   - v_deduction + v_sick;
  v_taxable := v_base_taxable - v_deduction + v_sick;
  v_tax     := ROUND(v_taxable * v_tax_pct / 100.0)::bigint + v_line.tax_correction_cents;
  v_social  := ROUND(v_taxable * v_social_pct / 100.0)::bigint;
  -- Net excludes non-cash benefits (förmåner raise the tax base only).
  v_net     := v_taxable - v_line.benefits_cents - v_tax - v_line.pension_employee_cents - v_line.advance_deduction_cents;

  UPDATE payroll_lines SET
    gross_cents = v_gross, taxable_cents = v_taxable, tax_cents = v_tax,
    social_fee_cents = v_social, net_cents = v_net,
    sick_days = p_sick_days, sick_deduction_cents = v_deduction, sick_pay_cents = v_sick
  WHERE id = v_line.id;

  UPDATE payroll_runs SET
    total_gross_cents      = (SELECT COALESCE(SUM(gross_cents),0)      FROM payroll_lines WHERE run_id = p_run_id),
    total_tax_cents        = (SELECT COALESCE(SUM(tax_cents),0)        FROM payroll_lines WHERE run_id = p_run_id),
    total_social_fee_cents = (SELECT COALESCE(SUM(social_fee_cents),0) FROM payroll_lines WHERE run_id = p_run_id),
    total_net_cents        = (SELECT COALESCE(SUM(net_cents),0)        FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'employee_id', p_employee_id,
    'sick_days', p_sick_days,
    'salary_deduction_cents', v_deduction,
    'sick_pay_cents', v_sick,
    'karensavdrag_cents', COALESCE((v_calc->>'karensavdrag_cents')::bigint, 0),
    'paid_sick_days', COALESCE((v_calc->>'paid_sick_days')::int, 0),
    'new_gross_cents', v_gross, 'new_tax_cents', v_tax, 'new_net_cents', v_net,
    'note', CASE WHEN v_line.pension_employer_cents > 0 OR v_line.pension_employee_cents > 0
                 THEN 'Pension amounts were computed on the previous gross — re-run apply_pension to refresh them.'
                 ELSE NULL END);
END; $function$;

-- approve_payroll_run → payroll. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
  v_pension_total BIGINT;
  v_benefits BIGINT;
  v_deductions BIGINT;
  v_debit BIGINT;
  v_credit BIGINT;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'draft' THEN RAISE EXCEPTION 'Run already %', v_run.status; END IF;

  SELECT COALESCE(SUM(benefits_cents),0), COALESCE(SUM(deductions_cents),0)
    INTO v_benefits, v_deductions
  FROM public.payroll_lines WHERE run_id = p_run_id;

  INSERT INTO public.journal_entries (entry_date, description, status, source)
  VALUES (v_run.period_date, 'Payroll run '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll')
  RETURNING id INTO v_je_id;

  IF v_run.total_gross_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7210', v_run.total_gross_cents, 0, 'Löner tjänstemän');
  END IF;
  -- Pre-tax deductions: the employee is paid that much less, so the wage cost
  -- is reduced correspondingly (Cr 7210).
  IF v_deductions > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7210', 0, v_deductions, 'Löneavdrag');
  END IF;
  -- Förmånsvärde: cost + contra account so the P&L nets to zero while the
  -- withheld tax and employer social fees still carry the benefit value.
  IF v_benefits > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7385', v_benefits, 0, 'Skattepliktiga förmåner'),
           (v_je_id, '7399', 0, v_benefits, 'Motkonto skattepliktiga förmåner');
  END IF;
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7510', v_run.total_social_fee_cents, 0, 'Arbetsgivaravgifter');
  END IF;
  IF COALESCE(v_run.total_pension_employer_cents,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '7410', v_run.total_pension_employer_cents, 0, 'Pensionsförsäkringspremier');
  END IF;
  IF v_run.total_tax_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2710', 0, v_run.total_tax_cents, 'Personalens källskatt');
  END IF;
  IF v_run.total_social_fee_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2731', 0, v_run.total_social_fee_cents, 'Avräkning lagstadgade sociala avgifter');
  END IF;
  v_pension_total := COALESCE(v_run.total_pension_employer_cents,0) + COALESCE(v_run.total_pension_employee_cents,0);
  IF v_pension_total > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2950', 0, v_pension_total, 'Upplupna pensionskostnader');
  END IF;
  IF COALESCE(v_run.total_advances_cents,0) > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '1610', 0, v_run.total_advances_cents, 'Avräkning löneförskott');
  END IF;
  IF v_run.total_net_cents > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, '2890', 0, v_run.total_net_cents, 'Nettolöneskuld');
  END IF;

  -- Assertion: a wage journal that does not balance must never be posted.
  SELECT COALESCE(SUM(debit_cents),0), COALESCE(SUM(credit_cents),0)
    INTO v_debit, v_credit
  FROM public.journal_entry_lines WHERE journal_entry_id = v_je_id;
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Payroll journal entry does not balance: debit % <> credit % (diff % cents) — approval aborted, run % stays draft',
      v_debit, v_credit, v_debit - v_credit, p_run_id;
  END IF;

  UPDATE public.salary_advances SET status='repaid', repaid_at=now(), updated_at=now()
  WHERE repayment_run_id = p_run_id AND status = 'repaying';

  UPDATE public.payroll_runs
    SET status='approved', approved_at=now(), approval_journal_id=v_je_id
  WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id,
    'pension_posted_cents',v_pension_total,
    'benefits_posted_cents',v_benefits,
    'deductions_posted_cents',v_deductions,
    'journal_debit_cents',v_debit,
    'journal_credit_cents',v_credit,
    'advances_settled_cents',COALESCE(v_run.total_advances_cents,0));
END; $function$;

-- approve_procurement_suggestion → inventory. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can approve procurement suggestions'; END IF;
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.approve_procurement_suggestion(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s procurement_suggestions%ROWTYPE; v_po_id uuid; v_po_number text; v_unit_price integer; v_total integer; v_bom uuid; v_mo uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions'; END IF;
  SELECT * INTO s FROM procurement_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'Suggestion already %', s.status; END IF;
  IF s.procurement_method = 'buy' THEN
    IF s.preferred_vendor_id IS NULL THEN RAISE EXCEPTION 'No preferred vendor; cannot create PO'; END IF;
    v_po_number := 'PO-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6);
    SELECT COALESCE(price_cents,0) INTO v_unit_price FROM products WHERE id = s.product_id;
    v_total := COALESCE(v_unit_price,0) * s.suggested_qty::int;
    INSERT INTO purchase_orders (po_number, vendor_id, status, order_date, expected_delivery, subtotal_cents, total_cents, created_by)
    VALUES (v_po_number, s.preferred_vendor_id, 'draft', CURRENT_DATE, s.needed_by, v_total, v_total, auth.uid())
    RETURNING id INTO v_po_id;
    INSERT INTO purchase_order_lines (purchase_order_id, product_id, quantity, unit_price_cents, total_cents)
    VALUES (v_po_id, s.product_id, s.suggested_qty::int, COALESCE(v_unit_price,0), v_total);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='purchase_order', materialized_ref_id=v_po_id WHERE id=p_id;
    RETURN jsonb_build_object('type','purchase_order','id',v_po_id,'po_number',v_po_number);
  ELSIF s.procurement_method = 'manufacture' THEN
    SELECT id INTO v_bom FROM bom_headers WHERE product_id = s.product_id AND is_active = true LIMIT 1;
    IF v_bom IS NULL THEN RAISE EXCEPTION 'No active BOM for product %', s.product_id; END IF;
    v_mo := create_manufacturing_order(v_bom, s.suggested_qty::int, s.needed_by);
    UPDATE procurement_suggestions SET status='materialized', resolved_at=now(), resolved_by=auth.uid(),
      materialized_ref_type='manufacturing_order', materialized_ref_id=v_mo WHERE id=p_id;
    RETURN jsonb_build_object('type','manufacturing_order','id',v_mo);
  END IF;
  RAISE EXCEPTION 'Unknown procurement_method %', s.procurement_method;
END; $function$;

-- ar_aging_report → invoicing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN
-- Lackmus: ekonomiroll med `invoicing` → svar; säljare utan invoicing → "not authorized".
CREATE OR REPLACE FUNCTION public.ar_aging_report(p_as_of date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customers jsonb; v_by_currency jsonb; v_buckets jsonb; v_dominant text; v_mixed boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Not authorized to view the AR aging report';
  END IF;

  WITH open_invoices AS (
    SELECT
      i.id,
      COALESCE(l.name, NULLIF(i.customer_name, ''), 'Unknown customer') AS customer_name,
      COALESCE(l.email, i.customer_email, '') AS customer_email,
      i.lead_id,
      UPPER(COALESCE(i.currency, 'SEK')) AS currency,
      GREATEST(0, i.total_cents - COALESCE(i.paid_amount_cents, 0))::bigint AS outstanding_cents,
      (p_as_of - COALESCE(i.due_date, i.issue_date)) AS days_overdue
    FROM invoices i
    LEFT JOIN leads l ON l.id = i.lead_id
    WHERE i.invoice_type = 'invoice'
      AND i.status::text <> 'cancelled'
      AND (i.total_cents - COALESCE(i.paid_amount_cents, 0)) > 0
  ),
  per_customer AS (
    SELECT
      customer_name, customer_email, lead_id, currency,
      SUM(CASE WHEN days_overdue <= 0 THEN outstanding_cents ELSE 0 END) AS current_cents,
      SUM(CASE WHEN days_overdue BETWEEN 1 AND 30 THEN outstanding_cents ELSE 0 END) AS overdue_1_30_cents,
      SUM(CASE WHEN days_overdue BETWEEN 31 AND 60 THEN outstanding_cents ELSE 0 END) AS overdue_31_60_cents,
      SUM(CASE WHEN days_overdue BETWEEN 61 AND 90 THEN outstanding_cents ELSE 0 END) AS overdue_61_90_cents,
      SUM(CASE WHEN days_overdue > 90 THEN outstanding_cents ELSE 0 END) AS overdue_90_plus_cents,
      SUM(outstanding_cents) AS total_outstanding_cents,
      COUNT(*) AS invoice_count
    FROM open_invoices
    GROUP BY customer_name, customer_email, lead_id, currency
  ),
  per_currency AS (
    SELECT currency,
      SUM(current_cents) AS current_cents,
      SUM(overdue_1_30_cents) AS overdue_1_30_cents,
      SUM(overdue_31_60_cents) AS overdue_31_60_cents,
      SUM(overdue_61_90_cents) AS overdue_61_90_cents,
      SUM(overdue_90_plus_cents) AS overdue_90_plus_cents,
      SUM(total_outstanding_cents) AS total_outstanding_cents,
      SUM(invoice_count) AS invoice_count
    FROM per_customer GROUP BY currency
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'customer_name', customer_name, 'customer_email', customer_email, 'lead_id', lead_id,
      'currency', currency,
      'current_cents', current_cents, 'overdue_1_30_cents', overdue_1_30_cents,
      'overdue_31_60_cents', overdue_31_60_cents, 'overdue_61_90_cents', overdue_61_90_cents,
      'overdue_90_plus_cents', overdue_90_plus_cents,
      'total_outstanding_cents', total_outstanding_cents, 'invoice_count', invoice_count
    ) ORDER BY total_outstanding_cents DESC) FROM per_customer), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'currency', currency,
      'current_cents', current_cents, 'overdue_1_30_cents', overdue_1_30_cents,
      'overdue_31_60_cents', overdue_31_60_cents, 'overdue_61_90_cents', overdue_61_90_cents,
      'overdue_90_plus_cents', overdue_90_plus_cents,
      'total_outstanding_cents', total_outstanding_cents
    ) ORDER BY total_outstanding_cents DESC) FROM per_currency), '[]'::jsonb),
    (SELECT currency FROM per_currency ORDER BY invoice_count DESC, total_outstanding_cents DESC LIMIT 1),
    (SELECT COUNT(*) > 1 FROM per_currency)
  INTO v_customers, v_by_currency, v_dominant, v_mixed;

  SELECT jsonb_build_object(
    'currency', v_dominant,
    'mixed_currencies', COALESCE(v_mixed, false),
    'current_cents', COALESCE((c->>'current_cents')::bigint, 0),
    'overdue_1_30_cents', COALESCE((c->>'overdue_1_30_cents')::bigint, 0),
    'overdue_31_60_cents', COALESCE((c->>'overdue_31_60_cents')::bigint, 0),
    'overdue_61_90_cents', COALESCE((c->>'overdue_61_90_cents')::bigint, 0),
    'overdue_90_plus_cents', COALESCE((c->>'overdue_90_plus_cents')::bigint, 0),
    'total_outstanding_cents', COALESCE((c->>'total_outstanding_cents')::bigint, 0)
  ) INTO v_buckets
  FROM (SELECT jsonb_array_elements(v_by_currency) AS c) x
  WHERE x.c->>'currency' = v_dominant;

  RETURN jsonb_build_object(
    'success', true,
    'as_of', p_as_of,
    'buckets', COALESCE(v_buckets, jsonb_build_object('currency', COALESCE(v_dominant,'SEK'), 'mixed_currencies', false,
      'current_cents', 0, 'overdue_1_30_cents', 0, 'overdue_31_60_cents', 0, 'overdue_61_90_cents', 0,
      'overdue_90_plus_cents', 0, 'total_outstanding_cents', 0)),
    'buckets_by_currency', v_by_currency,
    'customers', v_customers
  );
END;
$function$;

-- attach_return_label → returns. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'warehouse')) THEN
-- Lackmus: support med `returns` → svar; roll utan returns → "not authorized".
CREATE OR REPLACE FUNCTION public.attach_return_label(p_return_id uuid, p_label_url text DEFAULT NULL::text, p_tracking_number text DEFAULT NULL::text, p_carrier_code text DEFAULT NULL::text)
 RETURNS returns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.returns;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Only staff can attach labels';
  END IF;
  UPDATE public.returns SET
    return_label_url = coalesce(p_label_url, return_label_url),
    return_tracking_number = coalesce(p_tracking_number, return_tracking_number),
    return_carrier_code = coalesce(p_carrier_code, return_carrier_code)
  WHERE id = p_return_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Return % not found', p_return_id; END IF;
  RETURN v_row;
END $function$;

-- auto_allocate_vacation → hr. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
-- Lackmus: HR med `hr` → svar; employee utan hr → "not authorized".
CREATE OR REPLACE FUNCTION public.auto_allocate_vacation(p_year integer, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(employee_id uuid, employee_name text, allocated_days integer, carried_over_days numeric, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp RECORD;
  v_days INTEGER;
  v_max_carry INTEGER;
  v_prev_remaining NUMERIC;
  v_carry NUMERIC;
  v_existing UUID;
  v_action TEXT;
  v_run_id UUID := gen_random_uuid();
  v_total INTEGER := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'hr')) THEN
    RAISE EXCEPTION 'Requires the hr module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR v_emp IN
    SELECT id, name FROM public.employees WHERE status = 'active' ORDER BY name
  LOOP
    v_days := public.calculate_vacation_days(v_emp.id, p_year);

    SELECT max_carry_over_days INTO v_max_carry
    FROM public.vacation_policies
    WHERE is_active = true
    ORDER BY priority DESC LIMIT 1;
    v_max_carry := COALESCE(v_max_carry, 5);

    SELECT GREATEST(0,
      COALESCE(la.allocated_days, 0) + COALESCE(la.carried_over_days, 0)
      - COALESCE((
        SELECT SUM(days) FROM public.leave_requests
        WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND status = 'approved'
          AND EXTRACT(YEAR FROM start_date)::INTEGER = p_year - 1
      ), 0)
    )
    INTO v_prev_remaining
    FROM public.leave_allocations la
    WHERE la.employee_id = v_emp.id AND la.leave_type = 'vacation' AND la.year = p_year - 1;

    v_carry := LEAST(COALESCE(v_prev_remaining, 0), v_max_carry);

    SELECT id INTO v_existing FROM public.leave_allocations
    WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND year = p_year;

    v_action := CASE
      WHEN v_existing IS NOT NULL THEN (CASE WHEN p_dry_run THEN 'would_update' ELSE 'updated' END)
      ELSE (CASE WHEN p_dry_run THEN 'would_create' ELSE 'created' END)
    END;

    IF NOT p_dry_run THEN
      INSERT INTO public.leave_allocations (
        employee_id, leave_type, year, allocated_days, carried_over_days, notes
      ) VALUES (
        v_emp.id, 'vacation', p_year, v_days, v_carry,
        'Auto-allocated ' || to_char(now(), 'YYYY-MM-DD')
      )
      ON CONFLICT (employee_id, leave_type, year) DO UPDATE
      SET allocated_days = EXCLUDED.allocated_days,
          carried_over_days = EXCLUDED.carried_over_days,
          notes = EXCLUDED.notes,
          updated_at = now();

      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
      VALUES (
        'vacation.auto_allocated',
        'employee',
        v_emp.id,
        auth.uid(),
        jsonb_build_object(
          'run_id', v_run_id,
          'year', p_year,
          'employee_name', v_emp.name,
          'allocated_days', v_days,
          'carried_over_days', v_carry,
          'max_carry_over_cap', v_max_carry,
          'previous_year_remaining', v_prev_remaining,
          'action', v_action
        )
      );
      v_total := v_total + 1;
    END IF;

    employee_id := v_emp.id;
    employee_name := v_emp.name;
    allocated_days := v_days;
    carried_over_days := v_carry;
    action := v_action;
    RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run AND v_total > 0 THEN
    INSERT INTO public.audit_logs (action, entity_type, user_id, metadata)
    VALUES (
      'vacation.auto_allocate_run',
      'leave_allocation',
      auth.uid(),
      jsonb_build_object('run_id', v_run_id, 'year', p_year, 'employees_processed', v_total)
    );
  END IF;
END;
$function$;

-- cancel_manual_subscription → subscriptions. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
-- Lackmus: roll med `subscriptions` → svar; roll utan subscriptions → "not authorized".
CREATE OR REPLACE FUNCTION public.cancel_manual_subscription(_subscription_id uuid, _reason text DEFAULT NULL::text, _effective_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _eff date := COALESCE(_effective_date, CURRENT_DATE);
  _sub public.subscriptions%ROWTYPE;
  _months_remaining integer := 0;
  _early boolean := false;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id AND provider = 'manual';
  IF NOT FOUND THEN RAISE EXCEPTION 'Manual subscription % not found', _subscription_id; END IF;

  IF _sub.commitment_end IS NOT NULL AND _eff < _sub.commitment_end THEN
    _early := true;
    _months_remaining := GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (_sub.commitment_end::timestamptz - _eff::timestamptz)) / (86400 * 30))::integer
    );
  END IF;

  UPDATE public.subscriptions
     SET status = 'canceled'::public.subscription_status,
         canceled_at = now(),
         ended_at = _eff::timestamptz,
         cancel_at = _eff::timestamptz,
         next_invoice_date = NULL,
         metadata = metadata || jsonb_build_object(
           'cancel_reason', _reason,
           'canceled_by', auth.uid(),
           'early_termination', _early,
           'months_remaining_at_cancel', _months_remaining
         ),
         updated_at = now()
   WHERE id = _subscription_id;

  PERFORM public.emit_platform_event(
    'subscription.canceled',
    jsonb_build_object(
      'subscription_id', _subscription_id,
      'reason', _reason,
      'effective_date', _eff,
      'early_termination', _early,
      'months_remaining', _months_remaining
    ),
    'cancel_manual_subscription'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'subscription_id', _subscription_id,
    'effective_date', _eff,
    'early_termination', _early,
    'months_remaining', _months_remaining
  );
END $function$;

-- cancel_picking → inventory. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee'))) THEN
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.cancel_picking(p_picking_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line RECORD;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'))) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Release reservations
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND reservation_id IS NOT NULL LOOP
    BEGIN
      PERFORM public.cancel_reservation(v_line.reservation_id);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  UPDATE public.picking_lines
  SET status = 'cancelled'
  WHERE picking_order_id = p_picking_order_id AND status NOT IN ('picked','cancelled');

  UPDATE public.picking_orders
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason
  WHERE id = p_picking_order_id;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.cancelled', 'picking_order', p_picking_order_id, auth.uid(),
    jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id);
END;
$function$;

-- change_subscription → subscriptions. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN
-- Lackmus: roll med `subscriptions` → svar; roll utan subscriptions → "not authorized".
CREATE OR REPLACE FUNCTION public.change_subscription(p_subscription_id uuid, p_new_quantity integer DEFAULT NULL::integer, p_new_unit_amount_cents integer DEFAULT NULL::integer, p_generate_adjustment boolean DEFAULT true, p_tax_rate numeric DEFAULT 0.25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sub public.subscriptions%ROWTYPE; _old_per_period bigint; _new_per_period bigint; _delta bigint;
  _fraction numeric; _prorated bigint; _invoice_id uuid; _invoice_number text; _tax integer; _total integer;
  _line jsonb; _total_days numeric; _remaining_days numeric; _lead_id uuid;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'subscriptions')) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_new_quantity IS NULL AND p_new_unit_amount_cents IS NULL THEN RAISE EXCEPTION 'Provide p_new_quantity and/or p_new_unit_amount_cents'; END IF;
  IF p_new_quantity IS NOT NULL AND p_new_quantity < 1 THEN RAISE EXCEPTION 'quantity must be >= 1 (cancel instead of zeroing)'; END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', p_subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN RAISE EXCEPTION 'change_subscription only applies to manual subscriptions (got %); card subscriptions change at the provider', _sub.provider; END IF;
  IF _sub.status <> 'active'::subscription_status THEN RAISE EXCEPTION 'Cannot change subscription in status %', _sub.status; END IF;
  _old_per_period := _sub.unit_amount_cents::bigint * COALESCE(_sub.quantity, 1);
  _new_per_period := COALESCE(p_new_unit_amount_cents, _sub.unit_amount_cents)::bigint * COALESCE(p_new_quantity, _sub.quantity, 1);
  _delta := _new_per_period - _old_per_period;
  IF _sub.current_period_start IS NOT NULL AND _sub.current_period_end IS NOT NULL AND _sub.current_period_end > _sub.current_period_start THEN
    _total_days := EXTRACT(EPOCH FROM (_sub.current_period_end - _sub.current_period_start)) / 86400.0;
    _remaining_days := GREATEST(EXTRACT(EPOCH FROM (_sub.current_period_end - now())) / 86400.0, 0);
    _fraction := LEAST(_remaining_days / _total_days, 1);
  ELSE _fraction := 0; END IF;
  _prorated := round(_delta * _fraction);
  UPDATE public.subscriptions SET quantity = COALESCE(p_new_quantity, quantity), unit_amount_cents = COALESCE(p_new_unit_amount_cents, unit_amount_cents),
     metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_change', jsonb_build_object('at', now(), 'old_per_period_cents', _old_per_period, 'new_per_period_cents', _new_per_period, 'prorated_cents', _prorated, 'fraction', round(_fraction::numeric, 4)))
   WHERE id = p_subscription_id;
  IF _prorated > 0 AND p_generate_adjustment THEN
    _tax := round(_prorated * COALESCE(p_tax_rate, 0.25))::integer; _total := _prorated + _tax;
    _invoice_number := 'SUB-ADJ-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
    _line := jsonb_build_array(jsonb_build_object('description', 'Prorated adjustment: ' || _sub.product_name || ' (' || round(_fraction * 100) || '% of period remaining)', 'quantity', 1, 'unit_price_cents', _prorated, 'total_cents', _prorated));
    SELECT id INTO _lead_id FROM public.leads WHERE lower(email) = lower(_sub.customer_email) ORDER BY created_at DESC LIMIT 1;
    INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, due_date, issue_date, payment_terms, notes, subscription_id, lead_id)
    VALUES (_invoice_number, _sub.customer_email, _sub.customer_name, 'draft'::invoice_status, _line, _prorated::integer, COALESCE(p_tax_rate, 0.25), _tax, _total, upper(_sub.currency), CURRENT_DATE + 30, CURRENT_DATE, 'Net 30 days', 'Prorated adjustment for subscription ' || _sub.id::text, p_subscription_id, _lead_id)
    RETURNING id INTO _invoice_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'subscription_id', p_subscription_id, 'old_per_period_cents', _old_per_period, 'new_per_period_cents', _new_per_period, 'remaining_fraction', round(_fraction::numeric, 4), 'prorated_cents', _prorated, 'adjustment_invoice_id', _invoice_id, 'credit_cents', CASE WHEN _prorated < 0 THEN -_prorated ELSE 0 END, 'note', CASE WHEN _prorated < 0 THEN 'Downgrade credit recorded on subscription metadata — apply on next invoice' ELSE NULL END);
END $function$;

-- check_technician_availability → fieldService. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.check_technician_availability(p_technician_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_exclude_visit_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conflicts jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- clock_in → timesheets. Före: IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
-- Lackmus: roll med `timesheets` → svar; roll utan timesheets → "not authorized".
CREATE OR REPLACE FUNCTION public.clock_in(p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS attendance_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_id UUID;
  v_row public.attendance_entries;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'timesheets')) THEN
      RAISE EXCEPTION 'Requires the timesheets module — an admin can grant it under Users → Role Permissions';
    END IF;
    v_emp_id := p_employee_id;
  ELSE
    SELECT id INTO v_emp_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
    IF v_emp_id IS NULL THEN RAISE EXCEPTION 'No employee record found for current user'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.attendance_entries WHERE employee_id = v_emp_id AND clock_out IS NULL) THEN
    RAISE EXCEPTION 'Already clocked in — please clock out first';
  END IF;

  INSERT INTO public.attendance_entries (employee_id, clock_in, source)
  VALUES (v_emp_id, now(), 'self')
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- clock_out → timesheets. Före: IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Only admins can clock out for others'; END IF;
-- Lackmus: roll med `timesheets` → svar; roll utan timesheets → "not authorized".
CREATE OR REPLACE FUNCTION public.clock_out(p_break_minutes integer DEFAULT 0, p_notes text DEFAULT NULL::text, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS attendance_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_emp_id UUID;
  v_row public.attendance_entries;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_employee_id IS NOT NULL THEN
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'timesheets')) THEN RAISE EXCEPTION 'Requires the timesheets module — an admin can grant it under Users → Role Permissions'; END IF;
    v_emp_id := p_employee_id;
  ELSE
    SELECT id INTO v_emp_id FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
    IF v_emp_id IS NULL THEN RAISE EXCEPTION 'No employee record found'; END IF;
  END IF;

  UPDATE public.attendance_entries
  SET clock_out = now(),
      break_minutes = COALESCE(p_break_minutes, 0),
      notes = COALESCE(p_notes, notes)
  WHERE employee_id = v_emp_id AND clock_out IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RAISE EXCEPTION 'No open clock-in found'; END IF;
  RETURN v_row;
END;
$function$;

-- complete_inventory_transfer → inventory. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.complete_inventory_transfer(p_transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tr public.inventory_transfers%ROWTYPE;
  v_line record;
  v_move_id uuid;
  v_moves int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO v_tr FROM public.inventory_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
  IF v_tr.status = 'done' THEN RETURN jsonb_build_object('ok',true,'already_done',true); END IF;
  IF v_tr.status = 'cancelled' THEN RAISE EXCEPTION 'transfer_cancelled'; END IF;

  FOR v_line IN SELECT * FROM public.inventory_transfer_lines WHERE transfer_id = p_transfer_id LOOP
    INSERT INTO public.stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, reference_type, reference_id, state, notes)
    VALUES (v_line.product_id, v_line.quantity::int, 'transfer', v_tr.from_location_id, v_tr.to_location_id, v_line.lot_id, 'inventory_transfer', p_transfer_id::text, 'done', 'Transfer ' || v_tr.reference)
    RETURNING id INTO v_move_id;
    UPDATE public.inventory_transfer_lines SET move_id = v_move_id WHERE id = v_line.id;
    v_moves := v_moves + 1;
  END LOOP;

  UPDATE public.inventory_transfers SET status='done', completed_at=now(), updated_at=now() WHERE id = p_transfer_id;
  RETURN jsonb_build_object('ok',true,'transfer_id',p_transfer_id,'moves_posted',v_moves);
END $function$;

-- complete_service_order → fieldService. Före: IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'support'::app_role)) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.complete_service_order(_order_id uuid, _completion_notes text DEFAULT NULL::text)
 RETURNS service_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.service_orders;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.service_orders
     SET status = 'completed',
         completed_at = now(),
         notes = COALESCE(notes, '') || CASE WHEN _completion_notes IS NULL THEN '' ELSE E'\n[completion] ' || _completion_notes END,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$;

-- consultant_utilization_report → consultants. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
-- Lackmus: roll med `consultants` → svar; roll utan consultants → "not authorized".
CREATE OR REPLACE FUNCTION public.consultant_utilization_report(p_from date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date, p_to date DEFAULT ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon -1 days'::interval))::date, p_consultant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_days numeric;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'consultants')) THEN
    RAISE EXCEPTION 'Only staff can view utilization reports';
  END IF;
  IF p_to < p_from THEN RAISE EXCEPTION 'to must be >= from'; END IF;
  v_days := (p_to - p_from + 1)::numeric;

  SELECT COALESCE(jsonb_agg(row_json ORDER BY (row_json->>'utilization_pct')::numeric DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'consultant_id', cp.id,
      'consultant_name', cp.name,
      'title', cp.title,
      'availability', cp.availability,
      'utilization_pct', COALESCE(u.util_pct, 0),
      'assignments', COALESCE(u.assignments, '[]'::jsonb)
    ) AS row_json
    FROM public.consultant_profiles cp
    LEFT JOIN LATERAL (
      SELECT
        round(SUM(
          a.allocation_pct
          * (LEAST(COALESCE(a.end_date, p_to), p_to) - GREATEST(a.start_date, p_from) + 1)
        ) / v_days, 1) AS util_pct,
        jsonb_agg(jsonb_build_object(
          'assignment_id', a.id, 'client_name', a.client_name,
          'allocation_pct', a.allocation_pct,
          'start_date', a.start_date, 'end_date', a.end_date, 'status', a.status
        )) AS assignments
      FROM public.consultant_assignments a
      WHERE a.consultant_id = cp.id
        AND a.status <> 'planned'
        AND a.start_date <= p_to
        AND COALESCE(a.end_date, p_to) >= p_from
    ) u ON true
    WHERE cp.is_active
      AND (p_consultant_id IS NULL OR cp.id = p_consultant_id)
  ) sub;

  RETURN jsonb_build_object('success', true,
    'from', p_from, 'to', p_to, 'window_days', v_days,
    'consultants', v_rows);
END;
$function$;

-- convert_trial_to_active → subscriptions. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
-- Lackmus: roll med `subscriptions` → svar; roll utan subscriptions → "not authorized".
CREATE OR REPLACE FUNCTION public.convert_trial_to_active(_subscription_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sub public.subscriptions%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', _subscription_id; END IF;
  IF _sub.status <> 'trialing'::public.subscription_status THEN
    RAISE EXCEPTION 'Subscription is not in trialing status (current: %)', _sub.status;
  END IF;

  UPDATE public.subscriptions
     SET status = 'active'::public.subscription_status,
         next_invoice_date = COALESCE(next_invoice_date, CURRENT_DATE),
         current_period_start = COALESCE(current_period_start, now()),
         metadata = metadata || jsonb_build_object('trial_converted_at', now(), 'trial_converted_by', auth.uid()),
         updated_at = now()
   WHERE id = _subscription_id;

  PERFORM public.emit_platform_event(
    'subscription.trial_converted',
    jsonb_build_object('subscription_id', _subscription_id),
    'convert_trial_to_active'
  );

  RETURN jsonb_build_object('ok', true, 'subscription_id', _subscription_id, 'status', 'active');
END $function$;

-- create_bom → manufacturing. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'))) THEN
-- Lackmus: produktionsroll med `manufacturing` → svar; roll utan manufacturing → "not authorized".
CREATE OR REPLACE FUNCTION public.create_bom(p_product_id uuid, p_lines jsonb, p_version text DEFAULT NULL::text, p_quantity_produced numeric DEFAULT 1, p_routing_notes text DEFAULT NULL::text, p_activate boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bom_id  uuid;
  v_version text;
  v_line    jsonb;
  v_pos     int := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'manufacturing'))) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'product_id is required';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines must contain at least one component';
  END IF;

  -- Auto-version: v1, v2, ...
  IF p_version IS NULL OR trim(p_version) = '' THEN
    SELECT 'v' || (COALESCE(COUNT(*), 0) + 1)::text
      INTO v_version
      FROM public.bom_headers WHERE product_id = p_product_id;
  ELSE
    v_version := p_version;
  END IF;

  -- Deactivate other versions if activating this one
  IF p_activate THEN
    UPDATE public.bom_headers SET is_active = false WHERE product_id = p_product_id AND is_active = true;
  END IF;

  INSERT INTO public.bom_headers (product_id, version, is_active, quantity_produced, routing_notes, created_by)
  VALUES (p_product_id, v_version, p_activate, COALESCE(p_quantity_produced, 1), p_routing_notes, auth.uid())
  RETURNING id INTO v_bom_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.bom_lines (bom_id, component_product_id, quantity, unit, scrap_pct, position)
    VALUES (
      v_bom_id,
      (v_line->>'component_product_id')::uuid,
      (v_line->>'quantity')::numeric,
      v_line->>'unit',
      COALESCE((v_line->>'scrap_pct')::numeric, 0),
      COALESCE((v_line->>'position')::int, v_pos)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'bom_id', v_bom_id,
    'version', v_version,
    'line_count', jsonb_array_length(p_lines)
  );
END;
$function$;

-- create_cowork_document → documents. Före: public.has_role(v_uid, 'admin'::app_role) / OR public.has_role(v_uid, 'employee'::app_role) / OR public.has_role(v_uid, 'hr'::app_role)
-- Lackmus: roll med `documents` → svar; roll utan documents → "not authorized".
CREATE OR REPLACE FUNCTION public.create_cowork_document(p_title text, p_file_name text, p_file_url text, p_file_type text DEFAULT NULL::text, p_file_size_bytes bigint DEFAULT NULL::bigint, p_description text DEFAULT NULL::text, p_category text DEFAULT 'chat-attachment'::text, p_tags text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF NOT (auth.role() = 'service_role' OR can_access_module(v_uid,'documents')) THEN
    RAISE EXCEPTION 'Requires the documents module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'title required';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name required';
  END IF;
  IF p_file_url IS NULL OR length(trim(p_file_url)) = 0 THEN
    RAISE EXCEPTION 'file_url required';
  END IF;

  INSERT INTO public.documents (
    title, file_name, file_url, file_type, file_size_bytes,
    description, category, tags, source, uploaded_by, extraction_status
  ) VALUES (
    p_title, p_file_name, p_file_url, p_file_type, p_file_size_bytes,
    p_description, p_category, p_tags, 'cowork-upload', v_uid, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- create_credit_note → invoicing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `invoicing` → svar; säljare utan invoicing → "not authorized".
CREATE OR REPLACE FUNCTION public.create_credit_note(p_invoice_id uuid, p_reason text DEFAULT NULL::text, p_amount_cents integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv RECORD;
  v_seq int;
  v_number text;
  v_sub int;
  v_tax int;
  v_tot int;
  v_id uuid;
  v_already_credited bigint;
  v_remaining bigint;
  v_amount int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  -- Existing credit notes are stored with negative totals; sum their absolute value.
  SELECT COALESCE(SUM(ABS(total_cents)), 0)
    INTO v_already_credited
  FROM invoices
  WHERE credited_invoice_id = p_invoice_id
    AND invoice_type = 'credit_note'
    AND status::text <> 'cancelled';

  v_remaining := GREATEST(0, v_inv.total_cents - v_already_credited);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Invoice % is already fully credited (total %, already credited %)',
      p_invoice_id, v_inv.total_cents, v_already_credited;
  END IF;

  v_amount := COALESCE(p_amount_cents, v_remaining::int);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
  IF v_amount > v_remaining THEN
    RAISE EXCEPTION 'Credit % exceeds remaining creditable amount % (invoice total %, already credited %)',
      v_amount, v_remaining, v_inv.total_cents, v_already_credited;
  END IF;

  IF p_amount_cents IS NULL AND v_already_credited = 0 THEN
    -- Full credit of an uncredited invoice: mirror the original amounts exactly.
    v_sub := -v_inv.subtotal_cents;
    v_tax := -v_inv.tax_cents;
    v_tot := -v_inv.total_cents;
  ELSE
    v_sub := -v_amount;
    v_tax := 0;
    v_tot := -v_amount;
  END IF;

  SELECT count(*) + 1 INTO v_seq FROM invoices WHERE credited_invoice_id = p_invoice_id;
  v_number := COALESCE(v_inv.invoice_number, v_inv.id::text) || '-CN' || v_seq::text;

  INSERT INTO invoices (
    invoice_number, invoice_type, credited_invoice_id, lead_id, customer_name, customer_email,
    currency, subtotal_cents, tax_cents, total_cents, status, issue_date, due_date, notes
  ) VALUES (
    v_number, 'credit_note', p_invoice_id, v_inv.lead_id, v_inv.customer_name, v_inv.customer_email,
    v_inv.currency, v_sub, v_tax, v_tot, 'sent', CURRENT_DATE, CURRENT_DATE,
    COALESCE(p_reason, 'Credit note for ' || COALESCE(v_inv.invoice_number, v_inv.id::text))
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'credit_note_id', v_id,
    'invoice_number', v_number,
    'total_cents', v_tot,
    'already_credited_cents', v_already_credited,
    'remaining_creditable_cents', v_remaining - v_amount
  );
END;
$function$;

-- create_deal_from_template → deals. Före: OR has_role(v_uid,'admin') OR has_role(v_uid,'approver')) THEN
-- Lackmus: säljare med `deals` → svar; roll utan deals → "not authorized".
CREATE OR REPLACE FUNCTION public.create_deal_from_template(p_template_id uuid, p_lead_id uuid, p_override_value_cents bigint DEFAULT NULL::bigint, p_override_currency text DEFAULT NULL::text, p_expected_close date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  t public.deal_templates;
  v_id uuid;
  v_stage text;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(v_uid,'deals')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO t FROM public.deal_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'template not found'; END IF;

  v_stage := COALESCE(t.default_stage, 'proposal');

  INSERT INTO public.deals (
    lead_id, product_id, stage, stage_id, value_cents, currency, notes,
    team_id, expected_close, created_by
  ) VALUES (
    p_lead_id,
    t.default_product_id,
    v_stage::deal_stage,
    t.default_stage_id,
    COALESCE(p_override_value_cents, t.default_value_cents),
    COALESCE(p_override_currency, t.default_currency),
    t.default_notes,
    t.default_team_id,
    p_expected_close,
    v_uid
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- create_manual_subscription → subscriptions. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
-- Lackmus: roll med `subscriptions` → svar; roll utan subscriptions → "not authorized".
CREATE OR REPLACE FUNCTION public.create_manual_subscription(_customer_email text, _customer_name text, _product_name text DEFAULT NULL::text, _unit_amount_cents integer DEFAULT NULL::integer, _currency text DEFAULT NULL::text, _billing_interval text DEFAULT 'month'::text, _billing_interval_count integer DEFAULT 1, _quantity integer DEFAULT 1, _payment_terms text DEFAULT 'invoice_30'::text, _start_date date DEFAULT CURRENT_DATE, _billing_contact_email text DEFAULT NULL::text, _po_number text DEFAULT NULL::text, _product_id uuid DEFAULT NULL::uuid, _auto_finalize boolean DEFAULT false, _plan_id uuid DEFAULT NULL::uuid, _trial_days integer DEFAULT 0, _commitment_months integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _plan public.subscription_plans%ROWTYPE;
  _amount integer := _unit_amount_cents;
  _pname text := _product_name;
  _caller_currency text := NULLIF(trim(_currency), '');
  _cur text := lower(_caller_currency);
  _cur_source text := CASE WHEN _caller_currency IS NULL THEN 'platform' ELSE 'caller' END;
  _int text := lower(_billing_interval);
  _intc integer := GREATEST(1, _billing_interval_count);
  _pid uuid := _product_id;
  _trial integer := GREATEST(0, COALESCE(_trial_days, 0));
  _commit integer := GREATEST(0, COALESCE(_commitment_months, 0));
  _lead record;
  _resolved record;
  _pricelist uuid;
  _first_invoice date := _start_date;
  _status public.subscription_status := 'active'::public.subscription_status;
  _trial_start_ts timestamptz := NULL;
  _trial_end_ts timestamptz := NULL;
  _commit_end date := NULL;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'subscriptions')) THEN
    RAISE EXCEPTION 'Requires the subscriptions module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF _customer_email IS NULL OR length(trim(_customer_email)) = 0 THEN
    RAISE EXCEPTION 'customer_email is required';
  END IF;

  -- Load plan (if given) and fill missing fields
  IF _plan_id IS NOT NULL THEN
    SELECT * INTO _plan FROM public.subscription_plans WHERE id = _plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan % not found', _plan_id; END IF;
    _pname := COALESCE(NULLIF(trim(_pname), ''), _plan.product_name);
    IF _amount IS NULL THEN _amount := _plan.unit_amount_cents; END IF;
    IF _pid IS NULL THEN _pid := _plan.product_id; END IF;
    -- The plan speaks only where the caller stayed silent. This used to compare
    -- the argument to 'EUR', so a caller who genuinely wanted EUR was overridden.
    IF _caller_currency IS NULL AND NULLIF(trim(_plan.currency), '') IS NOT NULL THEN
      _cur := lower(_plan.currency);
      _cur_source := 'plan';
    END IF;
    IF _billing_interval = 'month' THEN _int := lower(_plan.billing_interval); END IF;
    IF _billing_interval_count = 1 THEN _intc := GREATEST(1, _plan.billing_interval_count); END IF;
    IF _trial = 0 THEN _trial := _plan.trial_days; END IF;
    IF _commit = 0 THEN _commit := _plan.commitment_months; END IF;
  END IF;

  -- Still nothing? Ask the platform. No literal lives in this function.
  IF _cur IS NULL THEN
    _cur := lower(public.platform_default_currency());
  END IF;
  IF _cur IS NULL THEN
    RAISE EXCEPTION 'No currency given and the instance has no platform currency configured (site_settings.platform_locale.default_currency)';
  END IF;

  IF _pname IS NULL OR length(trim(_pname)) = 0 THEN
    RAISE EXCEPTION 'product_name is required (either directly or via plan_id)';
  END IF;

  -- Resolve amount via pricelist if still missing
  IF _amount IS NULL THEN
    IF _pid IS NULL THEN
      RAISE EXCEPTION 'unit_amount_cents is required unless product_id or plan_id supplies price';
    END IF;
    SELECT l.id, l.company_id INTO _lead
    FROM public.leads l WHERE lower(l.email) = lower(trim(_customer_email))
    ORDER BY l.created_at DESC LIMIT 1;
    SELECT r.price_cents, r.pricelist_id INTO _resolved
    FROM public.resolve_pricelist_price(_pid, _lead.id, _lead.company_id,
      GREATEST(1,_quantity)::numeric, _start_date, upper(_cur)) r;
    _amount := _resolved.price_cents;
    _pricelist := _resolved.pricelist_id;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'unit_amount_cents must be > 0';
  END IF;

  -- Trial handling
  IF _trial > 0 THEN
    _status := 'trialing'::public.subscription_status;
    _trial_start_ts := _start_date::timestamptz;
    _trial_end_ts := (_start_date + (_trial || ' days')::interval)::timestamptz;
    _first_invoice := (_start_date + (_trial || ' days')::interval)::date;
  END IF;

  -- Commitment handling
  IF _commit > 0 THEN
    _commit_end := (_start_date + (_commit || ' months')::interval)::date;
  END IF;

  INSERT INTO public.subscriptions (
    customer_email, customer_name, product_name, product_id, plan_id,
    unit_amount_cents, currency, quantity,
    billing_interval, billing_interval_count,
    payment_terms, billing_contact_email, po_number,
    provider, status,
    current_period_start, current_period_end, next_invoice_date,
    trial_start, trial_end,
    commitment_start, commitment_months, commitment_end,
    auto_finalize, metadata
  ) VALUES (
    lower(trim(_customer_email)), _customer_name, _pname, _pid, _plan_id,
    _amount, _cur, GREATEST(1, _quantity),
    _int, _intc,
    _payment_terms, _billing_contact_email, _po_number,
    'manual', _status,
    _start_date::timestamptz,
    advance_billing_date(_start_date, _int, _intc)::timestamptz,
    _first_invoice,
    _trial_start_ts, _trial_end_ts,
    CASE WHEN _commit > 0 THEN _start_date ELSE NULL END,
    NULLIF(_commit, 0),
    _commit_end,
    COALESCE(_auto_finalize, false),
    jsonb_build_object(
      'created_via', 'create_manual_subscription',
      'created_by', auth.uid(),
      'auto_finalize', COALESCE(_auto_finalize, false),
      'currency_source', _cur_source
    )
    || CASE WHEN _pricelist IS NOT NULL
         THEN jsonb_build_object('pricelist_id', _pricelist, 'price_source', 'pricelist')
         ELSE '{}'::jsonb END
    || CASE WHEN _plan_id IS NOT NULL
         THEN jsonb_build_object('plan_id', _plan_id, 'plan_name', _plan.name)
         ELSE '{}'::jsonb END
  ) RETURNING id INTO _new_id;

  PERFORM public.emit_platform_event(
    'subscription.created',
    jsonb_build_object(
      'subscription_id', _new_id,
      'provider', 'manual',
      'customer_email', _customer_email,
      'auto_finalize', COALESCE(_auto_finalize, false),
      'trialing', (_trial > 0),
      'commitment_months', _commit
    ),
    'create_manual_subscription'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'subscription_id', _new_id,
    'status', _status,
    'next_invoice_date', _first_invoice,
    'trial_end', _trial_end_ts,
    'commitment_end', _commit_end,
    'unit_amount_cents', _amount,
    'currency', _cur,
    'currency_source', _cur_source,
    'plan_id', _plan_id,
    'pricelist_id', _pricelist
  );
END $function$;

-- create_partial_match_with_variance → reconciliation. Före: OR has_role(v_uid, 'admin') OR has_role(v_uid, 'approver')) THEN
-- Lackmus: ekonomiroll med `reconciliation` → svar; roll utan reconciliation → "not authorized".
CREATE OR REPLACE FUNCTION public.create_partial_match_with_variance(p_bank_transaction_id uuid, p_entity_type text, p_entity_id uuid, p_match_cents bigint, p_variance_cents bigint DEFAULT 0, p_variance_account_code text DEFAULT NULL::text, p_variance_account_name text DEFAULT 'Öresutjämning'::text, p_bank_gl_account text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bank public.bank_transactions;
  v_je_id uuid;
  v_match_id uuid;
BEGIN
  p_variance_account_code := COALESCE(p_variance_account_code, public.account_for('rounding_variance'));
  p_bank_gl_account := COALESCE(p_bank_gl_account, public.account_for('bank'));
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(v_uid,'reconciliation')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_bank FROM public.bank_transactions WHERE id = p_bank_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank transaction not found'; END IF;

  -- If variance != 0, post a journal entry to move the variance
  IF p_variance_cents <> 0 THEN
    INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source)
    VALUES (v_bank.transaction_date,
            'Partial-match variance: ' || COALESCE(p_notes,''),
            v_bank.reference, 'posted', 'reconciliation')
    RETURNING id INTO v_je_id;

    -- Variance sign convention:
    -- positive p_variance_cents = we received less than owed (short) → debit variance account, credit AR/etc.
    -- The two lines net to zero to keep JE balanced.
    IF p_variance_cents > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_variance_account_code, p_variance_account_name, p_variance_cents, 0),
        (v_je_id, p_bank_gl_account, 'Bank', 0, p_variance_cents);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_bank_gl_account, 'Bank', -p_variance_cents, 0),
        (v_je_id, p_variance_account_code, p_variance_account_name, 0, -p_variance_cents);
    END IF;
  END IF;

  INSERT INTO public.reconciliation_matches (
    bank_transaction_id, entity_type, entity_id, amount_cents,
    match_type, notes, created_by, variance_cents, variance_account_code, variance_journal_entry_id
  ) VALUES (
    p_bank_transaction_id, p_entity_type, p_entity_id, p_match_cents,
    'manual', p_notes, v_uid, p_variance_cents, p_variance_account_code, v_je_id
  ) RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'match_id', v_match_id,
    'journal_entry_id', v_je_id,
    'variance_cents', p_variance_cents
  );
END;
$function$;

-- create_payroll_run → payroll. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.create_payroll_run(p_period_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id UUID; v_emp RECORD;
  v_base BIGINT; v_earn BIGINT; v_benefits BIGINT; v_deductions BIGINT;
  v_s_earn BIGINT; v_s_benefits BIGINT; v_s_deductions BIGINT;
  v_taxable BIGINT; v_tax BIGINT; v_social BIGINT; v_net BIGINT; v_gross BIGINT;
  v_components JSONB; v_s_components JSONB;
  v_social_pct numeric; v_adv BIGINT; v_adv_skipped BIGINT := 0;
  v_total_gross BIGINT := 0; v_total_tax BIGINT := 0; v_total_social BIGINT := 0;
  v_total_net BIGINT := 0; v_total_adv BIGINT := 0;
  v_lines INT := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;
  INSERT INTO public.payroll_runs (period_date, status)
  VALUES (date_trunc('month', p_period_date)::date, 'draft')
  RETURNING id INTO v_run_id;
  FOR v_emp IN
    SELECT id, COALESCE(monthly_salary_cents,0) AS base, COALESCE(tax_rate_pct,30.00) AS tax_pct,
           COALESCE(payroll_country,'SE') AS country, salary_structure_id
    FROM public.employees WHERE COALESCE(status,'active') = 'active'
  LOOP
    -- Country profile drives the employer social fee (SE default 31.42).
    SELECT employer_social_pct INTO v_social_pct
    FROM public.payroll_country_profiles WHERE country_code = v_emp.country;
    v_social_pct := COALESCE(v_social_pct, 31.42);

    -- Base salary: employee salary, else the assigned structure's base.
    v_base := v_emp.base;
    IF v_base = 0 AND v_emp.salary_structure_id IS NOT NULL THEN
      SELECT COALESCE(base_salary_cents, 0) INTO v_base
      FROM public.salary_structures WHERE id = v_emp.salary_structure_id AND active;
      v_base := COALESCE(v_base, 0);
    END IF;

    -- Per-employee recurring components (unchanged behaviour).
    SELECT
      COALESCE(SUM(CASE WHEN component_type IN ('salary','bonus','overtime') AND taxable THEN amount_cents ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN component_type='benefit' THEN amount_cents ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN component_type='deduction' THEN amount_cents ELSE 0 END),0),
      COALESCE(jsonb_agg(jsonb_build_object('type',component_type,'label',label,'amount_cents',amount_cents,'taxable',taxable)),'[]'::jsonb)
    INTO v_earn, v_benefits, v_deductions, v_components
    FROM (SELECT component_type, label, amount_cents, taxable FROM public.payroll_components
          WHERE employee_id = v_emp.id AND active AND recurring) c;

    -- Salary-structure components (fixed or % of base).
    v_s_earn := 0; v_s_benefits := 0; v_s_deductions := 0; v_s_components := '[]'::jsonb;
    IF v_emp.salary_structure_id IS NOT NULL THEN
      SELECT
        COALESCE(SUM(CASE WHEN component_type IN ('salary','bonus','overtime') AND taxable THEN amt ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN component_type='benefit' THEN amt ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN component_type='deduction' THEN amt ELSE 0 END),0),
        COALESCE(jsonb_agg(jsonb_build_object('type',component_type,'label',label,'amount_cents',amt,'taxable',taxable,'source','structure')),'[]'::jsonb)
      INTO v_s_earn, v_s_benefits, v_s_deductions, v_s_components
      FROM (
        SELECT component_type, label, taxable,
               CASE WHEN pct_of_base IS NOT NULL THEN ROUND(v_base * pct_of_base / 100.0)::bigint
                    ELSE amount_cents END AS amt
        FROM public.salary_structure_components sc
        JOIN public.salary_structures s ON s.id = sc.structure_id AND s.active
        WHERE sc.structure_id = v_emp.salary_structure_id
      ) sx;
    END IF;

    v_gross := COALESCE(v_base,0) + COALESCE(v_earn,0) + COALESCE(v_s_earn,0);
    v_benefits := COALESCE(v_benefits,0) + COALESCE(v_s_benefits,0);
    v_deductions := COALESCE(v_deductions,0) + COALESCE(v_s_deductions,0);
    v_components := COALESCE(v_components,'[]'::jsonb) || COALESCE(v_s_components,'[]'::jsonb);
    v_taxable := v_gross + v_benefits - v_deductions;
    v_tax := ROUND(v_taxable * v_emp.tax_pct / 100.0);
    v_social := ROUND(v_taxable * v_social_pct / 100.0);
    -- Net pay: förmåner raise the tax base but are never paid out in cash;
    -- pre-tax deductions reduce both the tax base and the payout.
    -- (v_gross - v_deductions - v_tax ≡ v_taxable - v_benefits - v_tax)
    v_net := v_gross - v_deductions - v_tax;

    -- Open salary advances are deducted from net (post-tax) and settled on approve.
    SELECT COALESCE(SUM(amount_cents),0) INTO v_adv
    FROM public.salary_advances WHERE employee_id = v_emp.id AND status = 'open';
    IF v_adv > 0 AND v_adv <= v_net THEN
      v_net := v_net - v_adv;
      v_components := v_components || jsonb_build_array(jsonb_build_object(
        'type','advance_repayment','label','Löneförskott avdrag','amount_cents',v_adv,'taxable',false));
      UPDATE public.salary_advances SET status='repaying', repayment_run_id=v_run_id, updated_at=now()
      WHERE employee_id = v_emp.id AND status = 'open';
    ELSE
      IF v_adv > 0 THEN v_adv_skipped := v_adv_skipped + v_adv; END IF;
      v_adv := 0;
    END IF;

    INSERT INTO public.payroll_lines (run_id, employee_id, gross_cents, benefits_cents, deductions_cents,
      taxable_cents, tax_cents, social_fee_cents, net_cents, components, advance_deduction_cents)
    VALUES (v_run_id, v_emp.id, v_gross, v_benefits, v_deductions, v_taxable, v_tax, v_social, v_net,
      v_components, v_adv);
    v_total_gross := v_total_gross + v_gross; v_total_tax := v_total_tax + v_tax;
    v_total_social := v_total_social + v_social; v_total_net := v_total_net + v_net;
    v_total_adv := v_total_adv + v_adv;
    v_lines := v_lines + 1;
  END LOOP;
  UPDATE public.payroll_runs
    SET total_gross_cents=v_total_gross, total_tax_cents=v_total_tax,
        total_social_fee_cents=v_total_social, total_net_cents=v_total_net,
        total_advances_cents=v_total_adv
  WHERE id = v_run_id;
  RETURN jsonb_build_object('success',true,'run_id',v_run_id,'lines',v_lines,
    'total_gross_cents',v_total_gross,'total_tax_cents',v_total_tax,
    'total_social_fee_cents',v_total_social,'total_net_cents',v_total_net,
    'total_advances_deducted_cents',v_total_adv,
    'advances_skipped_cents',v_adv_skipped);
END; $function$;

-- create_rtv → purchasing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'purchasing')) THEN
-- Lackmus: inköpare med `purchasing` → svar; roll utan purchasing → "not authorized".
CREATE OR REPLACE FUNCTION public.create_rtv(p_rma_id uuid, p_vendor_id uuid DEFAULT NULL::uuid, p_items jsonb DEFAULT '[]'::jsonb, p_expected_credit_cents bigint DEFAULT 0, p_notes text DEFAULT NULL::text)
 RETURNS return_to_vendor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.return_to_vendor;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'purchasing')) THEN
    RAISE EXCEPTION 'Only staff can create RTVs';
  END IF;
  INSERT INTO public.return_to_vendor (rma_id, vendor_id, items, expected_credit_cents, notes, created_by)
    VALUES (p_rma_id, p_vendor_id, coalesce(p_items,'[]'::jsonb), coalesce(p_expected_credit_cents,0), p_notes, auth.uid())
    RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

-- dispose_fixed_asset → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(p_asset_id uuid, p_sale_amount_cents bigint DEFAULT 0, p_disposal_date date DEFAULT CURRENT_DATE, p_proceeds_account text DEFAULT NULL::text, p_gain_account text DEFAULT NULL::text, p_loss_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets;
  v_nbv BIGINT;
  v_gain_loss BIGINT;
  v_je_id UUID;
BEGIN
  p_proceeds_account := COALESCE(p_proceeds_account, public.account_for('bank'));
  p_gain_account := COALESCE(p_gain_account, public.account_for('disposal_gain'));
  p_loss_account := COALESCE(p_loss_account, public.account_for('disposal_loss'));
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset already disposed'; END IF;

  v_nbv := v_asset.cost_cents - v_asset.accumulated_cents;
  v_gain_loss := COALESCE(p_sale_amount_cents,0) - v_nbv;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_disposal_date, format('Disposal: %s', v_asset.name), 'fixed_asset_disposal', 'posted')
    RETURNING id INTO v_je_id;

    -- Remove cost
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.asset_account, 0, v_asset.cost_cents, 'Reverse cost');
    -- Remove accumulated depreciation
    IF v_asset.accumulated_cents > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.accumulated_account, v_asset.accumulated_cents, 0, 'Reverse accum depr');
    END IF;
    -- Cash proceeds
    IF COALESCE(p_sale_amount_cents,0) > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_proceeds_account, p_sale_amount_cents, 0, 'Sale proceeds');
    END IF;
    -- Gain or loss
    IF v_gain_loss > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_gain_account, 0, v_gain_loss, 'Gain on disposal');
    ELSIF v_gain_loss < 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_loss_account, ABS(v_gain_loss), 0, 'Loss on disposal');
    END IF;
  END IF;

  UPDATE public.fixed_assets
     SET status='disposed',
         disposed_at = p_disposal_date,
         disposed_amount_cents = p_sale_amount_cents
   WHERE id = p_asset_id;

  RETURN jsonb_build_object(
    'success', true,
    'asset_id', p_asset_id,
    'nbv_cents', v_nbv,
    'sale_cents', p_sale_amount_cents,
    'gain_loss_cents', v_gain_loss,
    'journal_entry_id', v_je_id
  );
END;
$function$;

-- export_calendar_ics → calendar. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
-- Lackmus: roll med `calendar` → svar; roll utan calendar → "not authorized".
CREATE OR REPLACE FUNCTION public.export_calendar_ics(p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT (now() + '365 days'::interval), p_include_private boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ics text; v_e record; v_esc text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'calendar')) THEN
    RAISE EXCEPTION 'export_calendar_ics: staff role required';
  END IF;

  v_ics := 'BEGIN:VCALENDAR' || E'\r\n'
        || 'VERSION:2.0' || E'\r\n'
        || 'PRODID:-//FlowWink//Calendar//EN' || E'\r\n'
        || 'CALSCALE:GREGORIAN' || E'\r\n'
        || 'METHOD:PUBLISH' || E'\r\n';

  FOR v_e IN
    SELECT * FROM calendar_events
    WHERE starts_at >= p_from AND starts_at < p_to
      AND (p_include_private OR visibility <> 'private' OR created_by = auth.uid())
    ORDER BY starts_at
  LOOP
    v_ics := v_ics || 'BEGIN:VEVENT' || E'\r\n'
          || 'UID:' || v_e.id || '@flowwink' || E'\r\n'
          || 'DTSTAMP:' || to_char(COALESCE(v_e.updated_at, v_e.created_at) AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n';
    IF v_e.all_day THEN
      v_ics := v_ics || 'DTSTART;VALUE=DATE:' || to_char(v_e.starts_at AT TIME ZONE 'UTC', 'YYYYMMDD') || E'\r\n';
      IF v_e.ends_at IS NOT NULL THEN
        v_ics := v_ics || 'DTEND;VALUE=DATE:' || to_char((v_e.ends_at AT TIME ZONE 'UTC') + interval '1 day', 'YYYYMMDD') || E'\r\n';
      END IF;
    ELSE
      v_ics := v_ics || 'DTSTART:' || to_char(v_e.starts_at AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n';
      IF v_e.ends_at IS NOT NULL THEN
        v_ics := v_ics || 'DTEND:' || to_char(v_e.ends_at AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || E'\r\n';
      END IF;
    END IF;
    -- Escape per RFC 5545: backslash, semicolon, comma, newline.
    v_esc := replace(replace(replace(replace(COALESCE(v_e.title,''), '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
    v_ics := v_ics || 'SUMMARY:' || v_esc || E'\r\n';
    IF COALESCE(v_e.description, '') <> '' THEN
      v_esc := replace(replace(replace(replace(v_e.description, '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
      v_ics := v_ics || 'DESCRIPTION:' || v_esc || E'\r\n';
    END IF;
    IF COALESCE(v_e.location, '') <> '' THEN
      v_esc := replace(replace(replace(replace(v_e.location, '\', '\\'), ';', '\;'), ',', '\,'), E'\n', '\n');
      v_ics := v_ics || 'LOCATION:' || v_esc || E'\r\n';
    END IF;
    IF v_e.reminder_minutes IS NOT NULL THEN
      v_ics := v_ics || 'BEGIN:VALARM' || E'\r\n'
            || 'ACTION:DISPLAY' || E'\r\n'
            || 'DESCRIPTION:Reminder' || E'\r\n'
            || 'TRIGGER:-PT' || v_e.reminder_minutes || 'M' || E'\r\n'
            || 'END:VALARM' || E'\r\n';
    END IF;
    v_ics := v_ics || 'END:VEVENT' || E'\r\n';
  END LOOP;

  v_ics := v_ics || 'END:VCALENDAR' || E'\r\n';
  RETURN v_ics;
END; $function$;

-- export_survey_responses → surveys. Före: v_authorized boolean := (auth.role() = 'service_role') OR public.has_role(auth.uid(), 'admin');
-- Lackmus: roll med `surveys` → svar; roll utan surveys → "not authorized".
CREATE OR REPLACE FUNCTION public.export_survey_responses(p_campaign_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean := (auth.role() = 'service_role') OR can_access_module(auth.uid(),'surveys');
  v_csv text;
  v_count int;
BEGIN
  IF NOT v_authorized THEN RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); END IF;

  WITH rows AS (
    SELECT r.created_at, c.name AS campaign_name, r.recipient_email, r.score, r.category,
           r.points_earned, r.passed, r.comment, r.answers
      FROM public.survey_responses r
      JOIN public.survey_campaigns c ON c.id = r.campaign_id
     WHERE (p_campaign_id IS NULL OR r.campaign_id = p_campaign_id)
       AND (p_category IS NULL OR r.category = p_category)
       AND (p_since IS NULL OR r.created_at >= p_since)
     ORDER BY r.created_at DESC
     LIMIT 10000
  ),
  lines AS (
    SELECT 0 AS ord, 'created_at,campaign,email,score,category,points_earned,passed,comment,answers' AS line
    UNION ALL
    SELECT 1, concat_ws(',',
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      '"' || replace(COALESCE(campaign_name, ''), '"', '""') || '"',
      '"' || replace(COALESCE(recipient_email, ''), '"', '""') || '"',
      COALESCE(score::text, ''),
      COALESCE(category, ''),
      COALESCE(points_earned::text, ''),
      COALESCE(passed::text, ''),
      '"' || replace(COALESCE(comment, ''), '"', '""') || '"',
      '"' || replace(COALESCE(answers::text, ''), '"', '""') || '"'
    ) FROM rows
  )
  SELECT string_agg(line, E'\n' ORDER BY ord),
         count(*) FILTER (WHERE ord = 1)
    INTO v_csv, v_count
    FROM lines;

  RETURN jsonb_build_object('success', true, 'csv', COALESCE(v_csv, ''), 'row_count', COALESCE(v_count, 0));
END;
$function$;

-- fulfill_order_line → ecommerce. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: butiksroll med `ecommerce` → svar; roll utan ecommerce → "not authorized".
CREATE OR REPLACE FUNCTION public.fulfill_order_line(p_line_id uuid, p_qty numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line RECORD;
  v_new_fulfilled numeric;
  v_order_id uuid;
  v_remaining numeric;
  v_order_complete boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'ecommerce')) THEN
    RAISE EXCEPTION 'Requires the ecommerce module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT id, order_id, quantity, qty_fulfilled INTO v_line
  FROM order_items WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order line % not found', p_line_id; END IF;
  v_order_id := v_line.order_id;

  -- Default: fulfill the whole remaining quantity
  v_new_fulfilled := LEAST(
    v_line.quantity,
    v_line.qty_fulfilled + COALESCE(p_qty, v_line.quantity - v_line.qty_fulfilled)
  );
  IF v_new_fulfilled < 0 THEN v_new_fulfilled := 0; END IF;

  UPDATE order_items SET qty_fulfilled = v_new_fulfilled WHERE id = p_line_id;

  -- Remaining across the whole order
  SELECT COALESCE(SUM(quantity - qty_fulfilled), 0) INTO v_remaining
  FROM order_items WHERE order_id = v_order_id;
  v_order_complete := (v_remaining <= 0);

  IF v_order_complete THEN
    UPDATE orders
       SET fulfillment_status = 'shipped',
           shipped_at = COALESCE(shipped_at, now())
     WHERE id = v_order_id AND fulfillment_status <> 'delivered';
  END IF;

  RETURN jsonb_build_object(
    'line_id', p_line_id,
    'qty_fulfilled', v_new_fulfilled,
    'line_quantity', v_line.quantity,
    'line_complete', v_new_fulfilled >= v_line.quantity,
    'order_remaining', v_remaining,
    'order_fully_fulfilled', v_order_complete
  );
END;
$function$;

-- generate_contract_invoice → invoicing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
-- Lackmus: ekonomiroll med `invoicing` → svar; säljare utan invoicing → "not authorized".
CREATE OR REPLACE FUNCTION public.generate_contract_invoice(_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c public.contracts%ROWTYPE;
  _invoice_id uuid;
  _invoice_number text;
  _subtotal bigint;
  _tax bigint;
  _total bigint;
  _due_date date;
  _period_start date;
  _period_end date;
  _line jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing') OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Requires the invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT * INTO _c FROM public.contracts WHERE id = _contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract % not found', _contract_id; END IF;
  IF NOT _c.billing_enabled THEN RAISE EXCEPTION 'Contract % does not have billing enabled', _contract_id; END IF;
  IF _c.status <> 'active' THEN RAISE EXCEPTION 'Contract % is not active (status=%)', _contract_id, _c.status; END IF;
  IF _c.billing_amount_cents IS NULL OR _c.billing_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Contract % has no billing_amount_cents set', _contract_id;
  END IF;
  IF _c.billing_interval IS NULL THEN
    RAISE EXCEPTION 'Contract % has no billing_interval set', _contract_id;
  END IF;
  IF _c.billing_next_date IS NULL THEN
    RAISE EXCEPTION 'Contract % has no billing_next_date set', _contract_id;
  END IF;
  IF _c.billing_next_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Contract % not due until %', _contract_id, _c.billing_next_date;
  END IF;

  _period_start := _c.billing_next_date;
  _period_end   := public.advance_contract_billing_date(_period_start, _c.billing_interval, _c.billing_interval_count);
  _subtotal     := _c.billing_amount_cents;
  _tax          := round(_subtotal * _c.billing_tax_rate)::bigint;
  _total        := _subtotal + _tax;
  _due_date     := CURRENT_DATE + COALESCE(_c.billing_due_in_days, 30);

  _invoice_number := 'CTR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                     lpad(floor(random()*100000)::text, 5, '0');

  _line := jsonb_build_array(jsonb_build_object(
    'description', _c.title || ' (' || to_char(_period_start, 'YYYY-MM-DD') || ' → ' || to_char(_period_end, 'YYYY-MM-DD') || ')',
    'quantity', 1,
    'unit_price_cents', _subtotal,
    'total_cents', _subtotal
  ));

  INSERT INTO public.invoices (
    invoice_number, customer_email, customer_name, status, line_items,
    subtotal_cents, tax_rate, tax_cents, total_cents, currency,
    due_date, issue_date, payment_terms, notes, sent_at, contract_id
  ) VALUES (
    _invoice_number, _c.counterparty_email, _c.counterparty_name, 'sent',
    _line, _subtotal, _c.billing_tax_rate, _tax, _total, upper(_c.currency),
    _due_date, CURRENT_DATE, 'Net ' || COALESCE(_c.billing_due_in_days,30) || ' days',
    'Generated from contract ' || _c.id::text, now(), _c.id
  ) RETURNING id INTO _invoice_id;

  UPDATE public.contracts SET
    billing_next_date = _period_end,
    billing_last_invoice_id = _invoice_id,
    updated_at = now()
  WHERE id = _contract_id;

  RETURN jsonb_build_object(
    'ok', true,
    'invoice_id', _invoice_id,
    'invoice_number', _invoice_number,
    'total_cents', _total,
    'currency', upper(_c.currency),
    'next_invoice_date', _period_end
  );
END $function$;

-- generate_mo_work_orders → manufacturing. Före: v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin'));
-- Lackmus: produktionsroll med `manufacturing` → svar; roll utan manufacturing → "not authorized".
CREATE OR REPLACE FUNCTION public.generate_mo_work_orders(p_mo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role()='service_role' OR can_access_module(auth.uid(),'manufacturing'));
  v_mo RECORD; v_created int := 0; v_total_cost int := 0; v_total_min numeric := 0;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions'; END IF;
  SELECT id, bom_id, quantity INTO v_mo FROM manufacturing_orders WHERE id = p_mo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MO % not found', p_mo_id; END IF;
  IF v_mo.bom_id IS NULL THEN RAISE EXCEPTION 'MO % has no BOM to route from', p_mo_id; END IF;
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

-- generate_payroll_export → payroll. Före: IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.generate_payroll_export(p_year integer, p_month integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_export_id UUID;
  v_existing UUID;
  v_total_emp INTEGER := 0;
  v_total_days NUMERIC := 0;
  v_total_cents BIGINT := 0;
  v_row RECORD;
  v_all_leave_ids UUID[] := '{}';
  v_all_expense_ids UUID[] := '{}';
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;

  -- Reuse draft export if exists, otherwise reject if locked
  SELECT id INTO v_existing FROM public.payroll_exports
  WHERE period_year = p_year AND period_month = p_month;

  IF v_existing IS NOT NULL THEN
    -- Cannot regenerate locked exports
    IF EXISTS (SELECT 1 FROM public.payroll_exports WHERE id = v_existing AND status = 'locked') THEN
      RAISE EXCEPTION 'Payroll export for %-% is locked and cannot be regenerated', p_year, p_month;
    END IF;
    -- Clear existing lines and unlink source rows so we can rebuild
    DELETE FROM public.payroll_export_lines WHERE export_id = v_existing;
    UPDATE public.leave_requests SET payroll_export_id = NULL WHERE payroll_export_id = v_existing;
    UPDATE public.expenses SET payroll_export_id = NULL WHERE payroll_export_id = v_existing;
    v_export_id := v_existing;
  ELSE
    INSERT INTO public.payroll_exports (period_year, period_month, status, generated_by, generated_at)
    VALUES (p_year, p_month, 'generated', auth.uid(), now())
    RETURNING id INTO v_export_id;
  END IF;

  -- Insert lines from preview
  FOR v_row IN SELECT * FROM public.preview_payroll_period(p_year, p_month) LOOP
    INSERT INTO public.payroll_export_lines (
      export_id, employee_id, employee_name, employee_email, personal_number,
      vacation_days, sick_days, parental_days, other_leave_days,
      expense_reimbursement_cents, representation_cents, expense_count,
      leave_request_ids, expense_ids
    )
    VALUES (
      v_export_id, v_row.employee_id, v_row.employee_name, v_row.employee_email, v_row.personal_number,
      v_row.vacation_days, v_row.sick_days, v_row.parental_days, v_row.other_leave_days,
      v_row.expense_reimbursement_cents, v_row.representation_cents, v_row.expense_count,
      v_row.leave_request_ids, v_row.expense_ids
    );

    v_total_emp := v_total_emp + 1;
    v_total_days := v_total_days + v_row.vacation_days + v_row.sick_days + v_row.parental_days + v_row.other_leave_days;
    v_total_cents := v_total_cents + v_row.expense_reimbursement_cents + v_row.representation_cents;
    v_all_leave_ids := v_all_leave_ids || v_row.leave_request_ids;
    v_all_expense_ids := v_all_expense_ids || v_row.expense_ids;
  END LOOP;

  -- Mark source rows as exported
  IF array_length(v_all_leave_ids, 1) > 0 THEN
    UPDATE public.leave_requests SET payroll_export_id = v_export_id WHERE id = ANY(v_all_leave_ids);
  END IF;
  IF array_length(v_all_expense_ids, 1) > 0 THEN
    UPDATE public.expenses SET payroll_export_id = v_export_id WHERE id = ANY(v_all_expense_ids);
  END IF;

  -- Update totals
  UPDATE public.payroll_exports
  SET total_employees = v_total_emp,
      total_leave_days = v_total_days,
      total_expense_cents = v_total_cents,
      status = 'generated',
      generated_at = now(),
      generated_by = auth.uid()
  WHERE id = v_export_id;

  RETURN v_export_id;
END;
$function$;

-- get_depreciation_schedule → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.get_depreciation_schedule(p_asset_id uuid DEFAULT NULL::uuid, p_months integer DEFAULT 120)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_sim public.fixed_assets;
  v_assets jsonb := '[]'::jsonb; v_rows jsonb; v_period date; v_amount bigint; v_i int;
  v_estimated boolean; v_remaining bigint; v_monthly bigint; v_months_left int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'get_depreciation_schedule: staff role required';
  END IF;
  FOR v_asset IN
    SELECT * FROM public.fixed_assets
    WHERE (p_asset_id IS NULL OR id = p_asset_id) AND status <> 'disposed'
    ORDER BY name
  LOOP
    v_sim := v_asset;
    v_rows := '[]'::jsonb;
    v_period := GREATEST(date_trunc('month', CURRENT_DATE)::date, date_trunc('month', v_sim.in_service_date)::date);
    v_estimated := (v_sim.depreciation_method = 'units_of_production');
    FOR v_i IN 1..LEAST(GREATEST(p_months,1), 600) LOOP
      v_remaining := v_sim.cost_cents - v_sim.accumulated_cents - v_sim.salvage_cents;
      EXIT WHEN v_remaining <= 0;
      IF v_estimated THEN
        -- UOP: even spread over remaining life as an estimate.
        v_months_left := GREATEST(v_sim.useful_life_months - (v_i - 1), 1);
        v_monthly := CEIL(v_remaining::numeric / v_months_left);
        v_amount := LEAST(v_monthly, v_remaining);
      ELSE
        v_amount := public.compute_monthly_depreciation(v_sim, v_period);
      END IF;
      EXIT WHEN v_amount <= 0;
      v_sim.accumulated_cents := v_sim.accumulated_cents + v_amount;
      v_rows := v_rows || jsonb_build_object(
        'period', to_char(v_period, 'YYYY-MM'),
        'amount_cents', v_amount,
        'accumulated_cents', v_sim.accumulated_cents,
        'nbv_cents', v_sim.cost_cents - v_sim.accumulated_cents);
      v_period := (v_period + interval '1 month')::date;
    END LOOP;
    v_assets := v_assets || jsonb_build_object(
      'asset_id', v_asset.id, 'name', v_asset.name, 'method', v_asset.depreciation_method,
      'cost_cents', v_asset.cost_cents, 'salvage_cents', v_asset.salvage_cents,
      'accumulated_cents', v_asset.accumulated_cents,
      'nbv_cents', v_asset.cost_cents - v_asset.accumulated_cents,
      'location', v_asset.location, 'parent_asset_id', v_asset.parent_asset_id,
      'estimated', v_estimated,
      'schedule', v_rows);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'assets', v_assets, 'generated_at', now());
END; $function$;

-- get_payslip → payroll. Före: v_admin := auth.role() = 'service_role' OR has_role(auth.uid(),'admin');
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.get_payslip(p_run_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin boolean;
  v_emp public.employees%ROWTYPE;
  v_line public.payroll_lines%ROWTYPE;
  v_run public.payroll_runs%ROWTYPE;
  v_rows jsonb;
  v_ytd jsonb;
  v_employer text;
  v_social_pct numeric;
BEGIN
  v_admin := auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll');

  IF NOT v_admin THEN
    SELECT * INTO v_emp FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No employee record linked to your account'; END IF;
    IF p_employee_id IS NOT NULL AND p_employee_id <> v_emp.id THEN
      RAISE EXCEPTION 'You can only view your own payslips';
    END IF;
    p_employee_id := v_emp.id;
  ELSE
    IF p_employee_id IS NULL THEN
      RAISE EXCEPTION 'p_employee_id is required (admins must pick an employee)';
    END IF;
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Employee % not found', p_employee_id; END IF;
  END IF;

  -- No run: list available payslips for the employee.
  IF p_run_id IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'run_id', r.id, 'period', to_char(r.period_date,'YYYY-MM'), 'status', r.status,
      'gross_cents', l.gross_cents, 'net_cents', l.net_cents)
      ORDER BY r.period_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.payroll_lines l
    JOIN public.payroll_runs r ON r.id = l.run_id
    WHERE l.employee_id = p_employee_id
      AND (v_admin OR r.status IN ('approved','paid'));
    RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id,
      'employee_name', v_emp.name, 'payslips', v_rows);
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF NOT v_admin AND v_run.status NOT IN ('approved','paid') THEN
    RAISE EXCEPTION 'Payslip not available until the run is approved';
  END IF;
  SELECT * INTO v_line FROM public.payroll_lines
  WHERE run_id = p_run_id AND employee_id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No payroll line for this employee on run %', p_run_id; END IF;

  SELECT NULLIF(trim(both '"' from value::text), '') INTO v_employer
  FROM public.site_settings WHERE key = 'site_name' LIMIT 1;
  SELECT employer_social_pct INTO v_social_pct
  FROM public.payroll_country_profiles WHERE country_code = COALESCE(v_emp.payroll_country,'SE');

  SELECT jsonb_build_object(
    'gross_cents', COALESCE(SUM(l.gross_cents),0),
    'taxable_cents', COALESCE(SUM(l.taxable_cents),0),
    'tax_cents', COALESCE(SUM(l.tax_cents),0),
    'net_cents', COALESCE(SUM(l.net_cents),0),
    'pension_employee_cents', COALESCE(SUM(l.pension_employee_cents),0),
    'months', COUNT(*))
  INTO v_ytd
  FROM public.payroll_lines l
  JOIN public.payroll_runs r ON r.id = l.run_id
  WHERE l.employee_id = p_employee_id
    AND r.status IN ('approved','paid')
    AND date_trunc('year', r.period_date) = date_trunc('year', v_run.period_date)
    AND r.period_date <= v_run.period_date;

  RETURN jsonb_build_object('success', true,
    'employer', jsonb_build_object('name', COALESCE(v_employer, 'FlowWink')),
    'employee', jsonb_build_object('id', v_emp.id, 'name', v_emp.name, 'email', v_emp.email,
      'title', v_emp.title, 'department', v_emp.department,
      'payroll_country', COALESCE(v_emp.payroll_country,'SE')),
    'period', to_char(v_run.period_date,'YYYY-MM'),
    'run_id', v_run.id,
    'status', v_run.status,
    'components', v_line.components,
    'amounts', jsonb_build_object(
      'gross_cents', v_line.gross_cents,
      'benefits_cents', v_line.benefits_cents,
      'deductions_cents', v_line.deductions_cents,
      'taxable_cents', v_line.taxable_cents,
      'tax_cents', v_line.tax_cents,
      'tax_correction_cents', v_line.tax_correction_cents,
      'social_fee_cents', v_line.social_fee_cents,
      'employer_social_pct', COALESCE(v_social_pct, 31.42),
      'pension_employer_cents', v_line.pension_employer_cents,
      'pension_employee_cents', v_line.pension_employee_cents,
      'sick_days', v_line.sick_days,
      'sick_deduction_cents', v_line.sick_deduction_cents,
      'sick_pay_cents', v_line.sick_pay_cents,
      'advance_deduction_cents', v_line.advance_deduction_cents,
      'net_cents', v_line.net_cents),
    'ytd', v_ytd);
END;
$function$;

-- get_survey_analytics → surveys. Före: v_authorized boolean := (auth.role() = 'service_role') OR public.has_role(auth.uid(), 'admin');
-- Lackmus: roll med `surveys` → svar; roll utan surveys → "not authorized".
CREATE OR REPLACE FUNCTION public.get_survey_analytics(p_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_authorized boolean := (auth.role() = 'service_role') OR can_access_module(auth.uid(),'surveys');
  v_out jsonb;
BEGIN
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  WITH camps AS (
    SELECT c.id, c.name, c.template_id, t.kind, t.questions, t.pass_score
      FROM public.survey_campaigns c
      LEFT JOIN public.survey_templates t ON t.id = c.template_id
     WHERE (p_campaign_id IS NULL OR c.id = p_campaign_id)
  ),
  agg AS (
    SELECT
      c.id AS campaign_id,
      c.name AS campaign_name,
      c.kind,
      c.questions,
      c.pass_score,
      count(r.id) AS total_responses,
      count(*) FILTER (WHERE r.category = 'promoter')  AS promoters,
      count(*) FILTER (WHERE r.category = 'passive')   AS passives,
      count(*) FILTER (WHERE r.category = 'detractor') AS detractors,
      round((100.0 * (count(*) FILTER (WHERE r.category = 'promoter') - count(*) FILTER (WHERE r.category = 'detractor')))
            / NULLIF(count(r.id), 0), 1) AS nps_score,
      round(avg(r.score), 2) AS avg_score,
      round(avg(r.points_earned), 2) AS avg_points,
      count(*) FILTER (WHERE r.passed IS TRUE)  AS passed_count,
      count(*) FILTER (WHERE r.passed IS FALSE) AS failed_count,
      coalesce(jsonb_agg(r.answers) FILTER (WHERE r.answers IS NOT NULL AND r.answers <> '{}'::jsonb), '[]'::jsonb) AS all_answers
    FROM camps c
    LEFT JOIN public.survey_responses r ON r.campaign_id = c.id
    GROUP BY c.id, c.name, c.kind, c.questions, c.pass_score
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'campaign_id', agg.campaign_id,
      'campaign_name', agg.campaign_name,
      'kind', agg.kind,
      'pass_score', agg.pass_score,
      'total_responses', agg.total_responses,
      'promoters', agg.promoters,
      'passives', agg.passives,
      'detractors', agg.detractors,
      'nps_score', agg.nps_score,
      'avg_score', agg.avg_score,
      'avg_points', agg.avg_points,
      'passed_count', agg.passed_count,
      'failed_count', agg.failed_count,
      'per_question', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', q->>'id',
          'label', q->>'label',
          'type', q->>'type',
          'response_count', (SELECT count(*) FROM jsonb_array_elements(agg.all_answers) a WHERE (a -> (q->>'id')) IS NOT NULL),
          'distribution', (
            SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM (
              SELECT (a -> (q->>'id'))::text AS k, count(*) AS v
                FROM jsonb_array_elements(agg.all_answers) a
               WHERE (a -> (q->>'id')) IS NOT NULL
               GROUP BY 1
            ) s
          )
        )), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(agg.questions, '[]'::jsonb)) q
      )
    )
  ) INTO v_out FROM agg;

  RETURN jsonb_build_object('success', true, 'campaigns', COALESCE(v_out, '[]'::jsonb));
END;
$function$;

-- inspect_return → returns. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: support med `returns` → svar; roll utan returns → "not authorized".
CREATE OR REPLACE FUNCTION public.inspect_return(p_return_id uuid, p_notes text DEFAULT NULL::text, p_restocking_fee_cents bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gross bigint;
  v_already bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Requires the returns module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_restocking_fee_cents IS NOT NULL THEN
    IF p_restocking_fee_cents < 0 THEN
      RAISE EXCEPTION 'restocking_fee_cents must not be negative';
    END IF;

    SELECT COALESCE(SUM(quantity * unit_refund_cents), 0) INTO v_gross
      FROM return_items WHERE return_id = p_return_id;
    SELECT COALESCE(refund_amount_cents, 0) INTO v_already
      FROM returns WHERE id = p_return_id;

    -- A fee is a deduction from a payout that may already have started. If it
    -- deducts past what was paid, the RMA can never be reconciled: refund_return
    -- would reject every remaining call and the return stays open forever.
    IF v_gross - p_restocking_fee_cents < v_already THEN
      RAISE EXCEPTION 'Restocking fee % would drop the expected refund total to % (lines % − fee %), below the % already refunded on this RMA — lower the fee to at most %',
        p_restocking_fee_cents,
        v_gross - p_restocking_fee_cents,
        v_gross,
        p_restocking_fee_cents,
        v_already,
        GREATEST(v_gross - v_already, 0);
    END IF;
  END IF;

  UPDATE returns
     SET inspected_at = now(),
         inspection_notes = COALESCE(p_notes, inspection_notes),
         restocking_fee_cents = COALESCE(p_restocking_fee_cents, restocking_fee_cents)
   WHERE id = p_return_id AND status = 'received';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found or not in received state', p_return_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'inspected', true);
END $function$;

-- kb_article_history → knowledgeBase. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: roll med `knowledgeBase` → svar; roll utan knowledgeBase → "not authorized".
CREATE OR REPLACE FUNCTION public.kb_article_history(p_action text, p_slug text DEFAULT NULL::text, p_article_id uuid DEFAULT NULL::uuid, p_revision_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rev public.kb_article_revisions;
  v_rows jsonb;
  v_cat uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'knowledgeBase')) THEN
    RAISE EXCEPTION 'Requires the knowledgeBase module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'list' THEN
    IF p_slug IS NULL AND p_article_id IS NULL THEN
      RAISE EXCEPTION 'list requires p_slug or p_article_id';
    END IF;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.revision_no DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, article_id, slug, title, question, revision_no, action, edited_by, revised_at,
             length(COALESCE(answer_text, '')) AS answer_length
      FROM public.kb_article_revisions
      WHERE (p_article_id IS NOT NULL AND article_id = p_article_id)
         OR (p_article_id IS NULL AND slug = p_slug)
      ORDER BY revision_no DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    ) r;
    RETURN jsonb_build_object('success', true, 'revisions', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'get requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.kb_article_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev));

  ELSIF p_action = 'restore' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.kb_article_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    UPDATE public.kb_articles
      SET title = v_rev.title, question = v_rev.question, answer_json = v_rev.answer_json,
          answer_text = v_rev.answer_text, updated_at = now(), updated_by = auth.uid()
      WHERE id = v_rev.article_id;
    IF NOT FOUND THEN
      -- Article was deleted — recreate it (fall back to any category if the original is gone).
      SELECT id INTO v_cat FROM public.kb_categories WHERE id = v_rev.category_id;
      IF v_cat IS NULL THEN
        SELECT id INTO v_cat FROM public.kb_categories ORDER BY created_at LIMIT 1;
      END IF;
      IF v_cat IS NULL THEN
        RAISE EXCEPTION 'Cannot restore: no KB categories exist';
      END IF;
      INSERT INTO public.kb_articles
        (id, category_id, title, slug, question, answer_json, answer_text, is_published, created_by, updated_by)
      VALUES (v_rev.article_id, v_cat, v_rev.title, v_rev.slug, v_rev.question,
              v_rev.answer_json, v_rev.answer_text, false, auth.uid(), auth.uid());
    END IF;
    RETURN jsonb_build_object('success', true, 'slug', v_rev.slug,
      'restored_revision_no', v_rev.revision_no);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|get|restore', p_action;
  END IF;
END;
$function$;

-- kb_feedback_report → knowledgeBase. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: roll med `knowledgeBase` → svar; roll utan knowledgeBase → "not authorized".
CREATE OR REPLACE FUNCTION public.kb_feedback_report(p_action text DEFAULT 'report'::text, p_slug text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_article public.kb_articles;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'knowledgeBase')) THEN
    RAISE EXCEPTION 'Requires the knowledgeBase module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'report' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'slug', slug, 'title', title,
        'positive', positive_feedback_count, 'negative', negative_feedback_count,
        'total', positive_feedback_count + negative_feedback_count,
        'negative_ratio', CASE WHEN positive_feedback_count + negative_feedback_count > 0
          THEN round(negative_feedback_count::numeric
                     / (positive_feedback_count + negative_feedback_count), 2) END,
        'needs_improvement', needs_improvement,
        'views', views_count, 'is_published', is_published) AS r
      FROM public.kb_articles
      WHERE positive_feedback_count + negative_feedback_count > 0
      ORDER BY needs_improvement DESC,
               (CASE WHEN positive_feedback_count + negative_feedback_count > 0
                     THEN negative_feedback_count::numeric
                          / (positive_feedback_count + negative_feedback_count) ELSE 0 END) DESC,
               negative_feedback_count DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) t;
    RETURN jsonb_build_object('success', true, 'articles', v_rows,
      'totals', (SELECT jsonb_build_object(
        'articles_with_feedback', count(*) FILTER (WHERE positive_feedback_count + negative_feedback_count > 0),
        'flagged_needs_improvement', count(*) FILTER (WHERE needs_improvement),
        'total_positive', COALESCE(sum(positive_feedback_count), 0),
        'total_negative', COALESCE(sum(negative_feedback_count), 0))
        FROM public.kb_articles));

  ELSIF p_action = 'list_flagged' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'slug', slug, 'title', title, 'positive', positive_feedback_count,
      'negative', negative_feedback_count, 'views', views_count)
      ORDER BY negative_feedback_count DESC), '[]'::jsonb) INTO v_rows
    FROM public.kb_articles WHERE needs_improvement;
    RETURN jsonb_build_object('success', true, 'flagged', v_rows);

  ELSIF p_action = 'clear_flag' THEN
    IF p_slug IS NULL THEN RAISE EXCEPTION 'clear_flag requires p_slug'; END IF;
    UPDATE public.kb_articles SET needs_improvement = false, updated_at = now()
      WHERE slug = p_slug RETURNING * INTO v_article;
    IF v_article.id IS NULL THEN RAISE EXCEPTION 'Article % not found', p_slug; END IF;
    RETURN jsonb_build_object('success', true, 'slug', p_slug, 'needs_improvement', false);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use report|list_flagged|clear_flag', p_action;
  END IF;
END;
$function$;

-- link_service_order → fieldService. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.link_service_order(p_order_id uuid, p_contract_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_deal_id uuid DEFAULT NULL::uuid, p_unlink text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.service_orders%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- list_payroll_runs → payroll. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'Admin only'; END IF;
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.list_payroll_runs(p_limit integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows JSONB;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.period_date DESC),'[]'::jsonb) INTO v_rows
  FROM (SELECT * FROM public.payroll_runs ORDER BY period_date DESC LIMIT p_limit) r;
  RETURN jsonb_build_object('success',true,'runs',v_rows);
END; $function$;

-- lock_payroll_export → payroll. Före: IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.lock_payroll_export(p_export_id uuid)
 RETURNS payroll_exports
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.payroll_exports;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;
  UPDATE public.payroll_exports
  SET status = 'locked', locked_at = now()
  WHERE id = p_export_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

-- manage_approval_chain → approvals. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: roll med `approvals` → svar; roll utan approvals → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_approval_chain(p_action text, p_chain_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_steps jsonb DEFAULT NULL::jsonb, p_group_id uuid DEFAULT NULL::uuid, p_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'approvals'));
  v_chain_id uuid;
  v_step jsonb;
  v_idx int := 0;
  v_result jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN
    RAISE EXCEPTION 'Requires the approvals module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'entity_type', c.entity_type, 'is_active', c.is_active,
      'steps', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                  'sort_order', s.sort_order, 'required_role', s.required_role,
                  'group_id', s.group_id, 'min_approvals', s.min_approvals) ORDER BY s.sort_order), '[]'::jsonb)
                FROM approval_steps s WHERE s.chain_id = c.id)
    ) ORDER BY c.name), '[]'::jsonb) INTO v_result
    FROM approval_chains c
    WHERE p_entity_type IS NULL OR c.entity_type = p_entity_type;
    RETURN jsonb_build_object('success', true, 'chains', v_result);

  ELSIF p_action = 'create_chain' THEN
    IF p_name IS NULL OR p_entity_type IS NULL THEN RAISE EXCEPTION 'name and entity_type required'; END IF;
    INSERT INTO approval_chains (name, entity_type) VALUES (p_name, p_entity_type) RETURNING id INTO v_chain_id;
    -- optional inline steps: [{sort_order, required_role|group_id, min_approvals}]
    IF p_steps IS NOT NULL THEN
      FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
        v_idx := v_idx + 1;
        INSERT INTO approval_steps (chain_id, sort_order, required_role, group_id, min_approvals)
        VALUES (v_chain_id,
                COALESCE((v_step->>'sort_order')::int, v_idx * 10),
                NULLIF(v_step->>'required_role','')::app_role,
                NULLIF(v_step->>'group_id','')::uuid,
                COALESCE((v_step->>'min_approvals')::int, 1));
      END LOOP;
    END IF;
    RETURN jsonb_build_object('success', true, 'chain_id', v_chain_id);

  ELSIF p_action = 'delete_chain' THEN
    IF p_chain_id IS NULL THEN RAISE EXCEPTION 'chain_id required'; END IF;
    DELETE FROM approval_chains WHERE id = p_chain_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_chain_id);

  ELSIF p_action = 'create_group' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name required'; END IF;
    INSERT INTO approval_groups (name) VALUES (p_name) RETURNING id INTO v_chain_id;
    IF p_user_ids IS NOT NULL THEN
      INSERT INTO approval_group_members (group_id, user_id)
      SELECT v_chain_id, unnest(p_user_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'group_id', v_chain_id);

  ELSIF p_action = 'set_group_members' THEN
    IF p_group_id IS NULL THEN RAISE EXCEPTION 'group_id required'; END IF;
    DELETE FROM approval_group_members WHERE group_id = p_group_id;
    IF p_user_ids IS NOT NULL THEN
      INSERT INTO approval_group_members (group_id, user_id)
      SELECT p_group_id, unnest(p_user_ids) ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'group_id', p_group_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create_chain|delete_chain|create_group|set_group_members', p_action;
  END IF;
END;
$function$;

-- manage_budget → accounting. Före: DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')); v_id uuid;
-- Lackmus: ekonomiroll med `accounting` → svar; roll utan accounting → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_budget(p_action text, p_budget_id uuid DEFAULT NULL::uuid, p_account_code text DEFAULT NULL::text, p_fiscal_year integer DEFAULT NULL::integer, p_period_month integer DEFAULT NULL::integer, p_amount_cents bigint DEFAULT NULL::bigint, p_currency text DEFAULT 'SEK'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'accounting')); v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'budgets', (
      SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.account_code, b.period_month NULLS FIRST), '[]'::jsonb)
      FROM budgets b WHERE p_fiscal_year IS NULL OR b.fiscal_year = p_fiscal_year));
  ELSIF p_action = 'upsert' THEN
    IF p_account_code IS NULL OR p_fiscal_year IS NULL OR p_amount_cents IS NULL THEN
      RAISE EXCEPTION 'account_code, fiscal_year, amount_cents required'; END IF;
    INSERT INTO budgets (account_code, fiscal_year, period_month, amount_cents, currency, notes, created_by)
    VALUES (p_account_code, p_fiscal_year, p_period_month, p_amount_cents, COALESCE(p_currency,'SEK'), p_notes, auth.uid())
    ON CONFLICT (account_code, fiscal_year, (COALESCE(period_month, -1)))
    DO UPDATE SET amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency, notes = EXCLUDED.notes, updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'budget_id', v_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM budgets WHERE id = p_budget_id; RETURN jsonb_build_object('success', true, 'deleted', p_budget_id);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $function$;

-- manage_business_hours → sla. Före: DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: support med `sla` → svar; roll utan sla → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_business_hours(p_action text, p_weekday integer DEFAULT NULL::integer, p_open_time time without time zone DEFAULT NULL::time without time zone, p_close_time time without time zone DEFAULT NULL::time without time zone, p_is_open boolean DEFAULT NULL::boolean, p_holiday date DEFAULT NULL::date, p_holiday_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'sla'));
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Requires the sla module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true,
      'hours', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.weekday, b.open_time), '[]'::jsonb) FROM business_hours b),
      'holidays', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.day), '[]'::jsonb) FROM business_holidays h));
  ELSIF p_action = 'set_hours' THEN
    IF p_weekday IS NULL OR p_open_time IS NULL OR p_close_time IS NULL THEN
      RAISE EXCEPTION 'weekday, open_time, close_time required'; END IF;
    INSERT INTO business_hours (weekday, open_time, close_time, is_open)
    VALUES (p_weekday, p_open_time, p_close_time, COALESCE(p_is_open, true))
    ON CONFLICT (weekday, open_time) DO UPDATE SET close_time = EXCLUDED.close_time, is_open = EXCLUDED.is_open;
    RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'clear_day' THEN
    DELETE FROM business_hours WHERE weekday = p_weekday; RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'add_holiday' THEN
    INSERT INTO business_holidays (day, name) VALUES (p_holiday, p_holiday_name)
    ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name; RETURN jsonb_build_object('success', true);
  ELSIF p_action = 'remove_holiday' THEN
    DELETE FROM business_holidays WHERE day = p_holiday; RETURN jsonb_build_object('success', true);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $function$;

-- manage_calendar_event → calendar. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: roll med `calendar` → svar; roll utan calendar → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_calendar_event(p_action text, p_event_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_all_day boolean DEFAULT NULL::boolean, p_location text DEFAULT NULL::text, p_attendees jsonb DEFAULT NULL::jsonb, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_visibility text DEFAULT NULL::text, p_reminder_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'calendar'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_visibility IS NOT NULL AND p_visibility NOT IN ('private','team','public') THEN
    RAISE EXCEPTION 'visibility must be private|team|public';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.starts_at), '[]'::jsonb) INTO v_rows
    FROM calendar_events e
    WHERE e.starts_at >= COALESCE(p_from, now() - interval '7 days')
      AND e.starts_at <  COALESCE(p_to, now() + interval '30 days')
      AND (e.visibility <> 'private' OR e.created_by = auth.uid() OR v_writer);
    RETURN jsonb_build_object('success', true, 'events', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the calendar module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'create' THEN
    IF p_title IS NULL OR p_starts_at IS NULL THEN
      RAISE EXCEPTION 'title and starts_at are required';
    END IF;
    INSERT INTO calendar_events (title, description, starts_at, ends_at, all_day, location, attendees, created_by, visibility, reminder_minutes)
    VALUES (p_title, p_description, p_starts_at, p_ends_at, COALESCE(p_all_day,false), p_location, COALESCE(p_attendees,'[]'::jsonb), auth.uid(),
            COALESCE(p_visibility, 'team'), p_reminder_minutes)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'event_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id is required'; END IF;
    UPDATE calendar_events SET
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      starts_at = COALESCE(p_starts_at, starts_at),
      ends_at = COALESCE(p_ends_at, ends_at),
      all_day = COALESCE(p_all_day, all_day),
      location = COALESCE(p_location, location),
      attendees = COALESCE(p_attendees, attendees),
      visibility = COALESCE(p_visibility, visibility),
      reminder_minutes = COALESCE(p_reminder_minutes, reminder_minutes),
      -- Re-arm the reminder when the start time moves.
      reminder_sent_at = CASE WHEN p_starts_at IS NOT NULL AND p_starts_at <> starts_at THEN NULL ELSE reminder_sent_at END
    WHERE id = p_event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Event % not found', p_event_id; END IF;
    RETURN jsonb_build_object('success', true, 'event_id', p_event_id);
  ELSIF p_action = 'delete' THEN
    IF p_event_id IS NULL THEN RAISE EXCEPTION 'event_id is required'; END IF;
    DELETE FROM calendar_events WHERE id = p_event_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_event_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END $function$;

-- manage_consent → leads. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: säljare med `leads` → svar; roll utan leads → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_consent(p_action text, p_email text DEFAULT NULL::text, p_consent_type text DEFAULT 'marketing_email'::text, p_source text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.contact_consents;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'leads')) THEN
    RAISE EXCEPTION 'Requires the leads module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action IN ('grant', 'revoke') THEN
    IF p_email IS NULL THEN RAISE EXCEPTION '% requires p_email', p_action; END IF;
    INSERT INTO public.contact_consents (email, consent_type, status, source, note, actor)
    VALUES (lower(p_email), p_consent_type,
            CASE WHEN p_action = 'grant' THEN 'granted' ELSE 'revoked' END,
            COALESCE(p_source, 'admin'), p_note, auth.uid())
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'consent', to_jsonb(v_row));

  ELSIF p_action = 'check' THEN
    IF p_email IS NULL THEN RAISE EXCEPTION 'check requires p_email'; END IF;
    SELECT COALESCE(jsonb_object_agg(t.consent_type, public.fw_consent_state(p_email, t.consent_type)), '{}'::jsonb)
      INTO v_rows
    FROM (VALUES ('marketing_email'), ('newsletter'), ('sms'), ('profiling'), ('analytics')) AS t(consent_type);
    RETURN jsonb_build_object('success', true, 'email', lower(p_email), 'consents', v_rows,
      'newsletter_unsubscribed', EXISTS (
        SELECT 1 FROM public.newsletter_subscribers
        WHERE lower(email) = lower(p_email) AND status = 'unsubscribed'));

  ELSIF p_action = 'history' THEN
    IF p_email IS NULL THEN RAISE EXCEPTION 'history requires p_email'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.occurred_at DESC), '[]'::jsonb) INTO v_rows
    FROM (SELECT * FROM public.contact_consents WHERE lower(email) = lower(p_email)
          ORDER BY occurred_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) c;
    RETURN jsonb_build_object('success', true, 'history', v_rows);

  ELSIF p_action = 'list' THEN
    -- Current state per email+type (latest event wins)
    SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT DISTINCT ON (lower(email), consent_type)
             lower(email) AS email, consent_type, status, source, occurred_at
      FROM public.contact_consents
      ORDER BY lower(email), consent_type, occurred_at DESC, created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000)
    ) x;
    RETURN jsonb_build_object('success', true, 'consents', v_rows);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use grant|revoke|check|history|list', p_action;
  END IF;
END;
$function$;

-- manage_consultant_assignment → consultants. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: roll med `consultants` → svar; roll utan consultants → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_consultant_assignment(p_action text, p_assignment_id uuid DEFAULT NULL::uuid, p_consultant_id uuid DEFAULT NULL::uuid, p_client_name text DEFAULT NULL::text, p_company_id uuid DEFAULT NULL::uuid, p_contract_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_role_title text DEFAULT NULL::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_allocation_pct integer DEFAULT NULL::integer, p_hourly_rate_cents integer DEFAULT NULL::integer, p_currency text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_sow_url text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_rows jsonb;
  v_asg public.consultant_assignments%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'consultants')) THEN
    RAISE EXCEPTION 'Only staff can manage consultant assignments';
  END IF;

  IF p_action = 'create' THEN
    IF p_consultant_id IS NULL OR p_client_name IS NULL THEN
      RAISE EXCEPTION 'consultant_id and client_name are required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.consultant_profiles WHERE id = p_consultant_id) THEN
      RAISE EXCEPTION 'Consultant % not found', p_consultant_id;
    END IF;
    IF p_contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id) THEN
      RAISE EXCEPTION 'Contract % not found', p_contract_id;
    END IF;
    INSERT INTO public.consultant_assignments
      (consultant_id, client_name, company_id, contract_id, project_id, role_title,
       start_date, end_date, allocation_pct, hourly_rate_cents, currency, status,
       sow_url, notes, created_by)
    VALUES
      (p_consultant_id, p_client_name, p_company_id, p_contract_id, p_project_id, p_role_title,
       COALESCE(p_start_date, CURRENT_DATE), p_end_date, COALESCE(p_allocation_pct, 100),
       COALESCE(p_hourly_rate_cents, (SELECT hourly_rate_cents FROM public.consultant_profiles WHERE id = p_consultant_id)),
       COALESCE(p_currency, 'SEK'), COALESCE(p_status, 'active'), p_sow_url, p_notes, auth.uid())
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'assignment_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_assignment_id IS NULL THEN RAISE EXCEPTION 'assignment_id is required'; END IF;
    IF p_contract_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id) THEN
      RAISE EXCEPTION 'Contract % not found', p_contract_id;
    END IF;
    UPDATE public.consultant_assignments
       SET client_name = COALESCE(p_client_name, client_name),
           company_id = COALESCE(p_company_id, company_id),
           contract_id = COALESCE(p_contract_id, contract_id),
           project_id = COALESCE(p_project_id, project_id),
           role_title = COALESCE(p_role_title, role_title),
           start_date = COALESCE(p_start_date, start_date),
           end_date = COALESCE(p_end_date, end_date),
           allocation_pct = COALESCE(p_allocation_pct, allocation_pct),
           hourly_rate_cents = COALESCE(p_hourly_rate_cents, hourly_rate_cents),
           currency = COALESCE(p_currency, currency),
           status = COALESCE(p_status, status),
           sow_url = COALESCE(p_sow_url, sow_url),
           notes = COALESCE(p_notes, notes),
           updated_at = now()
     WHERE id = p_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;
    RETURN jsonb_build_object('success', true, 'assignment_id', p_assignment_id);

  ELSIF p_action = 'end' THEN
    IF p_assignment_id IS NULL THEN RAISE EXCEPTION 'assignment_id is required'; END IF;
    UPDATE public.consultant_assignments
       SET status = 'ended', end_date = COALESCE(p_end_date, CURRENT_DATE), updated_at = now()
     WHERE id = p_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;
    RETURN jsonb_build_object('success', true, 'assignment_id', p_assignment_id, 'status', 'ended');

  ELSIF p_action = 'get' THEN
    IF p_assignment_id IS NULL THEN RAISE EXCEPTION 'assignment_id is required'; END IF;
    SELECT * INTO v_asg FROM public.consultant_assignments WHERE id = p_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Assignment % not found', p_assignment_id; END IF;
    RETURN jsonb_build_object('success', true, 'assignment', to_jsonb(v_asg),
      'consultant_name', (SELECT name FROM public.consultant_profiles WHERE id = v_asg.consultant_id),
      'contract_title', (SELECT title FROM public.contracts WHERE id = v_asg.contract_id));

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id, 'consultant_id', a.consultant_id,
        'consultant_name', cp.name,
        'client_name', a.client_name, 'role_title', a.role_title,
        'contract_id', a.contract_id,
        'contract_title', (SELECT title FROM public.contracts WHERE id = a.contract_id),
        'start_date', a.start_date, 'end_date', a.end_date,
        'allocation_pct', a.allocation_pct, 'hourly_rate_cents', a.hourly_rate_cents,
        'currency', a.currency, 'status', a.status, 'sow_url', a.sow_url
      ) ORDER BY a.start_date DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.consultant_assignments a
    JOIN public.consultant_profiles cp ON cp.id = a.consultant_id
    WHERE (p_consultant_id IS NULL OR a.consultant_id = p_consultant_id)
      AND (p_status IS NULL OR a.status = p_status);
    RETURN jsonb_build_object('success', true, 'assignments', v_rows);

  ELSE
    RAISE EXCEPTION 'action must be create | update | end | get | list (got %)', p_action;
  END IF;
END;
$function$;

-- manage_consultant_rates → consultants. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: roll med `consultants` → svar; roll utan consultants → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_consultant_rates(p_action text, p_consultant_id uuid DEFAULT NULL::uuid, p_skill text DEFAULT NULL::text, p_level text DEFAULT NULL::text, p_hourly_rate_cents integer DEFAULT NULL::integer, p_currency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'consultants')) THEN
    RAISE EXCEPTION 'Only staff can manage consultant rates';
  END IF;

  IF p_action = 'set' THEN
    IF p_consultant_id IS NULL OR p_skill IS NULL OR p_hourly_rate_cents IS NULL THEN
      RAISE EXCEPTION 'consultant_id, skill and hourly_rate_cents are required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.consultant_profiles WHERE id = p_consultant_id) THEN
      RAISE EXCEPTION 'Consultant % not found', p_consultant_id;
    END IF;
    INSERT INTO public.consultant_skill_rates (consultant_id, skill, level, hourly_rate_cents, currency)
    VALUES (p_consultant_id, p_skill, p_level, p_hourly_rate_cents, COALESCE(p_currency,'SEK'))
    ON CONFLICT (consultant_id, skill)
    DO UPDATE SET level = COALESCE(EXCLUDED.level, consultant_skill_rates.level),
                  hourly_rate_cents = EXCLUDED.hourly_rate_cents,
                  currency = EXCLUDED.currency,
                  updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rate_id', v_id,
      'consultant_id', p_consultant_id, 'skill', p_skill, 'hourly_rate_cents', p_hourly_rate_cents);

  ELSIF p_action = 'delete' THEN
    IF p_consultant_id IS NULL OR p_skill IS NULL THEN
      RAISE EXCEPTION 'consultant_id and skill are required';
    END IF;
    DELETE FROM public.consultant_skill_rates
     WHERE consultant_id = p_consultant_id AND skill = p_skill;
    IF NOT FOUND THEN RAISE EXCEPTION 'No rate for consultant % / skill %', p_consultant_id, p_skill; END IF;
    RETURN jsonb_build_object('success', true, 'deleted', p_skill);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.skill), '[]'::jsonb) INTO v_rows
    FROM public.consultant_skill_rates r
    WHERE (p_consultant_id IS NULL OR r.consultant_id = p_consultant_id);
    RETURN jsonb_build_object('success', true, 'rates', v_rows);

  ELSIF p_action = 'matrix' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'consultant_id', cp.id,
        'consultant_name', cp.name,
        'default_hourly_rate_cents', cp.hourly_rate_cents,
        'currency', COALESCE(cp.currency, 'SEK'),
        'rates', COALESCE((
          SELECT jsonb_object_agg(r.skill, r.hourly_rate_cents)
          FROM public.consultant_skill_rates r WHERE r.consultant_id = cp.id
        ), '{}'::jsonb)
      ) ORDER BY cp.name), '[]'::jsonb)
    INTO v_rows
    FROM public.consultant_profiles cp
    WHERE cp.is_active;
    RETURN jsonb_build_object('success', true,
      'skills', (SELECT COALESCE(jsonb_agg(DISTINCT skill), '[]'::jsonb) FROM public.consultant_skill_rates),
      'matrix', v_rows);

  ELSE
    RAISE EXCEPTION 'action must be set | delete | list | matrix (got %)', p_action;
  END IF;
END;
$function$;

-- manage_equipment → maintenance. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: roll med `maintenance` → svar; roll utan maintenance → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_equipment(p_action text, p_equipment_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_serial_number text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'maintenance'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.name), '[]'::jsonb) INTO v_rows
    FROM equipment e WHERE p_status IS NULL OR e.status = p_status;
    RETURN jsonb_build_object('success', true, 'equipment', v_rows);
  END IF;
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the maintenance module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    INSERT INTO equipment (name, serial_number, category, location, status, notes)
    VALUES (p_name, p_serial_number, p_category, p_location, COALESCE(p_status,'operational'), p_notes)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'equipment_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_equipment_id IS NULL THEN RAISE EXCEPTION 'equipment_id required'; END IF;
    UPDATE equipment SET
      name = COALESCE(p_name, name), serial_number = COALESCE(p_serial_number, serial_number),
      category = COALESCE(p_category, category), location = COALESCE(p_location, location),
      status = COALESCE(p_status, status), notes = COALESCE(p_notes, notes)
    WHERE id = p_equipment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Equipment % not found', p_equipment_id; END IF;
    RETURN jsonb_build_object('success', true, 'equipment_id', p_equipment_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $function$;

-- manage_expense_policy → expenses. Före: DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')); v_id uuid;
-- Lackmus: roll med `expenses` → svar; roll utan expenses → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_expense_policy(p_action text, p_policy_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_max_amount_cents bigint DEFAULT NULL::bigint, p_requires_receipt boolean DEFAULT NULL::boolean, p_requires_approval_over_cents bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'expenses')); v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Requires the expenses module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'policies',
      (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.category), '[]'::jsonb) FROM expense_policies p));
  ELSIF p_action = 'upsert' THEN
    IF p_category IS NULL THEN RAISE EXCEPTION 'category required'; END IF;
    INSERT INTO expense_policies (category, max_amount_cents, requires_receipt, requires_approval_over_cents)
    VALUES (p_category, p_max_amount_cents, COALESCE(p_requires_receipt,false), p_requires_approval_over_cents)
    ON CONFLICT (category) DO UPDATE SET
      max_amount_cents = EXCLUDED.max_amount_cents,
      requires_receipt = EXCLUDED.requires_receipt,
      requires_approval_over_cents = EXCLUDED.requires_approval_over_cents, updated_at = now()
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'policy_id', v_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM expense_policies WHERE id = p_policy_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_policy_id);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $function$;

-- manage_gift_card → pos. Före: DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb; v_gc RECORD;
-- Lackmus: kassabiträde med `pos` i Role Permissions → svar; kundkonto utan pos → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_gift_card(p_action text, p_code text DEFAULT NULL::text, p_amount_cents integer DEFAULT NULL::integer, p_currency text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role()='service_role' OR can_access_module(auth.uid(),'pos')); v_id uuid; v_res jsonb; v_gc RECORD;
BEGIN
  IF p_action IN ('issue','deactivate') AND NOT v_writer THEN RAISE EXCEPTION 'Requires the pos module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action='issue' THEN
    IF p_code IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'code and positive amount_cents required'; END IF;
    INSERT INTO gift_cards(code, initial_balance_cents, balance_cents, currency)
      VALUES (p_code, p_amount_cents, p_amount_cents, COALESCE(p_currency,'SEK')) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'gift_card_id',v_id,'balance_cents',p_amount_cents);
  ELSIF p_action='get' THEN
    SELECT * INTO v_gc FROM gift_cards WHERE code = p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success',true,'gift_card',to_jsonb(v_gc));
  ELSIF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.created_at DESC),'[]'::jsonb) INTO v_res FROM gift_cards g;
    RETURN jsonb_build_object('success',true,'gift_cards',v_res);
  ELSIF p_action='deactivate' THEN
    UPDATE gift_cards SET is_active=false WHERE code=p_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'Gift card % not found', p_code; END IF;
    RETURN jsonb_build_object('success',true,'code',p_code,'is_active',false);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use issue|get|list|deactivate', p_action; END IF;
END; $function$;

-- manage_inventory_count → inventory. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_inventory_count(p_action text, p_count_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid, p_product_id uuid DEFAULT NULL::uuid, p_lot_id uuid DEFAULT NULL::uuid, p_counted_qty numeric DEFAULT NULL::numeric, p_line_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'));
  v_id uuid; v_sys numeric; v_status text; v_line RECORD; v_applied int := 0;
BEGIN
  IF p_action <> 'list' AND p_action <> 'get' AND NOT v_writer THEN
    RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'create' THEN
    IF p_location_id IS NULL THEN RAISE EXCEPTION 'location_id required'; END IF;
    INSERT INTO inventory_counts (location_id, notes, created_by)
    VALUES (p_location_id, p_notes, auth.uid()) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'count_id', v_id);
  ELSIF p_action = 'add_line' THEN
    IF p_count_id IS NULL OR p_product_id IS NULL THEN RAISE EXCEPTION 'count_id and product_id required'; END IF;
    SELECT location_id, status INTO p_location_id, v_status FROM inventory_counts WHERE id = p_count_id;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Count % is not draft', p_count_id; END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO v_sys FROM stock_quants
      WHERE product_id = p_product_id AND location_id = p_location_id
        AND (p_lot_id IS NULL OR lot_id = p_lot_id);
    INSERT INTO inventory_count_lines (count_id, product_id, lot_id, system_qty, counted_qty)
    VALUES (p_count_id, p_product_id, p_lot_id, v_sys, COALESCE(p_counted_qty, v_sys))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'line_id', v_id, 'system_qty', v_sys);
  ELSIF p_action = 'set_count' THEN
    UPDATE inventory_count_lines SET counted_qty = p_counted_qty WHERE id = p_line_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Line % not found', p_line_id; END IF;
    RETURN jsonb_build_object('success', true, 'line_id', p_line_id);
  ELSIF p_action = 'post' THEN
    SELECT location_id, status INTO p_location_id, v_status FROM inventory_counts WHERE id = p_count_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Count % not found', p_count_id; END IF;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'Count % already %', p_count_id, v_status; END IF;
    FOR v_line IN SELECT product_id, lot_id, variance FROM inventory_count_lines WHERE count_id = p_count_id AND variance <> 0 LOOP
      PERFORM adjust_quant(v_line.product_id, p_location_id, v_line.variance, v_line.lot_id, 'cycle_count');
      v_applied := v_applied + 1;
    END LOOP;
    UPDATE inventory_counts SET status = 'posted', posted_at = now() WHERE id = p_count_id;
    RETURN jsonb_build_object('success', true, 'count_id', p_count_id, 'adjustments_applied', v_applied);
  ELSIF p_action = 'get' THEN
    RETURN jsonb_build_object('success', true,
      'count', (SELECT to_jsonb(c) FROM inventory_counts c WHERE c.id = p_count_id),
      'lines', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.created_at), '[]'::jsonb)
                FROM inventory_count_lines l WHERE l.count_id = p_count_id));
  ELSIF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'counts', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
      FROM inventory_counts c WHERE p_location_id IS NULL OR c.location_id = p_location_id));
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $function$;

-- manage_loyalty → pos. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: kassabiträde med `pos` i Role Permissions → svar; kundkonto utan pos → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_loyalty(p_action text, p_customer_email text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_points integer DEFAULT NULL::integer, p_sale_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acct public.loyalty_accounts%ROWTYPE;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'pos')) THEN
    RAISE EXCEPTION 'Only staff can manage loyalty';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.points_balance DESC), '[]'::jsonb) INTO v_rows
    FROM public.loyalty_accounts a WHERE a.active;
    RETURN jsonb_build_object('success', true, 'accounts', v_rows);
  END IF;

  IF p_customer_email IS NULL THEN RAISE EXCEPTION 'customer_email is required'; END IF;
  SELECT * INTO v_acct FROM public.loyalty_accounts
   WHERE lower(customer_email) = lower(p_customer_email) FOR UPDATE;

  IF p_action = 'enroll' THEN
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'account_id', v_acct.id,
        'already_enrolled', true, 'points_balance', v_acct.points_balance, 'tier', v_acct.tier);
    END IF;
    INSERT INTO public.loyalty_accounts (customer_email, customer_name)
    VALUES (lower(p_customer_email), p_customer_name)
    RETURNING * INTO v_acct;
    RETURN jsonb_build_object('success', true, 'account_id', v_acct.id,
      'points_balance', 0, 'tier', 'bronze');
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No loyalty account for % — enroll first (p_action=enroll)', p_customer_email;
  END IF;

  IF p_action = 'get' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM (SELECT * FROM public.loyalty_transactions WHERE account_id = v_acct.id ORDER BY created_at DESC LIMIT 20) t;
    RETURN jsonb_build_object('success', true, 'account', to_jsonb(v_acct), 'recent_transactions', v_rows);

  ELSIF p_action IN ('earn','redeem','adjust') THEN
    IF p_points IS NULL OR p_points = 0 THEN RAISE EXCEPTION 'points (non-zero) is required'; END IF;
    IF p_action = 'earn' AND p_points < 0 THEN RAISE EXCEPTION 'earn requires positive points'; END IF;
    IF p_action = 'redeem' THEN
      IF p_points < 0 THEN RAISE EXCEPTION 'redeem takes positive points to spend'; END IF;
      IF v_acct.points_balance < p_points THEN
        RAISE EXCEPTION 'Insufficient points: balance %, requested %', v_acct.points_balance, p_points;
      END IF;
    END IF;
    UPDATE public.loyalty_accounts
       SET points_balance = points_balance + CASE WHEN p_action = 'redeem' THEN -p_points ELSE p_points END,
           lifetime_points = lifetime_points + CASE WHEN p_action = 'earn' THEN p_points ELSE 0 END,
           tier = public.loyalty_tier_for(lifetime_points + CASE WHEN p_action = 'earn' THEN p_points ELSE 0 END),
           updated_at = now()
     WHERE id = v_acct.id
    RETURNING * INTO v_acct;
    INSERT INTO public.loyalty_transactions (account_id, sale_id, points, kind, note)
    VALUES (v_acct.id, p_sale_id,
            CASE WHEN p_action = 'redeem' THEN -p_points ELSE p_points END,
            p_action, p_note);
    RETURN jsonb_build_object('success', true, 'account_id', v_acct.id,
      'points_balance', v_acct.points_balance, 'lifetime_points', v_acct.lifetime_points, 'tier', v_acct.tier);

  ELSE
    RAISE EXCEPTION 'action must be enroll | get | list | earn | redeem | adjust (got %)', p_action;
  END IF;
END;
$function$;

-- manage_maintenance_request → maintenance. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: roll med `maintenance` → svar; roll utan maintenance → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_maintenance_request(p_action text, p_request_id uuid DEFAULT NULL::uuid, p_equipment_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_kind text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'maintenance'));
  v_id uuid; v_rows jsonb;
BEGIN
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_rows
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
    INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date, created_by)
    VALUES (p_equipment_id, p_title, p_description, COALESCE(p_kind,'corrective'),
            COALESCE(p_priority,'medium'), p_due_date, auth.uid())
    RETURNING id INTO v_id;
    IF COALESCE(p_priority,'medium') = 'critical' THEN
      UPDATE equipment SET status='under_maintenance' WHERE id=p_equipment_id AND status='operational';
    END IF;
    RETURN jsonb_build_object('success', true, 'request_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_request_id IS NULL THEN RAISE EXCEPTION 'request_id required'; END IF;
    UPDATE maintenance_requests SET
      title = COALESCE(p_title, title), description = COALESCE(p_description, description),
      priority = COALESCE(p_priority, priority), status = COALESCE(p_status, status),
      due_date = COALESCE(p_due_date, due_date),
      duration_minutes = COALESCE(p_duration_minutes, duration_minutes),
      completed_at = CASE WHEN p_status = 'done' THEN now() ELSE completed_at END
    WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request % not found', p_request_id; END IF;
    IF p_status IN ('done','cancelled') THEN
      UPDATE equipment e SET status='operational'
      WHERE e.id = (SELECT equipment_id FROM maintenance_requests WHERE id=p_request_id)
        AND e.status='under_maintenance'
        AND NOT EXISTS (SELECT 1 FROM maintenance_requests r
                        WHERE r.equipment_id=e.id AND r.status IN ('new','in_progress'));
    END IF;
    RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update', p_action;
  END IF;
END $function$;

-- manage_pipeline_stage → leads. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: säljare med `leads` → svar; roll utan leads → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_pipeline_stage(p_action text, p_entity_type text DEFAULT NULL::text, p_stage_id uuid DEFAULT NULL::uuid, p_key text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_sort_order integer DEFAULT NULL::integer, p_probability numeric DEFAULT NULL::numeric, p_is_won boolean DEFAULT NULL::boolean, p_is_lost boolean DEFAULT NULL::boolean, p_fold boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'leads'));
  v_id uuid;
  v_result jsonb;
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Requires the leads module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.sort_order), '[]'::jsonb) INTO v_result
    FROM pipeline_stages s
    WHERE p_entity_type IS NULL OR s.entity_type = p_entity_type;
    RETURN jsonb_build_object('success', true, 'stages', v_result);

  ELSIF p_action = 'create' THEN
    IF p_entity_type IS NULL OR p_name IS NULL THEN
      RAISE EXCEPTION 'entity_type and name are required';
    END IF;
    INSERT INTO pipeline_stages (entity_type, key, name, sort_order, probability, is_won, is_lost, fold)
    VALUES (
      p_entity_type,
      COALESCE(p_key, regexp_replace(lower(p_name), '[^a-z0-9]+', '_', 'g')),
      p_name, COALESCE(p_sort_order, 0), p_probability,
      COALESCE(p_is_won, false), COALESCE(p_is_lost, false), COALESCE(p_fold, false)
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'stage_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_stage_id IS NULL THEN RAISE EXCEPTION 'stage_id is required for update'; END IF;
    UPDATE pipeline_stages SET
      name = COALESCE(p_name, name),
      sort_order = COALESCE(p_sort_order, sort_order),
      probability = COALESCE(p_probability, probability),
      is_won = COALESCE(p_is_won, is_won),
      is_lost = COALESCE(p_is_lost, is_lost),
      fold = COALESCE(p_fold, fold)
    WHERE id = p_stage_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stage % not found', p_stage_id; END IF;
    RETURN jsonb_build_object('success', true, 'stage_id', p_stage_id);

  ELSIF p_action = 'delete' THEN
    IF p_stage_id IS NULL THEN RAISE EXCEPTION 'stage_id is required for delete'; END IF;
    DELETE FROM pipeline_stages WHERE id = p_stage_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_stage_id);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$function$;

-- manage_pos_table → pos. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: kassabiträde med `pos` i Role Permissions → svar; kundkonto utan pos → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_pos_table(p_action text, p_table_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_area text DEFAULT NULL::text, p_seats integer DEFAULT NULL::integer, p_register_id uuid DEFAULT NULL::uuid, p_sale_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table public.pos_tables%ROWTYPE;
  v_rows jsonb;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'pos')) THEN
    RAISE EXCEPTION 'Only staff can manage POS tables';
  END IF;

  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    INSERT INTO public.pos_tables (name, area, seats, register_id)
    VALUES (p_name, p_area, COALESCE(p_seats, 4), p_register_id)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'table_id', v_id);

  ELSIF p_action = 'update' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'table_id is required'; END IF;
    UPDATE public.pos_tables
       SET name = COALESCE(p_name, name), area = COALESCE(p_area, area),
           seats = COALESCE(p_seats, seats), register_id = COALESCE(p_register_id, register_id),
           status = COALESCE(p_status, status), updated_at = now()
     WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Table % not found', p_table_id; END IF;
    RETURN jsonb_build_object('success', true, 'table_id', p_table_id);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'area', t.area, 'seats', t.seats,
        'status', t.status, 'register_id', t.register_id,
        'current_sale_id', t.current_sale_id,
        'current_receipt', (SELECT receipt_number FROM public.pos_sales WHERE id = t.current_sale_id)
      ) ORDER BY t.area NULLS LAST, t.name), '[]'::jsonb)
    INTO v_rows FROM public.pos_tables t WHERE t.active;
    RETURN jsonb_build_object('success', true, 'tables', v_rows);

  ELSIF p_action = 'delete' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'table_id is required'; END IF;
    UPDATE public.pos_tables SET active = false, updated_at = now() WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Table % not found', p_table_id; END IF;
    RETURN jsonb_build_object('success', true, 'deactivated', p_table_id);

  ELSIF p_action = 'seat' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'table_id is required'; END IF;
    SELECT * INTO v_table FROM public.pos_tables WHERE id = p_table_id AND active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Table % not found', p_table_id; END IF;
    IF v_table.status = 'occupied' THEN RAISE EXCEPTION 'Table % is already occupied', v_table.name; END IF;
    UPDATE public.pos_tables
       SET status = 'occupied', current_sale_id = p_sale_id, updated_at = now()
     WHERE id = p_table_id;
    IF p_sale_id IS NOT NULL THEN
      UPDATE public.pos_sales SET table_id = p_table_id WHERE id = p_sale_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'table_id', p_table_id, 'status', 'occupied', 'sale_id', p_sale_id);

  ELSIF p_action = 'release' THEN
    IF p_table_id IS NULL THEN RAISE EXCEPTION 'table_id is required'; END IF;
    UPDATE public.pos_tables
       SET status = 'free', current_sale_id = NULL, updated_at = now()
     WHERE id = p_table_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Table % not found', p_table_id; END IF;
    RETURN jsonb_build_object('success', true, 'table_id', p_table_id, 'status', 'free');

  ELSE
    RAISE EXCEPTION 'action must be create | update | list | delete | seat | release (got %)', p_action;
  END IF;
END;
$function$;

-- manage_product_variant → ecommerce. Före: v_is_writer BOOLEAN := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: butiksroll med `ecommerce` → svar; roll utan ecommerce → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_product_variant(p_action text, p_product_id uuid DEFAULT NULL::uuid, p_variant_id uuid DEFAULT NULL::uuid, p_sku text DEFAULT NULL::text, p_barcode text DEFAULT NULL::text, p_price_delta_cents bigint DEFAULT NULL::bigint, p_stock_quantity integer DEFAULT NULL::integer, p_is_active boolean DEFAULT NULL::boolean, p_attribute_value_ids uuid[] DEFAULT NULL::uuid[], p_attributes jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_writer BOOLEAN := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'ecommerce'));
  v_variant RECORD;
  v_result JSONB;
  v_attr JSONB;
  v_attr_id UUID;
  v_val TEXT;
  v_combo UUID[];
  v_created INT := 0;
  v_sku_base TEXT;
  v_suffix TEXT;
  v_new_id UUID;
BEGIN
  IF p_action IN ('create','update','deactivate','generate') AND NOT v_is_writer THEN
    RAISE EXCEPTION 'Requires the ecommerce module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'list' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required for list'; END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', v.id, 'sku', v.sku, 'barcode', v.barcode,
      'price_delta_cents', v.price_delta_cents,
      'stock_quantity', v.stock_quantity, 'is_active', v.is_active,
      'values', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('attribute', a.name, 'value', av.value)), '[]'::jsonb)
        FROM product_variant_values vv
        JOIN product_attribute_values av ON av.id = vv.attribute_value_id
        JOIN product_attributes a ON a.id = av.attribute_id
        WHERE vv.variant_id = v.id
      )
    ) ORDER BY v.created_at), '[]'::jsonb)
    INTO v_result
    FROM product_variants v WHERE v.product_id = p_product_id;
    RETURN jsonb_build_object('success', true, 'variants', v_result);

  ELSIF p_action = 'get' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for get'; END IF;
    SELECT * INTO v_variant FROM product_variants WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant', to_jsonb(v_variant));

  ELSIF p_action = 'create' THEN
    IF p_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required for create'; END IF;
    INSERT INTO product_variants (product_id, sku, barcode, price_delta_cents, stock_quantity, is_active)
    VALUES (p_product_id, p_sku, p_barcode, COALESCE(p_price_delta_cents, 0), p_stock_quantity, COALESCE(p_is_active, true))
    RETURNING id INTO v_new_id;
    IF p_attribute_value_ids IS NOT NULL THEN
      INSERT INTO product_variant_values (variant_id, attribute_value_id)
      SELECT v_new_id, unnest(p_attribute_value_ids)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', v_new_id);

  ELSIF p_action = 'update' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for update'; END IF;
    UPDATE product_variants SET
      sku = COALESCE(p_sku, sku),
      barcode = COALESCE(p_barcode, barcode),
      price_delta_cents = COALESCE(p_price_delta_cents, price_delta_cents),
      stock_quantity = COALESCE(p_stock_quantity, stock_quantity),
      is_active = COALESCE(p_is_active, is_active)
    WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', p_variant_id);

  ELSIF p_action = 'deactivate' THEN
    IF p_variant_id IS NULL THEN RAISE EXCEPTION 'variant_id is required for deactivate'; END IF;
    UPDATE product_variants SET is_active = false WHERE id = p_variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant % not found', p_variant_id; END IF;
    RETURN jsonb_build_object('success', true, 'variant_id', p_variant_id);

  ELSIF p_action = 'generate' THEN
    -- p_attributes: [{"name":"Color","values":["Red","Blue"]}, ...]
    -- Upserts attributes/values, then creates the cartesian variant set.
    IF p_product_id IS NULL OR p_attributes IS NULL OR jsonb_typeof(p_attributes) <> 'array' THEN
      RAISE EXCEPTION 'product_id and attributes (array) are required for generate';
    END IF;

    SELECT COALESCE(NULLIF(regexp_replace(upper(name), '[^A-Z0-9]+', '-', 'g'), ''), 'VAR')
    INTO v_sku_base FROM products WHERE id = p_product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_product_id; END IF;

    -- Upsert attributes and their values
    FOR v_attr IN SELECT * FROM jsonb_array_elements(p_attributes) LOOP
      IF v_attr->>'name' IS NULL OR jsonb_typeof(v_attr->'values') <> 'array'
         OR jsonb_array_length(v_attr->'values') = 0 THEN
        RAISE EXCEPTION 'Each attribute needs a name and a non-empty values array';
      END IF;
      INSERT INTO product_attributes (name)
      VALUES (v_attr->>'name')
      ON CONFLICT (name) DO UPDATE SET updated_at = now()
      RETURNING id INTO v_attr_id;

      FOR v_val IN SELECT jsonb_array_elements_text(v_attr->'values') LOOP
        INSERT INTO product_attribute_values (attribute_id, value)
        VALUES (v_attr_id, v_val)
        ON CONFLICT (attribute_id, value) DO NOTHING;
      END LOOP;
    END LOOP;

    -- Cartesian expansion of the requested value sets
    DROP TABLE IF EXISTS _variant_combos;
    CREATE TEMP TABLE _variant_combos ON COMMIT DROP AS
    WITH RECURSIVE attrs AS (
      SELECT a.id AS attr_id,
             row_number() OVER (ORDER BY a.sort_order, a.name) AS rn
      FROM product_attributes a
      WHERE a.name IN (SELECT jsonb_array_elements(p_attributes)->>'name')
    ),
    combos(rn, value_ids, label) AS (
      SELECT a.rn, ARRAY[av.id], av.value
      FROM attrs a
      JOIN product_attribute_values av ON av.attribute_id = a.attr_id
      WHERE a.rn = 1
        AND av.value IN (
          SELECT jsonb_array_elements_text(e->'values')
          FROM jsonb_array_elements(p_attributes) e
          WHERE e->>'name' = (SELECT pa.name FROM product_attributes pa WHERE pa.id = a.attr_id)
        )
      UNION ALL
      SELECT a.rn, c.value_ids || av.id, c.label || '-' || av.value
      FROM combos c
      JOIN attrs a ON a.rn = c.rn + 1
      JOIN product_attribute_values av ON av.attribute_id = a.attr_id
      WHERE av.value IN (
        SELECT jsonb_array_elements_text(e->'values')
        FROM jsonb_array_elements(p_attributes) e
        WHERE e->>'name' = (SELECT pa.name FROM product_attributes pa WHERE pa.id = a.attr_id)
      )
    )
    SELECT value_ids, label FROM combos
    WHERE rn = (SELECT max(rn) FROM attrs);

    FOR v_combo, v_suffix IN SELECT value_ids, label FROM _variant_combos LOOP
      -- Skip if an identical variant (same value set) already exists for the product
      IF EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p_product_id
          AND (SELECT array_agg(vv.attribute_value_id ORDER BY vv.attribute_value_id)
               FROM product_variant_values vv WHERE vv.variant_id = pv.id)
            = (SELECT array_agg(x ORDER BY x) FROM unnest(v_combo) x)
      ) THEN CONTINUE; END IF;

      INSERT INTO product_variants (product_id, sku, price_delta_cents)
      VALUES (p_product_id,
              v_sku_base || '-' || regexp_replace(upper(v_suffix), '[^A-Z0-9-]+', '', 'g'),
              0)
      RETURNING id INTO v_new_id;
      INSERT INTO product_variant_values (variant_id, attribute_value_id)
      SELECT v_new_id, unnest(v_combo);
      v_created := v_created + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'created', v_created);

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|get|create|update|deactivate|generate', p_action;
  END IF;
END;
$function$;

-- manage_reconciliation_rule → reconciliation. Före: DECLARE v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')); v_id uuid;
-- Lackmus: ekonomiroll med `reconciliation` → svar; roll utan reconciliation → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_reconciliation_rule(p_action text, p_rule_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_match_field text DEFAULT NULL::text, p_match_type text DEFAULT NULL::text, p_pattern text DEFAULT NULL::text, p_suggested_account_code text DEFAULT NULL::text, p_suggested_category text DEFAULT NULL::text, p_priority integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'reconciliation')); v_id uuid;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Requires the reconciliation module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'rules',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.priority, r.created_at), '[]'::jsonb) FROM reconciliation_rules r));
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_match_field IS NULL OR p_match_type IS NULL OR p_pattern IS NULL THEN
      RAISE EXCEPTION 'name, match_field, match_type, pattern required'; END IF;
    INSERT INTO reconciliation_rules (name, match_field, match_type, pattern, suggested_account_code, suggested_category, priority)
    VALUES (p_name, p_match_field, p_match_type, p_pattern, p_suggested_account_code, p_suggested_category, COALESCE(p_priority,100))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rule_id', v_id);
  ELSIF p_action = 'update' THEN
    UPDATE reconciliation_rules SET
      name = COALESCE(p_name, name), match_field = COALESCE(p_match_field, match_field),
      match_type = COALESCE(p_match_type, match_type), pattern = COALESCE(p_pattern, pattern),
      suggested_account_code = COALESCE(p_suggested_account_code, suggested_account_code),
      suggested_category = COALESCE(p_suggested_category, suggested_category),
      priority = COALESCE(p_priority, priority)
    WHERE id = p_rule_id;
    RETURN jsonb_build_object('success', true, 'rule_id', p_rule_id);
  ELSIF p_action = 'delete' THEN
    DELETE FROM reconciliation_rules WHERE id = p_rule_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rule_id);
  ELSE RAISE EXCEPTION 'Unknown action: %', p_action; END IF;
END; $function$;

-- manage_recurring_service_order → fieldService. Före: AND NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN / AND NOT (auth.role() = 'service_role' OR auth.uid() IS NULL OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_recurring_service_order(p_action text, p_order_id uuid DEFAULT NULL::uuid, p_rule text DEFAULT NULL::text, p_until date DEFAULT NULL::date)
 RETURNS jsonb
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
     AND NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
    RAISE EXCEPTION 'Only staff can manage recurring service orders';
  END IF;
  IF p_action = 'generate'
     AND NOT (auth.role() = 'service_role' OR auth.uid() IS NULL OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- manage_routing_operation → manufacturing. Före: DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb;
-- Lackmus: produktionsroll med `manufacturing` → svar; roll utan manufacturing → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_routing_operation(p_action text, p_id uuid DEFAULT NULL::uuid, p_bom_id uuid DEFAULT NULL::uuid, p_sequence integer DEFAULT NULL::integer, p_name text DEFAULT NULL::text, p_work_center_id uuid DEFAULT NULL::uuid, p_duration_minutes numeric DEFAULT NULL::numeric)
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
      'work_center_id',o.work_center_id,'duration_minutes',o.duration_minutes) ORDER BY o.sequence),'[]'::jsonb)
    INTO v_res FROM routing_operations o WHERE o.bom_id = p_bom_id;
    RETURN jsonb_build_object('success',true,'operations',v_res);
  ELSIF p_action='create' THEN
    IF p_bom_id IS NULL OR p_name IS NULL OR p_work_center_id IS NULL THEN
      RAISE EXCEPTION 'bom_id, name and work_center_id required'; END IF;
    INSERT INTO routing_operations(bom_id,sequence,name,work_center_id,duration_minutes)
      VALUES (p_bom_id,COALESCE(p_sequence,10),p_name,p_work_center_id,COALESCE(p_duration_minutes,0)) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'operation_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE routing_operations SET sequence=COALESCE(p_sequence,sequence), name=COALESCE(p_name,name),
      work_center_id=COALESCE(p_work_center_id,work_center_id), duration_minutes=COALESCE(p_duration_minutes,duration_minutes)
      WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Operation % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'operation_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM routing_operations WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $function$;

-- manage_service_credit → sla. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN / IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin')) THEN
-- Lackmus: support med `sla` → svar; roll utan sla → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_service_credit(p_action text, p_credit_id uuid DEFAULT NULL::uuid, p_violation_id uuid DEFAULT NULL::uuid, p_company_id uuid DEFAULT NULL::uuid, p_customer_email text DEFAULT NULL::text, p_amount_cents bigint DEFAULT NULL::bigint, p_currency text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.service_credits;
  v_result jsonb;
BEGIN
  IF p_action = 'list' THEN
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'sla')) THEN
      RAISE EXCEPTION 'Only staff can view service credits';
    END IF;
    SELECT jsonb_build_object('success', true,
      'credits', COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY c.created_at DESC), '[]'::jsonb),
      'total_accrued_cents', COALESCE(sum(c.amount_cents) FILTER (WHERE c.status = 'accrued'), 0)
    ) INTO v_result
    FROM public.service_credits c
    WHERE (p_company_id IS NULL OR c.company_id = p_company_id)
      AND (p_customer_email IS NULL OR lower(c.customer_email) = lower(p_customer_email));
    RETURN v_result;
  END IF;

  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'sla')) THEN
    RAISE EXCEPTION 'Requires the sla module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_action = 'accrue' THEN
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
      RAISE EXCEPTION 'amount_cents must be positive';
    END IF;
    IF p_violation_id IS NULL AND p_company_id IS NULL AND p_customer_email IS NULL THEN
      RAISE EXCEPTION 'violation_id, company_id or customer_email is required';
    END IF;
    INSERT INTO public.service_credits (violation_id, company_id, customer_email, amount_cents, currency, reason, notes, created_by)
    VALUES (p_violation_id, p_company_id, p_customer_email, p_amount_cents, COALESCE(p_currency,'SEK'), p_reason, p_notes, auth.uid())
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'credit', to_jsonb(v_row));

  ELSIF p_action IN ('apply','waive') THEN
    IF p_credit_id IS NULL THEN RAISE EXCEPTION 'credit_id is required'; END IF;
    UPDATE public.service_credits
       SET status = CASE WHEN p_action = 'apply' THEN 'applied' ELSE 'waived' END,
           applied_at = CASE WHEN p_action = 'apply' THEN now() ELSE applied_at END,
           notes = COALESCE(p_notes, notes)
     WHERE id = p_credit_id AND status = 'accrued'
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'Credit % not found or not in accrued status', p_credit_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'credit', to_jsonb(v_row));
  END IF;

  RAISE EXCEPTION 'Unknown action: % (use accrue|apply|waive|list)', p_action;
END; $function$;

-- manage_service_package → fieldService. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_service_package(p_action text, p_package_id uuid DEFAULT NULL::uuid, p_order_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_lines jsonb DEFAULT NULL::jsonb, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
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
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- manage_service_sla → fieldService. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_service_sla(p_action text, p_order_id uuid DEFAULT NULL::uuid, p_response_hours numeric DEFAULT NULL::numeric, p_resolution_hours numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- manage_shipping_rate → shipping. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: roll med `shipping` → svar; roll utan shipping → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_shipping_rate(p_action text, p_rate_id uuid DEFAULT NULL::uuid, p_carrier_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_min_weight_grams integer DEFAULT NULL::integer, p_max_weight_grams integer DEFAULT NULL::integer, p_price_cents integer DEFAULT NULL::integer, p_currency text DEFAULT NULL::text, p_dim_divisor integer DEFAULT NULL::integer, p_countries text[] DEFAULT NULL::text[], p_allow_overlap boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'shipping'));
  v_id uuid; v_result jsonb; v_row shipping_rates%ROWTYPE;
  v_min integer; v_max integer; v_currency text; v_carrier uuid; v_countries text[];
BEGIN
  IF p_action IN ('create','update','delete') AND NOT v_writer THEN
    RAISE EXCEPTION 'Requires the shipping module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.min_weight_grams), '[]'::jsonb) INTO v_result
    FROM shipping_rates r
    WHERE p_carrier_id IS NULL OR r.carrier_id = p_carrier_id;
    RETURN jsonb_build_object('success', true, 'rates', v_result);
  ELSIF p_action = 'create' THEN
    IF p_carrier_id IS NULL OR p_name IS NULL OR p_price_cents IS NULL THEN
      RAISE EXCEPTION 'carrier_id, name and price_cents are required';
    END IF;
    v_carrier := p_carrier_id;
    v_min := COALESCE(p_min_weight_grams, 0);
    v_max := p_max_weight_grams;
    v_currency := COALESCE(p_currency, 'SEK');
    v_countries := (SELECT array_agg(upper(btrim(c))) FROM unnest(p_countries) c WHERE btrim(c) <> '');
    -- 2c96fe71: reject silently-overlapping bands for the same carrier +
    -- currency + intersecting destination scope. p_allow_overlap=true is the
    -- deliberate escape hatch (e.g. an express tier over the same weights).
    IF NOT p_allow_overlap AND EXISTS (
      SELECT 1 FROM shipping_rates r
      WHERE r.carrier_id = v_carrier AND r.is_active
        AND upper(r.currency) = upper(v_currency)
        AND (r.countries IS NULL OR v_countries IS NULL OR r.countries && v_countries)
        AND r.min_weight_grams <= COALESCE(v_max, 2147483647)
        AND COALESCE(r.max_weight_grams, 2147483647) >= v_min
    ) THEN
      RAISE EXCEPTION 'Weight band %–% g overlaps an existing active rate for this carrier/currency/destination. Adjust the range, deactivate the other rate, or pass p_allow_overlap=true for a deliberate secondary tier.', v_min, COALESCE(v_max::text, '∞');
    END IF;
    INSERT INTO shipping_rates (carrier_id, name, min_weight_grams, max_weight_grams, price_cents, currency, dim_divisor, countries)
    VALUES (v_carrier, p_name, v_min, v_max, p_price_cents, v_currency, p_dim_divisor, v_countries)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'rate_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    SELECT * INTO v_row FROM shipping_rates WHERE id = p_rate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rate % not found', p_rate_id; END IF;
    v_carrier := v_row.carrier_id;
    v_min := COALESCE(p_min_weight_grams, v_row.min_weight_grams);
    v_max := COALESCE(p_max_weight_grams, v_row.max_weight_grams);
    v_currency := COALESCE(p_currency, v_row.currency);
    v_countries := COALESCE((SELECT array_agg(upper(btrim(c))) FROM unnest(p_countries) c WHERE btrim(c) <> ''), v_row.countries);
    IF NOT p_allow_overlap AND v_row.is_active AND EXISTS (
      SELECT 1 FROM shipping_rates r
      WHERE r.carrier_id = v_carrier AND r.is_active AND r.id <> p_rate_id
        AND upper(r.currency) = upper(v_currency)
        AND (r.countries IS NULL OR v_countries IS NULL OR r.countries && v_countries)
        AND r.min_weight_grams <= COALESCE(v_max, 2147483647)
        AND COALESCE(r.max_weight_grams, 2147483647) >= v_min
    ) THEN
      RAISE EXCEPTION 'Weight band %–% g overlaps an existing active rate for this carrier/currency/destination. Adjust the range, deactivate the other rate, or pass p_allow_overlap=true for a deliberate secondary tier.', v_min, COALESCE(v_max::text, '∞');
    END IF;
    UPDATE shipping_rates SET
      name = COALESCE(p_name, name),
      min_weight_grams = v_min,
      max_weight_grams = v_max,
      price_cents = COALESCE(p_price_cents, price_cents),
      currency = v_currency,
      dim_divisor = COALESCE(p_dim_divisor, dim_divisor),
      countries = v_countries
    WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'rate_id', p_rate_id);
  ELSIF p_action = 'delete' THEN
    IF p_rate_id IS NULL THEN RAISE EXCEPTION 'rate_id is required'; END IF;
    DELETE FROM shipping_rates WHERE id = p_rate_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_rate_id);
  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action;
  END IF;
END;
$function$;

-- manage_sla_tier → sla. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN / IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin')) THEN
-- Lackmus: support med `sla` → svar; roll utan sla → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_sla_tier(p_action text, p_tier_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_threshold_multiplier numeric DEFAULT NULL::numeric, p_company_id uuid DEFAULT NULL::uuid, p_customer_email text DEFAULT NULL::text, p_assignment_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tier public.sla_tiers;
  v_assign public.sla_tier_assignments;
  v_result jsonb;
BEGIN
  IF p_action IN ('list','list_assignments') THEN
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'sla')) THEN
      RAISE EXCEPTION 'Only staff can view SLA tiers';
    END IF;
  ELSE
    IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'sla')) THEN
      RAISE EXCEPTION 'Requires the sla module — an admin can grant it under Users → Role Permissions';
    END IF;
  END IF;

  IF p_action = 'create' THEN
    IF p_name IS NULL THEN RAISE EXCEPTION 'name is required'; END IF;
    INSERT INTO public.sla_tiers (name, description, threshold_multiplier)
    VALUES (p_name, p_description, COALESCE(p_threshold_multiplier, 1.0))
    RETURNING * INTO v_tier;
    RETURN jsonb_build_object('success', true, 'tier', to_jsonb(v_tier));

  ELSIF p_action = 'update' THEN
    IF p_tier_id IS NULL THEN RAISE EXCEPTION 'tier_id is required'; END IF;
    UPDATE public.sla_tiers
       SET name = COALESCE(p_name, name),
           description = COALESCE(p_description, description),
           threshold_multiplier = COALESCE(p_threshold_multiplier, threshold_multiplier)
     WHERE id = p_tier_id RETURNING * INTO v_tier;
    IF v_tier.id IS NULL THEN RAISE EXCEPTION 'Tier % not found', p_tier_id; END IF;
    RETURN jsonb_build_object('success', true, 'tier', to_jsonb(v_tier));

  ELSIF p_action = 'delete' THEN
    IF p_tier_id IS NULL THEN RAISE EXCEPTION 'tier_id is required'; END IF;
    DELETE FROM public.sla_tiers WHERE id = p_tier_id;
    RETURN jsonb_build_object('success', true, 'deleted', FOUND);

  ELSIF p_action = 'assign' THEN
    IF p_tier_id IS NULL OR (p_company_id IS NULL AND p_customer_email IS NULL) THEN
      RAISE EXCEPTION 'tier_id and company_id or customer_email are required';
    END IF;
    -- One tier per customer: replace any existing assignment.
    DELETE FROM public.sla_tier_assignments
     WHERE (p_company_id IS NOT NULL AND company_id = p_company_id)
        OR (p_customer_email IS NOT NULL AND lower(customer_email) = lower(p_customer_email));
    INSERT INTO public.sla_tier_assignments (tier_id, company_id, customer_email)
    VALUES (p_tier_id, p_company_id, p_customer_email)
    RETURNING * INTO v_assign;
    RETURN jsonb_build_object('success', true, 'assignment', to_jsonb(v_assign));

  ELSIF p_action = 'unassign' THEN
    DELETE FROM public.sla_tier_assignments
     WHERE id = p_assignment_id
        OR (p_assignment_id IS NULL AND p_company_id IS NOT NULL AND company_id = p_company_id)
        OR (p_assignment_id IS NULL AND p_customer_email IS NOT NULL AND lower(customer_email) = lower(p_customer_email));
    RETURN jsonb_build_object('success', true, 'removed', FOUND);

  ELSIF p_action = 'list' THEN
    SELECT jsonb_build_object('success', true, 'tiers', COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'name', t.name, 'description', t.description,
      'threshold_multiplier', t.threshold_multiplier,
      'assignments', (SELECT count(*) FROM public.sla_tier_assignments a WHERE a.tier_id = t.id)
    ) ORDER BY t.threshold_multiplier), '[]'::jsonb)) INTO v_result
    FROM public.sla_tiers t;
    RETURN v_result;

  ELSIF p_action = 'list_assignments' THEN
    SELECT jsonb_build_object('success', true, 'assignments', COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'tier', t.name, 'threshold_multiplier', t.threshold_multiplier,
      'company_id', a.company_id, 'company_name', c.name, 'customer_email', a.customer_email
    ) ORDER BY a.created_at DESC), '[]'::jsonb)) INTO v_result
    FROM public.sla_tier_assignments a
    JOIN public.sla_tiers t ON t.id = a.tier_id
    LEFT JOIN public.companies c ON c.id = a.company_id
    WHERE (p_tier_id IS NULL OR a.tier_id = p_tier_id);
    RETURN v_result;
  END IF;

  RAISE EXCEPTION 'Unknown action: % (use create|update|delete|assign|unassign|list|list_assignments)', p_action;
END; $function$;

-- manage_timesheet_approval → timesheets. Före: v_is_manager boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver'));
-- Lackmus: roll med `timesheets` → svar; roll utan timesheets → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_timesheet_approval(p_action text, p_start_date date, p_end_date date, p_user_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_manager boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'timesheets'));
  v_count int;
BEGIN
  IF p_action NOT IN ('submit','approve','reject') THEN
    RAISE EXCEPTION 'Unknown action: %. Use submit|approve|reject', p_action;
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'start_date and end_date are required';
  END IF;
  IF p_action IN ('approve','reject') AND NOT v_is_manager THEN
    RAISE EXCEPTION 'Requires the timesheets module to % timesheets — an admin can grant it under Users → Role Permissions', p_action;
  END IF;

  IF p_action = 'submit' THEN
    UPDATE public.time_entries SET approval_status = 'submitted'
    WHERE entry_date BETWEEN p_start_date AND p_end_date
      AND approval_status IN ('draft','rejected')
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_employee_id IS NULL OR employee_id = p_employee_id)
      AND (v_is_manager OR user_id = auth.uid());
  ELSIF p_action = 'approve' THEN
    UPDATE public.time_entries SET
      approval_status = 'approved', approved_by = auth.uid(), approved_at = now(),
      approval_notes = COALESCE(p_notes, approval_notes)
    WHERE entry_date BETWEEN p_start_date AND p_end_date
      AND approval_status IN ('draft','submitted')
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_employee_id IS NULL OR employee_id = p_employee_id);
  ELSE
    UPDATE public.time_entries SET
      approval_status = 'rejected', approved_by = auth.uid(), approved_at = now(),
      approval_notes = COALESCE(p_notes, approval_notes)
    WHERE entry_date BETWEEN p_start_date AND p_end_date
      AND approval_status IN ('draft','submitted')
      AND (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_employee_id IS NULL OR employee_id = p_employee_id);
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'action', p_action, 'entries_updated', v_count,
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'note', CASE WHEN v_count = 0 THEN 'No entries matched — check the date range and current approval_status' ELSE NULL END);
END; $function$;

-- manage_work_center → manufacturing. Före: DECLARE v_writer boolean := (auth.role()='service_role' OR has_role(auth.uid(),'admin')); v_id uuid; v_res jsonb;
-- Lackmus: produktionsroll med `manufacturing` → svar; roll utan manufacturing → "not authorized".
CREATE OR REPLACE FUNCTION public.manage_work_center(p_action text, p_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_cost_per_hour_cents integer DEFAULT NULL::integer, p_capacity_per_hour numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_writer boolean := (auth.role()='service_role' OR can_access_module(auth.uid(),'manufacturing')); v_id uuid; v_res jsonb;
BEGIN
  IF p_action <> 'list' AND NOT v_writer THEN RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions'; END IF;
  IF p_action='list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(w) ORDER BY w.code),'[]'::jsonb) INTO v_res FROM work_centers w;
    RETURN jsonb_build_object('success',true,'work_centers',v_res);
  ELSIF p_action='create' THEN
    IF p_code IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'code and name required'; END IF;
    INSERT INTO work_centers(code,name,cost_per_hour_cents,capacity_per_hour)
      VALUES (p_code,p_name,COALESCE(p_cost_per_hour_cents,0),p_capacity_per_hour) RETURNING id INTO v_id;
    RETURN jsonb_build_object('success',true,'work_center_id',v_id);
  ELSIF p_action='update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required'; END IF;
    UPDATE work_centers SET name=COALESCE(p_name,name), cost_per_hour_cents=COALESCE(p_cost_per_hour_cents,cost_per_hour_cents),
      capacity_per_hour=COALESCE(p_capacity_per_hour,capacity_per_hour) WHERE id=p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work center % not found', p_id; END IF;
    RETURN jsonb_build_object('success',true,'work_center_id',p_id);
  ELSIF p_action='delete' THEN
    DELETE FROM work_centers WHERE id=p_id; RETURN jsonb_build_object('success',true,'deleted',p_id);
  ELSE RAISE EXCEPTION 'Unknown action: %. Use list|create|update|delete', p_action; END IF;
END; $function$;

-- mark_contract_obligation_status → contracts. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
-- Lackmus: roll med `contracts` → svar; roll utan contracts → "not authorized".
CREATE OR REPLACE FUNCTION public.mark_contract_obligation_status(_obligation_id uuid, _status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _r public.contract_obligations%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'contracts') OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Requires the contracts module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF _status NOT IN ('pending','met','overdue','waived') THEN
    RAISE EXCEPTION 'Invalid status %; expected pending|met|overdue|waived', _status;
  END IF;
  UPDATE public.contract_obligations
     SET status = _status,
         notes = COALESCE(_notes, notes),
         met_at = CASE WHEN _status = 'met' THEN now() ELSE NULL END,
         met_by = CASE WHEN _status = 'met' THEN auth.uid() ELSE NULL END,
         updated_at = now()
   WHERE id = _obligation_id
   RETURNING * INTO _r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation % not found', _obligation_id; END IF;
  RETURN jsonb_build_object('ok', true, 'id', _r.id, 'status', _r.status);
END $function$;

-- mark_payroll_paid → payroll. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: HR med `payroll` → svar; employee utan payroll → "not authorized".
CREATE OR REPLACE FUNCTION public.mark_payroll_paid(p_run_id uuid, p_payment_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_je_id UUID;
  v_date DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_run FROM public.payroll_runs WHERE id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  IF v_run.status <> 'approved' THEN RAISE EXCEPTION 'Run must be approved first'; END IF;

  v_date := COALESCE(p_payment_date, CURRENT_DATE);

  INSERT INTO public.journal_entries (entry_date, description, status, source)
  VALUES (v_date, 'Payroll payment '||to_char(v_run.period_date,'YYYY-MM'), 'posted', 'payroll_payment')
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je_id, '2890', v_run.total_net_cents, 0, 'Utbetald nettolön'),
         (v_je_id, '1930', 0, v_run.total_net_cents, 'Bank');

  UPDATE public.payroll_runs SET status='paid', paid_at=now(), payment_journal_id=v_je_id WHERE id=p_run_id;

  RETURN jsonb_build_object('success',true,'run_id',p_run_id,'journal_entry_id',v_je_id);
END; $function$;

-- mark_social_post_posted → paidGrowth. Före: IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
-- Lackmus: marketing med `paidGrowth` → svar; roll utan paidGrowth → "not authorized".
CREATE OR REPLACE FUNCTION public.mark_social_post_posted(_post_id uuid, _external_ref text DEFAULT NULL::text, _external_url text DEFAULT NULL::text)
 RETURNS social_posts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.social_posts;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'paidGrowth')) THEN
    RAISE EXCEPTION 'Requires the paidGrowth module — an admin can grant it under Users → Role Permissions';
  END IF;
  UPDATE public.social_posts
     SET status = 'posted',
         posted_at = COALESCE(posted_at, now()),
         external_ref = COALESCE(_external_ref, external_ref),
         external_url = COALESCE(_external_url, external_url),
         error = NULL
   WHERE id = _post_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Social post % not found', _post_id;
  END IF;
  RETURN v_row;
END;
$function$;

-- moderate_blog_comment → blog. Före: IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
-- Lackmus: marketing med `blog` → svar; roll utan blog → "not authorized".
CREATE OR REPLACE FUNCTION public.moderate_blog_comment(_comment_id uuid, _status text)
 RETURNS blog_comments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.blog_comments;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'blog')) THEN
    RAISE EXCEPTION 'Requires the blog module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF _status NOT IN ('pending','approved','spam','rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;
  UPDATE public.blog_comments
     SET status = _status,
         moderated_at = now(),
         moderated_by = COALESCE(auth.uid(), moderated_by)
   WHERE id = _comment_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Comment % not found', _comment_id;
  END IF;
  RETURN v_row;
END;
$function$;

-- mrp_reorder_run → manufacturing. Före: IF NOT p_dry_run AND NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: produktionsroll med `manufacturing` → svar; roll utan manufacturing → "not authorized".
CREATE OR REPLACE FUNCTION public.mrp_reorder_run(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_created int := 0;
  v_mo uuid;
BEGIN
  IF NOT p_dry_run AND NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'manufacturing')) THEN
    RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR v_row IN
    SELECT ps.product_id, p.name AS product_name,
           ps.quantity_on_hand, ps.reorder_point,
           GREATEST(ps.reorder_point - ps.quantity_on_hand, 1) AS suggested_qty,
           b.id AS bom_id
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    JOIN bom_headers b ON b.product_id = ps.product_id AND b.is_active
    WHERE ps.quantity_on_hand <= ps.reorder_point
      AND ps.reorder_point > 0
      AND NOT EXISTS (
        SELECT 1 FROM manufacturing_orders mo
        WHERE mo.product_id = ps.product_id AND mo.status NOT IN ('done','cancelled')
      )
  LOOP
    v_candidates := v_candidates || jsonb_build_object(
      'product_id', v_row.product_id, 'product_name', v_row.product_name,
      'quantity_on_hand', v_row.quantity_on_hand, 'reorder_point', v_row.reorder_point,
      'suggested_qty', v_row.suggested_qty, 'bom_id', v_row.bom_id);

    IF NOT p_dry_run THEN
      INSERT INTO manufacturing_orders (mo_number, product_id, bom_id, quantity, status, source_type, created_by)
      VALUES (next_mo_number(), v_row.product_id, v_row.bom_id, v_row.suggested_qty, 'draft', 'reorder', auth.uid())
      RETURNING id INTO v_mo;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'candidate_count', jsonb_array_length(v_candidates),
    'created', v_created,
    'candidates', v_candidates
  );
END;
$function$;

-- pos_sale_to_invoice → invoicing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: ekonomiroll med `invoicing` → svar; säljare utan invoicing → "not authorized".
CREATE OR REPLACE FUNCTION public.pos_sale_to_invoice(p_sale_id uuid, p_customer_name text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_due_in_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.pos_sales%ROWTYPE;
  v_email text;
  v_invoice_id uuid;
  v_invoice_number text;
  v_lines jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN
    RAISE EXCEPTION 'Only staff can create invoices from POS sales';
  END IF;
  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  IF v_sale.invoice_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'invoice_id', v_sale.invoice_id,
      'already_linked', true,
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_sale.invoice_id));
  END IF;
  IF v_sale.refund_of IS NOT NULL THEN RAISE EXCEPTION 'Cannot invoice a refund sale'; END IF;

  v_email := COALESCE(p_customer_email, v_sale.customer_email);
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'customer_email is required (sale has none on record)';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'description', l.product_name || CASE WHEN l.sku IS NOT NULL THEN ' (' || l.sku || ')' ELSE '' END,
      'quantity', l.quantity,
      'unit_price_cents', l.unit_price_cents,
      'total_cents', l.line_total_cents
    )), '[]'::jsonb)
  INTO v_lines
  FROM public.pos_sale_lines l WHERE l.sale_id = p_sale_id;

  v_invoice_number := 'POS-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');

  INSERT INTO public.invoices
    (invoice_number, customer_email, customer_name, status, line_items,
     subtotal_cents, tax_rate, tax_cents, total_cents, currency,
     due_date, issue_date, payment_terms, notes)
  VALUES
    (v_invoice_number, v_email, p_customer_name, 'draft', v_lines,
     v_sale.subtotal_cents, CASE WHEN v_sale.subtotal_cents > 0 THEN round(v_sale.tax_cents::numeric / v_sale.subtotal_cents, 4) ELSE 0 END,
     v_sale.tax_cents, v_sale.total_cents, COALESCE(v_sale.currency,'SEK'),
     CURRENT_DATE + COALESCE(p_due_in_days,30), CURRENT_DATE,
     'Net ' || COALESCE(p_due_in_days,30) || ' days',
     'Generated from POS receipt ' || v_sale.receipt_number)
  RETURNING id INTO v_invoice_id;

  UPDATE public.pos_sales SET invoice_id = v_invoice_id WHERE id = p_sale_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number, 'sale_id', p_sale_id,
    'total_cents', v_sale.total_cents);
END;
$function$;

-- post_manual_depreciation → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.post_manual_depreciation(p_asset_id uuid, p_amount_cents bigint, p_period_date date DEFAULT CURRENT_DATE, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_remaining BIGINT; v_je_id UUID; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'amount_cents must be > 0'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset is disposed'; END IF;

  v_remaining := v_asset.cost_cents - v_asset.accumulated_cents - v_asset.salvage_cents;
  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Adjustment % exceeds remaining depreciable base % (NBV minus salvage)', p_amount_cents, v_remaining;
  END IF;

  v_period := date_trunc('month', p_period_date)::DATE;
  v_je_id := NULL;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_period_date, format('Manual depreciation adjustment — %s%s', v_asset.name,
            CASE WHEN p_reason IS NOT NULL THEN ' ('||p_reason||')' ELSE '' END), 'fixed_asset_depreciation', 'posted') RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.depreciation_account, p_amount_cents, 0, format('Manual depr: %s', v_asset.name)),
           (v_je_id, v_asset.accumulated_account, 0, p_amount_cents, format('Accum depr: %s', v_asset.name));
  END IF;
  INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id, is_manual, notes)
  VALUES (v_asset.id, v_period, p_amount_cents, v_je_id, true, p_reason);
  UPDATE public.fixed_assets SET
    accumulated_cents = accumulated_cents + p_amount_cents,
    status = CASE WHEN (cost_cents - (accumulated_cents + p_amount_cents)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
  WHERE id = v_asset.id;

  RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id, 'amount_cents', p_amount_cents,
    'journal_entry_id', v_je_id, 'new_accumulated_cents', v_asset.accumulated_cents + p_amount_cents,
    'new_nbv_cents', v_asset.cost_cents - v_asset.accumulated_cents - p_amount_cents);
END; $function$;

-- post_units_depreciation → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.post_units_depreciation(p_asset_id uuid, p_units integer, p_period_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_amount BIGINT; v_remaining BIGINT; v_je_id UUID; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_units IS NULL OR p_units <= 0 THEN RAISE EXCEPTION 'units must be > 0'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF v_asset.status <> 'active' THEN RAISE EXCEPTION 'Asset is % — only active assets can be depreciated', v_asset.status; END IF;
  IF v_asset.depreciation_method <> 'units_of_production' THEN
    RAISE EXCEPTION 'Asset method is % — post_units_depreciation only applies to units_of_production', v_asset.depreciation_method;
  END IF;
  IF COALESCE(v_asset.total_expected_units, 0) <= 0 THEN
    RAISE EXCEPTION 'Asset has no total_expected_units — set it via update_fixed_asset first';
  END IF;

  v_period := date_trunc('month', p_period_date)::DATE;
  v_amount := ROUND((v_asset.cost_cents - v_asset.salvage_cents)::numeric * p_units / v_asset.total_expected_units);
  v_remaining := v_asset.cost_cents - v_asset.accumulated_cents - v_asset.salvage_cents;
  IF v_amount > v_remaining THEN v_amount := v_remaining; END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Asset already fully depreciated');
  END IF;

  v_je_id := NULL;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (p_period_date, format('Units depreciation %s units — %s', p_units, v_asset.name), 'fixed_asset_depreciation', 'posted') RETURNING id INTO v_je_id;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je_id, v_asset.depreciation_account, v_amount, 0, format('Units depr: %s', v_asset.name)),
           (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum depr: %s', v_asset.name));
  END IF;
  INSERT INTO public.depreciation_entries (asset_id, period_date, amount_cents, journal_entry_id, units, notes)
  VALUES (v_asset.id, v_period, v_amount, v_je_id, p_units, p_notes);
  UPDATE public.fixed_assets SET
    accumulated_cents = accumulated_cents + v_amount,
    units_depreciated = units_depreciated + p_units,
    status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
  WHERE id = v_asset.id;

  RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id, 'units', p_units,
    'amount_cents', v_amount, 'journal_entry_id', v_je_id,
    'units_depreciated_total', v_asset.units_depreciated + p_units);
END; $function$;

-- predict_lead_score → leads. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: säljare med `leads` → svar; roll utan leads → "not authorized".
CREATE OR REPLACE FUNCTION public.predict_lead_score(p_lead_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads;
  v_won bigint;
  v_lost bigint;
  v_prior numeric;
  v_odds numeric;
  v_prob numeric;
  v_factors jsonb := '[]'::jsonb;
  v_model text := 'bayes';
  v_activity_count bigint;
  -- feature helpers
  f_name text;
  f_value text;
  v_w bigint; v_l bigint; v_lr numeric;
  v_free_domains text[] := ARRAY['gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','live.com','aol.com','protonmail.com'];
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'leads')) THEN
    RAISE EXCEPTION 'Requires the leads module — an admin can grant it under Users → Role Permissions';
  END IF;

  IF p_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  ELSIF p_email IS NOT NULL THEN
    SELECT * INTO v_lead FROM public.leads WHERE lower(email) = lower(p_email)
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Provide p_lead_id or p_email';
  END IF;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;

  SELECT count(*) FILTER (WHERE status = 'customer' OR converted_at IS NOT NULL),
         count(*) FILTER (WHERE status = 'lost')
    INTO v_won, v_lost
  FROM public.leads WHERE id <> v_lead.id;

  SELECT count(*) INTO v_activity_count FROM public.lead_activities WHERE lead_id = v_lead.id;

  IF v_won + v_lost < 10 THEN
    -- Not enough closed history for a data-driven model: heuristic fallback.
    v_model := 'heuristic_fallback';
    v_prob := LEAST(0.95, GREATEST(0.02,
      0.10
      + CASE WHEN v_lead.company_id IS NOT NULL THEN 0.15 ELSE 0 END
      + CASE WHEN v_lead.phone IS NOT NULL THEN 0.10 ELSE 0 END
      + CASE WHEN split_part(lower(v_lead.email), '@', 2) <> ALL (v_free_domains) THEN 0.10 ELSE 0 END
      + LEAST(0.35, v_activity_count * 0.05)));
    v_factors := jsonb_build_array(jsonb_build_object(
      'factor', 'heuristic', 'detail',
      'fewer than 10 closed leads in history — attribute+engagement heuristic used'));
  ELSE
    v_prior := (v_won + 1.0) / (v_won + v_lost + 2.0);
    v_odds := v_prior / (1.0 - v_prior);

    -- Feature loop: source, email domain class, has_phone, has_company, activity bucket
    FOR f_name, f_value IN
      SELECT * FROM (VALUES
        ('source', COALESCE(v_lead.source, 'unknown')),
        ('domain_class', CASE WHEN split_part(lower(v_lead.email), '@', 2) = ANY (v_free_domains)
                              THEN 'free' ELSE 'corporate' END),
        ('has_phone', CASE WHEN v_lead.phone IS NULL THEN 'no' ELSE 'yes' END),
        ('has_company', CASE WHEN v_lead.company_id IS NULL THEN 'no' ELSE 'yes' END),
        ('activity_bucket', CASE WHEN v_activity_count = 0 THEN '0'
                                 WHEN v_activity_count <= 2 THEN '1-2'
                                 WHEN v_activity_count <= 5 THEN '3-5' ELSE '6+' END)
      ) t(name, value)
    LOOP
      IF f_name = 'source' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL) AND COALESCE(source,'unknown') = f_value),
               count(*) FILTER (WHERE status = 'lost' AND COALESCE(source,'unknown') = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSIF f_name = 'domain_class' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL)
                 AND (CASE WHEN split_part(lower(email),'@',2) = ANY (v_free_domains) THEN 'free' ELSE 'corporate' END) = f_value),
               count(*) FILTER (WHERE status = 'lost'
                 AND (CASE WHEN split_part(lower(email),'@',2) = ANY (v_free_domains) THEN 'free' ELSE 'corporate' END) = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSIF f_name = 'has_phone' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL)
                 AND (CASE WHEN phone IS NULL THEN 'no' ELSE 'yes' END) = f_value),
               count(*) FILTER (WHERE status = 'lost'
                 AND (CASE WHEN phone IS NULL THEN 'no' ELSE 'yes' END) = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSIF f_name = 'has_company' THEN
        SELECT count(*) FILTER (WHERE (status = 'customer' OR converted_at IS NOT NULL)
                 AND (CASE WHEN company_id IS NULL THEN 'no' ELSE 'yes' END) = f_value),
               count(*) FILTER (WHERE status = 'lost'
                 AND (CASE WHEN company_id IS NULL THEN 'no' ELSE 'yes' END) = f_value)
          INTO v_w, v_l FROM public.leads WHERE id <> v_lead.id;
      ELSE -- activity_bucket
        SELECT count(*) FILTER (WHERE (l.status = 'customer' OR l.converted_at IS NOT NULL) AND b.bucket = f_value),
               count(*) FILTER (WHERE l.status = 'lost' AND b.bucket = f_value)
          INTO v_w, v_l
        FROM public.leads l
        LEFT JOIN LATERAL (
          SELECT CASE WHEN count(*) = 0 THEN '0' WHEN count(*) <= 2 THEN '1-2'
                      WHEN count(*) <= 5 THEN '3-5' ELSE '6+' END AS bucket
          FROM public.lead_activities la WHERE la.lead_id = l.id
        ) b ON true
        WHERE l.id <> v_lead.id;
      END IF;

      -- Laplace-smoothed likelihood ratio P(f|won)/P(f|lost)
      v_lr := ((v_w + 1.0) / (v_won + 2.0)) / ((v_l + 1.0) / (v_lost + 2.0));
      v_odds := v_odds * v_lr;
      v_factors := v_factors || jsonb_build_object(
        'factor', f_name, 'value', f_value,
        'won_with', v_w, 'lost_with', v_l,
        'likelihood_ratio', round(v_lr, 3),
        'direction', CASE WHEN v_lr > 1.05 THEN 'positive'
                          WHEN v_lr < 0.95 THEN 'negative' ELSE 'neutral' END);
    END LOOP;

    v_prob := v_odds / (1.0 + v_odds);
  END IF;

  IF p_apply THEN
    UPDATE public.leads SET score = round(v_prob * 100)::integer, updated_at = now()
      WHERE id = v_lead.id;
    INSERT INTO public.lead_activities (lead_id, type, metadata, points)
    VALUES (v_lead.id, 'predictive_scoring',
            jsonb_build_object('model', v_model, 'probability_pct', round(v_prob * 100, 1)), 0);
  END IF;

  RETURN jsonb_build_object('success', true, 'lead_id', v_lead.id, 'email', v_lead.email,
    'model', v_model, 'win_probability_pct', round(v_prob * 100, 1),
    'training_won', v_won, 'training_lost', v_lost,
    'applied_to_score', p_apply, 'factors', v_factors);
END;
$function$;

-- procurement_run → inventory. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.procurement_run()
 RETURNS TABLE(suggestions_created integer, rules_evaluated integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rule record; v_on_hand numeric; v_reserved numeric; v_incoming numeric; v_virtual numeric; v_qty_to_order numeric; v_count integer := 0; v_evaluated integer := 0;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  FOR v_rule IN SELECT * FROM reorder_rules WHERE is_active = true LOOP
    v_evaluated := v_evaluated + 1;
    SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(reserved_quantity),0) INTO v_on_hand, v_reserved
      FROM stock_quants WHERE product_id = v_rule.product_id AND location_id = v_rule.location_id;
    SELECT COALESCE(SUM(pol.quantity - COALESCE(pol.received_quantity,0)),0) INTO v_incoming
      FROM purchase_order_lines pol JOIN purchase_orders po ON po.id = pol.purchase_order_id
      WHERE pol.product_id = v_rule.product_id AND po.status IN ('draft','sent','confirmed','partial');
    v_virtual := v_on_hand - v_reserved + COALESCE(v_incoming,0);
    IF v_virtual < v_rule.min_qty THEN
      v_qty_to_order := COALESCE(NULLIF(v_rule.reorder_qty,0), v_rule.max_qty - v_virtual);
      IF v_qty_to_order <= 0 THEN v_qty_to_order := v_rule.min_qty - v_virtual; END IF;
      IF NOT EXISTS (SELECT 1 FROM procurement_suggestions WHERE product_id = v_rule.product_id AND location_id = v_rule.location_id AND status = 'pending') THEN
        INSERT INTO procurement_suggestions (product_id, location_id, suggested_qty, procurement_method, preferred_vendor_id, needed_by, reasoning)
        VALUES (v_rule.product_id, v_rule.location_id, v_qty_to_order, v_rule.procurement_method, v_rule.preferred_vendor_id,
          (CURRENT_DATE + (v_rule.lead_time_days || ' days')::interval)::date,
          jsonb_build_object('on_hand', v_on_hand, 'reserved', v_reserved, 'incoming', v_incoming, 'virtual', v_virtual, 'min_qty', v_rule.min_qty, 'max_qty', v_rule.max_qty));
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_count, v_evaluated;
END; $function$;

-- progress_work_order → manufacturing. Före: v_writer boolean := (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'));
-- Lackmus: produktionsroll med `manufacturing` → svar; roll utan manufacturing → "not authorized".
CREATE OR REPLACE FUNCTION public.progress_work_order(p_work_order_id uuid, p_action text, p_actual_minutes numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_writer boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'manufacturing'));
  v_wo RECORD;
  v_rate int := 0;
  v_minutes numeric;
  v_cost int;
BEGIN
  IF NOT v_writer THEN RAISE EXCEPTION 'Requires the manufacturing module — an admin can grant it under Users → Role Permissions'; END IF;

  SELECT * INTO v_wo FROM mo_work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order % not found', p_work_order_id; END IF;

  SELECT COALESCE(wc.cost_per_hour_cents, 0) INTO v_rate
    FROM work_centers wc WHERE wc.id = v_wo.work_center_id;
  v_rate := COALESCE(v_rate, 0);

  IF p_action = 'start' THEN
    IF v_wo.status = 'done' THEN RAISE EXCEPTION 'Work order already done'; END IF;
    UPDATE mo_work_orders
      SET status = 'in_progress',
          started_at = COALESCE(started_at, now())
      WHERE id = p_work_order_id;

  ELSIF p_action = 'pause' THEN
    IF v_wo.status <> 'in_progress' THEN RAISE EXCEPTION 'Only an in-progress work order can be paused'; END IF;
    v_minutes := COALESCE(
      p_actual_minutes,
      COALESCE(v_wo.actual_minutes, 0) + EXTRACT(EPOCH FROM (now() - COALESCE(v_wo.started_at, now()))) / 60.0
    );
    UPDATE mo_work_orders
      SET status = 'pending',
          actual_minutes = ROUND(v_minutes, 2),
          actual_labor_cost_cents = ROUND(v_minutes / 60.0 * v_rate)::int
      WHERE id = p_work_order_id;

  ELSIF p_action = 'done' THEN
    v_minutes := COALESCE(
      p_actual_minutes,
      v_wo.actual_minutes,
      CASE WHEN v_wo.started_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (now() - v_wo.started_at)) / 60.0
        ELSE v_wo.planned_minutes END
    );
    v_cost := ROUND(v_minutes / 60.0 * v_rate)::int;
    UPDATE mo_work_orders
      SET status = 'done',
          started_at = COALESCE(started_at, now()),
          completed_at = now(),
          actual_minutes = ROUND(v_minutes, 2),
          actual_labor_cost_cents = v_cost
      WHERE id = p_work_order_id;

  ELSIF p_action = 'cancel' THEN
    UPDATE mo_work_orders SET status = 'cancelled' WHERE id = p_work_order_id;

  ELSE
    RAISE EXCEPTION 'Unknown action: %. Use start|pause|done|cancel', p_action;
  END IF;

  SELECT * INTO v_wo FROM mo_work_orders WHERE id = p_work_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'work_order_id', p_work_order_id,
    'mo_id', v_wo.mo_id,
    'status', v_wo.status,
    'actual_minutes', v_wo.actual_minutes,
    'actual_labor_cost_cents', v_wo.actual_labor_cost_cents,
    'variance_minutes', COALESCE(v_wo.actual_minutes, 0) - v_wo.planned_minutes,
    'mo_open_work_orders', (
      SELECT COUNT(*) FROM mo_work_orders
      WHERE mo_id = v_wo.mo_id AND status NOT IN ('done', 'cancelled')
    )
  );
END; $function$;

-- record_invoice_payment → invoicing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN RAISE EXCEPTION 'Not authorized to record payments'; END IF;
-- Lackmus: ekonomiroll med `invoicing` → svar; säljare utan invoicing → "not authorized".
CREATE OR REPLACE FUNCTION public.record_invoice_payment(p_invoice_id uuid, p_amount_cents bigint, p_method text DEFAULT 'manual'::text, p_paid_at timestamp with time zone DEFAULT now(), p_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inv RECORD; v_remaining bigint; v_new_paid bigint; v_fully boolean; v_new_status invoice_status;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'invoicing')) THEN RAISE EXCEPTION 'Not authorized to record payments'; END IF;
  IF p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
  SELECT id, total_cents, COALESCE(paid_amount_cents,0) AS paid_amount_cents, status, invoice_type INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.status::text = 'cancelled' THEN RAISE EXCEPTION 'Cannot pay a cancelled invoice'; END IF;
  IF COALESCE(v_inv.invoice_type,'invoice') <> 'invoice' THEN RAISE EXCEPTION 'Cannot pay a credit note'; END IF;

  -- Idempotency: a payment already recorded under this reference for this invoice is a no-op.
  IF p_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM audit_logs
     WHERE action = 'invoice.payment_recorded' AND entity_type = 'invoice' AND entity_id = p_invoice_id
       AND metadata->>'reference' = p_reference
  ) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'invoice_id', p_invoice_id,
      'paid_amount_cents', v_inv.paid_amount_cents,
      'remaining_cents', GREATEST(0, v_inv.total_cents - v_inv.paid_amount_cents),
      'fully_paid', v_inv.paid_amount_cents >= v_inv.total_cents, 'status', v_inv.status::text);
  END IF;

  v_remaining := GREATEST(0, v_inv.total_cents - v_inv.paid_amount_cents);
  IF p_amount_cents > v_remaining THEN RAISE EXCEPTION 'Payment % exceeds remaining balance %', p_amount_cents, v_remaining; END IF;
  v_new_paid := v_inv.paid_amount_cents + p_amount_cents;
  v_fully := (v_new_paid >= v_inv.total_cents);
  v_new_status := CASE
    WHEN v_fully THEN 'paid'::invoice_status
    WHEN v_inv.status = 'overdue'::invoice_status THEN 'overdue'::invoice_status
    WHEN v_new_paid > 0 THEN 'partially_paid'::invoice_status
    ELSE v_inv.status END;
  UPDATE invoices SET paid_amount_cents = v_new_paid, status = v_new_status, paid_at = CASE WHEN v_fully THEN COALESCE(paid_at, p_paid_at) ELSE paid_at END WHERE id = p_invoice_id;
  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('invoice.payment_recorded', 'invoice', p_invoice_id, auth.uid(),
    jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method, 'paid_amount_cents', v_new_paid, 'fully_paid', v_fully, 'reference', p_reference));
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'amount_cents', p_amount_cents, 'paid_amount_cents', v_new_paid, 'remaining_cents', GREATEST(0, v_inv.total_cents - v_new_paid), 'fully_paid', v_fully, 'status', v_new_status::text);
END; $function$;

-- record_petty_cash_count → accounting. Före: OR has_role(v_uid, 'admin') OR has_role(v_uid, 'approver')) THEN
-- Lackmus: ekonomiroll med `accounting` → svar; roll utan accounting → "not authorized".
CREATE OR REPLACE FUNCTION public.record_petty_cash_count(p_cash_account_code text, p_counted_cents bigint, p_diff_account_code text DEFAULT NULL::text, p_count_date date DEFAULT NULL::date, p_notes text DEFAULT NULL::text, p_currency text DEFAULT 'SEK'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_date date := COALESCE(p_count_date, CURRENT_DATE);
  v_book bigint := 0;
  v_diff bigint;
  v_je_id uuid;
  v_count_id uuid;
BEGIN
  p_diff_account_code := COALESCE(p_diff_account_code, public.account_for('cash_difference'));
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(v_uid,'accounting')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)
    INTO v_book
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE l.account_code = p_cash_account_code
     AND e.status = 'posted'
     AND e.entry_date <= v_date;

  v_diff := p_counted_cents - v_book;

  IF v_diff <> 0 THEN
    INSERT INTO public.journal_entries (entry_date, description, status, source)
    VALUES (v_date,
            'Petty-cash count adjustment ' || p_cash_account_code,
            'posted', 'petty_cash_count')
    RETURNING id INTO v_je_id;

    IF v_diff > 0 THEN
      -- Counted more than book: debit cash, credit diff (income/gain)
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_cash_account_code, 'Cash', v_diff, 0),
        (v_je_id, p_diff_account_code, 'Cash difference', 0, v_diff);
    ELSE
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
      VALUES
        (v_je_id, p_diff_account_code, 'Cash difference', -v_diff, 0),
        (v_je_id, p_cash_account_code, 'Cash', 0, -v_diff);
    END IF;
  END IF;

  INSERT INTO public.petty_cash_counts (
    cash_account_code, count_date, counted_cents, book_balance_cents,
    difference_cents, diff_account_code, currency, notes, journal_entry_id, counted_by
  ) VALUES (
    p_cash_account_code, v_date, p_counted_cents, v_book,
    v_diff, p_diff_account_code, p_currency, p_notes, v_je_id, v_uid
  ) RETURNING id INTO v_count_id;

  RETURN jsonb_build_object(
    'count_id', v_count_id,
    'book_balance_cents', v_book,
    'difference_cents', v_diff,
    'journal_entry_id', v_je_id
  );
END;
$function$;

-- record_visit_proof → fieldService. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.record_visit_proof(p_visit_id uuid, p_signature_url text DEFAULT NULL::text, p_photo_urls jsonb DEFAULT NULL::jsonb, p_signed_by text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visit public.service_visits%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- record_visit_time → fieldService. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: tekniker med `fieldService` → svar; roll utan fieldService → "not authorized".
CREATE OR REPLACE FUNCTION public.record_visit_time(p_visit_id uuid, p_action text, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visit public.service_visits%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fieldService')) THEN
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

-- refund_pos_sale → pos. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer')) THEN
-- Lackmus: kassabiträde med `pos` i Role Permissions → svar; kundkonto utan pos → "not authorized".
CREATE OR REPLACE FUNCTION public.refund_pos_sale(p_sale_id uuid, p_lines jsonb DEFAULT NULL::jsonb, p_reason text DEFAULT NULL::text, p_method text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.pos_sales%ROWTYPE;
  v_line public.pos_sale_lines%ROWTYPE;
  v_req jsonb;
  v_qty numeric;
  v_already numeric;
  v_refund_id uuid;
  v_receipt text;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer := 0;
  v_line_subtotal integer;
  v_line_tax integer;
  v_method text;
  v_refunded_before integer;
  v_count int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'pos')) THEN
    RAISE EXCEPTION 'Only staff can refund POS sales';
  END IF;

  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  IF v_sale.refund_of IS NOT NULL THEN RAISE EXCEPTION 'Sale % is itself a refund', p_sale_id; END IF;
  IF v_sale.status NOT IN ('completed','refunded','partially_refunded') THEN
    RAISE EXCEPTION 'Only completed sales can be refunded (status %)', v_sale.status;
  END IF;

  v_method := COALESCE(p_method, CASE WHEN v_sale.payment_method = 'split' THEN 'cash' ELSE v_sale.payment_method END, 'cash');
  v_receipt := 'RF-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((EXTRACT(EPOCH FROM now())::bigint % 100000)::text, 5, '0');

  -- Total already refunded (positive number)
  SELECT COALESCE(-SUM(total_cents), 0) INTO v_refunded_before
  FROM public.pos_sales WHERE refund_of = p_sale_id;

  INSERT INTO public.pos_sales
    (receipt_number, register_id, session_id, customer_id, customer_email,
     subtotal_cents, tax_cents, discount_cents, total_cents, currency,
     payment_method, status, refund_of, refund_reason, metadata)
  VALUES
    (v_receipt, v_sale.register_id, p_session_id, v_sale.customer_id, v_sale.customer_email,
     0, 0, 0, 0, v_sale.currency, v_method, 'completed', p_sale_id, p_reason,
     jsonb_build_object('original_receipt', v_sale.receipt_number))
  RETURNING id INTO v_refund_id;

  FOR v_line IN SELECT * FROM public.pos_sale_lines WHERE sale_id = p_sale_id
  LOOP
    v_qty := NULL;
    IF p_lines IS NULL THEN
      v_qty := v_line.quantity;
    ELSE
      SELECT (r->>'quantity')::numeric INTO v_qty
      FROM jsonb_array_elements(p_lines) r
      WHERE (r->>'sale_line_id')::uuid = v_line.id;
    END IF;
    CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

    -- Cap at what remains refundable for this line
    SELECT COALESCE(-SUM(rl.quantity), 0) INTO v_already
    FROM public.pos_sale_lines rl
    JOIN public.pos_sales rs ON rs.id = rl.sale_id
    WHERE rs.refund_of = p_sale_id
      AND rl.product_name = v_line.product_name
      AND COALESCE(rl.product_id::text,'') = COALESCE(v_line.product_id::text,'')
      AND rl.sale_id <> v_refund_id;
    IF v_qty > v_line.quantity - v_already THEN
      RAISE EXCEPTION 'Refund quantity % exceeds remaining % for line "%"',
        v_qty, v_line.quantity - v_already, v_line.product_name;
    END IF;

    v_line_subtotal := -round((v_line.unit_price_cents * v_qty)
                       - (COALESCE(v_line.discount_cents,0) * v_qty / v_line.quantity))::integer;
    v_line_tax := round(v_line_subtotal * COALESCE(v_line.tax_rate,0) / 100.0)::integer;

    INSERT INTO public.pos_sale_lines
      (sale_id, product_id, product_name, sku, quantity, unit_price_cents, discount_cents, tax_rate, line_total_cents)
    VALUES
      (v_refund_id, v_line.product_id, v_line.product_name, v_line.sku, -v_qty,
       v_line.unit_price_cents, 0, v_line.tax_rate, v_line_subtotal + v_line_tax);

    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_subtotal + v_line_tax;
    v_count := v_count + 1;

    -- Restock returned goods
    IF v_line.product_id IS NOT NULL THEN
      PERFORM public.emit_platform_event(
        'stock.movement',
        jsonb_build_object(
          'product_id', v_line.product_id,
          'qty_delta', v_qty,
          'quantity', v_qty,
          'reason', 'pos_refund',
          'reference_type', 'pos_sale',
          'reference_id', v_refund_id,
          'sku', v_line.sku
        ),
        'pos');
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nothing to refund — no matching lines (already fully refunded?)';
  END IF;
  IF v_refunded_before - v_total > v_sale.total_cents THEN
    RAISE EXCEPTION 'Refund exceeds original sale total: original %, already refunded %, this refund %',
      v_sale.total_cents, v_refunded_before, -v_total;
  END IF;

  UPDATE public.pos_sales
     SET subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_total
   WHERE id = v_refund_id;

  INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference)
  VALUES (v_refund_id, v_method, v_total, 'refund of ' || v_sale.receipt_number);

  -- Reverse loyalty points earned on the refunded portion
  UPDATE public.loyalty_accounts a
     SET points_balance = points_balance - floor(-v_total / 1000.0)::integer,
         updated_at = now()
   WHERE lower(a.customer_email) = lower(COALESCE(v_sale.customer_email,''))
     AND floor(-v_total / 1000.0)::integer > 0;

  UPDATE public.pos_sales
     SET status = CASE WHEN v_refunded_before - v_total >= total_cents THEN 'refunded' ELSE 'partially_refunded' END
   WHERE id = p_sale_id;

  IF p_session_id IS NOT NULL THEN
    UPDATE public.pos_sessions
       SET total_sales_cents = total_sales_cents + v_total
     WHERE id = p_session_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refund_sale_id', v_refund_id,
    'receipt_number', v_receipt,
    'refund_total_cents', v_total,
    'original_sale_id', p_sale_id,
    'original_status', (SELECT status FROM public.pos_sales WHERE id = p_sale_id),
    'lines_refunded', v_count
  );
END;
$function$;

-- register_fixed_asset → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.register_fixed_asset(p_name text, p_cost_cents bigint, p_useful_life_months integer, p_purchase_date date DEFAULT CURRENT_DATE, p_in_service_date date DEFAULT NULL::date, p_salvage_cents bigint DEFAULT 0, p_method text DEFAULT 'straight_line'::text, p_declining_rate numeric DEFAULT NULL::numeric, p_asset_account text DEFAULT NULL::text, p_depreciation_account text DEFAULT NULL::text, p_accumulated_account text DEFAULT NULL::text, p_credit_account text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_create_journal_entry boolean DEFAULT true)
 RETURNS fixed_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets;
  v_je_id UUID;
BEGIN
  p_asset_account := COALESCE(p_asset_account, public.account_for('fixed_asset'));
  p_depreciation_account := COALESCE(p_depreciation_account, public.account_for('depreciation_expense'));
  p_accumulated_account := COALESCE(p_accumulated_account, public.account_for('accumulated_depreciation'));
  p_credit_account := COALESCE(p_credit_account, public.account_for('bank'));
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions';
  END IF;

  INSERT INTO public.fixed_assets (
    name, description, cost_cents, salvage_cents, purchase_date, in_service_date,
    useful_life_months, depreciation_method, declining_rate,
    asset_account, depreciation_account, accumulated_account
  ) VALUES (
    p_name, p_description, p_cost_cents, COALESCE(p_salvage_cents,0),
    p_purchase_date, COALESCE(p_in_service_date, p_purchase_date),
    p_useful_life_months, p_method, p_declining_rate,
    p_asset_account, p_depreciation_account, p_accumulated_account
  ) RETURNING * INTO v_asset;

  IF p_create_journal_entry
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN
    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (
      v_asset.purchase_date,
      format('Acquisition of fixed asset: %s', v_asset.name),
      'fixed_asset_register',
      'posted'
    ) RETURNING id INTO v_je_id;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES
      (v_je_id, p_asset_account,  p_cost_cents, 0, format('Asset: %s', v_asset.name)),
      (v_je_id, p_credit_account, 0, p_cost_cents, format('Acquisition: %s', v_asset.name));
  END IF;

  RETURN v_asset;
END;
$function$;

-- reject_procurement_suggestion → inventory. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN RAISE EXCEPTION 'Only admins can reject suggestions'; END IF;
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.reject_procurement_suggestion(p_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) THEN RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions'; END IF;
  UPDATE procurement_suggestions SET status='rejected', resolved_at=now(), resolved_by=auth.uid(),
    reasoning = COALESCE(reasoning,'{}'::jsonb) || jsonb_build_object('rejection_reason', p_reason)
    WHERE id = p_id AND status = 'pending';
END; $function$;

-- render_pos_receipt → pos. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
-- Lackmus: kassabiträde med `pos` i Role Permissions → svar; kundkonto utan pos → "not authorized".
CREATE OR REPLACE FUNCTION public.render_pos_receipt(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.pos_sales%ROWTYPE;
  v_register public.pos_registers%ROWTYPE;
  v_lines jsonb;
  v_payments jsonb;
  v_branding jsonb;
  v_general jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'pos')) THEN
    RAISE EXCEPTION 'Only staff can render receipts';
  END IF;
  SELECT * INTO v_sale FROM public.pos_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale % not found', p_sale_id; END IF;
  SELECT * INTO v_register FROM public.pos_registers WHERE id = v_sale.register_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'product_name', l.product_name, 'sku', l.sku, 'quantity', l.quantity,
      'unit_price_cents', l.unit_price_cents, 'discount_cents', l.discount_cents,
      'tax_rate', l.tax_rate, 'line_total_cents', l.line_total_cents
    ) ORDER BY l.created_at), '[]'::jsonb)
  INTO v_lines FROM public.pos_sale_lines l WHERE l.sale_id = p_sale_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'method', p.method, 'amount_cents', p.amount_cents, 'reference', p.reference
    ) ORDER BY p.created_at), '[]'::jsonb)
  INTO v_payments FROM public.pos_payments p WHERE p.sale_id = p_sale_id;

  SELECT value INTO v_branding FROM public.site_settings WHERE key = 'branding';
  SELECT value INTO v_general FROM public.site_settings WHERE key = 'general';

  RETURN jsonb_build_object(
    'success', true,
    'receipt', jsonb_build_object(
      'receipt_number', v_sale.receipt_number,
      'created_at', v_sale.created_at,
      'is_refund', v_sale.refund_of IS NOT NULL,
      'refund_of_sale_id', v_sale.refund_of,
      'refund_reason', v_sale.refund_reason,
      'currency', v_sale.currency,
      'lines', v_lines,
      'payments', v_payments,
      'subtotal_cents', v_sale.subtotal_cents,
      'discount_cents', v_sale.discount_cents,
      'tax_cents', v_sale.tax_cents,
      'tip_cents', COALESCE(v_sale.tip_cents, 0),
      'total_cents', v_sale.total_cents,
      'grand_total_cents', v_sale.total_cents + COALESCE(v_sale.tip_cents, 0),
      'invoice_number', (SELECT invoice_number FROM public.invoices WHERE id = v_sale.invoice_id),
      'table', (SELECT name FROM public.pos_tables WHERE id = v_sale.table_id)
    ),
    'template', jsonb_build_object(
      'header', v_register.receipt_header,
      'footer', v_register.receipt_footer,
      'register_name', v_register.name,
      'register_location', v_register.location,
      'site_branding', v_branding,
      'site_general', v_general
    )
  );
END;
$function$;

-- revalue_fixed_asset → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.revalue_fixed_asset(p_asset_id uuid, p_new_value_cents bigint, p_reason text DEFAULT NULL::text, p_revaluation_date date DEFAULT CURRENT_DATE, p_impairment_account text DEFAULT NULL::text, p_reversal_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset public.fixed_assets; v_nbv BIGINT; v_delta BIGINT; v_amount BIGINT; v_je_id UUID;
BEGIN
  p_impairment_account := COALESCE(p_impairment_account, public.account_for('impairment'));
  p_reversal_account := COALESCE(p_reversal_account, public.account_for('impairment_reversal'));
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_new_value_cents IS NULL OR p_new_value_cents < 0 THEN RAISE EXCEPTION 'new_value_cents must be >= 0'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset is disposed'; END IF;

  v_nbv := v_asset.cost_cents - v_asset.accumulated_cents;
  v_delta := p_new_value_cents - v_nbv;
  IF v_delta = 0 THEN
    RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id, 'message', 'New value equals current NBV — nothing to post', 'nbv_cents', v_nbv);
  END IF;

  v_je_id := NULL;
  IF v_delta < 0 THEN
    -- Impairment: Dt impairment loss / Cr accumulated
    v_amount := -v_delta;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (p_revaluation_date, format('Impairment — %s%s', v_asset.name,
              CASE WHEN p_reason IS NOT NULL THEN ' ('||p_reason||')' ELSE '' END), 'fixed_asset_revaluation', 'posted') RETURNING id INTO v_je_id;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, p_impairment_account, v_amount, 0, format('Impairment loss: %s', v_asset.name)),
             (v_je_id, v_asset.accumulated_account, 0, v_amount, format('Accum impairment: %s', v_asset.name));
    END IF;
    UPDATE public.fixed_assets SET
      accumulated_cents = accumulated_cents + v_amount,
      status = CASE WHEN (cost_cents - (accumulated_cents + v_amount)) <= salvage_cents THEN 'fully_depreciated' ELSE status END
    WHERE id = v_asset.id;
  ELSE
    -- Reversal of impairment / write-up: Dt accumulated / Cr reversal income.
    -- Capped so accumulated never goes negative (NBV never exceeds cost).
    v_amount := LEAST(v_delta, v_asset.accumulated_cents);
    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Cannot revalue above original cost — no accumulated depreciation/impairment to reverse');
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries') THEN
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (p_revaluation_date, format('Impairment reversal — %s%s', v_asset.name,
              CASE WHEN p_reason IS NOT NULL THEN ' ('||p_reason||')' ELSE '' END), 'fixed_asset_revaluation', 'posted') RETURNING id INTO v_je_id;
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, v_asset.accumulated_account, v_amount, 0, format('Reversal: %s', v_asset.name)),
             (v_je_id, p_reversal_account, 0, v_amount, format('Impairment reversal income: %s', v_asset.name));
    END IF;
    UPDATE public.fixed_assets SET
      accumulated_cents = accumulated_cents - v_amount,
      status = CASE WHEN status = 'fully_depreciated' THEN 'active' ELSE status END
    WHERE id = v_asset.id;
    v_amount := v_amount; -- positive for reversal
  END IF;

  INSERT INTO public.asset_revaluations (asset_id, revaluation_date, amount_cents, new_value_cents, reason, journal_entry_id)
  VALUES (v_asset.id, p_revaluation_date, CASE WHEN v_delta < 0 THEN -v_amount ELSE v_amount END, p_new_value_cents, p_reason, v_je_id);

  RETURN jsonb_build_object('success', true, 'asset_id', v_asset.id,
    'kind', CASE WHEN v_delta < 0 THEN 'impairment' ELSE 'reversal' END,
    'amount_cents', v_amount, 'journal_entry_id', v_je_id,
    'old_nbv_cents', v_nbv,
    'new_nbv_cents', CASE WHEN v_delta < 0 THEN v_nbv - v_amount ELSE v_nbv + v_amount END);
END; $function$;

-- revalue_open_balances → multiCurrency. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `multiCurrency` → svar; roll utan multiCurrency → "not authorized".
CREATE OR REPLACE FUNCTION public.revalue_open_balances(p_revaluation_date date DEFAULT CURRENT_DATE, p_fx_gain_account text DEFAULT NULL::text, p_fx_loss_account text DEFAULT NULL::text, p_ar_account text DEFAULT NULL::text, p_ap_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base TEXT;
  v_total_gain NUMERIC := 0;
  v_total_loss NUMERIC := 0;
  v_ar_lines INT := 0;
  v_ap_lines INT := 0;
  v_ar_delta NUMERIC := 0;
  v_ap_delta NUMERIC := 0;
  v_je_id UUID;
  rec RECORD;
  v_current_rate NUMERIC;
  v_delta NUMERIC;
BEGIN
  p_fx_gain_account := COALESCE(p_fx_gain_account, public.account_for('fx_gain'));
  p_fx_loss_account := COALESCE(p_fx_loss_account, public.account_for('fx_loss'));
  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  p_ap_account := COALESCE(p_ap_account, public.account_for('accounts_payable'));
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'multiCurrency')) THEN
    RAISE EXCEPTION 'Requires the multiCurrency module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT code INTO v_base FROM public.currencies WHERE is_base = true LIMIT 1;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'No base currency configured';
  END IF;

  -- Compute AR delta (open invoices in non-base currency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    FOR rec IN
      SELECT id, currency, exchange_rate, total_cents, status
      FROM public.invoices
      WHERE currency <> v_base
        AND COALESCE(status::text, 'draft') NOT IN ('paid', 'cancelled', 'void')
    LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      -- delta in base currency = amount * (current_rate - booked_rate)
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      v_ar_delta := v_ar_delta + v_delta;
      v_ar_lines := v_ar_lines + 1;
    END LOOP;
  END IF;

  -- Compute AP delta (open POs / vendor bills in non-base currency)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchase_orders') THEN
    FOR rec IN
      SELECT id, currency, exchange_rate, COALESCE(total_cents, 0) as total_cents, status
      FROM public.purchase_orders
      WHERE currency <> v_base
        AND COALESCE(status::text, 'draft') NOT IN ('paid', 'cancelled', 'closed')
    LOOP
      v_current_rate := public.get_exchange_rate(rec.currency, v_base, p_revaluation_date);
      v_delta := (rec.total_cents::NUMERIC / 100.0) * (v_current_rate - rec.exchange_rate);
      -- AP delta is opposite sign (liability)
      v_ap_delta := v_ap_delta - v_delta;
      v_ap_lines := v_ap_lines + 1;
    END LOOP;
  END IF;

  IF v_ar_delta > 0 THEN v_total_gain := v_total_gain + v_ar_delta; ELSE v_total_loss := v_total_loss + ABS(v_ar_delta); END IF;
  IF v_ap_delta > 0 THEN v_total_gain := v_total_gain + v_ap_delta; ELSE v_total_loss := v_total_loss + ABS(v_ap_delta); END IF;

  -- Create journal entry only if there's anything to book and accounting tables exist
  IF (v_total_gain > 0.01 OR v_total_loss > 0.01)
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entries')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='journal_entry_lines') THEN

    INSERT INTO public.journal_entries (entry_date, description, source, status)
    VALUES (
      p_revaluation_date,
      format('FX revaluation %s — AR %s lines, AP %s lines', p_revaluation_date, v_ar_lines, v_ap_lines),
      'fx_revaluation',
      'posted'
    )
    RETURNING id INTO v_je_id;

    -- AR delta
    IF ABS(v_ar_delta) > 0.01 THEN
      IF v_ar_delta > 0 THEN
        -- AR increased in base value → Dt 1510, Cr 3960 (gain)
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_ar_account, ROUND(v_ar_delta * 100), 0, 'FX revaluation AR'),
          (v_je_id, p_fx_gain_account, 0, ROUND(v_ar_delta * 100), 'Unrealized FX gain on AR');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_fx_loss_account, ROUND(ABS(v_ar_delta) * 100), 0, 'Unrealized FX loss on AR'),
          (v_je_id, p_ar_account, 0, ROUND(ABS(v_ar_delta) * 100), 'FX revaluation AR');
      END IF;
    END IF;

    -- AP delta
    IF ABS(v_ap_delta) > 0.01 THEN
      IF v_ap_delta > 0 THEN
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_ap_account, ROUND(v_ap_delta * 100), 0, 'FX revaluation AP'),
          (v_je_id, p_fx_gain_account, 0, ROUND(v_ap_delta * 100), 'Unrealized FX gain on AP');
      ELSE
        INSERT INTO public.journal_entry_lines (entry_id, account_code, debit_cents, credit_cents, description)
        VALUES
          (v_je_id, p_fx_loss_account, ROUND(ABS(v_ap_delta) * 100), 0, 'Unrealized FX loss on AP'),
          (v_je_id, p_ap_account, 0, ROUND(ABS(v_ap_delta) * 100), 'FX revaluation AP');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'revaluation_date', p_revaluation_date,
    'base_currency', v_base,
    'ar_lines', v_ar_lines,
    'ap_lines', v_ap_lines,
    'ar_delta', v_ar_delta,
    'ap_delta', v_ap_delta,
    'total_gain', v_total_gain,
    'total_loss', v_total_loss,
    'journal_entry_id', v_je_id
  );
END;
$function$;

-- run_monthly_depreciation → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN RAISE EXCEPTION 'run_monthly_depreciation: admin role required'; END IF;
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(p_period_date date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets; v_amount BIGINT; v_je_id UUID; v_total_amount BIGINT := 0; v_processed INT := 0; v_skipped INT := 0; v_period DATE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions'; END IF;
  v_period := date_trunc('month', p_period_date)::DATE;
  FOR v_asset IN SELECT * FROM public.fixed_assets WHERE status = 'active' AND in_service_date <= (v_period + INTERVAL '1 month - 1 day')::DATE LOOP
    IF EXISTS (SELECT 1 FROM public.depreciation_entries WHERE asset_id = v_asset.id AND period_date = v_period AND is_manual = false AND units IS NULL) THEN
      v_skipped := v_skipped + 1; CONTINUE; END IF;
    -- Usage-driven assets are posted via post_units_depreciation, not the sweep.
    IF v_asset.depreciation_method = 'units_of_production' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_amount := public.compute_monthly_depreciation(v_asset, v_period);
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

-- run_recurring_quotes → quotes. Före: IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
-- Lackmus: säljare med `quotes` → svar; roll utan quotes → "not authorized".
CREATE OR REPLACE FUNCTION public.run_recurring_quotes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tpl RECORD;
  src RECORD;
  new_id UUID;
  new_number TEXT;
  generated INT := 0;
  skipped INT := 0;
  results JSONB := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'quotes')) THEN
    RAISE EXCEPTION 'Requires the quotes module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR tpl IN
    SELECT * FROM public.recurring_quote_templates
    WHERE active = true AND next_run_at <= CURRENT_DATE
    ORDER BY next_run_at
    LIMIT 200
  LOOP
    SELECT * INTO src FROM public.quotes WHERE id = tpl.source_quote_id;
    IF NOT FOUND THEN
      skipped := skipped + 1;
      results := results || jsonb_build_object('template_id', tpl.id, 'skipped', 'source_missing');
      CONTINUE;
    END IF;

    new_number := 'QUO-R-' || to_char(now(), 'YYYYMMDD') || '-' || substr(gen_random_uuid()::text, 1, 6);

    INSERT INTO public.quotes (
      quote_number, lead_id, deal_id, status, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency,
      valid_until, notes, created_by
    ) VALUES (
      new_number, src.lead_id, src.deal_id, 'draft', COALESCE(src.line_items, '[]'::jsonb),
      src.subtotal_cents, src.tax_rate, src.tax_cents, src.total_cents, src.currency,
      (CURRENT_DATE + INTERVAL '30 days')::date,
      COALESCE(src.notes, '') || E'\n[Auto-generated from recurring template: ' || tpl.name || ']',
      tpl.created_by
    ) RETURNING id INTO new_id;

    UPDATE public.recurring_quote_templates
    SET next_run_at = public.advance_quote_recurrence(next_run_at, interval),
        last_generated_at = now(),
        last_generated_quote_id = new_id,
        generated_count = generated_count + 1
    WHERE id = tpl.id;

    generated := generated + 1;
    results := results || jsonb_build_object('template_id', tpl.id, 'quote_id', new_id, 'quote_number', new_number);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'generated', generated, 'skipped', skipped, 'results', results);
END;
$function$;

-- run_ticket_escalations → tickets. Före: IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
-- Lackmus: support med `tickets` → svar; roll utan tickets → "not authorized".
CREATE OR REPLACE FUNCTION public.run_ticket_escalations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rule record;
  v_ticket record;
  v_applied integer := 0;
  v_rules_evaluated integer := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  -- Only admins or service_role (edge functions / MCP gateway) may run the sweep.
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'tickets')) THEN
    RAISE EXCEPTION 'Requires the tickets module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR v_rule IN
    SELECT * FROM public.ticket_escalation_rules WHERE is_active = true
  LOOP
    v_rules_evaluated := v_rules_evaluated + 1;

    FOR v_ticket IN
      EXECUTE format(
        'SELECT id, priority, assigned_to, team_id, status FROM public.tickets
          WHERE status NOT IN (''resolved'',''closed'')
            AND (%L IS NULL OR status = %L)
            AND (%L IS NULL OR priority = %L)
            AND (NOT %L OR assigned_to IS NULL)
            AND %I < now() - (%L || '' hours'')::interval',
        v_rule.match_status, v_rule.match_status,
        v_rule.match_priority, v_rule.match_priority,
        v_rule.match_unassigned,
        v_rule.age_field,
        v_rule.age_hours::text
      )
    LOOP
      -- Raise priority
      IF v_rule.action_raise_priority IS NOT NULL
         AND v_ticket.priority IS DISTINCT FROM v_rule.action_raise_priority THEN
        UPDATE public.tickets
          SET priority = v_rule.action_raise_priority,
              updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Reassign
      IF v_rule.action_reassign_to IS NOT NULL AND v_rule.action_reassign_kind = 'user' THEN
        UPDATE public.tickets
          SET assigned_to = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      ELSIF v_rule.action_reassign_to IS NOT NULL AND v_rule.action_reassign_kind = 'team' THEN
        UPDATE public.tickets
          SET team_id = v_rule.action_reassign_to, updated_at = now()
          WHERE id = v_ticket.id;
      END IF;

      -- Notify (create support_escalations row if that table exists)
      IF v_rule.action_notify THEN
        BEGIN
          INSERT INTO public.support_escalations (ticket_id, reason, escalated_at, resolved)
          VALUES (v_ticket.id,
                  format('Auto-escalation rule: %s', v_rule.name),
                  now(),
                  false);
        EXCEPTION WHEN OTHERS THEN
          -- swallow (table may have different columns on some instances)
          NULL;
        END;
      END IF;

      v_applied := v_applied + 1;
      v_results := v_results || jsonb_build_object(
        'ticket_id', v_ticket.id,
        'rule_id', v_rule.id,
        'rule_name', v_rule.name
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'rules_evaluated', v_rules_evaluated,
    'tickets_escalated', v_applied,
    'details', v_results
  );
END;
$function$;

-- schedule_return_pickup → returns. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'warehouse')) THEN
-- Lackmus: support med `returns` → svar; roll utan returns → "not authorized".
CREATE OR REPLACE FUNCTION public.schedule_return_pickup(p_rma_id uuid, p_pickup_date date, p_carrier text DEFAULT NULL::text, p_address_line1 text DEFAULT NULL::text, p_address_line2 text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_pickup_window text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS return_pickups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.return_pickups;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Only staff can schedule pickups';
  END IF;
  INSERT INTO public.return_pickups (rma_id, pickup_date, carrier, address_line1, address_line2, city, postal_code, country, pickup_window, notes, created_by)
    VALUES (p_rma_id, p_pickup_date, p_carrier, p_address_line1, p_address_line2, p_city, p_postal_code, p_country, p_pickup_window, p_notes, auth.uid())
    RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

-- search_tickets → tickets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'employee')) THEN
-- Lackmus: support med `tickets` → svar; roll utan tickets → "not authorized".
CREATE OR REPLACE FUNCTION public.search_tickets(p_query text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'tickets')) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF p_query IS NULL OR btrim(p_query) = '' THEN
    RAISE EXCEPTION 'p_query is required';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'rank'), '[]'::jsonb) INTO v_result FROM (
    SELECT id, subject, status, priority, category, contact_email, contact_name,
           assigned_to, tags, sla_deadline, created_at,
           ts_rank(
             to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(description,'')),
             websearch_to_tsquery('simple', p_query)
           ) AS rank
    FROM tickets
    WHERE (p_status IS NULL OR status::text = p_status)
      AND (
        to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(description,'')) @@ websearch_to_tsquery('simple', p_query)
        OR subject ILIKE '%' || p_query || '%'
        OR coalesce(description, '') ILIKE '%' || p_query || '%'
        OR EXISTS (SELECT 1 FROM unnest(tags) tg WHERE tg ILIKE '%' || p_query || '%')
      )
    ORDER BY rank DESC, created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ) t;
  RETURN jsonb_build_object('success', true, 'query', p_query, 'results', v_result);
END; $function$;

-- send_bulk_lead_email → leads. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: säljare med `leads` → svar; roll utan leads → "not authorized".
CREATE OR REPLACE FUNCTION public.send_bulk_lead_email(p_subject text, p_body_html text, p_statuses text[] DEFAULT NULL::text[], p_sources text[] DEFAULT NULL::text[], p_min_score integer DEFAULT NULL::integer, p_stage_key text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_blast_id uuid;
  v_url text;
  v_token text;
  v_site_url text;
  v_targeted integer := 0;
  v_sent integer := 0;
  v_excl_unsub integer := 0;
  v_excl_revoked integer := 0;
  v_footer text;
  v_unsub text;
  r record;
  v_sample jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'leads')) THEN
    RAISE EXCEPTION 'Requires the leads module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_subject IS NULL OR p_body_html IS NULL THEN
    RAISE EXCEPTION 'p_subject and p_body_html are required';
  END IF;

  SELECT value #>> '{}' INTO v_site_url FROM public.site_settings WHERE key = 'siteUrl';

  IF NOT p_dry_run THEN
    SELECT base_url, token INTO v_url, v_token FROM public.fw_edge_credentials();
  END IF;

  v_blast_id := gen_random_uuid();

  -- Create the blast header first so recipient rows can reference it (FK).
  IF NOT p_dry_run THEN
    INSERT INTO public.lead_email_blasts (id, subject, body_html, segment, status, created_by)
    VALUES (v_blast_id, p_subject, p_body_html,
      jsonb_build_object('statuses', p_statuses, 'sources', p_sources,
                         'min_score', p_min_score, 'stage_key', p_stage_key, 'limit', p_limit),
      'sending', auth.uid());
  END IF;

  FOR r IN
    SELECT DISTINCT ON (lower(l.email)) l.id, l.email, l.name
    FROM public.leads l
    LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
    WHERE l.email IS NOT NULL AND l.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
      AND (p_statuses IS NULL OR l.status::text = ANY (p_statuses))
      AND (p_sources IS NULL OR l.source = ANY (p_sources))
      AND (p_min_score IS NULL OR l.score >= p_min_score)
      AND (p_stage_key IS NULL OR ps.key = p_stage_key)
    ORDER BY lower(l.email), l.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  LOOP
    v_targeted := v_targeted + 1;

    IF EXISTS (SELECT 1 FROM public.newsletter_subscribers
               WHERE lower(email) = lower(r.email) AND status = 'unsubscribed') THEN
      v_excl_unsub := v_excl_unsub + 1;
      IF NOT p_dry_run THEN
        INSERT INTO public.lead_email_blast_recipients (blast_id, lead_id, email, status, exclusion_reason)
        VALUES (v_blast_id, r.id, r.email, 'excluded', 'unsubscribed');
      END IF;
      CONTINUE;
    END IF;

    IF public.fw_consent_state(r.email, 'marketing_email') = 'revoked'
       OR public.fw_consent_state(r.email, 'newsletter') = 'revoked' THEN
      v_excl_revoked := v_excl_revoked + 1;
      IF NOT p_dry_run THEN
        INSERT INTO public.lead_email_blast_recipients (blast_id, lead_id, email, status, exclusion_reason)
        VALUES (v_blast_id, r.id, r.email, 'excluded', 'consent_revoked');
      END IF;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      IF v_sent < 10 THEN
        v_sample := v_sample || jsonb_build_object('email', r.email, 'name', r.name);
      END IF;
      v_sent := v_sent + 1;
      CONTINUE;
    END IF;

    -- Make sure the recipient exists on the unsubscribe list machinery
    -- (keeps status of already-known subscribers, incl. unsubscribed).
    INSERT INTO public.newsletter_subscribers (email, name, status, metadata)
    VALUES (lower(r.email), r.name, 'confirmed', jsonb_build_object('source', 'crm_blast'))
    ON CONFLICT (email) DO NOTHING;

    v_unsub := CASE WHEN COALESCE(v_site_url, '') <> ''
      THEN v_site_url || '/newsletter/manage?action=unsubscribe&email=' || r.email
      ELSE v_url || '/functions/v1/newsletter/subscribe?action=unsubscribe&email=' || r.email END;
    v_footer := '<hr style="margin-top:24px;border:none;border-top:1px solid #eee">'
      || '<p style="font-size:12px;color:#888">You receive this because you are in contact with us. '
      || '<a href="' || v_unsub || '">Unsubscribe</a></p>';

    PERFORM net.http_post(
      url := v_url || '/functions/v1/email-send',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_token),
      body := jsonb_build_object(
        'to', r.email,
        'subject', p_subject,
        'html', p_body_html || v_footer,
        'source', 'crm_blast',
        'related_entity_type', 'lead_email_blast',
        'related_entity_id', v_blast_id::text,
        'tags', jsonb_build_object('blast_id', v_blast_id::text)
      )
    );

    INSERT INTO public.lead_email_blast_recipients (blast_id, lead_id, email, status)
    VALUES (v_blast_id, r.id, r.email, 'sent');
    INSERT INTO public.lead_activities (lead_id, type, metadata, points)
    VALUES (r.id, 'bulk_email_sent', jsonb_build_object('blast_id', v_blast_id, 'subject', p_subject), 0);
    v_sent := v_sent + 1;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.lead_email_blasts
      SET status = 'sent', targeted_count = v_targeted, sent_count = v_sent,
          excluded_unsubscribed = v_excl_unsub, excluded_revoked = v_excl_revoked
      WHERE id = v_blast_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'dry_run', p_dry_run,
    'blast_id', CASE WHEN p_dry_run THEN NULL ELSE v_blast_id END,
    'targeted', v_targeted, 'sent', v_sent,
    'excluded_unsubscribed', v_excl_unsub, 'excluded_consent_revoked', v_excl_revoked,
    'sample', CASE WHEN p_dry_run THEN v_sample ELSE NULL END);
END;
$function$;

-- set_exchange_rate → multiCurrency. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `multiCurrency` → svar; roll utan multiCurrency → "not authorized".
CREATE OR REPLACE FUNCTION public.set_exchange_rate(p_base text, p_quote text, p_rate numeric, p_rate_date date DEFAULT CURRENT_DATE, p_source text DEFAULT 'manual'::text)
 RETURNS exchange_rates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.exchange_rates;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'multiCurrency')) THEN
    RAISE EXCEPTION 'Requires the multiCurrency module — an admin can grant it under Users → Role Permissions';
  END IF;

  INSERT INTO public.exchange_rates (base_currency, quote_currency, rate, rate_date, source)
  VALUES (p_base, p_quote, p_rate, p_rate_date, p_source)
  ON CONFLICT (base_currency, quote_currency, rate_date)
  DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- set_media_alt_text → mediaLibrary. Före: IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
-- Lackmus: marketing med `mediaLibrary` → svar; roll utan mediaLibrary → "not authorized".
CREATE OR REPLACE FUNCTION public.set_media_alt_text(p_storage_path text, p_alt_text text, p_bucket text DEFAULT 'cms-images'::text)
 RETURNS media_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.media_assets;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'mediaLibrary')) THEN
    RAISE EXCEPTION 'Requires the mediaLibrary module — an admin can grant it under Users → Role Permissions';
  END IF;

  INSERT INTO public.media_assets (bucket, storage_path, folder, filename, alt_text)
  VALUES (
    p_bucket, p_storage_path,
    split_part(p_storage_path, '/', 1),
    regexp_replace(p_storage_path, '^.*/', ''),
    p_alt_text
  )
  ON CONFLICT (bucket, storage_path) DO UPDATE SET
    alt_text = EXCLUDED.alt_text,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- set_return_item_action → returns. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'warehouse')) THEN
-- Lackmus: support med `returns` → svar; roll utan returns → "not authorized".
CREATE OR REPLACE FUNCTION public.set_return_item_action(p_return_item_id uuid, p_action text)
 RETURNS return_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.return_items;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Only staff can set item action';
  END IF;
  IF p_action NOT IN ('restock','refurbish','rtv','scrap') THEN
    RAISE EXCEPTION 'Invalid action %', p_action;
  END IF;
  UPDATE public.return_items SET chosen_action = p_action
    WHERE id = p_return_item_id
    RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Return item % not found', p_return_item_id; END IF;
  RETURN v_row;
END $function$;

-- ship_picking → inventory. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'employee'))) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.ship_picking(p_picking_order_id uuid, p_tracking_number text DEFAULT NULL::text, p_carrier text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD; v_line RECORD; v_consumed INT := 0;
  v_carrier_id uuid; v_carrier_code text; v_active_count int;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'))) THEN RAISE EXCEPTION 'Insufficient permissions'; END IF;
  SELECT * INTO v_po FROM public.picking_orders WHERE id = p_picking_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Picking order % not found', p_picking_order_id; END IF;
  IF v_po.status = 'shipped' THEN RETURN jsonb_build_object('success', true, 'already_shipped', true); END IF;
  IF v_po.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot ship cancelled picking_order'; END IF;
  -- 4b85909f: resolve p_carrier against the carriers table (id, code or name,
  -- case-insensitive). Unknown values are rejected while active carriers
  -- exist; when none are configured yet, free text passes (fail forward).
  IF p_carrier IS NOT NULL AND btrim(p_carrier) <> '' THEN
    SELECT c.id, c.code INTO v_carrier_id, v_carrier_code
    FROM public.carriers c
    WHERE c.is_active
      AND (c.id::text = btrim(p_carrier) OR lower(c.code) = lower(btrim(p_carrier)) OR lower(c.name) = lower(btrim(p_carrier)))
    LIMIT 1;
    IF v_carrier_id IS NULL THEN
      SELECT count(*) INTO v_active_count FROM public.carriers WHERE is_active;
      IF v_active_count > 0 THEN
        RAISE EXCEPTION 'Unknown carrier "%" — pass an active carrier id, code or name. Active carriers: %', p_carrier,
          (SELECT string_agg(code, ', ' ORDER BY code) FROM public.carriers WHERE is_active);
      END IF;
    END IF;
  END IF;
  FOR v_line IN SELECT * FROM public.picking_lines WHERE picking_order_id = p_picking_order_id AND status = 'picked' LOOP
    IF v_line.reservation_id IS NOT NULL THEN
      BEGIN PERFORM public.consume_reservation(v_line.reservation_id, v_line.qty_picked); v_consumed := v_consumed + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata) VALUES ('picking.consume_failed', 'picking_line', v_line.id, auth.uid(), jsonb_build_object('error', SQLERRM));
      END;
    END IF;
  END LOOP;
  UPDATE public.picking_orders SET status = 'shipped', shipped_at = now(),
    tracking_number = COALESCE(p_tracking_number, tracking_number),
    carrier = COALESCE(v_carrier_code, p_carrier, carrier),
    carrier_id = COALESCE(v_carrier_id, carrier_id)
  WHERE id = p_picking_order_id;
  IF v_po.order_id IS NOT NULL THEN UPDATE public.orders SET status = 'shipped', updated_at = now() WHERE id = v_po.order_id; END IF;
  BEGIN PERFORM public.emit_platform_event('picking.shipped', jsonb_build_object('picking_order_id', p_picking_order_id, 'order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'carrier_id', v_carrier_id, 'consumed_lines', v_consumed), 'pick_pack');
  EXCEPTION WHEN OTHERS THEN NULL; END;
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.shipped', 'picking_order', p_picking_order_id, auth.uid(), jsonb_build_object('order_id', v_po.order_id, 'tracking_number', p_tracking_number, 'carrier_id', v_carrier_id, 'consumed', v_consumed));
  RETURN jsonb_build_object('success', true, 'picking_order_id', p_picking_order_id, 'consumed_lines', v_consumed, 'carrier_id', v_carrier_id, 'carrier_code', v_carrier_code);
END; $function$;

-- sign_employment_contract → hr. Före: v_is_admin := has_role(auth.uid(), 'admin'::app_role);
-- Lackmus: HR med `hr` → svar; employee utan hr → "not authorized".
CREATE OR REPLACE FUNCTION public.sign_employment_contract(p_contract_id uuid, p_side text DEFAULT 'employee'::text)
 RETURNS employment_contracts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.employment_contracts;
  v_emp public.employees;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL AND auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.employment_contracts WHERE id = p_contract_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;

  v_is_admin := (auth.role() = 'service_role' OR can_access_module(auth.uid(),'hr'));

  IF p_side = 'employer' THEN
    IF NOT v_is_admin THEN RAISE EXCEPTION 'Requires the hr module — an admin can grant it under Users → Role Permissions'; END IF;
    UPDATE public.employment_contracts
    SET signed_by_employer_at = now(),
        status = CASE WHEN signed_by_employee_at IS NOT NULL THEN 'signed' ELSE status END,
        signed_at = CASE WHEN signed_by_employee_at IS NOT NULL THEN now() ELSE signed_at END
    WHERE id = p_contract_id RETURNING * INTO v_row;
  ELSE
    -- employee side
    SELECT * INTO v_emp FROM public.employees WHERE id = v_row.employee_id;
    IF NOT v_is_admin AND (v_emp.user_id IS NULL OR v_emp.user_id <> auth.uid()) THEN
      RAISE EXCEPTION 'Not authorized to sign this contract';
    END IF;
    UPDATE public.employment_contracts
    SET signed_by_employee_at = now(),
        status = CASE WHEN signed_by_employer_at IS NOT NULL THEN 'signed' ELSE status END,
        signed_at = CASE WHEN signed_by_employer_at IS NOT NULL THEN now() ELSE signed_at END
    WHERE id = p_contract_id RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$function$;

-- signoff_reconciliation → reconciliation. Före: OR has_role(v_uid, 'admin') OR has_role(v_uid, 'approver')) THEN
-- Lackmus: ekonomiroll med `reconciliation` → svar; roll utan reconciliation → "not authorized".
CREATE OR REPLACE FUNCTION public.signoff_reconciliation(p_bank_account_id uuid, p_period_start date, p_period_end date, p_statement_balance_cents bigint, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_gl text;
  v_currency text;
  v_book bigint := 0;
  v_diff bigint;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR can_access_module(v_uid,'reconciliation')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT gl_account, currency INTO v_gl, v_currency
    FROM public.bank_accounts WHERE id = p_bank_account_id;
  IF v_gl IS NULL THEN RAISE EXCEPTION 'bank account not found'; END IF;

  SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)
    INTO v_book
    FROM public.journal_entry_lines l
    JOIN public.journal_entries e ON e.id = l.journal_entry_id
   WHERE l.account_code = v_gl
     AND e.status = 'posted'
     AND e.entry_date <= p_period_end;

  v_diff := p_statement_balance_cents - v_book;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Cannot sign off: difference of % cents (statement % vs book %). Resolve before signing off.',
      v_diff, p_statement_balance_cents, v_book
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.reconciliation_signoffs (
    bank_account_id, period_start, period_end,
    statement_balance_cents, book_balance_cents, difference_cents,
    currency, notes, reconciled_by
  ) VALUES (
    p_bank_account_id, p_period_start, p_period_end,
    p_statement_balance_cents, v_book, 0, COALESCE(v_currency, 'SEK'), p_notes, v_uid
  )
  ON CONFLICT (bank_account_id, period_start, period_end)
  DO UPDATE SET
    statement_balance_cents = EXCLUDED.statement_balance_cents,
    book_balance_cents = EXCLUDED.book_balance_cents,
    difference_cents = 0,
    notes = EXCLUDED.notes,
    reconciled_by = EXCLUDED.reconciled_by,
    reconciled_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('signoff_id', v_id, 'book_balance_cents', v_book);
END;
$function$;

-- sla_compliance_report → sla. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'writer') OR has_role(auth.uid(),'approver')) THEN
-- Lackmus: support med `sla` → svar; roll utan sla → "not authorized".
CREATE OR REPLACE FUNCTION public.sla_compliance_report(p_days integer DEFAULT 30, p_entity_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(COALESCE(p_days,30),1));
  v_by_entity jsonb;
  v_by_severity jsonb;
  v_opened integer;
  v_resolved integer;
  v_open_now integer;
  v_avg_overage numeric;
  v_credits bigint;
  v_escalated integer;
  v_entity record;
  v_entities jsonb := '{}'::jsonb;
  v_total bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'sla')) THEN
    RAISE EXCEPTION 'Only staff can view compliance reports';
  END IF;

  SELECT count(*) FILTER (WHERE created_at >= v_since),
         count(*) FILTER (WHERE resolved_at >= v_since),
         count(*) FILTER (WHERE resolved_at IS NULL),
         round(avg(actual_minutes::numeric / NULLIF(threshold_minutes,0)) FILTER (WHERE created_at >= v_since), 2),
         count(*) FILTER (WHERE escalated_at IS NOT NULL AND created_at >= v_since)
  INTO v_opened, v_resolved, v_open_now, v_avg_overage, v_escalated
  FROM public.sla_violations
  WHERE (p_entity_type IS NULL OR entity_type = p_entity_type);

  SELECT COALESCE(jsonb_object_agg(entity_type, cnt), '{}'::jsonb) INTO v_by_entity
  FROM (SELECT entity_type, count(*) AS cnt FROM public.sla_violations
         WHERE created_at >= v_since AND (p_entity_type IS NULL OR entity_type = p_entity_type)
         GROUP BY entity_type) x;

  SELECT COALESCE(jsonb_object_agg(COALESCE(severity,'medium'), cnt), '{}'::jsonb) INTO v_by_severity
  FROM (SELECT severity, count(*) AS cnt FROM public.sla_violations
         WHERE created_at >= v_since AND (p_entity_type IS NULL OR entity_type = p_entity_type)
         GROUP BY severity) x;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_credits
  FROM public.service_credits WHERE created_at >= v_since;

  -- Breach rate per entity type: entities created in the window vs violations.
  FOR v_entity IN
    SELECT * FROM (VALUES
      ('ticket','tickets'), ('order','orders'), ('lead','leads'),
      ('chat','chat_conversations'), ('booking','bookings')
    ) AS t(etype, tbl)
    WHERE (p_entity_type IS NULL OR etype = p_entity_type)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE created_at >= $1', v_entity.tbl)
      INTO v_total USING v_since;
    IF v_total > 0 THEN
      v_entities := v_entities || jsonb_build_object(v_entity.etype, jsonb_build_object(
        'created_in_period', v_total,
        'violations_in_period', COALESCE((v_by_entity->>v_entity.etype)::int, 0),
        'compliance_pct', round((1 - LEAST(COALESCE((v_by_entity->>v_entity.etype)::numeric, 0) / v_total, 1)) * 100, 1)
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period_days', GREATEST(COALESCE(p_days,30),1),
    'violations_opened', v_opened,
    'violations_resolved', v_resolved,
    'violations_open_now', v_open_now,
    'avg_overage_ratio', v_avg_overage,
    'escalations_fired', v_escalated,
    'service_credits_accrued_cents', v_credits,
    'by_entity_type', v_by_entity,
    'by_severity', v_by_severity,
    'compliance_by_entity', v_entities
  );
END; $function$;

-- split_time_entry → timesheets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: roll med `timesheets` → svar; roll utan timesheets → "not authorized".
CREATE OR REPLACE FUNCTION public.split_time_entry(p_entry_id uuid, p_allocations jsonb, p_allow_total_change boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry public.time_entries; v_alloc jsonb; v_total numeric := 0;
  v_project_id uuid; v_hours numeric; v_first boolean := true;
  v_ids uuid[] := ARRAY[]::uuid[]; v_new_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'timesheets')) THEN
    RAISE EXCEPTION 'Requires the timesheets module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_entry FROM public.time_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Time entry % not found', p_entry_id; END IF;
  IF v_entry.is_invoiced THEN RAISE EXCEPTION 'Entry is already invoiced — cannot split'; END IF;
  IF v_entry.approval_status = 'approved' THEN RAISE EXCEPTION 'Entry is approved — reject it first to split'; END IF;
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) < 2 THEN
    RAISE EXCEPTION 'allocations must be an array of at least 2 items: [{project_id|project_name, hours, description?}]';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_hours := (v_alloc->>'hours')::numeric;
    IF v_hours IS NULL OR v_hours <= 0 THEN RAISE EXCEPTION 'Each allocation needs hours > 0'; END IF;
    v_total := v_total + v_hours;
  END LOOP;
  IF NOT p_allow_total_change AND ABS(v_total - v_entry.hours) > 0.01 THEN
    RAISE EXCEPTION 'Allocation hours sum to % but the entry has % — pass allow_total_change=true to override', v_total, v_entry.hours;
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_hours := (v_alloc->>'hours')::numeric;
    v_project_id := NULLIF(v_alloc->>'project_id','')::uuid;
    IF v_project_id IS NULL AND COALESCE(v_alloc->>'project_name','') <> '' THEN
      SELECT id INTO v_project_id FROM public.projects
      WHERE lower(name) = lower(v_alloc->>'project_name') LIMIT 1;
      IF v_project_id IS NULL THEN
        SELECT id INTO v_project_id FROM public.projects
        WHERE name ILIKE '%'||(v_alloc->>'project_name')||'%' LIMIT 1;
      END IF;
      IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'Project "%" not found', v_alloc->>'project_name';
      END IF;
    END IF;
    IF v_project_id IS NULL THEN v_project_id := v_entry.project_id; END IF;

    IF v_first THEN
      UPDATE public.time_entries SET
        project_id = v_project_id, hours = v_hours,
        description = COALESCE(v_alloc->>'description', description),
        is_billable = COALESCE((v_alloc->>'is_billable')::boolean, is_billable),
        updated_at = now()
      WHERE id = p_entry_id;
      v_ids := v_ids || p_entry_id;
      v_first := false;
    ELSE
      INSERT INTO public.time_entries
        (user_id, employee_id, project_id, task_id, entry_date, hours, description, is_billable, category, approval_status, cost_rate_cents)
      VALUES
        (v_entry.user_id, v_entry.employee_id, v_project_id, v_entry.task_id, v_entry.entry_date, v_hours,
         COALESCE(v_alloc->>'description', v_entry.description),
         COALESCE((v_alloc->>'is_billable')::boolean, v_entry.is_billable),
         v_entry.category, v_entry.approval_status, v_entry.cost_rate_cents)
      RETURNING id INTO v_new_id;
      v_ids := v_ids || v_new_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'entry_ids', to_jsonb(v_ids),
    'entries', jsonb_array_length(p_allocations), 'total_hours', v_total,
    'entry_date', v_entry.entry_date);
END; $function$;

-- submit_expense_report → expenses. Före: OR has_role(auth.uid(), 'admin')
-- Lackmus: roll med `expenses` → svar; roll utan expenses → "not authorized".
CREATE OR REPLACE FUNCTION public.submit_expense_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_total bigint;
  v_lines integer;
BEGIN
  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  -- Own report, or admin, or an agent running under the service key.
  IF NOT (
    auth.role() = 'service_role'
    OR v_report.user_id = auth.uid()
    OR can_access_module(auth.uid(),'expenses')
  ) THEN
    RAISE EXCEPTION 'Only the report owner or someone granted the expenses module can submit expense report %', p_report_id;
  END IF;

  IF v_report.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft reports can be submitted');
  END IF;

  UPDATE expenses
     SET status = 'submitted', updated_at = now()
   WHERE report_id = p_report_id AND status = 'draft';

  SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) INTO v_lines, v_total
    FROM expenses WHERE report_id = p_report_id;

  UPDATE expense_reports
     SET status = 'submitted',
         submitted_at = now(),
         total_cents = v_total,
         updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', 'submitted',
    'expense_count', v_lines, 'total_cents', v_total);
END;
$function$;

-- timesheet_utilization_report → timesheets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN
-- Lackmus: roll med `timesheets` → svar; roll utan timesheets → "not authorized".
CREATE OR REPLACE FUNCTION public.timesheet_utilization_report(p_start_date date, p_end_date date, p_capacity_hours_per_day numeric DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workdays int; v_capacity numeric; v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'timesheets')) THEN
    RAISE EXCEPTION 'Requires the timesheets module — an admin can grant it under Users → Role Permissions';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN RAISE EXCEPTION 'start_date and end_date are required'; END IF;

  SELECT COUNT(*) INTO v_workdays
  FROM generate_series(p_start_date, p_end_date, interval '1 day') d
  WHERE EXTRACT(ISODOW FROM d) < 6;
  v_capacity := v_workdays * p_capacity_hours_per_day;

  SELECT COALESCE(jsonb_agg(row_j ORDER BY row_j->>'person'), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
      'person', COALESCE(MAX(x.employee_name), 'user ' || MAX(x.user_id::text)),
      'employee_id', MAX(x.employee_id::text), 'user_id', MAX(x.user_id::text),
      'total_hours', SUM(x.hours),
      'work_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'work'), 0),
      'billable_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.is_billable AND x.category = 'work'), 0),
      'pto_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'pto'), 0),
      'sick_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'sick'), 0),
      'training_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'training'), 0),
      'overhead_hours', COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'overhead'), 0),
      'overtime_hours', COALESCE(SUM(x.overtime_hours), 0),
      'capacity_hours', v_capacity,
      'utilization_pct', CASE WHEN v_capacity > 0
        THEN ROUND(100.0 * COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'work'), 0) / v_capacity, 1) ELSE NULL END,
      'billable_pct', CASE WHEN COALESCE(SUM(x.hours) FILTER (WHERE x.category = 'work'), 0) > 0
        THEN ROUND(100.0 * COALESCE(SUM(x.hours) FILTER (WHERE x.is_billable AND x.category = 'work'), 0)
             / SUM(x.hours) FILTER (WHERE x.category = 'work'), 1) ELSE NULL END,
      'cost_cents', ROUND(SUM(x.hours * x.effective_cost_rate))::bigint,
      'revenue_cents', ROUND(COALESCE(SUM(x.hours * x.billable_rate) FILTER (WHERE x.is_billable AND x.category = 'work'), 0))::bigint
    ) AS row_j
    FROM (
      SELECT te.*, e.name AS employee_name,
        COALESCE(te.cost_rate_cents::numeric, e.monthly_salary_cents::numeric / (21 * 8), 0) AS effective_cost_rate,
        COALESCE(p.hourly_rate_cents, 0)::numeric AS billable_rate
      FROM public.time_entries te
      LEFT JOIN public.employees e ON e.id = te.employee_id
      LEFT JOIN public.projects p ON p.id = te.project_id
      WHERE te.entry_date BETWEEN p_start_date AND p_end_date
    ) x
    GROUP BY COALESCE(x.employee_id::text, x.user_id::text)
  ) sub;

  RETURN jsonb_build_object('success', true,
    'range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
    'workdays', v_workdays, 'capacity_hours_per_person', v_capacity,
    'people', v_rows, 'generated_at', now());
END; $function$;

-- transfer_stock → inventory. Före: IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
-- Lackmus: lagerroll med `inventory` → svar; marketing utan inventory → "not authorized".
CREATE OR REPLACE FUNCTION public.transfer_stock(p_product_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity numeric, p_lot_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_move_id uuid; v_available numeric;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
  SELECT COALESCE(quantity,0) INTO v_available FROM stock_quants
    WHERE product_id = p_product_id AND location_id = p_from_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  IF COALESCE(v_available,0) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock at source (have %, need %)', COALESCE(v_available,0), p_quantity;
  END IF;
  PERFORM _upsert_quant(p_product_id, p_from_location_id, p_lot_id, -p_quantity);
  PERFORM _upsert_quant(p_product_id, p_to_location_id, p_lot_id, p_quantity);
  INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, notes, created_by, state)
  VALUES (p_product_id, p_quantity::int, 'transfer', p_from_location_id, p_to_location_id, p_lot_id, p_notes, auth.uid(), 'done')
  RETURNING id INTO v_move_id;
  RETURN v_move_id;
END; $function$;

-- unlock_reconciliation_signoff → reconciliation. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `reconciliation` → svar; roll utan reconciliation → "not authorized".
CREATE OR REPLACE FUNCTION public.unlock_reconciliation_signoff(p_signoff_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'reconciliation')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.reconciliation_signoffs WHERE id = p_signoff_id;
END;
$function$;

-- update_fixed_asset → fixedAssets. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
-- Lackmus: ekonomiroll med `fixedAssets` → svar; roll utan fixedAssets → "not authorized".
CREATE OR REPLACE FUNCTION public.update_fixed_asset(p_asset_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_parent_asset_id uuid DEFAULT NULL::uuid, p_total_expected_units integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_asset public.fixed_assets;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'fixedAssets')) THEN
    RAISE EXCEPTION 'Requires the fixedAssets module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset % not found', p_asset_id; END IF;
  IF p_parent_asset_id IS NOT NULL THEN
    IF p_parent_asset_id = p_asset_id THEN RAISE EXCEPTION 'Asset cannot be its own parent'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fixed_assets WHERE id = p_parent_asset_id) THEN
      RAISE EXCEPTION 'Parent asset % not found', p_parent_asset_id;
    END IF;
  END IF;

  UPDATE public.fixed_assets SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    location = COALESCE(p_location, location),
    parent_asset_id = COALESCE(p_parent_asset_id, parent_asset_id),
    total_expected_units = COALESCE(p_total_expected_units, total_expected_units),
    updated_at = now()
  WHERE id = p_asset_id;

  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  RETURN jsonb_build_object('success', true, 'asset', jsonb_build_object(
    'id', v_asset.id, 'name', v_asset.name, 'location', v_asset.location,
    'parent_asset_id', v_asset.parent_asset_id, 'total_expected_units', v_asset.total_expected_units,
    'components', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'cost_cents', c.cost_cents)), '[]'::jsonb)
                   FROM public.fixed_assets c WHERE c.parent_asset_id = p_asset_id)));
END; $function$;

-- update_return_pickup → returns. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'warehouse')) THEN
-- Lackmus: support med `returns` → svar; roll utan returns → "not authorized".
CREATE OR REPLACE FUNCTION public.update_return_pickup(p_pickup_id uuid, p_status text DEFAULT NULL::text, p_tracking_reference text DEFAULT NULL::text, p_pickup_date date DEFAULT NULL::date)
 RETURNS return_pickups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.return_pickups;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN
    RAISE EXCEPTION 'Only staff can update pickups';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('requested','scheduled','picked_up','failed','cancelled') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;
  UPDATE public.return_pickups SET
    status = coalesce(p_status, status),
    tracking_reference = coalesce(p_tracking_reference, tracking_reference),
    pickup_date = coalesce(p_pickup_date, pickup_date)
  WHERE id = p_pickup_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pickup % not found', p_pickup_id; END IF;
  RETURN v_row;
END $function$;

-- update_rtv_status → purchasing. Före: IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'support') OR has_role(auth.uid(),'warehouse') OR has_role(auth.uid(),'purchasing')) THEN
-- Lackmus: inköpare med `purchasing` → svar; roll utan purchasing → "not authorized".
CREATE OR REPLACE FUNCTION public.update_rtv_status(p_rtv_id uuid, p_status text, p_credit_memo_id uuid DEFAULT NULL::uuid)
 RETURNS return_to_vendor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.return_to_vendor;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'purchasing')) THEN
    RAISE EXCEPTION 'Only staff can update RTVs';
  END IF;
  IF p_status NOT IN ('draft','sent','credited','cancelled') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;
  UPDATE public.return_to_vendor SET
    status = p_status,
    sent_at = CASE WHEN p_status = 'sent' AND sent_at IS NULL THEN now() ELSE sent_at END,
    credited_at = CASE WHEN p_status = 'credited' AND credited_at IS NULL THEN now() ELSE credited_at END,
    credit_memo_id = coalesce(p_credit_memo_id, credit_memo_id)
  WHERE id = p_rtv_id
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'RTV % not found', p_rtv_id; END IF;
  RETURN v_row;
END $function$;

-- upsert_media_asset → mediaLibrary. Före: IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
-- Lackmus: marketing med `mediaLibrary` → svar; roll utan mediaLibrary → "not authorized".
CREATE OR REPLACE FUNCTION public.upsert_media_asset(p_storage_path text, p_folder text DEFAULT NULL::text, p_filename text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_size_bytes bigint DEFAULT NULL::bigint, p_width integer DEFAULT NULL::integer, p_height integer DEFAULT NULL::integer, p_alt_text text DEFAULT NULL::text, p_variants jsonb DEFAULT NULL::jsonb, p_bucket text DEFAULT 'cms-images'::text)
 RETURNS media_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.media_assets;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'mediaLibrary')) THEN
    RAISE EXCEPTION 'Requires the mediaLibrary module — an admin can grant it under Users → Role Permissions';
  END IF;

  INSERT INTO public.media_assets AS m (
    bucket, storage_path, folder, filename, mime_type, size_bytes,
    width, height, alt_text, variants, created_by
  ) VALUES (
    p_bucket, p_storage_path,
    COALESCE(p_folder, split_part(p_storage_path, '/', 1)),
    COALESCE(p_filename, regexp_replace(p_storage_path, '^.*/', '')),
    p_mime_type, p_size_bytes, p_width, p_height, p_alt_text,
    COALESCE(p_variants, '[]'::jsonb),
    auth.uid()
  )
  ON CONFLICT (bucket, storage_path) DO UPDATE SET
    mime_type = COALESCE(EXCLUDED.mime_type, m.mime_type),
    size_bytes = COALESCE(EXCLUDED.size_bytes, m.size_bytes),
    width = COALESCE(EXCLUDED.width, m.width),
    height = COALESCE(EXCLUDED.height, m.height),
    alt_text = COALESCE(EXCLUDED.alt_text, m.alt_text),
    variants = CASE WHEN p_variants IS NULL THEN m.variants ELSE EXCLUDED.variants END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

-- wiki_page_history → wiki. Före: v_is_writer := auth.role() = 'service_role' OR has_role(auth.uid(),'admin');
-- Lackmus: roll med `wiki` → svar; roll utan wiki → "not authorized".
CREATE OR REPLACE FUNCTION public.wiki_page_history(p_action text, p_slug text DEFAULT NULL::text, p_revision_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rev public.wiki_page_revisions;
  v_rows jsonb;
  v_is_writer boolean;
BEGIN
  v_is_writer := auth.role() = 'service_role' OR can_access_module(auth.uid(),'wiki');
  IF NOT (v_is_writer OR auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_action = 'list' THEN
    IF p_slug IS NULL THEN RAISE EXCEPTION 'list requires p_slug'; END IF;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.revision_no DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, slug, title, revision_no, action, edited_by, revised_at,
             length(content_md) AS content_length
      FROM public.wiki_page_revisions WHERE slug = p_slug
      ORDER BY revision_no DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),100)
    ) r;
    RETURN jsonb_build_object('success', true, 'slug', p_slug, 'revisions', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'get requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.wiki_page_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev));

  ELSIF p_action = 'restore' THEN
    IF NOT v_is_writer THEN
      RAISE EXCEPTION 'Requires the wiki module — an admin can grant it under Users → Role Permissions';
    END IF;
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.wiki_page_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    UPDATE public.wiki_pages
    SET title = v_rev.title, content_md = v_rev.content_md, updated_at = now(), updated_by = auth.uid()
    WHERE slug = v_rev.slug;
    IF NOT FOUND THEN
      -- Page was deleted — restore recreates it.
      INSERT INTO public.wiki_pages (slug, title, content_md, created_by, updated_by)
      VALUES (v_rev.slug, v_rev.title, v_rev.content_md, auth.uid(), auth.uid());
    END IF;
    RETURN jsonb_build_object('success', true, 'slug', v_rev.slug,
      'restored_revision_no', v_rev.revision_no);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|get|restore', p_action;
  END IF;
END;
$function$;
