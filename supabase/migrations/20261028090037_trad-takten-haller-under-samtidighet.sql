-- ─────────────────────────────────────────────────────────────────────────────
-- Trådens takt håller under samtidighet — the task-thread cadence survives a
-- double invocation
-- ─────────────────────────────────────────────────────────────────────────────
-- comment_on_task refuses an agent that already wrote on a task in the last
-- 24 h (optic, 2026-10-27: 48 FlowPilot comments on "Revisionsberättelse",
-- none from a person). The decision is made in agent-execute from the thread
-- it read; two overlapping heartbeat invocations would both read an empty
-- window and both write. This function is the write: it takes a per-task
-- advisory lock and writes only if no comment from the same agent has landed
-- since the one the caller saw — compare-and-set, so the rule holds.
--
-- agent_key is WHO wrote, stamped by the server (FlowPilot → 'flowpilot', a
-- gateway agent → its server-side caller_agent_name, a person driving FlowChat
-- → 'person:<user id>'). author_name stays the display voice a model may
-- choose; it was never an identity. NULL for rows written by people in the UI
-- and for rows before this migration.
--
-- A refusal (ALREADY_NUDGED_TODAY, QUESTION_STILL_OPEN) is journaled as
-- 'refused' — neither a success that counts as objective evidence nor a
-- failure that self-healing counts toward disabling the skill.
-- Idempotent: ADD VALUE / ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

-- First, and never used in this file: a new enum value cannot be used in the
-- transaction that adds it (SQLSTATE 55P04; see 20260710070000).
ALTER TYPE public.agent_activity_status ADD VALUE IF NOT EXISTS 'refused';

ALTER TABLE public.project_task_comments ADD COLUMN IF NOT EXISTS agent_key text;

COMMENT ON COLUMN public.project_task_comments.agent_key IS
  'Which agent wrote the comment, stamped server-side by comment_on_task (flowpilot | the gateway agent''s name | person:<uuid> for FlowChat). The cadence guard keys on it; author_name is only the display voice.';

CREATE INDEX IF NOT EXISTS idx_project_task_comments_task_agent
  ON public.project_task_comments (task_id, agent_key, created_at DESC)
  WHERE agent_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.insert_task_comment_paced(
  p_task_id uuid,
  p_project_id uuid,
  p_body text,
  p_kind text,
  p_author_type text,
  p_author_name text,
  p_author_id uuid,
  p_agent_key text,
  p_seen_last_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
DECLARE
  v_id uuid;
  v_at timestamptz;
BEGIN
  -- One writer per task at a time; released at the end of the transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('project_task_comments:' || p_task_id::text, 0));
  -- p_seen_last_at NULL skips the check (a person at the keyboard is never refused).
  IF p_agent_key IS NOT NULL AND p_seen_last_at IS NOT NULL THEN
    SELECT max(created_at) INTO v_at FROM public.project_task_comments
     WHERE task_id = p_task_id AND agent_key = p_agent_key AND created_at > p_seen_last_at;
    -- The winner's time, so the loser's next_comment_at is a day after IT.
    IF v_at IS NOT NULL THEN RETURN jsonb_build_object('written', false, 'last_at', v_at); END IF;
  END IF;
  INSERT INTO public.project_task_comments (task_id, project_id, body, kind, author_type, author_name, author_id, agent_key)
    VALUES (p_task_id, p_project_id, p_body, p_kind, p_author_type, p_author_name, p_author_id, p_agent_key)
    RETURNING id, created_at INTO v_id, v_at;
  RETURN jsonb_build_object('written', true, 'id', v_id, 'created_at', v_at);
END $fn$;

REVOKE ALL ON FUNCTION public.insert_task_comment_paced(uuid, uuid, text, text, text, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_task_comment_paced(uuid, uuid, text, text, text, text, uuid, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_task_comment_paced(uuid, uuid, text, text, text, text, uuid, text, timestamptz) TO service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- The second write from the same agent since what it saw is refused; another
-- agent and a person at the keyboard (no check) still write. Rolled back.
DO $$
DECLARE v_p uuid; v_t uuid; v_r jsonb;
BEGIN
  BEGIN
    INSERT INTO public.projects (name, is_active, visibility) VALUES ('Proof 090000', true, 'shared') RETURNING id INTO v_p;
    INSERT INTO public.project_tasks (project_id, title, status) VALUES (v_p, 'Proof cadence', 'todo') RETURNING id INTO v_t;
    v_r := public.insert_task_comment_paced(v_t, v_p, 'first', 'question', 'flowpilot', 'FlowPilot', NULL, 'flowpilot', now() - interval '24 hours');
    IF (v_r->>'written')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof: the first comment should be written, got %', v_r; END IF;
    v_r := public.insert_task_comment_paced(v_t, v_p, 'again', 'question', 'flowpilot', 'Pilot', NULL, 'flowpilot', now() - interval '24 hours');
    IF (v_r->>'written')::boolean IS NOT FALSE OR v_r->>'last_at' IS NULL THEN RAISE EXCEPTION 'proof: the racing second comment should be refused with the winner''s time, got %', v_r; END IF;
    v_r := public.insert_task_comment_paced(v_t, v_p, 'other agent', 'step', 'agent', 'OpenClaw', NULL, 'OpenClaw', now() - interval '24 hours');
    IF (v_r->>'written')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof: another agent should still write, got %', v_r; END IF;
    v_r := public.insert_task_comment_paced(v_t, v_p, 'a person', 'comment', 'person', 'Proof', NULL, 'person:proof', NULL);
    v_r := public.insert_task_comment_paced(v_t, v_p, 'a person again', 'comment', 'person', 'Proof', NULL, 'person:proof', NULL);
    IF (v_r->>'written')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'proof: a person at the keyboard is never refused, got %', v_r; END IF;
    RAISE EXCEPTION '__cadence_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__cadence_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
