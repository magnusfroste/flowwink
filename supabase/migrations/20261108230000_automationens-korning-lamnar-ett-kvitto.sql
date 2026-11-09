-- ============================================================================
-- A background run leaves a marker until it answers.
--
-- event-dispatcher hands event automations to agent-execute with async: true
-- and gets 202 at once. Since magnusfroste/flowwink#957 the run's own failure
-- is written back to the automation's last_error — but only by code that is
-- still alive when the run ends. When the edge isolate is shut down first
-- (2026-10-29: the reply skill died mid-run, no draft, no reply, no error
-- anywhere) nothing writes anything, and the automation reads as healthy.
--
-- So the dispatcher writes a row here BEFORE the handoff. The run deletes it
-- when it answers — the forwarded run itself, and the handoff that awaited it,
-- whichever is still alive. A row that outlives every edge wall clock (150 s)
-- is a run nobody heard back from: the dispatcher's next minute sweeps it
-- into the automation's last_error.
--
-- Service role only: no browser reads or writes it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_pending_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.agent_automations(id) ON DELETE CASCADE,
  event_id uuid,
  skill_name text,
  started_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_pending_runs_started_at_idx
  ON public.automation_pending_runs (started_at);

ALTER TABLE public.automation_pending_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_pending_runs FROM anon, authenticated;

COMMENT ON TABLE public.automation_pending_runs IS
  'One row per background automation run handed off by event-dispatcher; deleted when the run answers. A row older than the edge wall clock is a run that never answered — swept into agent_automations.last_error.';

-- ── LACKMUS ────────────────────────────────────────────────────────────────
--   BEGIN;
--   INSERT INTO automation_pending_runs (automation_id, started_at)
--     SELECT id, now() - interval '10 minutes' FROM agent_automations LIMIT 1;
--   -- Within a minute event-dispatcher deletes the row and the automation's
--   -- last_error reads "background run never answered …".
--   ROLLBACK;
