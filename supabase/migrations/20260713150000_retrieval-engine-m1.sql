-- Retrieval Engine M1 (docs/architecture/retrieval-engine.md)
-- Chunk index for knowledge-shaped content: table + index queue + source
-- triggers + SECURITY INVOKER hybrid search RPC + RLS + cron registration.
--
-- Confidentiality rule: retrieval runs with the CALLER's eyes. The RPC is
-- SECURITY INVOKER and knowledge_chunks has RLS keyed on visibility class —
-- anon sees only 'public'; internal staff roles also see 'internal'.
-- Customer/company/role classes arrive with identity-ladder rungs 2-4.

-- ── 1. Chunk store ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  text NOT NULL,
  entity_id     text NOT NULL,          -- uuid-as-text; wiki_pages keys by slug
  chunk_index   int  NOT NULL,
  title         text NOT NULL,          -- entity title + heading trail (citations)
  content       text NOT NULL,
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  embedding     extensions.vector,      -- null until M2 embeds; text-only until then
  embedding_model text,
  visibility    text NOT NULL DEFAULT 'internal'
                CHECK (visibility IN ('public','internal')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- slug/category/url hints for citations
  content_hash  text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, entity_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv
  ON public.knowledge_chunks USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_entity
  ON public.knowledge_chunks (source_table, entity_id);

-- ── 2. Index queue (written by triggers, drained by knowledge-indexer) ───────
CREATE TABLE IF NOT EXISTS public.knowledge_index_queue (
  source_table  text NOT NULL,
  entity_id     text NOT NULL,
  op            text NOT NULL DEFAULT 'upsert' CHECK (op IN ('upsert','delete')),
  queued_at     timestamptz NOT NULL DEFAULT now(),
  attempts      int NOT NULL DEFAULT 0,
  last_error    text,
  PRIMARY KEY (source_table, entity_id)
);

CREATE OR REPLACE FUNCTION public.queue_knowledge_reindex()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_entity text;
  v_op text;
BEGIN
  -- NB: wiki_pages keys by slug and has no id column. These must be separate
  -- IF-branch statements — a single CASE expression referencing both NEW.id
  -- and NEW.slug fails at plan time on the table that lacks the other field.
  IF TG_OP = 'DELETE' THEN
    v_op := 'delete';
    IF TG_TABLE_NAME = 'wiki_pages' THEN
      v_entity := OLD.slug::text;
    ELSE
      v_entity := OLD.id::text;
    END IF;
  ELSE
    v_op := 'upsert';
    IF TG_TABLE_NAME = 'wiki_pages' THEN
      v_entity := NEW.slug::text;
    ELSE
      v_entity := NEW.id::text;
    END IF;
  END IF;

  INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
  VALUES (TG_TABLE_NAME, v_entity, v_op)
  ON CONFLICT (source_table, entity_id)
  DO UPDATE SET op = EXCLUDED.op, queued_at = now(), attempts = 0, last_error = NULL;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pages','kb_articles','wiki_pages','docs_pages','documents'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_knowledge_reindex ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_knowledge_reindex
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.queue_knowledge_reindex()', t);
  END LOOP;
END $$;

-- ── 3. RLS: the caller's-eyes rule, structurally ─────────────────────────────
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public chunks" ON public.knowledge_chunks;
CREATE POLICY "Anyone can read public chunks"
  ON public.knowledge_chunks FOR SELECT
  USING (visibility = 'public');

DROP POLICY IF EXISTS "Internal staff can read internal chunks" ON public.knowledge_chunks;
-- Staff = every app_role EXCEPT 'customer' (NB: 'manager' is NOT in the enum
-- — it exists only as UI shorthand; using it here fails at migration time).
CREATE POLICY "Internal staff can read internal chunks"
  ON public.knowledge_chunks FOR SELECT
  USING (
    visibility = 'internal'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','employee','writer','approver','sales','hr',
                        'accounting','support','warehouse')
    )
  );
-- No INSERT/UPDATE/DELETE policies: only the service-role indexer writes.

-- Queue is service-role-only (no policies at all).
ALTER TABLE public.knowledge_index_queue ENABLE ROW LEVEL SECURITY;

-- ── 4. Hybrid search RPC — SECURITY INVOKER so RLS decides what exists ───────
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks(
  query_text text,
  query_embedding extensions.vector DEFAULT NULL,
  match_count int DEFAULT 8,
  rrf_k int DEFAULT 60,
  sources text[] DEFAULT NULL
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
           (COALESCE(1.0 / (rrf_k + t.rank), 0) + COALESCE(1.0 / (rrf_k + s.rank), 0))::double precision AS hybrid_score
    FROM textual t
    FULL OUTER JOIN semantic s ON s.id = t.id
  )
  SELECT c.id, c.source_table, c.entity_id, c.title, c.content, c.metadata,
         f.text_score, f.semantic_score, f.hybrid_score
  FROM fused f
  JOIN public.knowledge_chunks c ON c.id = f.id
  ORDER BY f.hybrid_score DESC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks(text, extensions.vector, int, int, text[])
  TO anon, authenticated, service_role;

-- ── 5. Cron registration (idempotent; called by knowledge-indexer on boot) ───
CREATE OR REPLACE FUNCTION public.register_knowledge_indexer_cron(
  p_supabase_url text,
  p_anon_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $$
DECLARE
  job_exists boolean;
  auth_header text;
BEGIN
  -- Service-role or admin only: this writes cron state.
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can register cron jobs';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN jsonb_build_object('knowledge_indexer', 'pg_cron_missing');
  END IF;

  auth_header := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_anon_key
  )::text;

  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'knowledge-indexer') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'knowledge-indexer',
      '*/5 * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source":"cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/knowledge-indexer',
        auth_header
      )
    );
    RETURN jsonb_build_object('knowledge_indexer', 'registered');
  END IF;
  RETURN jsonb_build_object('knowledge_indexer', 'already_exists');
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_knowledge_indexer_cron(text, text)
  TO authenticated, service_role;

-- ── 6. Seed the queue with all existing content (first sweep indexes it) ─────
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'pages', id::text, 'upsert' FROM public.pages
ON CONFLICT (source_table, entity_id) DO NOTHING;
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'kb_articles', id::text, 'upsert' FROM public.kb_articles
ON CONFLICT (source_table, entity_id) DO NOTHING;
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'wiki_pages', slug, 'upsert' FROM public.wiki_pages
ON CONFLICT (source_table, entity_id) DO NOTHING;
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'docs_pages', id::text, 'upsert' FROM public.docs_pages
ON CONFLICT (source_table, entity_id) DO NOTHING;
INSERT INTO public.knowledge_index_queue (source_table, entity_id, op)
SELECT 'documents', id::text, 'upsert' FROM public.documents WHERE content_md IS NOT NULL
ON CONFLICT (source_table, entity_id) DO NOTHING;
