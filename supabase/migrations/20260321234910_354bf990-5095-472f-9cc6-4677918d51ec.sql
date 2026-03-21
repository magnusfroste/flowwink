
-- Enable pg_trgm for trigram-based keyword matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add GIN trigram index on agent_memory key and value (cast to text)
CREATE INDEX IF NOT EXISTS idx_agent_memory_key_trgm 
  ON public.agent_memory USING gin (key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_agent_memory_value_trgm 
  ON public.agent_memory USING gin ((value::text) gin_trgm_ops);

-- Hybrid search function: combines vector similarity (70%) with keyword similarity (30%)
CREATE OR REPLACE FUNCTION public.search_memories_hybrid(
  query_text text,
  query_embedding extensions.vector DEFAULT NULL,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10,
  filter_category agent_memory_category DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  key text,
  value jsonb,
  category agent_memory_category,
  similarity double precision,
  search_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      am.id,
      am.key,
      am.value,
      am.category,
      CASE 
        WHEN query_embedding IS NOT NULL AND am.embedding IS NOT NULL 
        THEN 1 - (am.embedding <=> query_embedding)
        ELSE 0
      END AS vec_score
    FROM public.agent_memory am
    WHERE
      am.key NOT IN ('soul', 'identity')
      AND (filter_category IS NULL OR am.category = filter_category)
      AND (
        (query_embedding IS NOT NULL AND am.embedding IS NOT NULL 
         AND 1 - (am.embedding <=> query_embedding) > match_threshold * 0.5)
        OR
        (query_text IS NOT NULL AND query_text != '' AND (
          am.key ILIKE '%' || query_text || '%'
          OR am.value::text ILIKE '%' || query_text || '%'
          OR similarity(am.key, query_text) > 0.1
          OR similarity(am.value::text, query_text) > 0.05
        ))
      )
  ),
  keyword_results AS (
    SELECT
      vr.id,
      vr.key,
      vr.value,
      vr.category,
      vr.vec_score,
      GREATEST(
        COALESCE(similarity(vr.key, query_text), 0),
        COALESCE(similarity(vr.value::text, query_text), 0) * 0.8,
        CASE WHEN vr.key ILIKE '%' || query_text || '%' THEN 0.5 ELSE 0 END,
        CASE WHEN vr.value::text ILIKE '%' || query_text || '%' THEN 0.3 ELSE 0 END
      ) AS kw_score
    FROM vector_results vr
  )
  SELECT
    kr.id,
    kr.key,
    kr.value,
    kr.category,
    (0.7 * kr.vec_score + 0.3 * kr.kw_score)::double precision AS similarity,
    CASE
      WHEN kr.vec_score > 0.3 AND kr.kw_score > 0.1 THEN 'hybrid'
      WHEN kr.vec_score > 0.3 THEN 'semantic'
      ELSE 'keyword'
    END AS search_type
  FROM keyword_results kr
  WHERE (0.7 * kr.vec_score + 0.3 * kr.kw_score) > match_threshold
  ORDER BY (0.7 * kr.vec_score + 0.3 * kr.kw_score) DESC
  LIMIT match_count;
END;
$$;
