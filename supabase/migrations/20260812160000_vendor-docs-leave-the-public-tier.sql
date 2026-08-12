-- FlowWink's own documentation must not be readable by a customer's visitors.
--
-- FOUND 2026-08-12, across four fleet instances at once (7,959 chunks total:
-- optic 2,377 · liteit 2,267 · autoversio 1,760 · www-legacy 1,555).
--
-- `docs_pages` holds FlowWink's repo documentation, synced onto each customer
-- instance so the /docs page can search itself. The indexer classed those
-- chunks `visibility = 'public'`, and `knowledge_chunks` has an RLS policy
-- "Anyone can read public chunks". `search_knowledge_chunks` is EXECUTE-granted
-- to `anon`. The instance's publishable key ships in the JS bundle by design.
--
-- Those four facts compose into: anyone can POST
--   /rest/v1/rpc/search_knowledge_chunks {"sources":["docs_pages"], …}
-- against a customer's project and read our architecture notes out of their
-- database. No login, no chat surface involved. Verified by simulating the
-- `anon` role against a live instance: all 2,377 rows visible.
--
-- The chat surfaces were never the hole — they don't request the source (and
-- since 2026-08-12 a guardrail forbids adding it). The hole is the tier.
--
-- Fix, in two halves:
--   • CODE — the indexer now writes 'internal' for docs_pages (this migration's
--     companion). Staff keep the docs search; the public tier loses it.
--   • DATA — this migration reclassifies what is already indexed. Reclassify
--     rather than delete: on an instance where the Docs module is ON, staff
--     search still works. Where the module is OFF, the indexer's module gate
--     removes the chunks on its next sweep anyway.
--
-- Idempotent: re-running only re-asserts the tier.

DO $vendor_docs$
DECLARE
  v_moved int;
BEGIN
  IF to_regclass('public.knowledge_chunks') IS NULL THEN
    RAISE NOTICE 'knowledge_chunks not present — nothing to reclassify.';
    RETURN;
  END IF;

  UPDATE public.knowledge_chunks
     SET visibility = 'internal'
   WHERE source_table = 'docs_pages'
     AND visibility <> 'internal';
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  IF v_moved > 0 THEN
    RAISE NOTICE 'Vendor docs left the public tier: % chunk(s) reclassified to internal.', v_moved;
  ELSE
    RAISE NOTICE 'Vendor docs already internal (or none indexed).';
  END IF;
END $vendor_docs$;
