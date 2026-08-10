-- ============================================================================
-- The extractor says 'success'; the indexer listened for 'completed'.
--
-- Every writer of documents.extraction_status on this platform writes
-- 'success' (upload_document, extract-pdf-text). The knowledge indexer's
-- documents case required 'completed' — a literal no writer has ever
-- produced. Result: NOT ONE document has ever been indexed, including fully
-- extracted ones with content_md in place. The Documents source appeared in
-- every chat's source picker and always returned nothing.
--
-- Same near-miss-literal class as the VAT coverage `<> 'void'` filter
-- (2026-08-09): a filter that never matches fails silently, and silence reads
-- as "no documents" rather than "broken check".
--
-- The code fix lives in _shared/retrieval/indexer.ts (accepts the literal
-- actually written). This migration re-queues every extracted document so the
-- next indexer sweep (≤5 min) finally chunks them.
-- ============================================================================

INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'documents', id::text, 'upsert'
  FROM public.documents
 WHERE extraction_status IN ('success', 'completed')
   AND coalesce(content_md, '') <> ''
ON CONFLICT (source_table, entity_id)
  DO UPDATE SET op = 'upsert', queued_at = now(), attempts = 0, last_error = NULL;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.documents
   WHERE extraction_status IN ('success', 'completed') AND coalesce(content_md, '') <> '';
  RAISE NOTICE 'Documents: % extracted document(s) re-queued for indexing. They were never chunked — the indexer was listening for a status no writer produces.', v_n;
END $$;
