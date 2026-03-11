
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding column to agent_memory
ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index for similarity search
CREATE INDEX IF NOT EXISTS agent_memory_embedding_idx ON public.agent_memory
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- Create semantic search function
CREATE OR REPLACE FUNCTION public.search_memories_semantic(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_category agent_memory_category DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  key text,
  value jsonb,
  category agent_memory_category,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.key,
    am.value,
    am.category,
    1 - (am.embedding <=> query_embedding) AS similarity
  FROM public.agent_memory am
  WHERE
    am.embedding IS NOT NULL
    AND am.key NOT IN ('soul', 'identity')
    AND (filter_category IS NULL OR am.category = filter_category)
    AND 1 - (am.embedding <=> query_embedding) > match_threshold
  ORDER BY am.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function to summarize old conversation messages (for context pruning)
CREATE OR REPLACE FUNCTION public.get_conversation_token_estimate(p_conversation_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(SUM(LENGTH(content) / 4), 0)::integer
  FROM public.chat_messages
  WHERE conversation_id = p_conversation_id;
$$;
