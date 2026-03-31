
CREATE TABLE IF NOT EXISTS public.autonomy_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  layers integer[] NOT NULL DEFAULT '{}',
  summary jsonb NOT NULL DEFAULT '{}',
  results jsonb NOT NULL DEFAULT '[]',
  duration_ms integer NOT NULL DEFAULT 0,
  l9_accuracy numeric(5,2) DEFAULT NULL,
  triggered_by text NOT NULL DEFAULT 'manual'
);

ALTER TABLE public.autonomy_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on autonomy_test_runs"
  ON public.autonomy_test_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read test runs"
  ON public.autonomy_test_runs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_autonomy_test_runs_created_at ON public.autonomy_test_runs (created_at DESC);
