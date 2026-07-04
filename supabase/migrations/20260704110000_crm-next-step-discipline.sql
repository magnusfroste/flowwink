-- CRM next-step discipline (Odoo parity cluster, docs/parity/references/crm-odoo.md)
-- 1. Done-with-feedback: crm_tasks.completion_note — the note captured when a task
--    is marked done; also posted to lead_activities (type 'task_completed') so
--    completed work is permanent timeline history (Odoo action_feedback pattern).
-- 2. Lost discipline: lost_reason + lost_note on leads and deals — captured when a
--    record moves to a lost stage/status, cleared on re-open (Odoo crm.lost.reason).
-- Idempotent: safe to run multiple times.

ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS completion_note text;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_note text;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_note text;

-- Next-activity chips on the kanbans load every open task in one query ordered by
-- due date; this partial index keeps that lookup cheap as tasks accumulate.
CREATE INDEX IF NOT EXISTS idx_crm_tasks_open_due
  ON public.crm_tasks (due_date)
  WHERE completed_at IS NULL;
