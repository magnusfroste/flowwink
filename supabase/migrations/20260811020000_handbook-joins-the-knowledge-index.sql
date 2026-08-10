-- ============================================================================
-- The handbook joins the knowledge index.
--
-- handbook_chapters — the customer's OWN handbook, the Handbook module in the
-- admin nav — was never indexed. The reindex trigger sat on documents,
-- kb_articles, pages and wiki_pages, but not here. A team writing its handbook
-- produced content no retrieval surface could see: not FlowWork, not FlowPilot,
-- not search_knowledge.
--
-- (Not to be confused with docs_pages, which is FlowWink's repo documentation
-- synced per instance. Confusing the two briefly exposed vendor architecture
-- notes in a customer chat on 2026-08-11. This migration indexes the CUSTOMER's
-- book.)
--
-- queue_knowledge_reindex() is generic over TG_TABLE_NAME, so joining the
-- index is exactly one trigger, plus a seed of whatever already exists.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_knowledge_reindex ON public.handbook_chapters;
CREATE TRIGGER trg_knowledge_reindex
  AFTER INSERT OR UPDATE OR DELETE ON public.handbook_chapters
  FOR EACH ROW EXECUTE FUNCTION public.queue_knowledge_reindex();

-- Queue every existing chapter once, so instances that already hold content
-- get indexed on the next sweep instead of waiting for an edit.
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'handbook_chapters', id::text, 'upsert' FROM public.handbook_chapters
ON CONFLICT (source_table, entity_id)
  DO UPDATE SET op = 'upsert', queued_at = now(), attempts = 0, last_error = NULL;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.handbook_chapters;
  IF v_n > 0 THEN
    RAISE NOTICE 'Handbook: % existing chapter(s) queued for indexing — searchable after the next indexer sweep (≤5 min).', v_n;
  ELSE
    RAISE NOTICE 'Handbook: empty today, but every chapter written from now on is indexed as it is saved.';
  END IF;
END $$;
