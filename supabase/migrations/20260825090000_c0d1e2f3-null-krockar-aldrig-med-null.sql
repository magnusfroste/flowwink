-- NULL krockar aldrig med NULL.
--
-- `SELECT adjust_quant(<spårad produkt>, <plats>, 3)` svarar, på varje instans,
-- så snart produkten redan har ett saldo på den platsen:
--
--     ERROR: duplicate key value violates unique constraint
--            "stock_quants_product_location_nolot_uq"
--
-- Alltså: den ANDRA lagerjusteringen på samma produkt och plats går inte att
-- göra. Första gången fungerar (raden finns inte än), sedan är vägen stängd.
--
-- SKILJEDOMAREN PEKADE PÅ EN GARANTI SOM INTE GÄLLER
-- --------------------------------------------------
-- `_upsert_quant` gör en upsert:
--
--     INSERT INTO public.stock_quants (product_id, location_id, lot_id, quantity, updated_at)
--     VALUES (_product_id, _location_id, _lot_id, _delta, now())
--     ON CONFLICT (product_id, location_id, lot_id)          ← skiljedomaren
--     DO UPDATE SET quantity = stock_quants.quantity + _delta, updated_at = now();
--
-- Skiljedomaren `(product_id, location_id, lot_id)` matchar det vanliga
-- UNIQUE-villkoret `stock_quants_product_id_location_id_lot_id_key` från
-- baselinen. I ett vanligt UNIQUE-index är NULL <> NULL: två rader med samma
-- produkt och plats men `lot_id IS NULL` bryter det INTE mot villkoret, och
-- konflikten upptäcks därför aldrig. `DO UPDATE`-grenen fyrar inte.
--
-- Insert:en fortsätter — och träffar det PARTIELLA unikindexet som
-- 20260820210002 lade just för att täppa till samma hål:
--
--     stock_quants_product_location_nolot_uq (product_id, location_id) WHERE lot_id IS NULL
--
-- Där finns inget NULL att jämföra: predikatet har redan sorterat bort raderna
-- med parti, och de kvarvarande jämförs på två icke-null-kolumner. Indexet
-- säger stopp. Upserten blev en ren INSERT mot ett index den inte visste om.
--
-- Notera vad det INTE är: det är inte ett saknat index, inte dubblettdata, inte
-- en tävlan mellan två samtidiga anrop. Raden som ska räknas upp finns, koden
-- som ska räkna upp den finns — de pekar bara på två olika unikhetsgarantier.
--
-- VILKA VÄGAR SOM STOD STILLA
-- ---------------------------
--     adjust_quant          — lagerjustering, och inventeringens bokning
--     transfer_stock        — flytt mellan platser (två anrop, båda faller)
--     consume_reservation   — anropas av ship_picking när godset lämnar hyllan
--
-- Alla tre bara för partilöst lager (`lot_id IS NULL`) — vilket är
-- normalfallet: partispårning är undantaget, inte regeln. Lager med parti gick
-- hela tiden igenom, eftersom både villkoret och det partiella indexet då
-- jämför tre icke-null-kolumner och skiljedomaren träffar rätt.
--
-- SYSKONET SOM ALDRIG HADE BUGGEN
-- -------------------------------
-- `upsert_stock_quant(p_product_id, p_location_id, p_qty_delta, p_lot_id)` —
-- lagd i 20260820210002 tillsammans med de partiella indexen, med kommentaren
-- "The one place a stock balance changes" — grenar på `lot_id` och pekar på
-- rätt index i båda grenarna. Den har varit korrekt hela tiden.
--
-- Två primitiv för samma sak är felet under felet: den ena lagades när indexen
-- kom, den andra glömdes, och ingenting sade till. Rättningen lägger därför
-- inte en tredje kopia av grenlogiken — den låter `_upsert_quant` DELEGERA, så
-- att "den enda plats ett lagersaldo ändras" blir sant i bokstavlig mening.
-- Nästa gång unikheten ändras finns det bara en INSERT att ändra.
--
-- `_upsert_quant` behålls (den är GRANT:ad, anon-revokad i 20260822020000 och
-- anropad från tre funktioner) — men bara som ett skal.
--
-- TVÅ SKILLNADER SOM ÄR MEDVETNA
-- ------------------------------
--   * Delta 0: `upsert_stock_quant` returnerar tyst. Förut skrevs en rad med
--     saldo 0. Ingen anropare kan nå hit — `adjust_quant` vägrar delta 0,
--     `transfer_stock` kräver positivt antal, `reserve_stock` likaså — och en
--     tom rad var aldrig något någon läste: `reserve_stock` och `transfer_stock`
--     tolkar redan "ingen rad" som noll.
--   * NULL produkt eller plats: kastar HÖGT här i stället för att delegera.
--     `upsert_stock_quant` returnerar tyst i det läget, och tystnad vore en
--     regression: `transfer_stock` med en NULL-plats skulle hoppa över quanten
--     men ändå skriva sin `stock_moves`-rad — en halv flytt, tyst. NOT NULL på
--     kolumnerna sade ifrån förut; det beskedet behålls.
--
-- Vakten från 20260824150000 (BEFORE INSERT på liggaren) sitter kvar och fyrar
-- likadant: den prövas före konfliktprövningen och stoppar en ospårad produkt
-- oavsett vilket index skiljedomaren pekar på.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Indexen som skiljedomaren ska peka på måste finnas
-- ═══════════════════════════════════════════════════════════════════════
--
-- De kom i 20260820210002. Den migrationen ligger under HEAD på varje
-- managerad instans och kan ha hoppats över där; utan det partiella indexet
-- har `ON CONFLICT … WHERE lot_id IS NULL` inget att sluta sig till och
-- funktionen skulle falla på "no unique or exclusion constraint matching".
-- Samma kollaps-först-skapa-sedan som originalet, men bara när indexet saknas.
DO $ensure_indexes$
BEGIN
  IF to_regclass('public.stock_quants_product_location_nolot_uq') IS NULL THEN
    -- Slå ihop partilösa dubbletter innan indexet kan avvisa dem: summan
    -- överlever, den äldsta raden bär den.
    WITH ranked AS (
      SELECT id, product_id, location_id,
             row_number() OVER (PARTITION BY product_id, location_id ORDER BY updated_at, id) AS rn,
             sum(quantity) OVER (PARTITION BY product_id, location_id) AS tot_qty,
             sum(reserved_quantity) OVER (PARTITION BY product_id, location_id) AS tot_res
        FROM public.stock_quants
       WHERE lot_id IS NULL
    )
    UPDATE public.stock_quants q
       SET quantity = r.tot_qty, reserved_quantity = r.tot_res, updated_at = now()
      FROM ranked r
     WHERE q.id = r.id AND r.rn = 1
       AND EXISTS (SELECT 1 FROM ranked d WHERE d.product_id = r.product_id
                     AND d.location_id = r.location_id AND d.rn > 1);

    DELETE FROM public.stock_quants q
     USING (
       SELECT id, row_number() OVER (PARTITION BY product_id, location_id ORDER BY updated_at, id) AS rn
         FROM public.stock_quants WHERE lot_id IS NULL
     ) d
     WHERE q.id = d.id AND d.rn > 1;

    CREATE UNIQUE INDEX stock_quants_product_location_nolot_uq
      ON public.stock_quants (product_id, location_id) WHERE lot_id IS NULL;
  END IF;

  -- Partirader kan inte vara dubblerade: det vanliga UNIQUE-villkoret från
  -- baselinen jämför tre icke-null-kolumner och har redan hållit dem isär.
  IF to_regclass('public.stock_quants_product_location_lot_uq') IS NULL THEN
    CREATE UNIQUE INDEX stock_quants_product_location_lot_uq
      ON public.stock_quants (product_id, location_id, lot_id) WHERE lot_id IS NOT NULL;
  END IF;
END $ensure_indexes$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Ett primitiv, inte två
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._upsert_quant(_product_id uuid, _location_id uuid, _lot_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- A missing product or location is a defect in the caller, not a no-op: the
  -- NOT NULL columns said so before this change, and upsert_stock_quant would
  -- return in silence. Keep saying it out loud, or a transfer to nowhere writes
  -- a stock_moves row for a quant that never moved.
  IF _product_id IS NULL OR _location_id IS NULL THEN
    RAISE EXCEPTION '_upsert_quant requires a product and a location (got product %, location %)',
      COALESCE(_product_id::text, 'NULL'), COALESCE(_location_id::text, 'NULL')
      USING ERRCODE = 'not_null_violation';
  END IF;

  -- Named notation, deliberately: the two signatures order (lot, delta) and
  -- (delta, lot) opposite to each other, and a positional call that silently
  -- swapped them would post a lot id as a quantity.
  PERFORM public.upsert_stock_quant(
    p_product_id  => _product_id,
    p_location_id => _location_id,
    p_qty_delta   => _delta,
    p_lot_id      => _lot_id
  );
END;
$function$;

COMMENT ON FUNCTION public._upsert_quant(uuid, uuid, uuid, numeric) IS
  'Legacy-signaturskal över upsert_stock_quant, som är den enda plats ett lagersaldo ändras. Egen ON CONFLICT här är förbjuden: skiljedomaren (product_id, location_id, lot_id) träffar det vanliga UNIQUE-villkoret där NULL <> NULL, missar konflikten för partilöst lager och faller mot det partiella indexet. Se 20260825090000.';
