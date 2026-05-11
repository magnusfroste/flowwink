-- Bootstrap circuit breaker: track per-module bootstrap runs with status, hash, and failure streak.
-- Goal: prevent infinite repair loops, surface degraded modules to admins, and detect drift via hash mismatch.

CREATE TABLE IF NOT EXISTS public.bootstrap_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'degraded')),
  seeded_skills INTEGER NOT NULL DEFAULT 0,
  seeded_automations INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  config_hash TEXT,
  duration_ms INTEGER,
  triggered_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_runs_module_created
  ON public.bootstrap_runs (module_id, created_at DESC);

ALTER TABLE public.bootstrap_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view bootstrap runs" ON public.bootstrap_runs;
CREATE POLICY "Admins can view bootstrap runs"
  ON public.bootstrap_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert bootstrap runs" ON public.bootstrap_runs;
CREATE POLICY "Admins can insert bootstrap runs"
  ON public.bootstrap_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Helper: fetch latest run + consecutive failure streak for a module
CREATE OR REPLACE FUNCTION public.get_bootstrap_health(_module_id TEXT)
RETURNS TABLE (
  last_status TEXT,
  last_run_at TIMESTAMPTZ,
  last_hash TEXT,
  failure_streak INTEGER,
  is_degraded BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _streak INTEGER := 0;
  _last_status TEXT;
  _last_run_at TIMESTAMPTZ;
  _last_hash TEXT;
BEGIN
  SELECT status, created_at, config_hash
    INTO _last_status, _last_run_at, _last_hash
  FROM public.bootstrap_runs
  WHERE module_id = _module_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF _last_status IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, 0, FALSE;
    RETURN;
  END IF;

  -- Count consecutive failures from most recent backwards
  SELECT COUNT(*)::INTEGER INTO _streak
  FROM (
    SELECT status FROM public.bootstrap_runs
    WHERE module_id = _module_id
    ORDER BY created_at DESC
    LIMIT 10
  ) recent
  WHERE status = 'failed';

  RETURN QUERY SELECT
    _last_status,
    _last_run_at,
    _last_hash,
    _streak,
    (_streak >= 3);
END;
$$;