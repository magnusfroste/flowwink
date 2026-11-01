-- ============================================================
-- Migration: trace events — the decisions a run made, not only its outcomes
-- Date: 2026-10-30
-- Safe to re-run: Yes
-- ============================================================
--
-- The Trace tab grouped agent_activity rows by trace_id: it showed WHAT a run
-- did (each skill call, verbatim input/output) but never WHY. The ReAct loop's
-- decisions — which skills it searched for and what came back, every guard
-- that stopped a call (circuit breaker, cadence, loop detection, a built-in it
-- was not granted, a failure handed back instead of retried), a budget stop,
-- and the model's own closing account — went to console.log and were lost.
--
-- One row per decision, written by the loop in a single batch at the end of a
-- run (_shared/trace/events.ts), read by the trace read model next to the
-- steps. `summary` is one plain sentence for the admin; `detail` is the data
-- behind it. Never prompt text or chunk content — metadata only.

CREATE TABLE IF NOT EXISTS public.agent_trace_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id text NOT NULL,
  seq integer NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_trace_events_trace_idx
  ON public.agent_trace_events (trace_id, seq);
CREATE INDEX IF NOT EXISTS agent_trace_events_created_idx
  ON public.agent_trace_events (created_at DESC);

ALTER TABLE public.agent_trace_events ENABLE ROW LEVEL SECURITY;

-- Same audience as the Trace tab: admins read; the service role (the loop) writes.
DROP POLICY IF EXISTS agent_trace_events_admin_read ON public.agent_trace_events;
CREATE POLICY agent_trace_events_admin_read ON public.agent_trace_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON public.agent_trace_events FROM anon;
GRANT SELECT ON public.agent_trace_events TO authenticated;
GRANT ALL ON public.agent_trace_events TO service_role;

COMMENT ON TABLE public.agent_trace_events IS
  'Decisions a harness run made (skill searches, guard events, budget stops, the model''s closing account), one plain-language row each, keyed by trace_id. Written by _shared/trace/events.ts; read with the run''s steps by the trace read model.';
