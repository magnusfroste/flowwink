-- Resumption Phase 1 (agent-resumption.md §2.1): the durable run record.
--
-- A harness RUN already has an identity (agent_activity.trace_id, promoted to a
-- column in the Trace work) and ordered steps. This table makes the run's
-- LIFECYCLE durable: running → completed / failed / paused, so a stopped run
-- can be found and (Phase 2) resumed from its cursor. Derived-then-durable —
-- old runs reconstruct from agent_activity on read; new runs are checkpointed
-- by the loop. Read-only for the operator; written by the reason loop.
--
-- Idempotent, forward-dated, RLS on.

CREATE TABLE IF NOT EXISTS public.agent_runs (
  trace_id text PRIMARY KEY,
  agent text NOT NULL DEFAULT 'flowpilot',
  objective_id uuid,                       -- nullable: ad-hoc runs advance no plan
  status text NOT NULL DEFAULT 'running',  -- running | paused | completed | failed
  cursor integer NOT NULL DEFAULT 0,       -- index of the next unstarted plan step
  plan jsonb,                              -- snapshot of plan.steps at run start
  paused_reason text,                      -- window_ended | rate_limited | awaiting_approval | error
  resume_after timestamptz,                -- don't resume before this (backoff / approval-poll)
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_runs IS
  'Durable lifecycle of one harness run (keyed by the same trace_id as agent_activity). running/paused/completed/failed + cursor. The Trace read model surfaces it; the resumer (Phase 2) continues paused runs from the cursor. See docs/architecture/agent-resumption.md.';

CREATE INDEX IF NOT EXISTS idx_agent_runs_status_resume
  ON public.agent_runs (status, resume_after)
  WHERE status = 'paused';

CREATE INDEX IF NOT EXISTS idx_agent_runs_started
  ON public.agent_runs (started_at DESC);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read agent runs" ON public.agent_runs;
CREATE POLICY "Admins read agent runs"
  ON public.agent_runs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages agent runs" ON public.agent_runs;
CREATE POLICY "Service role manages agent runs"
  ON public.agent_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
