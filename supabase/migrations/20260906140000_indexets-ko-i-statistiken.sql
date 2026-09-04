-- Indexets kö syns i statistiken — och via gatewayn.
--
-- Resta 2026-09-04: 28 KB-artiklar publicerades, wikisidor skapade samtidigt
-- kom in i indexet, KB-artiklarna kom aldrig — och ingen väg via gatewayn
-- att se kön eller dess fel. knowledge_index_stats() bär nu kön: djup,
-- rader som gett upp, senaste felet med källa och post. Samma RPC som
-- Observability läser; skillen knowledge_index_status läser den utifrån.

CREATE OR REPLACE FUNCTION public.knowledge_index_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only staff can read knowledge index stats';
  END IF;
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.knowledge_chunks),
    'by_source', COALESCE((SELECT jsonb_object_agg(source_table, n) FROM (
        SELECT source_table, count(*) AS n FROM public.knowledge_chunks GROUP BY source_table) s), '{}'::jsonb),
    'missing_embedding', (SELECT count(*) FROM public.knowledge_chunks WHERE embedding IS NULL),
    'gave_up', (SELECT count(*) FROM public.knowledge_chunks WHERE embedding IS NULL AND embedding_attempts >= 5),
    'last_embedding_error', (SELECT embedding_error FROM public.knowledge_chunks
        WHERE embedding_error IS NOT NULL ORDER BY embedding_attempted_at DESC NULLS LAST LIMIT 1),
    'last_embedding_error_at', (SELECT embedding_attempted_at FROM public.knowledge_chunks
        WHERE embedding_error IS NOT NULL ORDER BY embedding_attempted_at DESC NULLS LAST LIMIT 1),
    'last_indexed_at', (SELECT max(updated_at) FROM public.knowledge_chunks),
    'queue_depth', (SELECT count(*) FROM public.knowledge_index_queue),
    'queue_by_source', COALESCE((SELECT jsonb_object_agg(source_table, n) FROM (
        SELECT source_table, count(*) AS n FROM public.knowledge_index_queue GROUP BY source_table) q), '{}'::jsonb),
    'queue_failing', (SELECT count(*) FROM public.knowledge_index_queue WHERE attempts > 0),
    'queue_oldest_at', (SELECT min(queued_at) FROM public.knowledge_index_queue),
    'last_queue_error', (SELECT jsonb_build_object('source_table', source_table, 'entity_id', entity_id, 'attempts', attempts, 'error', last_error)
        FROM public.knowledge_index_queue WHERE last_error IS NOT NULL ORDER BY queued_at DESC LIMIT 1)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_index_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_index_stats() TO authenticated, service_role;
