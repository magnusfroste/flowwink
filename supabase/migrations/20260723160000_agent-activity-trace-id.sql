-- Trace (H10 → product): promote trace_id to a first-class column on
-- agent_activity so a harness RUN groups efficiently.
--
-- Today a run's steps share input->>'trace_id' (reason.ts stamps every
-- agent-execute call with the same id, e.g. hb_mrrnt8gf_… for one heartbeat).
-- Grouping on a jsonb path is unindexed and slow at scale — and the Trace
-- read model's whole job is "give me every step of run X". A real column +
-- index makes that a clean GROUP BY. See docs/architecture/agent-harness.md §4.
--
-- Read-only, additive, idempotent. Backfills existing rows from input.

ALTER TABLE public.agent_activity
  ADD COLUMN IF NOT EXISTS trace_id text;

COMMENT ON COLUMN public.agent_activity.trace_id IS
  'Correlation id for one harness run (heartbeat / chat turn / cron / gateway session). All steps of a run share it. Populated by agent-execute from the request body; the Trace read model groups on it.';

-- Backfill from the jsonb where the run id already landed.
UPDATE public.agent_activity
   SET trace_id = input ->> 'trace_id'
 WHERE trace_id IS NULL
   AND input ? 'trace_id';

-- Runs are read newest-first, filtered by trace_id — index both.
CREATE INDEX IF NOT EXISTS idx_agent_activity_trace_id
  ON public.agent_activity (trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_activity_created_desc
  ON public.agent_activity (created_at DESC);
