-- Indexet rapporterar sina fel — och räknar sig självt.
--
-- Två saker labs1100 visade 2026-09-03: "591 chunk(s) without an embedding —
-- check the AI provider key" när nyckeln var frisk, och "1000 chunk(s)" som
-- var PostgREST:s tysta 1000-radskap, inte antalet. Svepet valde samma
-- oordnade 80 rader varje gång, en chunk som alltid felar bröt svepet efter
-- tre fel, och ingen såg felet. Nu bär varje chunk sina försök och sitt
-- senaste fel, och statistiken räknas här, hel.

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embedding_error text,
  ADD COLUMN IF NOT EXISTS embedding_attempted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embed_pending
  ON public.knowledge_chunks (embedding_attempts, updated_at)
  WHERE embedding IS NULL;

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
    'queue_depth', (SELECT count(*) FROM public.knowledge_index_queue)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.knowledge_index_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_index_stats() TO authenticated, service_role;

-- Ett omtag ska få bli av: nollställ försöken på allt som saknar vektor, så
-- att chunkar som gav upp under den gamla regimen provas igen med felet synligt.
UPDATE public.knowledge_chunks SET embedding_attempts = 0 WHERE embedding IS NULL AND embedding_attempts <> 0;
