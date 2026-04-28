
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  provider text,
  model text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  status text NOT NULL DEFAULT 'success',
  error text,
  user_id uuid,
  conversation_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON public.ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_logs_source_idx ON public.ai_usage_logs (source);
CREATE INDEX IF NOT EXISTS ai_usage_logs_model_idx ON public.ai_usage_logs (model);
CREATE INDEX IF NOT EXISTS ai_usage_logs_status_idx ON public.ai_usage_logs (status);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "Admins can read ai_usage_logs"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies → only service_role (which bypasses RLS) can write.
