-- Ett serviceavtal har ingen hylla.
--
-- Nordbrygg AB säljer kaffemaskiner MED service. Nio av produkterna är tjänster
-- — installation, serviceavtal Bas/Plus/Prio, servicebesök, utryckning,
-- barista-utbildning, vattenanalys, bönabonnemang — och alla nio har korrekt
-- `track_inventory = false`. Ändå bar liggaren den 23 augusti 2026:
--
--     Installation och driftsättning   stock_quants.quantity = -2
--     Serviceavtal Prio                stock_quants.quantity = -1
--
-- och tre `stock_moves`-rader med notisen 'Auto-decrement from order item'.
-- Värre än spöksaldot: det BLOCKERADE leveransen. `allocate_picking` försökte
-- reservera lager för tjänsteraden, `reserve_stock` svarade
-- "Insufficient available stock to reserve (free -1, need 1)", raden blev
-- `short` — och en order som innehöll installation eller ett serviceavtal kunde
-- aldrig plockas färdigt. Hela order-to-delivery-kedjan stod på något som per
-- definition inte har lager.
--
-- VAKTEN SATT PÅ KOLUMNEN SOM FASAS UT
-- ------------------------------------
-- `trigger_order_item_stock_decrement` (20260820210005_overselling-is-refused)
-- ser ut att bry sig om flaggan:
--
--     INSERT INTO public.stock_moves …                                 ← OVAKTAD
--     UPDATE public.products … AND (track_inventory = true OR stock_quantity IS NOT NULL);
--     PERFORM public.upsert_stock_quant(…);                            ← OVAKTAD
--
-- Vakten skyddar `products.stock_quantity` — den gamla spegeln, som är NULL för
-- en tjänst och därför korrekt gör ingenting — medan den NYA liggaren
-- (`stock_moves` + `stock_quants`) står helt oskyddad. Vakten sattes på kolumnen
-- som ersattes, inte på liggaren som ersatte den.
--
-- Och den är inte ensam. Svep över varenda kodväg som skriver liggaren:
--
--   SKRIVARE                             moves  quants  läser track_inventory?
--   trigger_order_item_stock_decrement     ja     ja    NEJ (vakt på gamla spegeln)
--   process_stock_move_valuation (trg)     —      —     NEJ (fyrar på rörelsen)
--   apply_stock_movement_event             ja     ja    NEJ (samma felplacerade vakt)
--   adjust_quant                           ja     ja    NEJ (bara i en kommentar)
--   apply_goods_receipt_stock              —      ja    NEJ (bara i en kommentar)
--   transfer_stock                         ja     ja    NEJ
--   receive_purchase_order                 ja     ja*   NEJ  (*via apply_goods_receipt_stock)
--   consume_reservation                    ja     ja    NEJ
--   reserve_stock                          —      ja    NEJ
--   cancel_reservation                     —      ja    NEJ
--   complete_inventory_transfer            ja     —     NEJ
--   complete_mo                            ja     —     NEJ
--   advance_inventory_receipt              ja     —     NEJ
--   upsert_stock_quant / _upsert_quant     —      ja    NEJ
--   seed_demo_inventory / sandbox_seed_*   ja     ja    NEJ
--   agent-execute: manage_inventory        ja     —     NEJ  (edge function)
--   agent-execute: goods receipt           ja     —     NEJ  (edge function)
--   useInventory.useAdjustStock            ja     —     NEJ  (frontend)
--   usePurchasing goods receipt            ja     —     NEJ  (frontend)
--
-- Noll av arton läser flaggan innan de skriver liggaren. Att laga två av dem
-- vore att lämna buggen kvar i sexton.
--
-- EN VAKT, PÅ LIGGAREN — INTE ARTON VAKTER I ARTON SKRIVARE
-- ---------------------------------------------------------
-- Odoos modell är strukturell: en `service`-produkt HAR inga lagerrörelser, så
-- ingen kodväg behöver komma ihåg något. Vi har en flagga i stället, och en
-- flagga som arton skrivare måste minnas är arton chanser att glömma — den
-- nittonde skrivaren som skrivs nästa månad kommer att glömma den också.
--
-- Därför läggs vakten EN gång, på liggaren själv:
--
--     BEFORE INSERT ON stock_moves   → RETURN NULL för ospårad produkt
--     BEFORE INSERT ON stock_quants  → RETURN NULL för ospårad produkt
--
-- Båda behövs. `stock_moves` ensamt räcker inte: `trigger_order_item_stock_decrement`
-- anropar `upsert_stock_quant` DIREKT, och det var det anropet som skrev −2.
-- BEFORE INSERT täcker även `INSERT … ON CONFLICT DO UPDATE` (vakten fyrar före
-- konfliktprövningen), så upsert-vägen kan varken skapa eller räkna upp en rad.
-- Rena `UPDATE stock_quants` (reserve_stock, cancel_reservation) behöver ingen
-- vakt: finns raden aldrig träffar de noll rader.
--
-- Att den fyrar på liggaren och inte i skrivarna betyder också att den täcker
-- skrivare som inte är SQL — edge-funktionen och frontend-hookarna skriver
-- `stock_moves` över PostgREST och passerar samma trigger.
--
-- TYST ELLER HÖGT: TVÅ SORTERS ANROPARE
-- -------------------------------------
-- Vakten avvisar tyst (`RETURN NULL`), inte med ett fel. Ett fel här skulle
-- rulla tillbaka INSERT:en på `order_items` — alltså: "vi säljer tjänster" blir
-- "vi kan inte ta emot ordern". Det vore en sämre bugg än den vi lagar.
--
-- Tyst är rätt här därför att det är UPPENBART KORREKT att ingenting sker: en
-- produkt utan lagerdimension kan inte röra ett lagersaldo, och ordern blir i
-- övrigt fullständigt korrekt — raden säljs, plockas, faktureras. Ingenting
-- blir halvgjort.
--
-- Men det finns en andra sorts anropare: den som SIKTADE på lagret. En människa
-- eller agent som kallar `transfer_stock`, `adjust_quant` eller `reserve_stock`
-- på ett serviceavtal har bett om något omöjligt, och tystnad där vore en lögn
-- ("flyttade 5 st Installation") — dessutom skriver `adjust_quant` och
-- `apply_goods_receipt_stock` den ANDRA liggaren, `products.stock_quantity`,
-- som en trigger på `stock_moves` omöjligt kan skydda. De fyra får därför
-- explicita svar nedan. Det är inte "vakt i varje skrivare": vakten på liggaren
-- ger korrektheten, de här fyra ger ärligheten.
--
-- `trigger_order_item_stock_decrement` och `apply_stock_movement_event` rörs
-- MED FLIT INTE. De var de bevisade skrivarna, och att de blir korrekta utan en
-- rad ändrad kod är hela poängen med att lägga vakten på liggaren.
--
-- KVARSTÅENDE RISK, MEDVETET TAGEN
-- --------------------------------
-- `products.track_inventory` är NOT NULL DEFAULT false. En produkt som verkligen
-- bär lager men vars flagga står i false får hädanefter inga liggarrader alls.
-- Det är samma tolkning som redan styr `getStockStatus()`, `isProductPurchasable()`
-- och översäljningsvakten från 20260820210005 — flaggan ÄR plattformens switch,
-- och att låta liggaren tolka den annorlunda än storefronten vore en tredje
-- sanning. Att vända flaggan till false på en produkt som har saldo kvar måste
-- föregås av att saldot skrivs av; läkningen nedan rör därför aldrig ett
-- positivt saldo.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Vakten — en gång, på liggaren
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.stock_ledger_untracked_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tracked boolean;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT track_inventory INTO v_tracked FROM public.products WHERE id = NEW.product_id;

  -- Okänd produkt: inte vår sak att avgöra, låt främmandenyckeln tala.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Ospårad produkt har ingen lagerdimension. Raden skrivs inte.
  IF v_tracked IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.stock_ledger_untracked_guard() IS
  'Avvisar liggarrader (stock_moves / stock_quants) för produkter med track_inventory = false. En tjänst har ingen hylla; rörelsen är definitionsmässigt tom och skrivs inte. Vakten sitter på liggaren i stället för i varje skrivare — se 20260824150000.';

DROP TRIGGER IF EXISTS trg_stock_moves_untracked_guard ON public.stock_moves;
CREATE TRIGGER trg_stock_moves_untracked_guard
  BEFORE INSERT ON public.stock_moves
  FOR EACH ROW EXECUTE FUNCTION public.stock_ledger_untracked_guard();

DROP TRIGGER IF EXISTS trg_stock_quants_untracked_guard ON public.stock_quants;
CREATE TRIGGER trg_stock_quants_untracked_guard
  BEFORE INSERT ON public.stock_quants
  FOR EACH ROW EXECUTE FUNCTION public.stock_ledger_untracked_guard();

-- ═══════════════════════════════════════════════════════════════════════
-- 2. De som siktade på lagret får svar
-- ═══════════════════════════════════════════════════════════════════════

-- adjust_quant: skriver BÅDA liggarna. Utan det här beskedet skulle vakten ge
-- ett nytt glapp — products.stock_quantity flyttades medan quanten avvisades.
CREATE OR REPLACE FUNCTION public.adjust_quant(p_product_id uuid, p_location_id uuid, p_qty_delta numeric, p_lot_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'manual_adjustment'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_move uuid; v_name text; v_tracked boolean;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role))
       OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;
  IF p_qty_delta = 0 THEN RAISE EXCEPTION 'Delta cannot be zero'; END IF;

  SELECT name, track_inventory INTO v_name, v_tracked FROM public.products WHERE id = p_product_id;
  IF v_tracked IS NOT TRUE THEN
    RAISE EXCEPTION '"%" is not stock-tracked (track_inventory = false) — it has no balance to adjust. Enable inventory tracking on the product first, or use a different record if this is a service.',
      COALESCE(v_name, p_product_id::text)
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM _upsert_quant(p_product_id, p_location_id, p_lot_id, p_qty_delta);

  -- The mirror the storefront, the low-stock alert and the reorder loop read.
  -- Same reasoning as apply_goods_receipt_stock: a count is a physical fact, so
  -- the mirror moves whether or not the product is flagged track_inventory.
  -- Without this an adjustment was invisible everywhere except the quant table.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + p_qty_delta::int,
         updated_at = now()
   WHERE id = p_product_id;

  -- Signed quantity and a directional location pair, so the ledger says which
  -- way the goods went. The sign is what the valuation trigger below reads.
  INSERT INTO stock_moves (product_id, quantity, move_type, from_location_id, to_location_id,
                           lot_id, notes, created_by, state)
  VALUES (p_product_id, p_qty_delta::int, 'adjustment',
          CASE WHEN p_qty_delta < 0 THEN p_location_id END,
          CASE WHEN p_qty_delta > 0 THEN p_location_id END,
          p_lot_id, p_reason, auth.uid(), 'done')
  RETURNING id INTO v_move;

  RETURN v_move;
END; $function$;

-- transfer_stock: flyttar mellan två platser. Tystnad här skulle rapportera en
-- flytt som aldrig hände.
CREATE OR REPLACE FUNCTION public.transfer_stock(p_product_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_quantity numeric, p_lot_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_move_id uuid; v_available numeric; v_name text; v_tracked boolean;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory'))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT name, track_inventory INTO v_name, v_tracked FROM public.products WHERE id = p_product_id;
  IF v_tracked IS NOT TRUE THEN
    RAISE EXCEPTION '"%" is not stock-tracked (track_inventory = false) — there is nothing at any location to move. Enable inventory tracking on the product first.',
      COALESCE(v_name, p_product_id::text)
      USING ERRCODE = 'check_violation';
  END IF;

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

-- reserve_stock: svarade "Insufficient available stock to reserve (free -1, need 1)"
-- på ett serviceavtal. Det är inte lagerbrist, det är fel fråga — och det var
-- den meningen som stoppade plockningen. Säg vad som faktiskt är fallet.
CREATE OR REPLACE FUNCTION public.reserve_stock(p_product_id uuid, p_location_id uuid, p_quantity numeric, p_reference_type text DEFAULT NULL::text, p_reference_id text DEFAULT NULL::text, p_lot_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_avail numeric; v_reserved numeric; v_name text; v_tracked boolean;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'writer'::app_role)) OR (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role))) THEN RAISE EXCEPTION 'Insufficient privileges'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT name, track_inventory INTO v_name, v_tracked FROM public.products WHERE id = p_product_id;
  IF v_tracked IS NOT TRUE THEN
    RAISE EXCEPTION '"%" is not stock-tracked (track_inventory = false) — it needs no reservation and is always available. Do not reserve service lines.',
      COALESCE(v_name, p_product_id::text)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(quantity,0), COALESCE(reserved_quantity,0) INTO v_avail, v_reserved
    FROM stock_quants WHERE product_id = p_product_id AND location_id = p_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  IF (COALESCE(v_avail,0) - COALESCE(v_reserved,0)) < p_quantity THEN
    RAISE EXCEPTION 'Insufficient available stock to reserve (free %, need %)', (COALESCE(v_avail,0) - COALESCE(v_reserved,0)), p_quantity;
  END IF;
  INSERT INTO stock_reservations (product_id, location_id, lot_id, quantity, reference_type, reference_id, reserved_by, notes)
  VALUES (p_product_id, p_location_id, p_lot_id, p_quantity, p_reference_type, p_reference_id, auth.uid(), p_notes) RETURNING id INTO v_id;
  UPDATE stock_quants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_quantity, updated_at = now()
    WHERE product_id = p_product_id AND location_id = p_location_id AND (lot_id IS NOT DISTINCT FROM p_lot_id);
  RETURN v_id;
END; $function$;

-- apply_goods_receipt_stock: att ta emot en tjänst på en inköpsorder bokar
-- ingenting — Odoo gör ingen mottagningsrad för en servicerad. Här är tystnad
-- uppenbart korrekt, men spegeln måste sluta röra sig med, annars ger vakten
-- ett nytt glapp. Returnerar NULL, samma "ingenting bokades" som redan gäller
-- för NULL-produkt och nollkvantitet.
CREATE OR REPLACE FUNCTION public.apply_goods_receipt_stock(p_product_id uuid, p_quantity numeric, p_location_id uuid DEFAULT NULL::uuid, p_lot_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_loc uuid := p_location_id;
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR has_role(auth.uid(), 'admin'::public.app_role)
          OR public.can_access_module(auth.uid(), 'inventory')
          OR public.can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Not allowed to book stock receipts';
  END IF;

  IF p_product_id IS NULL OR COALESCE(p_quantity, 0) = 0 THEN
    RETURN NULL;
  END IF;

  -- Ospårad produkt: ingen quant, ingen spegel, ingen rörelse.
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id AND track_inventory = true) THEN
    RETURN NULL;
  END IF;

  IF v_loc IS NULL THEN
    v_loc := public.default_internal_location();
  END IF;

  IF v_loc IS NULL THEN
    RAISE EXCEPTION 'No active internal stock location exists — cannot receive goods. Run SELECT public.seed_stock_locations() to restore the canonical warehouse layout.'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM public.upsert_stock_quant(p_product_id, v_loc, p_quantity, p_lot_id);

  -- The storefront, low-stock alerts and the reorder loop all read
  -- products.stock_quantity. A receipt is a physical fact, so the mirror moves.
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + p_quantity::int,
         updated_at = now()
   WHERE id = p_product_id;

  RETURN v_loc;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. allocate_picking begär inte lager för något som inte har lager
-- ═══════════════════════════════════════════════════════════════════════
--
-- Valet: raden HOPPAS INTE ÖVER — den plockas med, som `reserved`, utan
-- reservation och utan att röra ett saldo. Skälen:
--
--   * Att hoppa över raden helt vore att göra plocklistan till en lögn om
--     ordern. Teknikern som kommer ut ska se att installationen ingår.
--   * `reserved` utan reservation är redan vad `ship_picking` klarar: den
--     konsumerar bara rader med `reservation_id IS NOT NULL`, så en tjänsterad
--     passerar utan att röra lagret. Odoo levererar inga tjänster, de faktureras.
--   * `short` betyder "vi saknar varan". En tjänst saknas aldrig. Att räkna den
--     som slut var precis det som blockerade leveransen.
--
-- Svaret bär `stock_tracked` per rad och `lines_untracked` i summan, så en
-- anropare kan se skillnad på "reserverad ur lagret" och "behövde inget lager".
-- Rader helt utan produkt (fritextrader) hanteras likadant: de har heller inget
-- saldo att reservera, och blev `short` av samma skäl.
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
  v_untracked_count INT := 0;
  v_needs_stock BOOLEAN;
  v_short_reason TEXT;
  v_lines JSONB := '[]'::JSONB;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR can_access_module(auth.uid(),'inventory')) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_source_location := COALESCE(
    p_source_location_id,
    (SELECT id FROM public.stock_locations
      WHERE location_type = 'internal' AND is_active = true ORDER BY created_at LIMIT 1)
  );

  -- Idempotency: reuse an open picking_order for this order if one exists.
  SELECT id INTO v_picking_id
    FROM public.picking_orders
   WHERE order_id = p_order_id AND status IN ('draft','ready','in_progress')
   LIMIT 1;

  IF v_picking_id IS NULL THEN
    INSERT INTO public.picking_orders (order_id, source_location_id, status, ship_to_name,
                                       ship_to_address, created_by, allocated_at)
    VALUES (p_order_id, v_source_location, 'ready', v_order.customer_name, NULL, auth.uid(), now())
    RETURNING id INTO v_picking_id;
  END IF;

  -- products has no `sku` column — `barcode` carries the SKU value.
  FOR v_item IN
    SELECT oi.*, p.name AS p_name, p.barcode AS p_sku,
           COALESCE(p.track_inventory, false) AS p_tracked
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = p_order_id
  LOOP
    v_total_count := v_total_count + 1;
    v_reservation_id := NULL;
    v_short_reason := NULL;

    -- En tjänst (track_inventory = false) och en fritextrad har inget saldo.
    -- Reservera inte; raden är tillgänglig, inte slut.
    v_needs_stock := (v_item.product_id IS NOT NULL AND v_item.p_tracked);

    IF v_needs_stock THEN
      BEGIN
        -- ::text — p_reference_id is text. Without the cast this call does not
        -- resolve and no line has ever been reserved.
        v_reservation_id := public.reserve_stock(
          v_item.product_id,
          v_source_location,
          v_item.quantity,
          'picking_order',
          v_picking_id::text
        );
      EXCEPTION
        -- A missing function, column or table is a defect in this function, not a
        -- statement about the warehouse. Let it out.
        WHEN undefined_function OR undefined_column OR undefined_table THEN
          RAISE;
        WHEN OTHERS THEN
          v_short_count := v_short_count + 1;
          v_short_reason := left(SQLERRM, 200);
      END;
    ELSE
      v_untracked_count := v_untracked_count + 1;
    END IF;

    INSERT INTO public.picking_lines (
      picking_order_id, product_id, product_sku, product_name,
      qty_requested, reservation_id, status, notes
    )
    VALUES (
      v_picking_id, v_item.product_id, v_item.p_sku, COALESCE(v_item.p_name, v_item.product_name, 'Product'),
      v_item.quantity, v_reservation_id,
      CASE
        WHEN NOT v_needs_stock THEN 'reserved'
        WHEN v_reservation_id IS NOT NULL THEN 'reserved'
        ELSE 'short'
      END,
      CASE WHEN NOT v_needs_stock THEN 'No stock reservation — product is not stock-tracked' ELSE v_short_reason END
    )
    RETURNING id INTO v_line_id;

    v_lines := v_lines || jsonb_build_object(
      'line_id', v_line_id,
      'product_id', v_item.product_id,
      'qty', v_item.quantity,
      'reserved', (v_reservation_id IS NOT NULL OR NOT v_needs_stock),
      'stock_tracked', v_needs_stock,
      'short_reason', v_short_reason
    );
  END LOOP;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('picking.allocated', 'picking_order', v_picking_id, auth.uid(),
    jsonb_build_object('order_id', p_order_id, 'lines', v_total_count,
                       'short', v_short_count, 'untracked', v_untracked_count));

  RETURN jsonb_build_object(
    'success', true,
    'picking_order_id', v_picking_id,
    'lines_total', v_total_count,
    'lines_short', v_short_count,
    'lines_untracked', v_untracked_count,
    'lines', v_lines
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.allocate_picking(uuid, uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Läkning — konservativ, villkorad, loggad
-- ═══════════════════════════════════════════════════════════════════════
--
-- RÖR:   liggarrader som BARA kan ha uppstått ur den här vägen —
--          * stock_moves för produkter med track_inventory = false, som varken
--            bär ett värde (value_cents/unit_cost_cents = 0) eller har någon
--            värderingsrad. På nordbrygg är alla tre exakt det: värdet blev 0,
--            så COGS-verifikatet aldrig bokfördes och böckerna är rena.
--          * stock_quants för produkter med track_inventory = false vars saldo
--            är noll eller NEGATIVT och som inte är reserverat. Ett negativt
--            saldo på något ospårat kan inte vara verkliga varor; det kan bara
--            vara fantomavdrag.
--
-- RÖR INTE: någon spårad produkts saldo eller rörelse — inte en rad, oavsett
--          hur fel den ser ut. Ett felaktigt lagat lagersaldo är värre än ett
--          synligt fel.
--          Inte heller ett POSITIVT saldo på en ospårad produkt: det kan vara
--          verkliga varor på en produkt vars flagga vändes, och att radera dem
--          vore att uppfinna ett svar.
--          Inte heller en ospårad rörelse som BÄR ett värde eller har en
--          värderingsrad: den har nått böckerna, och att ta bort den utan att
--          röra verifikatet vore att göra lagerkontot obalanserat i tysthet.
--          Inte stock_valuation_layers, inte journal_entries, inte
--          products.stock_quantity.
--
-- Idempotent: andra körningen hittar noll rader och loggar ingenting.
DO $heal$
DECLARE
  v_moves int := 0;
  v_quants int := 0;
  v_kept_moves int := 0;
  v_kept_quants int := 0;
  v_detail jsonb := '[]'::jsonb;
BEGIN
  IF to_regclass('public.stock_moves') IS NULL OR to_regclass('public.stock_quants') IS NULL THEN
    RETURN;
  END IF;

  -- Vad som lämnas kvar, med flit — räknat före raderingen så siffran är sann.
  SELECT count(*) INTO v_kept_moves
    FROM public.stock_moves m
    JOIN public.products p ON p.id = m.product_id
   WHERE p.track_inventory = false
     AND (COALESCE(m.value_cents, 0) <> 0
          OR COALESCE(m.unit_cost_cents, 0) <> 0
          OR EXISTS (SELECT 1 FROM public.stock_valuation_layers v WHERE v.move_id = m.id));

  SELECT count(*) INTO v_kept_quants
    FROM public.stock_quants q
    JOIN public.products p ON p.id = q.product_id
   WHERE p.track_inventory = false
     AND (q.quantity > 0 OR COALESCE(q.reserved_quantity, 0) <> 0);

  -- Vad som läks, rad för rad, innan det försvinner.
  SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) INTO v_detail FROM (
    SELECT jsonb_build_object('kind','stock_quant','product', p.name,
                              'quantity', q.quantity, 'location_id', q.location_id) AS d
      FROM public.stock_quants q JOIN public.products p ON p.id = q.product_id
     WHERE p.track_inventory = false
       AND q.quantity <= 0 AND COALESCE(q.reserved_quantity, 0) = 0
    UNION ALL
    SELECT jsonb_build_object('kind','stock_move','product', p.name, 'move_id', m.id,
                              'quantity', m.quantity, 'reference_type', m.reference_type,
                              'notes', m.notes, 'created_at', m.created_at)
      FROM public.stock_moves m JOIN public.products p ON p.id = m.product_id
     WHERE p.track_inventory = false
       AND COALESCE(m.value_cents, 0) = 0
       AND COALESCE(m.unit_cost_cents, 0) = 0
       AND NOT EXISTS (SELECT 1 FROM public.stock_valuation_layers v WHERE v.move_id = m.id)
  ) s;

  DELETE FROM public.stock_quants q
   USING public.products p
   WHERE p.id = q.product_id
     AND p.track_inventory = false
     AND q.quantity <= 0
     AND COALESCE(q.reserved_quantity, 0) = 0;
  GET DIAGNOSTICS v_quants = ROW_COUNT;

  DELETE FROM public.stock_moves m
   USING public.products p
   WHERE p.id = m.product_id
     AND p.track_inventory = false
     AND COALESCE(m.value_cents, 0) = 0
     AND COALESCE(m.unit_cost_cents, 0) = 0
     AND NOT EXISTS (SELECT 1 FROM public.stock_valuation_layers v WHERE v.move_id = m.id);
  GET DIAGNOSTICS v_moves = ROW_COUNT;

  IF v_moves > 0 OR v_quants > 0 THEN
    RAISE NOTICE 'stock ledger healed: % ghost quant row(s), % ghost move(s) removed for untracked products; % move(s) and % quant row(s) deliberately left in place.',
      v_quants, v_moves, v_kept_moves, v_kept_quants;

    BEGIN
      INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
      VALUES ('inventory.untracked_ledger_healed', 'stock_quants', NULL, NULL,
              jsonb_build_object(
                'migration', '20260824150000_b9c0d1e2-a-service-has-no-shelf',
                'quants_removed', v_quants,
                'moves_removed', v_moves,
                'moves_left_valued', v_kept_moves,
                'quants_left_positive_or_reserved', v_kept_quants,
                'removed', v_detail));
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'healing audit_log entry skipped: %', SQLERRM;
    END;
  END IF;
END
$heal$;
