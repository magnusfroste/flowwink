-- Kostnaden följer varan genom dörren — inte genom orderformuläret.
--
-- UPPMÄTT PÅ NORDBRYGG 2026-08-25, på en nyss nollställd huvudbok:
--
--   order_items INSERT → trigger_order_item_stock_decrement
--     → consume_stock_fefo (quants + partier konsumeras)
--     → stock_moves 'out'  → process_stock_move_valuation
--     → värderingslager förbrukas + COGS bokas (Dt 4990 / Kr 1460)
--
--   …allt i ORDERLÄGGNINGENS transaktion. Plock, skeppning, leverans: döda för
--   böckerna. Facit på testbänken: 62 936 kr COGS bokad för varor som står på
--   hyllan — fyra ordrar utan uppfyllnad, varav en MAKULERAD (29 500 kr för en
--   espressomaskin som aldrig lämnade huset). Makulering kompenserade
--   ingenting: det fanns ingen händelse att haka en kompensation på, för
--   händelsen hade redan skett, vid fel tidpunkt.
--
-- Odoo-semantiken (referenssanningen): bekräftad order RESERVERAR;
-- `stock.picking done` — varan genom dörren — konsumerar och kostnadsför.
--
-- SNITTET, medvetet minimalt:
--
--   * `products.stock_quantity`-avdraget STÅR KVAR vid order. Det är butikens
--     tillgänglighetstal, och som åtagande (on hand − committed) betyder det
--     exakt detsamma som i går. Ingen tillgänglighetsläsare behöver röras, och
--     översäljningsskyddet är oförändrat.
--   * Konsumtionen (FEFO, quants, moves → värdering → COGS) flyttar till det
--     FÖRSTA fysiska utpasseringstecknet: shipped_at eller delivered_at sätts.
--   * Makulering före utpassering blir en icke-händelse i böckerna:
--     åtagandet återläggs, reservationen släpps, ingenting har bokats — felet
--     kan inte längre uppstå, i stället för att behöva städas.
--   * `process_stock_move_valuation` skulle inte röras — men torrkörningen
--     avslöjade att 20260827200000 (fakturasidans fix!) definierat om den från
--     en äldre kopia och TAPPAT COGS-bokningen: utflöden konsumerade värdering
--     utan att röra huvudboken. Sektion 5 återinför blocket, byggt mot den
--     LEVANDE kroppen — inte mot någon fil. En fix som skapade ett hål,
--     upptäckt av nästa fix' negativtest.
--   * Kassa/serviceorder/integrationer (apply_stock_movement_event) rörs inte:
--     där ÄR försäljningsögonblicket utpasseringen.
--
-- PLOCKVÄGENS INTERAKTION, verifierad mot levande kroppar innan detta skrevs:
-- ship_picking sätter fulfillment_status='shipped' på ordern; BEFORE-triggern
-- validate_fulfillment_status stämplar orders.shipped_at; vår AFTER-trigger
-- konsumerar i samma statement. ship_pickings `v_move_stock := (order_id IS
-- NULL)` — 'order entry already took these goods off the shelf' — förblir RÄTT
-- beteende (order-backade plock ska inte skriva moves) men av NYTT skäl: det
-- är utpasseringstriggern som tar varorna nu, inte orderingången. Dubbel-
-- reservationen (ordertriggern + allocate_picking) är ett ärvt, magnitud-
-- identiskt beteende: i går sänkte order hårt saldo OCH plocket reserverade;
-- i dag reserverar båda. Tillgängligheten påverkas lika; städas separat.
--
-- Idempotens och arv: konsumtionen vägrar köra om det redan finns 'out'-moves
-- för ordern. Det gör den omkörningssäker OCH arvssäker — ordrar lagda före
-- den här migrationen har redan konsumerat (gamla modellen) och får inte
-- konsumera igen när de skeppas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ordertriggern: åtagande + reservation. Ingen konsumtion, inga moves.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_order_item_stock_decrement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc uuid;
  v_free numeric;
BEGIN
  IF NEW.product_id IS NULL OR COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Åtagandet. Samma rad som alltid: butikens tillgänglighet sjunker i
  -- ordersekunden, negativt = äkta restorderposition, inget GREATEST-gömsle.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) - NEW.quantity,
         updated_at = now()
   WHERE id = NEW.product_id
     AND (track_inventory = true OR stock_quantity IS NOT NULL);

  -- Reservationen: BÄST MÖJLIGA, aldrig blockerande. reserve_stock() kastar på
  -- otillräckligt fritt saldo och på ospårade varor — helt rätt för en
  -- lagerarbetares uttryckliga reservation, helt fel i checkoutens transaktion.
  -- En order dagens modell tar emot ska den här modellen också ta emot.
  v_loc := public.default_internal_location();
  IF v_loc IS NOT NULL THEN
    SELECT COALESCE(quantity,0) - COALESCE(reserved_quantity,0) INTO v_free
      FROM public.stock_quants
     WHERE product_id = NEW.product_id AND location_id = v_loc AND lot_id IS NULL;
    IF COALESCE(v_free, 0) > 0 THEN
      INSERT INTO public.stock_reservations
        (product_id, location_id, quantity, reference_type, reference_id, notes)
      VALUES (NEW.product_id, v_loc, LEAST(v_free, NEW.quantity), 'order', NEW.order_id::text,
              'Auto-reservation at order — consumed on shipment, released on cancellation');
      UPDATE public.stock_quants
         SET reserved_quantity = COALESCE(reserved_quantity,0) + LEAST(v_free, NEW.quantity),
             updated_at = now()
       WHERE product_id = NEW.product_id AND location_id = v_loc AND lot_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Konsumtionen, som EN funktion. Skeppningstriggern anropar den; att den är
--    fristående gör den anropbar för läkning och test. Vägrar dubbelkörning.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_order_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_loc uuid;
  v_customer_loc uuid;
  v_item RECORD;
  v_res RECORD;
  v_result jsonb;
  v_alloc jsonb;
  v_rest numeric;
  v_items int := 0;
  v_moves int := 0;
BEGIN
  -- Redan konsumerad (eller lagd före den här migrationen, då konsumtionen
  -- skedde vid order): rör ingenting. Frånvaron av dubbelkonsumtion är hela
  -- arvskontraktet.
  IF EXISTS (SELECT 1 FROM public.stock_moves
              WHERE reference_type = 'order' AND reference_id = p_order_id::text
                AND move_type = 'out') THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'already_consumed');
  END IF;

  v_loc := public.default_internal_location();
  SELECT id INTO v_customer_loc FROM public.stock_locations
   WHERE code = 'WH/CUSTOMERS' AND is_active = true LIMIT 1;
  IF v_customer_loc IS NULL THEN
    SELECT id INTO v_customer_loc FROM public.stock_locations
     WHERE location_type = 'customer' AND is_active = true ORDER BY created_at LIMIT 1;
  END IF;

  FOR v_item IN
    SELECT product_id, variant_id, quantity FROM public.order_items
     WHERE order_id = p_order_id AND product_id IS NOT NULL AND COALESCE(quantity,0) > 0
  LOOP
    v_items := v_items + 1;

    -- Reservationen är förbrukad i och med utpasseringen.
    FOR v_res IN
      SELECT id, product_id, location_id, lot_id, quantity FROM public.stock_reservations
       WHERE reference_type = 'order' AND reference_id = p_order_id::text
         AND product_id = v_item.product_id AND state = 'reserved'
       FOR UPDATE
    LOOP
      UPDATE public.stock_reservations SET state = 'consumed', consumed_at = now() WHERE id = v_res.id;
      UPDATE public.stock_quants
         SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - v_res.quantity),
             updated_at = now()
       WHERE product_id = v_res.product_id AND location_id = v_res.location_id
         AND (lot_id IS NOT DISTINCT FROM v_res.lot_id);
    END LOOP;

    -- FEFO-uttaget och rörelseraderna: ordagrant den gamla ordertriggerns
    -- kropp (20260827410000) — bara tidpunkten är ny. Varje move triggar
    -- process_stock_move_valuation → värdering förbrukas + COGS bokas HÄR.
    v_result := public.consume_stock_fefo(v_item.product_id, v_loc, v_item.quantity, NULL);

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(v_result->'allocated', '[]'::jsonb))
    LOOP
      INSERT INTO public.stock_moves
        (product_id, variant_id, quantity, move_type, reference_type, reference_id,
         from_location_id, to_location_id, lot_id, notes)
      VALUES (v_item.product_id, v_item.variant_id, -((v_alloc->>'qty')::numeric), 'out', 'order', p_order_id::text,
              v_loc, v_customer_loc, (v_alloc->>'lot_id')::uuid,
              'Consumed on shipment — lot ' || COALESCE(v_alloc->>'lot_number', '?')
                || ' (FEFO' || COALESCE(', best before ' || (v_alloc->>'expiry_date'), '') || ')');
      v_moves := v_moves + 1;
    END LOOP;

    v_rest := COALESCE((v_result->>'unattributed')::numeric, 0);
    IF v_rest > 0 THEN
      INSERT INTO public.stock_moves
        (product_id, variant_id, quantity, move_type, reference_type, reference_id,
         from_location_id, to_location_id, notes)
      VALUES (v_item.product_id, v_item.variant_id, -(v_rest), 'out', 'order', p_order_id::text,
              v_loc, v_customer_loc,
              CASE WHEN (v_result->>'lot_tracked')::boolean
                   THEN 'Consumed on shipment — NO LOT COULD COVER THIS QUANTITY (oversell beyond every registered lot)'
                   ELSE 'Consumed on shipment' END);
      v_moves := v_moves + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('consumed', true, 'items', v_items, 'moves', v_moves);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Utpasseringstriggern: första fysiska tecknet vinner. Tidsstämplarna, inte
--    statuskolumnen — tvåaxelklassen har redan visat att status kan säga
--    'pending' om en levererad order.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_order_stock_on_exit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.shipped_at IS NULL AND NEW.shipped_at IS NOT NULL)
     OR (OLD.delivered_at IS NULL AND NEW.delivered_at IS NOT NULL) THEN
    PERFORM public.consume_order_stock(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_stock_on_exit_trg ON public.orders;
CREATE TRIGGER order_stock_on_exit_trg
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_order_stock_on_exit();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Makuleringen: en icke-händelse i böckerna. Åtagandet tillbaka,
--    reservationen släppt — och bara om ingenting passerat dörren. En order
--    som makuleras EFTER skeppning är en retur och går returflödet.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_order_stock_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_res RECORD;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM 'cancelled' OR NEW.status IS DISTINCT FROM 'cancelled' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_moves
              WHERE reference_type = 'order' AND reference_id = NEW.id::text AND move_type = 'out') THEN
    RETURN NEW; -- skeppad: retur, inte upplösning
  END IF;

  FOR v_item IN
    SELECT product_id, quantity FROM public.order_items
     WHERE order_id = NEW.id AND product_id IS NOT NULL AND COALESCE(quantity,0) > 0
  LOOP
    UPDATE public.products
       SET stock_quantity = COALESCE(stock_quantity, 0) + v_item.quantity,
           updated_at = now()
     WHERE id = v_item.product_id
       AND (track_inventory = true OR stock_quantity IS NOT NULL);
  END LOOP;

  FOR v_res IN
    SELECT id, product_id, location_id, lot_id, quantity FROM public.stock_reservations
     WHERE reference_type = 'order' AND reference_id = NEW.id::text AND state = 'reserved'
     FOR UPDATE
  LOOP
    UPDATE public.stock_reservations SET state = 'cancelled', cancelled_at = now() WHERE id = v_res.id;
    UPDATE public.stock_quants
       SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity,0) - v_res.quantity),
           updated_at = now()
     WHERE product_id = v_res.product_id AND location_id = v_res.location_id
       AND (lot_id IS NOT DISTINCT FROM v_res.lot_id);
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_stock_on_cancel_trg ON public.orders;
CREATE TRIGGER order_stock_on_cancel_trg
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_order_stock_on_cancel();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Värderingsfunktionen med COGS-blocket ÅTERINFÖRT (se narrativet ovan),
--    plus kontorollen 'cogs' som blocket resolvar genom. Rollen är data i
--    kontoplanen — funktionskroppen bär inga kontonummer (Law:et från
--    20260827200000, nu tillämpat på blocket som den migrationen tappade).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.account_roles (locale, role, account_code, description)
VALUES ('se-bas2024', 'cogs', '4990', 'Kostnad sålda varor — utflödets motkonto till lagret'),
       ('ifrs-generic', 'cogs', '5000', 'Cost of goods sold')
ON CONFLICT (locale, role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.process_stock_move_valuation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty numeric := abs(COALESCE(NEW.quantity,0));
  v_is_in boolean;
  v_method text;
  v_unit_cost bigint;
  v_total_cost bigint := 0;
  v_layer RECORD;
  v_take numeric;
  v_remaining numeric;
  v_avg numeric;
  v_je uuid;
  v_is_purchase boolean;
  v_event_date date;
  v_receipt_id uuid;
BEGIN
  IF v_qty = 0 THEN RETURN NEW; END IF;
  IF NEW.move_type NOT IN ('in','out','mo_production','mo_consumption','adjustment') THEN RETURN NEW; END IF;
  -- 'adjustment' carries its direction in the SIGN (adjust_quant), the same way
  -- 'in' does. Stock that appears on a count is stock the books must carry.
  v_is_in := (NEW.move_type IN ('in','mo_production','adjustment')) AND COALESCE(NEW.quantity,0) > 0;
  v_is_purchase := NEW.reference_type IN ('purchase_order','po','goods_receipt');

  IF v_is_in THEN
    v_unit_cost := COALESCE(NEW.unit_cost_cents,
                            resolve_inbound_unit_cost(NEW.product_id, NEW.reference_type, NEW.reference_id));

    -- Goods coming back that the warehouse already carries re-enter at what it
    -- carries them at. Only when nothing else supplied a cost — a receipt's PO
    -- price and an explicit unit_cost_cents both still win.
    IF COALESCE(v_unit_cost, 0) = 0 THEN
      SELECT CASE WHEN sum(remaining_qty) > 0
                  THEN round(sum(remaining_qty * unit_cost_cents) / sum(remaining_qty)) END
        INTO v_unit_cost
        FROM stock_valuation_layers
       WHERE product_id = NEW.product_id AND remaining_qty > 0;
      -- Still nothing on hand to average against: the product's standing cost.
      IF COALESCE(v_unit_cost, 0) = 0 THEN
        SELECT cost_cents INTO v_unit_cost FROM products WHERE id = NEW.product_id;
      END IF;
      v_unit_cost := COALESCE(v_unit_cost, 0);
    END IF;

    INSERT INTO stock_valuation_layers (product_id, variant_id, move_id, quantity, unit_cost_cents, value_cents, remaining_qty)
    VALUES (NEW.product_id, NEW.variant_id, NEW.id, v_qty, v_unit_cost, round(v_qty * v_unit_cost), v_qty);
    UPDATE stock_moves SET unit_cost_cents = v_unit_cost, value_cents = round(v_qty * v_unit_cost)
      WHERE id = NEW.id;

    -- What was paid for it is what it costs. Learned once, from the receipt
    -- that knew; never overwritten, so a standard cost an operator set stands.
    IF v_is_purchase AND v_unit_cost > 0 THEN
      UPDATE products
         SET cost_cents = v_unit_cost, updated_at = now()
       WHERE id = NEW.product_id AND cost_cents IS NULL;
    END IF;

    IF v_is_purchase AND v_unit_cost > 0 THEN
      -- Bokföringsdatumet följer händelsen, inte klockan.
      v_receipt_id := NULL;
      v_event_date := NULL;
      IF NEW.reference_type = 'goods_receipt'
         AND COALESCE(NEW.reference_id,'') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_receipt_id := NEW.reference_id::uuid;
        SELECT received_date INTO v_event_date FROM goods_receipts WHERE id = v_receipt_id;
      END IF;
      v_event_date := COALESCE(v_event_date, NEW.created_at::date, CURRENT_DATE);

      BEGIN
        INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
        VALUES (v_event_date, 'Inventory receipt '||COALESCE(NEW.reference_id,''),
                NEW.reference_id, 'inventory_receipt', 'posted')
        RETURNING id INTO v_je;
        INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
        VALUES (v_je, public.account_for('inventory'), round(v_qty*v_unit_cost), 0, 'Lager av handelsvaror'),
               (v_je, public.account_for('goods_received_not_invoiced'), 0, round(v_qty*v_unit_cost), 'GRNI — ej fakturerade leveranser');
      EXCEPTION WHEN others THEN
        -- Kvar som varning (inte notis): en utebliven verifikation ska synas i
        -- loggen, inte bara i saldot tre månader senare.
        RAISE WARNING 'inventory_receipt JE skipped: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(pc.costing_method,'average') INTO v_method
  FROM products p LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE p.id = NEW.product_id;
  v_method := COALESCE(v_method,'average');

  IF v_method = 'average' THEN
    SELECT CASE WHEN sum(remaining_qty) > 0
                THEN sum(remaining_qty * unit_cost_cents) / sum(remaining_qty) END
    INTO v_avg FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0;
  END IF;

  v_remaining := v_qty;
  FOR v_layer IN
    SELECT id, remaining_qty, unit_cost_cents FROM stock_valuation_layers
    WHERE product_id = NEW.product_id AND remaining_qty > 0
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_layer.remaining_qty, v_remaining);
    v_total_cost := v_total_cost + round(v_take * CASE WHEN v_method='average' THEN v_avg ELSE v_layer.unit_cost_cents END);
    UPDATE stock_valuation_layers SET remaining_qty = remaining_qty - v_take WHERE id = v_layer.id;
    v_remaining := v_remaining - v_take;
  END LOOP;
  IF v_remaining > 0 THEN
    SELECT COALESCE(v_avg, cost_cents, 0) INTO v_unit_cost FROM products WHERE id = NEW.product_id;
    v_total_cost := v_total_cost + round(v_remaining * COALESCE(v_unit_cost,0));
  END IF;


  -- ── COGS-verifikationen, ÅTERINFÖRD ────────────────────────────────────────
  -- 20260822105000 bokade Dt 4990 / Kr 1460 här. 20260827200000 — migrationen
  -- som lagade FAKTURASIDANS saknade verifikation — definierade om den här
  -- funktionen från en äldre kopia och tappade blocket: utflöden konsumerade
  -- värderingslager utan att röra huvudboken. Upptäckt 2026-08-25 när torr-
  -- körningen av utpasseringstriggern fick move men ingen COGS, och den levande
  -- kroppen visade sig sakna varje spår av inventory_cogs. Två kopior av en
  -- funktionskropp driver isär; det här blocket är återhämtat MOT den levande
  -- definitionen, inte mot någon fil. Kontona via rollerna, referensen bär
  -- ordernyckeln — det var frånvaron av referens som gjorde GRNI-läkningen
  -- blind i går, samma läxa.
  IF NEW.move_type = 'out' AND v_total_cost > 0 THEN
    BEGIN
      -- Movens egen tidsstämpel ÄR utpasseringen — en återuppspelad eller
      -- efterregistrerad rörelse bokförs på sin dag, inte på klockans
      -- (p2p-seam-guardrailens regel: datumet följer händelsen).
      INSERT INTO journal_entries (entry_date, description, reference_number, source, status)
      VALUES (COALESCE(NEW.created_at::date, CURRENT_DATE),
              'COGS '||COALESCE(NEW.reference_type,'move')||' '||COALESCE(NEW.reference_id,''),
              NEW.reference_id, 'inventory_cogs', 'posted')
      RETURNING id INTO v_je;
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je, public.account_for('cogs'), v_total_cost, 0, 'Kostnad sålda varor'),
             (v_je, public.account_for('inventory'), 0, v_total_cost, 'Lager av handelsvaror');
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'inventory_cogs JE skipped: %', SQLERRM;
    END;
  END IF;

  UPDATE stock_moves SET
    unit_cost_cents = CASE WHEN v_qty > 0 THEN round(v_total_cost / v_qty) ELSE NULL END,
    value_cents = v_total_cost
  WHERE id = NEW.id;

  RETURN NEW;
END $function$;
