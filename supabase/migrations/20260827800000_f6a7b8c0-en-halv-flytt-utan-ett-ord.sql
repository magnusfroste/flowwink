-- En halv flytt, utan ett ord.
--
-- `20260825140000_e2f3a4b5-null-is-not-equal-to-null` lagade huvudsaken: den
-- predikatlösa skiljedomaren i `_upsert_quant` som gjorde att en partilös quant
-- aldrig kunde räknas upp. Den lagningen står kvar orörd i sin sak — omslaget
-- delegerar till `upsert_stock_quant`, ett primitiv i stället för två.
--
-- Två hål blev kvar öppna av delegeringen. Båda är små, båda är tysta, och tyst
-- är det enda de har gemensamt med varandra.
--
-- ETT: NULL PRODUKT ELLER PLATS BLEV EN TYST NO-OP
-- ------------------------------------------------
-- `upsert_stock_quant` inleder med
--
--     IF p_product_id IS NULL OR p_location_id IS NULL OR COALESCE(p_qty_delta,0) = 0
--     THEN RETURN; END IF;
--
-- Rätt beslut för det primitivet, som anropas från mottagningsvägar där en
-- utebliven rad verkligen betyder "ingenting att boka". Men `_upsert_quant`
-- skrev tidigare rakt in i `stock_quants`, och kolumnerna `product_id` och
-- `location_id` är NOT NULL — ett NULL där gav ett fel, och felet rullade
-- tillbaka hela anropet. Efter delegeringen returnerar samma anrop tyst.
--
-- Det spelar roll för exakt en anropare, och den är den värsta att vara tyst i:
--
--     transfer_stock(p_product_id, p_from_location_id, p_to_location_id, ...)
--       PERFORM _upsert_quant(..., p_from_location_id, -p_quantity);  ← platsen finns: DRAS AV
--       PERFORM _upsert_quant(..., p_to_location_id,   +p_quantity);  ← NULL: tyst hoppad
--       INSERT INTO stock_moves (... from_location_id, to_location_id ...)  ← skrivs ÄNDÅ
--
-- Och det är värre än en tom rörelse. De två benen är inte symmetriska: FRÅN-benet
-- har en giltig plats och dras av, TILL-benet är NULL och hoppas över. Mätt på en
-- replika av live-schemat med bara 20260825140000 applicerad — saldo 8, flytt av 2
-- till NULL:
--
--     transfer_stock(...)              → lyckades (returnerade ett move-id)
--     stock_moves 'transfer'-rader     → 1   ("2 st flyttades")
--     saldo på källan                  → 6   (avdraget skedde)
--     saldo på målet                   → finns inte  (påslaget skedde aldrig)
--
-- Två enheter upphörde att existera, och anropet rapporterade framgång.
-- `stock_moves.from_location_id` och `to_location_id` är nullbara, så ingenting
-- längre ned säger ifrån heller. Det är en sämre sorts fel än det som lagades:
-- det gamla felet stoppade arbetet högljutt, det här förstör lager tyst.
--
-- Noll-delta är INTE samma sak och lämnas tyst med flit: en rörelse av
-- ingenting är ingen rörelse, ingen anropare kan nå dit (`adjust_quant` vägrar
-- delta 0, `transfer_stock` och `reserve_stock` kräver positivt antal), och en
-- 0-rad är precis vad en senare läsare misstar för "räknat, tomt". Den
-- bedömningen står kvar från 20260825140000.
--
-- TVÅ: DELEGERINGEN FÖRUTSÄTTER INDEX SOM KAN SAKNAS
-- --------------------------------------------------
-- `upsert_stock_quant` namnger partiella index i sina två grenar:
--
--     ON CONFLICT (product_id, location_id) WHERE lot_id IS NULL
--     ON CONFLICT (product_id, location_id, lot_id) WHERE lot_id IS NOT NULL
--
-- De indexen kom i `20260820210002`. Den migrationen ligger under ledgerns HEAD
-- på varje managerad instans, och en instans som passerat den stämpeln har
-- hoppat över den tyst — det är precis den drivklass som
-- check-migration-forward-dated finns för. Saknas indexet finns ingenting att
-- sluta sig till, och anropet faller på
--
--     ERROR: there is no unique or exclusion constraint matching
--            the ON CONFLICT specification
--
-- Verifierat på samma replika: droppa `stock_quants_product_location_nolot_uq`,
-- kör `adjust_quant` — felet ovan, ur INSERT:en inne i `upsert_stock_quant`.
--
-- Före delegeringen spelade det ingen roll: `_upsert_quant` pekade på det
-- vanliga UNIQUE-villkoret från baselinen, som finns överallt. Delegeringen
-- flyttade alltså beroendet från ett villkor som alltid finns till två index som
-- kanske inte gör det. Säkras här, villkorat, med samma kollaps-först som
-- originalet.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Indexen som delegeringen sluter sig till
-- ═══════════════════════════════════════════════════════════════════════
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
-- 2. Delegeringen behålls — tystnaden om NULL gör den inte
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._upsert_quant(_product_id uuid, _location_id uuid, _lot_id uuid, _delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- En saknad produkt eller plats är ett fel i anroparen, inte en no-op. NOT
  -- NULL på kolumnerna sade det förut; efter delegeringen gör ingen det. Utan
  -- den här raden skriver transfer_stock sin stock_moves-rad för en quant som
  -- aldrig flyttades — en halv flytt, utan ett ord.
  IF _product_id IS NULL OR _location_id IS NULL THEN
    RAISE EXCEPTION '_upsert_quant requires a product and a location (got product %, location %)',
      COALESCE(_product_id::text, 'NULL'), COALESCE(_location_id::text, 'NULL')
      USING ERRCODE = 'not_null_violation';
  END IF;

  -- Namngivna argument, med flit: de två signaturerna ordnar (lot, delta)
  -- respektive (delta, lot) omvänt, och ett positionellt anrop som tyst kastade
  -- om dem skulle posta ett parti-id som ett antal.
  PERFORM public.upsert_stock_quant(
    p_product_id  => _product_id,
    p_location_id => _location_id,
    p_qty_delta   => _delta,
    p_lot_id      => _lot_id
  );
END;
$function$;

COMMENT ON FUNCTION public._upsert_quant(uuid, uuid, uuid, numeric) IS
  'Legacy-signaturskal över upsert_stock_quant, som är den enda plats ett lagersaldo ändras. Egen ON CONFLICT här är förbjuden (se 20260825140000). NULL produkt eller plats kastar i stället för att tiga — annars skriver transfer_stock en rörelse för ett saldo som aldrig rörde sig (se 20260827800000).';

-- Samma efterkontroll som 20260825140000 bär: kroppen får aldrig få tillbaka en
-- egen konfliktmålsklausul, oavsett vem som skriver om den härnäst.
DO $proof$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
   WHERE proname = '_upsert_quant' AND pronamespace = 'public'::regnamespace;
  IF body ILIKE '%ON CONFLICT%' THEN
    RAISE EXCEPTION '_upsert_quant still carries its own conflict target — it must delegate, or the two copies drift again';
  END IF;
  IF body NOT ILIKE '%not_null_violation%' THEN
    RAISE EXCEPTION '_upsert_quant lost its NULL guard — a transfer to nowhere would write a stock_move for a quant that never moved';
  END IF;
END $proof$;
