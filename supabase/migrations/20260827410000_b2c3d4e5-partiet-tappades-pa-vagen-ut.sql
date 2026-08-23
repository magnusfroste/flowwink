-- Partiet tappades på vägen ut.
--
-- Mätt på Nordbrygg, som säljer FÄRSKVARA med bäst före-datum:
--
--   Söderberg Espresso Nordic — 1 kg
--     WH/MAIN, parti ROST-2026-W34 (bäst före 2027-02-28):  60
--     WH/MAIN, utan parti:                                 −10
--     netto:                                                50
--
--   Milano Uno — espressomaskin, 1 grupp
--     WH/MAIN, serie CM-UNO-SN-884213:                       1
--     WH/MAIN, utan parti:                                  −1
--     netto:                                                 0
--
-- Godsmottagningen gjorde rätt: partiet registrerades och lades på quanten.
-- Försäljningen gjorde en ANDRA quant-rad, utan parti, för avdraget. Nettot
-- blir rätt, men frågan "hur mycket har vi kvar av ROST-2026-W34?" svarar 60
-- när sanningen är 50, och "var tog serienummer CM-UNO-SN-884213 vägen?"
-- svarar "i hyllan" när maskinen står hos en kund.
--
-- Två saker går sönder av det, och båda är själva poängen med partispårning:
--   * En ÅTERKALLELSE går inte att genomföra. Partiets saldo är en lögn och
--    dess kunder syns inte i någon rörelse.
--   * FEFO-plockning (först utgående utgångsdatum) är omöjlig, eftersom
--     utleveransen aldrig valde parti.
--
-- VALET. Odoo tvingar partival på utgående rörelse för en partispårad vara.
-- Här finns ingen människa i beslutsögonblicket — avdraget sker i en trigger
-- på order_items och i händelsebanan för kassa/serviceorder. Att KRÄVA parti
-- skulle stoppa försäljningen; att VÄGRA skulle stoppa den hårdare. Husets
-- Law 4 säger fail forward, inte grind. Därför:
--
--   Partispårad vara  → parti väljs AUTOMATISKT enligt FEFO (tidigast bäst
--                       före först, därefter tillverkningsdatum, därefter
--                       registreringsordning), och splittas över flera partier
--                       när ett inte räcker. Pekar kallaren ut ett parti gäller
--                       det, så långt det räcker.
--   Ospårad vara      → exakt som förr. En enda partilös quant-rad, ingen ny
--                       kod i vägen, ingen beteendeförändring alls.
--   Rest som inget    → en partilös NEGATIV rad, precis som förr — men nu
--   parti kan bära      betyder den vad den ser ut som: en översäljning utöver
--                       varje registrerat parti, inte ett osynligt hål i ett
--                       parti som ser fullt ut.
--
-- "Partispårad" avgörs på det enda bevis som finns: produkten HAR partier
-- (stock_lots). Det är samma signal godsmottagningen skapar när någon anger
-- ett partinummer. En produkt utan partier kan aldrig drabbas.
--
-- Rörelseliggaren följer med: en stock_moves-rad per parti, med lot_id satt,
-- så återkallelsen har något att läsa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Är varan partispårad?
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.product_is_lot_tracked(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.stock_lots WHERE product_id = p_product_id);
$function$;

COMMENT ON FUNCTION public.product_is_lot_tracked(uuid) IS
  'Partispårad = produkten har minst ett registrerat parti/serienummer. '
  'products har ingen spårningsflagga; partierna själva ÄR beviset, och de '
  'uppstår när godsmottagningen anger ett partinummer. Läses av '
  'consume_stock_fefo så att en ospårad vara aldrig påverkas.';

REVOKE ALL ON FUNCTION public.product_is_lot_tracked(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_is_lot_tracked(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Utgående förbrukning med parti. En funktion, alla utgående banor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_stock_fefo(
  p_product_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_lot_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_left  numeric := abs(COALESCE(p_qty, 0));
  v_take  numeric;
  v_lot   record;
  v_alloc jsonb := '[]'::jsonb;
BEGIN
  IF p_product_id IS NULL OR p_location_id IS NULL OR v_left = 0 THEN
    RETURN jsonb_build_object('lot_tracked', false, 'allocated', '[]'::jsonb, 'unattributed', 0);
  END IF;

  -- Ospårad vara: oförändrad bana. En partilös rad, som förr.
  IF NOT public.product_is_lot_tracked(p_product_id) THEN
    PERFORM public.upsert_stock_quant(p_product_id, p_location_id, -v_left, NULL);
    RETURN jsonb_build_object('lot_tracked', false, 'allocated', '[]'::jsonb, 'unattributed', v_left);
  END IF;

  -- Pekar kallaren ut ett parti gäller det först, så långt saldot räcker.
  IF p_lot_id IS NOT NULL THEN
    SELECT GREATEST(LEAST(v_left, COALESCE(sq.quantity, 0)), 0) INTO v_take
      FROM public.stock_quants sq
     WHERE sq.product_id = p_product_id
       AND sq.location_id = p_location_id
       AND sq.lot_id = p_lot_id;

    IF COALESCE(v_take, 0) > 0 THEN
      PERFORM public.upsert_stock_quant(p_product_id, p_location_id, -v_take, p_lot_id);
      v_alloc := v_alloc || jsonb_build_object(
        'lot_id', p_lot_id,
        'lot_number', (SELECT lot_number FROM public.stock_lots WHERE id = p_lot_id),
        'expiry_date', (SELECT expiry_date FROM public.stock_lots WHERE id = p_lot_id),
        'qty', v_take);
      v_left := v_left - v_take;
    END IF;
  END IF;

  -- FEFO: först utgående bäst före-datum. Partier utan datum sist (de kan inte
  -- bli för gamla först), och inom samma datum den ordning de kom in.
  FOR v_lot IN
    SELECT sq.lot_id, l.lot_number, l.expiry_date, sq.quantity
      FROM public.stock_quants sq
      JOIN public.stock_lots l ON l.id = sq.lot_id
     WHERE sq.product_id = p_product_id
       AND sq.location_id = p_location_id
       AND sq.lot_id IS NOT NULL
       AND sq.quantity > 0
       AND (p_lot_id IS NULL OR sq.lot_id <> p_lot_id)
     ORDER BY l.expiry_date ASC NULLS LAST,
              l.manufactured_at ASC NULLS LAST,
              l.created_at ASC
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(v_left, v_lot.quantity);
    PERFORM public.upsert_stock_quant(p_product_id, p_location_id, -v_take, v_lot.lot_id);
    v_alloc := v_alloc || jsonb_build_object(
      'lot_id', v_lot.lot_id, 'lot_number', v_lot.lot_number,
      'expiry_date', v_lot.expiry_date, 'qty', v_take);
    v_left := v_left - v_take;
  END LOOP;

  -- Det som inget parti kunde bära är en översäljning. Den bokas partilöst och
  -- syns som en negativ partilös rad — ärligt, och utan att förstöra ett partis
  -- saldo genom att dra av något som inte fanns där.
  IF v_left > 0 THEN
    PERFORM public.upsert_stock_quant(p_product_id, p_location_id, -v_left, NULL);
  END IF;

  RETURN jsonb_build_object('lot_tracked', true, 'allocated', v_alloc, 'unattributed', v_left);
END;
$function$;

COMMENT ON FUNCTION public.consume_stock_fefo(uuid, uuid, numeric, uuid) IS
  'Utgående lageravdrag som behåller partiet. FEFO-allokering (tidigast bäst '
  'före först) för partispårade varor, oförändrad partilös bana för ospårade. '
  'Utan den skrev försäljningen en andra, partilös quant-rad: parti '
  'ROST-2026-W34 svarade 60 när sanningen var 50, och en återkallelse hade '
  'inget att gå på. Returnerar allokeringen så att kallaren kan skriva en '
  'rörelserad per parti.';

REVOKE ALL ON FUNCTION public.consume_stock_fefo(uuid, uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_stock_fefo(uuid, uuid, numeric, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Orderraden drar av med parti.
--    Kroppen är hämtad ur den levande definitionen; enda ändringen är att
--    quant-avdraget går via consume_stock_fefo och att rörelserna skrivs per
--    parti i stället för som en enda partilös rad.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_order_item_stock_decrement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc uuid;
  v_customer_loc uuid;
  v_result jsonb;
  v_alloc jsonb;
  v_rest numeric;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_loc := public.default_internal_location();
  SELECT id INTO v_customer_loc FROM public.stock_locations
   WHERE code = 'WH/CUSTOMERS' AND is_active = true LIMIT 1;
  IF v_customer_loc IS NULL THEN
    SELECT id INTO v_customer_loc FROM public.stock_locations
     WHERE location_type = 'customer' AND is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  -- The balance. A negative result is a real backorder position (see the guard
  -- above), not something to hide behind GREATEST(…, 0).
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) - NEW.quantity,
         updated_at = now()
   WHERE id = NEW.product_id
     AND (track_inventory = true OR stock_quantity IS NOT NULL);

  -- Avdraget väljer parti (FEFO) för en partispårad vara, och beter sig exakt
  -- som förr för en ospårad.
  v_result := public.consume_stock_fefo(NEW.product_id, v_loc, NEW.quantity, NULL);

  -- En rörelserad per parti, så återkallelsen har något att läsa.
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(v_result->'allocated', '[]'::jsonb))
  LOOP
    INSERT INTO public.stock_moves
      (product_id, variant_id, quantity, move_type, reference_type, reference_id,
       from_location_id, to_location_id, lot_id, notes)
    VALUES (NEW.product_id, NEW.variant_id, -((v_alloc->>'qty')::numeric), 'out', 'order', NEW.order_id::text,
            v_loc, v_customer_loc, (v_alloc->>'lot_id')::uuid,
            'Auto-decrement from order item — lot ' || COALESCE(v_alloc->>'lot_number', '?')
              || ' (FEFO' || COALESCE(', best before ' || (v_alloc->>'expiry_date'), '') || ')');
  END LOOP;

  -- Ospårad vara, eller en rest som inget parti kunde bära: en partilös rad,
  -- som förr. Noteringen skiljer de två fallen åt.
  v_rest := COALESCE((v_result->>'unattributed')::numeric, 0);
  IF v_rest > 0 THEN
    INSERT INTO public.stock_moves
      (product_id, variant_id, quantity, move_type, reference_type, reference_id,
       from_location_id, to_location_id, notes)
    VALUES (NEW.product_id, NEW.variant_id, -(v_rest), 'out', 'order', NEW.order_id::text,
            v_loc, v_customer_loc,
            CASE WHEN (v_result->>'lot_tracked')::boolean
                 THEN 'Auto-decrement from order item — NO LOT COULD COVER THIS QUANTITY (oversell beyond every registered lot)'
                 ELSE 'Auto-decrement from order item' END);
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Händelsebanan (kassa, serviceorder, integrationer) drar av med parti.
--    Kroppen hämtad ur den levande definitionen; enda ändringen är att ett
--    NEGATIVT delta går via consume_stock_fefo och skriver en rörelse per
--    parti. Positiva delta (inleverans) är oförändrade.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_customer_loc uuid;
  v_lot_id uuid;
  v_result jsonb;
  v_alloc jsonb;
  v_rest numeric;
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
  v_lot_id := NULLIF(p_payload->>'lot_id','')::uuid;

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
    v_location_id := public.default_internal_location();
  END IF;

  -- The mirror does not need a location. Do it FIRST, unconditionally, so a
  -- missing warehouse row can never again cost us the number the product page
  -- and the reorder loop read.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + v_qty_delta::int,
         updated_at = now()
   WHERE id = v_product_id AND track_inventory = true;

  IF v_location_id IS NULL THEN
    RAISE WARNING 'apply_stock_movement_event: no stock location for code % — mirrored products.stock_quantity but booked no quant. Run SELECT public.seed_stock_locations().', v_location_code;
    RETURN;
  END IF;

  SELECT id INTO v_customer_loc FROM public.stock_locations
   WHERE code = 'WH/CUSTOMERS' AND is_active = true LIMIT 1;
  IF v_customer_loc IS NULL THEN
    SELECT id INTO v_customer_loc FROM public.stock_locations
     WHERE location_type = 'customer' AND is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  IF v_qty_delta > 0 THEN
    -- Inleverans: oförändrad. Partiet kommer med i nyttolasten om det finns.
    PERFORM public.upsert_stock_quant(v_product_id, v_location_id, v_qty_delta, v_lot_id);

    INSERT INTO public.stock_moves
      (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, state, notes)
    VALUES (v_product_id, abs(v_qty_delta)::int, 'in', v_customer_loc, v_location_id, v_lot_id, 'done', v_reason);
    RETURN;
  END IF;

  -- Utleverans: parti först, FEFO när nyttolasten inte pekar ut något.
  v_result := public.consume_stock_fefo(v_product_id, v_location_id, v_qty_delta, v_lot_id);

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(v_result->'allocated', '[]'::jsonb))
  LOOP
    INSERT INTO public.stock_moves
      (product_id, quantity, move_type, from_location_id, to_location_id, lot_id, state, notes)
    VALUES (v_product_id, ((v_alloc->>'qty')::numeric)::int, 'out',
            v_location_id, v_customer_loc, (v_alloc->>'lot_id')::uuid, 'done',
            v_reason || ' — lot ' || COALESCE(v_alloc->>'lot_number', '?'));
  END LOOP;

  v_rest := COALESCE((v_result->>'unattributed')::numeric, 0);
  IF v_rest > 0 THEN
    INSERT INTO public.stock_moves
      (product_id, quantity, move_type, from_location_id, to_location_id, state, notes)
    VALUES (v_product_id, v_rest::int, 'out', v_location_id, v_customer_loc, 'done',
            CASE WHEN (v_result->>'lot_tracked')::boolean
                 THEN v_reason || ' — NO LOT COULD COVER THIS QUANTITY (oversell beyond every registered lot)'
                 ELSE v_reason END);
  END IF;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reparationen av det som redan tappats.
--    En partilös NEGATIV rad på en partispårad vara är alltid ett avdrag som
--    borde ha valt parti. Den flyttas till partier enligt samma FEFO-regel som
--    hädanefter gäller. Omkörbar: efter en körning finns inget kvar att flytta.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reconcile_lotless_outgoing()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_qty numeric;
  v_result jsonb;
  v_fixed int := 0;
  v_moved numeric := 0;
  v_left numeric := 0;
  v_detail jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(auth.uid(), 'admin'::public.app_role)
          OR public.can_access_module(auth.uid(), 'inventory')) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  FOR v_row IN
    SELECT sq.id, sq.product_id, sq.location_id, sq.quantity, p.name AS product_name
      FROM public.stock_quants sq
      JOIN public.products p ON p.id = sq.product_id
     WHERE sq.lot_id IS NULL
       AND sq.quantity < 0
       AND public.product_is_lot_tracked(sq.product_id)
       -- Bara den del som faktiskt finns i partier går att attribuera.
       AND EXISTS (
         SELECT 1 FROM public.stock_quants l
          WHERE l.product_id = sq.product_id
            AND l.location_id = sq.location_id
            AND l.lot_id IS NOT NULL
            AND l.quantity > 0)
  LOOP
    v_qty := abs(v_row.quantity);
    -- Nolla den partilösa skulden först, allokera den sedan mot partier.
    PERFORM public.upsert_stock_quant(v_row.product_id, v_row.location_id, v_qty, NULL);
    v_result := public.consume_stock_fefo(v_row.product_id, v_row.location_id, v_qty, NULL);

    v_fixed := v_fixed + 1;
    v_moved := v_moved + (v_qty - COALESCE((v_result->>'unattributed')::numeric, 0));
    v_left  := v_left + COALESCE((v_result->>'unattributed')::numeric, 0);
    v_detail := v_detail || jsonb_build_object(
      'product', v_row.product_name, 'quantity', v_qty, 'allocated', v_result->'allocated',
      'still_unattributed', v_result->'unattributed');
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'rows_repaired', v_fixed,
    'quantity_attributed_to_lots', v_moved,
    'quantity_still_unattributed', v_left,
    'detail', v_detail);
END;
$function$;

COMMENT ON FUNCTION public.reconcile_lotless_outgoing() IS
  'Flyttar historiska partilösa NEGATIVA quant-rader på partispårade varor till '
  'rätt parti enligt FEFO. På Nordbrygg gällde det Söderberg Espresso Nordic '
  '(parti ROST-2026-W34 sade 60, sanningen var 50) och serienumret '
  'CM-UNO-SN-884213. Omkörbar — efter en körning finns inget kvar att flytta.';

REVOKE ALL ON FUNCTION public.reconcile_lotless_outgoing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_lotless_outgoing() TO authenticated, service_role;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.reconcile_lotless_outgoing();
END $$;
