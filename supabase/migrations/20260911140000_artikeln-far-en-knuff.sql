-- Artikeln får en knuff.
--
-- Kunskapsbas och sidor låg i samma index och tävlade på lika villkor: bara
-- likhet med frågan vägde. På Resta rankades artikeln "Vilka öppettider har
-- gårdsbutiken…" TVÅA på exakt den frågan, bakom sidan "Köp". En KB-artikel är
-- skriven för att svara; en sida är skriven för att övertyga. Vid lika
-- relevans är artikeln den pålitligare källan.
--
-- En KNUFF, inte en spärr: source_boost är en faktor per källtabell på den
-- sammanvägda poängen. Med rrf_k=60 låter ×1.15 en artikel gå om en sida några
-- placeringar ovanför sig — inte fler. En klart bättre sida vinner fortfarande,
-- och saknas artikel svarar sidorna precis som förut. Default kan skrivas över
-- per anrop ('{}' = ingen knuff).
--
-- Signaturen får en sjunde parameter med default. CREATE OR REPLACE skulle ha
-- skapat en ÖVERLAGRING bredvid den gamla, så den gamla signaturen droppas
-- först — en version, en funktion.

DROP FUNCTION IF EXISTS public.search_knowledge_chunks(text, extensions.vector, int, int, text[], double precision);

CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_text text,
  query_embedding extensions.vector DEFAULT NULL,
  match_count int DEFAULT 8,
  rrf_k int DEFAULT 60,
  sources text[] DEFAULT NULL,
  semantic_weight double precision DEFAULT 0.65,
  source_boost jsonb DEFAULT '{"kb_articles": 1.15}'::jsonb
) RETURNS TABLE (
  chunk_id uuid,
  source_table text,
  entity_id text,
  title text,
  content text,
  metadata jsonb,
  text_score double precision,
  semantic_score double precision,
  hybrid_score double precision
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $$
  WITH q AS (
    SELECT public.build_or_tsquery(query_text) AS tsq
  ),
  textual AS (
    SELECT c.id,
           ts_rank(c.tsv, q.tsq) AS score,
           row_number() OVER (ORDER BY ts_rank(c.tsv, q.tsq) DESC) AS rank
    FROM public.knowledge_chunks c, q
    WHERE c.tsv @@ q.tsq
      AND (sources IS NULL OR c.source_table = ANY(sources))
    ORDER BY score DESC
    LIMIT greatest(match_count * 4, 40)
  ),
  semantic AS (
    SELECT c.id,
           1 - (c.embedding <=> query_embedding) AS score,
           row_number() OVER (ORDER BY c.embedding <=> query_embedding ASC) AS rank
    FROM public.knowledge_chunks c
    WHERE query_embedding IS NOT NULL AND c.embedding IS NOT NULL
      AND (sources IS NULL OR c.source_table = ANY(sources))
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT greatest(match_count * 4, 40)
  ),
  fused AS (
    SELECT COALESCE(t.id, s.id) AS id,
           COALESCE(t.score, 0)::double precision AS text_score,
           COALESCE(s.score, 0)::double precision AS semantic_score,
           -- Weighted reciprocal-rank fusion: semantic term × semantic_weight,
           -- text term × (1 - semantic_weight). With the semantic leg absent
           -- (text-only fallback) this is just the monotonic text term.
           (semantic_weight       * COALESCE(1.0 / (rrf_k + s.rank), 0)
            + (1 - semantic_weight) * COALESCE(1.0 / (rrf_k + t.rank), 0))::double precision AS hybrid_score
    FROM textual t
    FULL OUTER JOIN semantic s ON s.id = t.id
  )
  SELECT c.id, c.source_table, c.entity_id, c.title, c.content, c.metadata,
         f.text_score, f.semantic_score,
         -- Source boost: a KB article is WRITTEN to answer; a page is written to
         -- persuade. At equal relevance the article is the more reliable source,
         -- so it gets a nudge — never a gate. RRF is flat near the top
         -- (1/(60+rank)), so ×1.15 lets an article overtake a page a handful of
         -- ranks above it and no more; a clearly better page still wins, and
         -- with no article in reach the pages answer exactly as before.
         (f.hybrid_score * COALESCE((source_boost ->> c.source_table)::double precision, 1.0))::double precision AS hybrid_score
  FROM fused f
  JOIN public.knowledge_chunks c ON c.id = f.id
  -- Semantic-similarity tiebreak: when weighted hybrid scores are ~equal, the
  -- semantically closer chunk wins (this is exactly the near-tie the finding hit).
  ORDER BY 9 DESC, f.semantic_score DESC, f.text_score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks(text, extensions.vector, int, int, text[], double precision, jsonb) TO anon, authenticated, service_role;

-- Bevisar sig själv: exakt EN funktion med det namnet, och knuffen i defaulten.
DO $$
DECLARE v_n int; v_args text;
BEGIN
  SELECT count(*), max(pg_get_function_arguments(oid)) INTO v_n, v_args
    FROM pg_proc WHERE proname = 'search_knowledge_chunks' AND pronamespace = 'public'::regnamespace;
  IF v_n <> 1 THEN RAISE EXCEPTION 'search_knowledge_chunks har % överlagringar — ska vara exakt en', v_n; END IF;
  IF v_args NOT LIKE '%source_boost jsonb DEFAULT%kb_articles%' THEN
    RAISE EXCEPTION 'search_knowledge_chunks saknar source_boost-defaulten: %', v_args;
  END IF;
END $$;
