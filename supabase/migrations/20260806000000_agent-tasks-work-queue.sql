-- The work queue — durable tasks instead of a sweep per feature.
-- Design: docs/architecture/work-queue.md
--
-- Ships EMPTY. Nothing enqueues yet, no cron job or automation is removed, and
-- the dispatcher's new lane drains a table that stays at zero rows until a
-- family is migrated deliberately. Fully reversible: drop the four functions
-- and the table.
--
-- Why this exists, from evidence: pg_cron's unit of work is "a command fired at
-- a time" and its notion of success is "the command dispatched" — not "the work
-- happened". Every scheduling incident in the last month lived in that gap. A
-- task row closes it: it has a due time, a lease, an attempt count, and an
-- outcome sentence, so a run that dies is distinguishable from a run that had
-- nothing to do.

CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What to do: the existing skill layer, unchanged. A task names a SKILL, never
  -- arbitrary code, so everything stays inside the trust/audit rails we have.
  skill_name      text NOT NULL,
  skill_arguments jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- What it is about. Nullable — some work is not entity-scoped.
  subject_type    text,
  subject_id      uuid,

  -- When, and in what order.
  due_at          timestamptz NOT NULL DEFAULT now(),
  priority        int NOT NULL DEFAULT 0,

  -- Why. NOT NULL on purpose: an agent that cannot say why it will be back on
  -- Thursday does not have a reason, it has a default.
  reason          text NOT NULL,

  -- Durability.
  leased_until    timestamptz,
  attempts        int NOT NULL DEFAULT 0,
  max_attempts    int NOT NULL DEFAULT 3,

  status          text NOT NULL DEFAULT 'pending',
  outcome         text,
  last_error      text,

  -- Provenance.
  created_by      text NOT NULL DEFAULT 'platform',
  session_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  CONSTRAINT agent_tasks_status_check
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'cancelled')),
  CONSTRAINT agent_tasks_reason_not_blank
    CHECK (length(btrim(reason)) > 0),
  CONSTRAINT agent_tasks_max_attempts_positive
    CHECK (max_attempts > 0)
);

COMMENT ON TABLE public.agent_tasks IS
  'Durable work items: a skill to run, a due time, a lease and an attempt count. Drained by automation-dispatcher. See docs/architecture/work-queue.md.';
COMMENT ON COLUMN public.agent_tasks.reason IS
  'Human-readable justification, shown in the admin UI. Required — a scheduled action nobody can explain is a default, not a decision.';
COMMENT ON COLUMN public.agent_tasks.leased_until IS
  'Set when claimed. A row still running past this is presumed dead and reaped back to pending.';

-- The only index the dispatcher needs.
CREATE INDEX IF NOT EXISTS agent_tasks_due_idx
  ON public.agent_tasks (due_at, priority DESC)
  WHERE status = 'pending';

-- Reaper lookup.
CREATE INDEX IF NOT EXISTS agent_tasks_lease_idx
  ON public.agent_tasks (leased_until)
  WHERE status = 'running';

-- Idempotency, and the reason a double-enqueue raises instead of double-sending.
-- Scoped to open work only: the same subject may be re-enqueued after the
-- previous task finished (next month's invoice, next booking's reminder).
CREATE UNIQUE INDEX IF NOT EXISTS agent_tasks_open_subject_idx
  ON public.agent_tasks (subject_type, subject_id, skill_name)
  WHERE status IN ('pending', 'running') AND subject_id IS NOT NULL;

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

-- Admin-visible; the dispatcher uses the service role, which bypasses RLS.
-- No anon policy: this table describes what the platform is about to do.
DROP POLICY IF EXISTS "Admins can view tasks" ON public.agent_tasks;
CREATE POLICY "Admins can view tasks" ON public.agent_tasks
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can manage tasks" ON public.agent_tasks;
CREATE POLICY "Admins can manage tasks" ON public.agent_tasks
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── claim ──────────────────────────────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED is the whole concurrency story: two dispatchers running
-- at the same instant take DISJOINT rows. No distributed lock, no "select and
-- hope" — which is what today's automation lane does, and why a slow run plus
-- the next minute's tick can double-execute.
CREATE OR REPLACE FUNCTION public.claim_due_tasks(
  p_limit int DEFAULT 10,
  p_lease_seconds int DEFAULT 300
)
RETURNS SETOF public.agent_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can claim tasks';
  END IF;

  RETURN QUERY
  UPDATE public.agent_tasks t
     SET status       = 'running',
         leased_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
         attempts     = t.attempts + 1
   WHERE t.id IN (
     SELECT c.id
       FROM public.agent_tasks c
      WHERE c.status = 'pending'
        AND c.due_at <= now()
        AND c.attempts < c.max_attempts
      ORDER BY c.priority DESC, c.due_at ASC
      LIMIT GREATEST(p_limit, 0)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING t.*;
END;
$function$;

-- ── complete ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_task(
  p_task_id uuid,
  p_outcome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row public.agent_tasks%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can complete tasks';
  END IF;

  UPDATE public.agent_tasks
     SET status       = 'done',
         outcome      = COALESCE(p_outcome, 'Completed.'),
         leased_until = NULL,
         completed_at = now()
   WHERE id = p_task_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Task %s not found', p_task_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'task_id', _row.id, 'status', _row.status);
END;
$function$;

-- ── fail ───────────────────────────────────────────────────────────────────
-- A failure below max_attempts returns the row to pending for the next tick;
-- at the cap it terminates with a sentence a human can read. `attempts` was
-- already incremented at claim time, so a run that dies without reporting back
-- still burns an attempt and cannot retry forever.
CREATE OR REPLACE FUNCTION public.fail_task(
  p_task_id uuid,
  p_error text,
  p_retry_in_seconds int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row public.agent_tasks%ROWTYPE; _exhausted boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can fail tasks';
  END IF;

  SELECT * INTO _row FROM public.agent_tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Task %s not found', p_task_id));
  END IF;

  _exhausted := _row.attempts >= _row.max_attempts;

  UPDATE public.agent_tasks
     SET status       = CASE WHEN _exhausted THEN 'failed' ELSE 'pending' END,
         last_error   = left(COALESCE(p_error, 'Unknown error'), 2000),
         outcome      = CASE WHEN _exhausted
                             THEN format('Gave up after %s attempt(s): %s',
                                         _row.attempts, left(COALESCE(p_error, 'unknown error'), 300))
                             ELSE NULL END,
         leased_until = NULL,
         due_at       = CASE WHEN _exhausted THEN due_at
                             ELSE now() + make_interval(secs => GREATEST(p_retry_in_seconds, 1)) END,
         completed_at = CASE WHEN _exhausted THEN now() ELSE NULL END
   WHERE id = p_task_id
  RETURNING * INTO _row;

  RETURN jsonb_build_object(
    'ok', true, 'task_id', _row.id, 'status', _row.status,
    'attempts', _row.attempts, 'max_attempts', _row.max_attempts
  );
END;
$function$;

-- ── reaper ─────────────────────────────────────────────────────────────────
-- A run that dies mid-flight leaves its row 'running' with an expired lease.
-- Today the equivalent is silence; here it becomes either a retry or an
-- explicit "the run never reported back".
CREATE OR REPLACE FUNCTION public.reap_stale_task_leases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _requeued int; _failed int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can reap task leases';
  END IF;

  WITH stale AS (
    SELECT id, attempts, max_attempts
      FROM public.agent_tasks
     WHERE status = 'running'
       AND leased_until IS NOT NULL
       AND leased_until < now()
     FOR UPDATE SKIP LOCKED
  ), requeued AS (
    UPDATE public.agent_tasks t
       SET status = 'pending', leased_until = NULL,
           last_error = 'Lease expired — the run never reported back.'
      FROM stale s
     WHERE t.id = s.id AND s.attempts < s.max_attempts
    RETURNING t.id
  ), gave_up AS (
    UPDATE public.agent_tasks t
       SET status = 'failed', leased_until = NULL, completed_at = now(),
           last_error = 'Lease expired — the run never reported back.',
           outcome = format('Gave up after %s attempt(s) — the run never reported back.', t.attempts)
      FROM stale s
     WHERE t.id = s.id AND s.attempts >= s.max_attempts
    RETURNING t.id
  )
  SELECT (SELECT count(*) FROM requeued), (SELECT count(*) FROM gave_up)
    INTO _requeued, _failed;

  RETURN jsonb_build_object('ok', true, 'requeued', _requeued, 'failed', _failed);
END;
$function$;

-- ── enqueue ────────────────────────────────────────────────────────────────
-- The one writer. Idempotent by design: an open task for the same
-- (subject, skill) is returned rather than duplicated, so an enqueuer that runs
-- twice — a retried trigger, a backfill over rows a sweep already covered —
-- cannot produce two invoices or two reminders.
CREATE OR REPLACE FUNCTION public.enqueue_task(
  p_skill_name text,
  p_reason text,
  p_skill_arguments jsonb DEFAULT '{}'::jsonb,
  p_subject_type text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT now(),
  p_priority int DEFAULT 0,
  p_max_attempts int DEFAULT 3,
  p_created_by text DEFAULT 'platform'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _id uuid; _existing uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can enqueue tasks';
  END IF;

  IF p_skill_name IS NULL OR length(btrim(p_skill_name)) = 0 THEN
    RAISE EXCEPTION 'skill_name is required';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason is required — a scheduled action nobody can explain is a default, not a decision';
  END IF;

  IF p_subject_id IS NOT NULL THEN
    SELECT id INTO _existing
      FROM public.agent_tasks
     WHERE subject_type IS NOT DISTINCT FROM p_subject_type
       AND subject_id = p_subject_id
       AND skill_name = p_skill_name
       AND status IN ('pending', 'running')
     LIMIT 1;
    IF _existing IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'task_id', _existing, 'created', false,
                                'note', 'An open task already covers this subject and skill.');
    END IF;
  END IF;

  INSERT INTO public.agent_tasks (
    skill_name, skill_arguments, subject_type, subject_id,
    due_at, priority, reason, max_attempts, created_by
  ) VALUES (
    p_skill_name, COALESCE(p_skill_arguments, '{}'::jsonb), p_subject_type, p_subject_id,
    COALESCE(p_due_at, now()), COALESCE(p_priority, 0), p_reason,
    COALESCE(p_max_attempts, 3), COALESCE(p_created_by, 'platform')
  )
  RETURNING id INTO _id;

  RETURN jsonb_build_object('ok', true, 'task_id', _id, 'created', true);
END;
$function$;

-- Agent-callable functions run under the service role via the MCP gateway, where
-- auth.uid() is NULL — hence the service_role escape in every guard above.
REVOKE EXECUTE ON FUNCTION public.claim_due_tasks(int, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_task(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fail_task(uuid, text, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reap_stale_task_leases() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_task(text, text, jsonb, text, uuid, timestamptz, int, int, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_due_tasks(int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_task(uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reap_stale_task_leases() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_task(text, text, jsonb, text, uuid, timestamptz, int, int, text) TO authenticated, service_role;
