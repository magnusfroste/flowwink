-- Påfyllningsregeln gick inte att sätta från agentytan.
--
-- reorder_rules är Odoos allra första steg i procure-to-pay: min/max per
-- produkt och lagerplats. Tabellen har admin-UI (InventoryV2Panels.tsx →
-- useUpsertReorderRule) och läses av procurement_run, list_reorder_candidates,
-- auto_generate_purchase_orders, mrp_reorder_run och purchase_reorder_check.
--
-- Men den hade INGEN skill. search_skills på
--   "set reordering rule min max reorder point"
-- gav manage_product, place_order och manage_reconciliation_rule — tre skills
-- som inte kan skriva en enda rad i reorder_rules. Och två skillinstruktioner
-- sa uttryckligen "Reordering rules are set in the inventory UI, not by this
-- skill", vilket är raka motsatsen till husets stående mål: 100 % externt
-- agentadministrerbart.
--
-- Följden var konkret: en agent kunde LÄSA vad som behövde beställas och SKAPA
-- ordern, men aldrig ändra tröskeln som avgjorde vad som räknades som lågt. Den
-- första ratten i kedjan satt bakom en skärm bara en människa kunde nå.
--
-- Funktionen tar emot det en agent faktiskt har: namn i stället för UUID
-- (produkt, lagerkod, leverantör), och löser upp dem med husets vanliga stege —
-- uuid → exakt namn (skiftlägesokänsligt) → streckkod → unikt prefix. Tvetydigt
-- namn ger ett fel som RÄKNAR UPP kandidaterna, så nästa tur självrättar.
--
-- Svaret bär alltid tillgängligheten (stock_virtual_available) för produkten,
-- så agenten ser vad regeln kommer att göra utan att behöva köra motorn.

CREATE OR REPLACE FUNCTION public.manage_reorder_rule(
  p_action text DEFAULT 'list',
  p_product text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_min_qty numeric DEFAULT NULL,
  p_max_qty numeric DEFAULT NULL,
  p_reorder_qty numeric DEFAULT NULL,
  p_lead_time_days integer DEFAULT NULL,
  p_procurement_method text DEFAULT NULL,
  p_preferred_vendor text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_rule_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_action text := lower(COALESCE(p_action, 'list'));
  v_product_id uuid;
  v_location_id uuid;
  v_vendor_id uuid;
  v_matches text[];
  v_rule record;
  v_av record;
  v_method text;
  v_min numeric;
  v_max numeric;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(auth.uid(), 'admin'::public.app_role)
          OR public.can_access_module(auth.uid(), 'inventory')
          OR public.can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Not allowed to manage reordering rules — needs the inventory or purchasing module';
  END IF;

  -- ── Produkten ────────────────────────────────────────────────────────────
  IF p_product IS NOT NULL AND btrim(p_product) <> '' THEN
    BEGIN
      v_product_id := p_product::uuid;
    EXCEPTION WHEN others THEN
      v_product_id := NULL;
    END;

    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id FROM public.products
       WHERE lower(name) = lower(btrim(p_product)) AND is_active LIMIT 1;
    END IF;
    IF v_product_id IS NULL THEN
      SELECT id INTO v_product_id FROM public.products
       WHERE barcode = btrim(p_product) AND is_active LIMIT 1;
    END IF;
    IF v_product_id IS NULL THEN
      SELECT array_agg(name ORDER BY name) INTO v_matches FROM public.products
       WHERE name ILIKE btrim(p_product) || '%' AND is_active;
      IF v_matches IS NULL THEN
        RAISE EXCEPTION 'No active product matches "%". Use list_products or manage_product(action=list) to find the exact name.', p_product
          USING ERRCODE = 'no_data_found';
      ELSIF array_length(v_matches, 1) > 1 THEN
        RAISE EXCEPTION 'Product "%" is ambiguous — % candidates: %. Pass the full name or the product uuid.',
          p_product, array_length(v_matches, 1), array_to_string(v_matches[1:8], ' | ')
          USING ERRCODE = 'cardinality_violation';
      END IF;
      SELECT id INTO v_product_id FROM public.products
       WHERE name = v_matches[1] AND is_active LIMIT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id) THEN
      RAISE EXCEPTION 'Product % does not exist', p_product USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- ── Lagerplatsen. Utelämnad = husets standardlager (WH/MAIN). ────────────
  IF p_location IS NOT NULL AND btrim(p_location) <> '' THEN
    BEGIN
      v_location_id := p_location::uuid;
    EXCEPTION WHEN others THEN
      v_location_id := NULL;
    END;
    IF v_location_id IS NULL THEN
      SELECT id INTO v_location_id FROM public.stock_locations
       WHERE (upper(code) = upper(btrim(p_location)) OR lower(name) = lower(btrim(p_location)))
         AND is_active LIMIT 1;
    END IF;
    IF v_location_id IS NULL THEN
      RAISE EXCEPTION 'No active stock location matches "%". Known codes: %',
        p_location,
        (SELECT string_agg(code, ', ' ORDER BY code) FROM public.stock_locations WHERE is_active)
        USING ERRCODE = 'no_data_found';
    END IF;
  ELSE
    v_location_id := public.default_internal_location();
  END IF;

  -- ── Leverantören (valfri) ────────────────────────────────────────────────
  IF p_preferred_vendor IS NOT NULL AND btrim(p_preferred_vendor) <> '' THEN
    BEGIN
      v_vendor_id := p_preferred_vendor::uuid;
    EXCEPTION WHEN others THEN
      v_vendor_id := NULL;
    END;
    IF v_vendor_id IS NULL THEN
      SELECT id INTO v_vendor_id FROM public.vendors
       WHERE lower(name) = lower(btrim(p_preferred_vendor)) AND is_active LIMIT 1;
    END IF;
    IF v_vendor_id IS NULL THEN
      SELECT array_agg(name ORDER BY name) INTO v_matches FROM public.vendors
       WHERE name ILIKE btrim(p_preferred_vendor) || '%' AND is_active;
      IF v_matches IS NULL OR array_length(v_matches, 1) > 1 THEN
        RAISE EXCEPTION 'Vendor "%" is unknown or ambiguous. Known vendors: %',
          p_preferred_vendor,
          (SELECT string_agg(name, ' | ' ORDER BY name) FROM public.vendors WHERE is_active)
          USING ERRCODE = 'no_data_found';
      END IF;
      SELECT id INTO v_vendor_id FROM public.vendors WHERE name = v_matches[1] LIMIT 1;
    END IF;
  END IF;

  -- ── list ────────────────────────────────────────────────────────────────
  IF v_action = 'list' THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'list',
      'rules', COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'product_name')
        FROM (
          SELECT jsonb_build_object(
            'rule_id', rr.id,
            'product_id', rr.product_id,
            'product_name', p.name,
            'location_id', rr.location_id,
            'location_code', sl.code,
            'min_qty', rr.min_qty,
            'max_qty', rr.max_qty,
            'reorder_qty', rr.reorder_qty,
            'lead_time_days', rr.lead_time_days,
            'procurement_method', rr.procurement_method,
            'preferred_vendor_id', rr.preferred_vendor_id,
            'preferred_vendor', v.name,
            'is_active', rr.is_active,
            'on_hand', a.on_hand,
            'reserved', a.reserved,
            'incoming', a.incoming,
            'virtual', a.virtual,
            'below_min', a.virtual < rr.min_qty) AS x
          FROM public.reorder_rules rr
          JOIN public.products p ON p.id = rr.product_id
          JOIN public.stock_locations sl ON sl.id = rr.location_id
          LEFT JOIN public.vendors v ON v.id = rr.preferred_vendor_id
          CROSS JOIN LATERAL public.stock_virtual_available(rr.product_id, rr.location_id) a
          WHERE (v_product_id IS NULL OR rr.product_id = v_product_id)
            AND (p_location IS NULL OR rr.location_id = v_location_id)
            AND (p_is_active IS NULL OR rr.is_active = p_is_active)
        ) s), '[]'::jsonb));
  END IF;

  -- ── get ─────────────────────────────────────────────────────────────────
  IF v_action = 'get' THEN
    SELECT rr.* INTO v_rule FROM public.reorder_rules rr
     WHERE (p_rule_id IS NOT NULL AND rr.id = p_rule_id)
        OR (p_rule_id IS NULL AND rr.product_id = v_product_id AND rr.location_id = v_location_id)
     LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', true, 'action', 'get', 'found', false,
        'message', 'No reordering rule for that product at that location. Use action=set to create one.');
    END IF;
    SELECT * INTO v_av FROM public.stock_virtual_available(v_rule.product_id, v_rule.location_id);
    RETURN jsonb_build_object('success', true, 'action', 'get', 'found', true,
      'rule', to_jsonb(v_rule),
      'availability', jsonb_build_object('on_hand', v_av.on_hand, 'reserved', v_av.reserved,
        'incoming', v_av.incoming, 'virtual', v_av.virtual, 'below_min', v_av.virtual < v_rule.min_qty));
  END IF;

  -- ── set (upsert) ────────────────────────────────────────────────────────
  IF v_action IN ('set', 'create', 'update', 'upsert') THEN
    IF p_rule_id IS NOT NULL THEN
      SELECT rr.* INTO v_rule FROM public.reorder_rules rr WHERE rr.id = p_rule_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reordering rule % does not exist', p_rule_id USING ERRCODE = 'no_data_found';
      END IF;
      v_product_id := v_rule.product_id;
      v_location_id := v_rule.location_id;
    ELSE
      IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'p_product is required to set a reordering rule (name, barcode or uuid)'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT rr.* INTO v_rule FROM public.reorder_rules rr
       WHERE rr.product_id = v_product_id AND rr.location_id = v_location_id;
    END IF;

    v_min := COALESCE(p_min_qty, v_rule.min_qty, 0);
    v_max := COALESCE(p_max_qty, v_rule.max_qty, 0);
    v_method := lower(COALESCE(p_procurement_method, v_rule.procurement_method, 'buy'));

    IF v_method NOT IN ('buy', 'manufacture') THEN
      RAISE EXCEPTION 'p_procurement_method must be "buy" (purchased) or "manufacture" (produced), got "%"', p_procurement_method
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_min < 0 OR v_max < 0 THEN
      RAISE EXCEPTION 'min_qty and max_qty cannot be negative' USING ERRCODE = 'check_violation';
    END IF;
    IF v_max < v_min THEN
      RAISE EXCEPTION 'max_qty (%) must be at least min_qty (%) — max is the level the rule refills TO, min the level it triggers BELOW', v_max, v_min
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id AND track_inventory = true) THEN
      RAISE EXCEPTION 'Product % is not stock-tracked (track_inventory = false) — a reordering rule on it would never fire. Enable inventory tracking first via manage_product.',
        COALESCE((SELECT name FROM public.products WHERE id = v_product_id), v_product_id::text)
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.reorder_rules (
      product_id, location_id, min_qty, max_qty, reorder_qty,
      lead_time_days, preferred_vendor_id, procurement_method, is_active)
    VALUES (
      v_product_id, v_location_id, v_min, v_max,
      COALESCE(p_reorder_qty, v_rule.reorder_qty),
      COALESCE(p_lead_time_days, v_rule.lead_time_days, 7),
      COALESCE(v_vendor_id, v_rule.preferred_vendor_id),
      v_method,
      COALESCE(p_is_active, v_rule.is_active, true))
    ON CONFLICT (product_id, location_id) DO UPDATE SET
      min_qty = EXCLUDED.min_qty,
      max_qty = EXCLUDED.max_qty,
      reorder_qty = EXCLUDED.reorder_qty,
      lead_time_days = EXCLUDED.lead_time_days,
      preferred_vendor_id = EXCLUDED.preferred_vendor_id,
      procurement_method = EXCLUDED.procurement_method,
      is_active = EXCLUDED.is_active,
      updated_at = now();

    -- Läs tillbaka raden. Ett "updated: true" utan återläsning är hur ett
    -- tyst no-op ser ut inifrån (se project_silent_noop_alias_bug).
    SELECT rr.* INTO v_rule FROM public.reorder_rules rr
     WHERE rr.product_id = v_product_id AND rr.location_id = v_location_id;
    SELECT * INTO v_av FROM public.stock_virtual_available(v_product_id, v_location_id);

    RETURN jsonb_build_object(
      'success', true, 'action', 'set',
      'rule', to_jsonb(v_rule),
      'product_name', (SELECT name FROM public.products WHERE id = v_product_id),
      'location_code', (SELECT code FROM public.stock_locations WHERE id = v_location_id),
      'availability', jsonb_build_object('on_hand', v_av.on_hand, 'reserved', v_av.reserved,
        'incoming', v_av.incoming, 'virtual', v_av.virtual),
      'will_trigger_now', v_av.virtual < v_rule.min_qty,
      'message', format(
        '%s: replenish below %s up to %s at %s. Virtual stock is %s (%s on hand − %s reserved + %s incoming) — %s.',
        (SELECT name FROM public.products WHERE id = v_product_id),
        v_rule.min_qty, v_rule.max_qty,
        (SELECT code FROM public.stock_locations WHERE id = v_location_id),
        v_av.virtual, v_av.on_hand, v_av.reserved, v_av.incoming,
        CASE WHEN v_av.virtual < v_rule.min_qty
             THEN 'the next procurement_run will suggest a replenishment'
             ELSE 'nothing to replenish right now' END));
  END IF;

  -- ── deactivate / delete ─────────────────────────────────────────────────
  IF v_action IN ('deactivate', 'disable', 'delete', 'remove') THEN
    SELECT rr.* INTO v_rule FROM public.reorder_rules rr
     WHERE (p_rule_id IS NOT NULL AND rr.id = p_rule_id)
        OR (p_rule_id IS NULL AND rr.product_id = v_product_id AND rr.location_id = v_location_id)
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No reordering rule to %s — none exists for that product at that location', v_action
        USING ERRCODE = 'no_data_found';
    END IF;

    IF v_action IN ('delete', 'remove') THEN
      DELETE FROM public.reorder_rules WHERE id = v_rule.id;
      RETURN jsonb_build_object('success', true, 'action', 'delete', 'rule_id', v_rule.id,
        'deleted', NOT EXISTS (SELECT 1 FROM public.reorder_rules WHERE id = v_rule.id));
    END IF;

    UPDATE public.reorder_rules SET is_active = false, updated_at = now() WHERE id = v_rule.id;
    SELECT rr.* INTO v_rule FROM public.reorder_rules rr WHERE rr.id = v_rule.id;
    RETURN jsonb_build_object('success', true, 'action', 'deactivate', 'rule', to_jsonb(v_rule));
  END IF;

  RAISE EXCEPTION 'Unknown action "%". Valid: list, get, set, deactivate, delete', p_action
    USING ERRCODE = 'invalid_parameter_value';
END;
$function$;

COMMENT ON FUNCTION public.manage_reorder_rule(text, text, text, numeric, numeric, numeric, integer, text, text, boolean, uuid) IS
  'Agentytan för reorder_rules — Odoos första steg i procure-to-pay. Tabellen '
  'hade admin-UI men ingen skill alls: search_skills på "set reordering rule '
  'min max reorder point" gav manage_product, place_order och '
  'manage_reconciliation_rule, och två skillinstruktioner sa uttryckligen att '
  'reglerna sätts i UI:t. Tar emot namn i stället för UUID och svarar med '
  'tillgängligheten ur stock_virtual_available, så agenten ser vad regeln gör.';

REVOKE ALL ON FUNCTION public.manage_reorder_rule(text, text, text, numeric, numeric, numeric, integer, text, text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_reorder_rule(text, text, text, numeric, numeric, numeric, integer, text, text, boolean, uuid) TO authenticated, service_role;
