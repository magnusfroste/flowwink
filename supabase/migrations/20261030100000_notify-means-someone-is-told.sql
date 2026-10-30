-- ============================================================
-- Migration: 'notify' means someone is told
-- Date: 2026-10-30
-- Safe to re-run: Yes
-- ============================================================
--
-- A skill on trust level 'notify' ran exactly like 'auto': agent-execute's own
-- comment said the activity row was the notification, and nobody looks at a
-- feed of every run. Under posture 'proving' every 'approve' skill resolves to
-- 'notify' — so on Nordbrygg, FlowPilot's e-mail replies (reply_to_email is
-- seeded 'approve') left with nothing anywhere saying a human should look.
--
-- From here a notify run is marked (agent_activity.log_type = 'notify') and
-- stays in "acted on its own" — the cockpit card and the notification bell —
-- until an admin acknowledges it (acknowledged_at). Admins can already UPDATE
-- agent_activity ("Admins can update agent activity"), so no RPC is needed.

ALTER TABLE public.agent_activity
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

COMMENT ON COLUMN public.agent_activity.acknowledged_at IS
  'When an admin acknowledged a notify-level run (log_type = notify). NULL on a notify run = still in the "acted on its own" queue.';

CREATE INDEX IF NOT EXISTS agent_activity_notify_unacked_idx
  ON public.agent_activity (created_at DESC)
  WHERE log_type = 'notify' AND acknowledged_at IS NULL;
