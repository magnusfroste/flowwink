
-- Test run history for the Platform Tests page
CREATE TABLE IF NOT EXISTS public.platform_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id TEXT NOT NULL,
  suite_title TEXT,
  scope TEXT NOT NULL,
  category TEXT,
  module TEXT,
  status TEXT NOT NULL CHECK (status IN ('pass','fail','error','skip')),
  total INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  results JSONB,
  error TEXT,
  triggered_by TEXT NOT NULL DEFAULT 'ui' CHECK (triggered_by IN ('ui','edge','ci','cron','manual')),
  run_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_test_runs_suite_started
  ON public.platform_test_runs (suite_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_test_runs_started
  ON public.platform_test_runs (started_at DESC);

ALTER TABLE public.platform_test_runs ENABLE ROW LEVEL SECURITY;

-- Admins can read all history
DROP POLICY IF EXISTS "Admins read platform test runs" ON public.platform_test_runs;
CREATE POLICY "Admins read platform test runs"
  ON public.platform_test_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Service role inserts (edge functions). No client inserts.
DROP POLICY IF EXISTS "Service role inserts platform test runs" ON public.platform_test_runs;
CREATE POLICY "Service role inserts platform test runs"
  ON public.platform_test_runs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Convenience view: latest run per suite
CREATE OR REPLACE VIEW public.platform_test_runs_latest AS
SELECT DISTINCT ON (suite_id)
  suite_id, suite_title, scope, category, module,
  status, total, passed, failed, skipped, duration_ms,
  error, triggered_by, started_at
FROM public.platform_test_runs
ORDER BY suite_id, started_at DESC;

GRANT SELECT ON public.platform_test_runs_latest TO authenticated;
