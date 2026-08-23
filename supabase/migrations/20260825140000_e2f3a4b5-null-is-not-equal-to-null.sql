-- `_upsert_quant` could not upsert a lot-less quant, and everything that moves
-- stock went through it.
--
-- Reproduced live on the Nordbrygg testbed 2026-08-23, on a plain stock
-- adjustment of a product that already had a balance:
--   adjust_quant(...) → duplicate key value violates unique constraint
--                       "stock_quants_product_location_nolot_uq"
--
-- The body did a single, predicate-less conflict target:
--     ON CONFLICT (product_id, location_id, lot_id)
-- In SQL, NULL is not equal to NULL. With no lot the clause matches nothing, so
-- the INSERT proceeds and is then refused by the PARTIAL index that actually
-- enforces uniqueness for lot-less rows. Blast radius: adjust_quant,
-- transfer_stock and consume_reservation — the last of which is what
-- ship_picking uses, so a picked order could not be shipped.
--
-- Not batch-tracked goods are the normal case, so this was every ordinary
-- product that already had stock somewhere.
--
-- WHO CREATED IT: the fix did. 20260820210002 deduplicated the lot-less rows
-- that had silently accumulated (precisely BECAUSE the plain unique constraint
-- could never see them — NULL ≠ NULL both ways) and added the two partial
-- indexes that enforce it properly. It left the original constraint standing and
-- did not update this writer. Before that migration nothing crashed; duplicates
-- just crept in. Loud is better than quiet — it is how this was found — but the
-- fix was half.
--
-- The correct shape already existed in the house: upsert_stock_quant branches on
-- lot presence and names the matching partial index in each branch, PREDICATE
-- INCLUDED. Two near-identical functions where the less-used one was wrong, and
-- it surfaced only when somebody ran the whole process. Rather than write a
-- third copy of the logic, the wrapper now delegates — one truth, and callers
-- keep the signature they already pass.
--
-- ARGUMENT ORDER DIFFERS between the two and is easy to transpose:
--   _upsert_quant(product, location, LOT, DELTA)
--   upsert_stock_quant(product, location, DELTA, LOT)
--
-- One deliberate behaviour change: upsert_stock_quant returns early on a zero
-- delta instead of writing a zero-quantity row. A movement of nothing is not a
-- movement, and a 0-row is what a later reader mistakes for "counted, empty".
CREATE OR REPLACE FUNCTION public._upsert_quant(
  _product_id uuid, _location_id uuid, _lot_id uuid, _delta numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.upsert_stock_quant(_product_id, _location_id, _delta, _lot_id);
END; $function$;

-- Reproduction, before and after (run against a product that already has a
-- lot-less balance at the location):
--   SELECT public._upsert_quant('<product>','<location>', NULL, 5);
--   before → duplicate key … stock_quants_product_location_nolot_uq
--   after  → quantity increases by 5
DO $proof$
DECLARE body text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
   WHERE proname = '_upsert_quant' AND pronamespace = 'public'::regnamespace;
  IF body ILIKE '%ON CONFLICT%' THEN
    RAISE EXCEPTION '_upsert_quant still carries its own conflict target — it must delegate, or the two copies drift again';
  END IF;
END $proof$;
