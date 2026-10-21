-- An activity has a type.
--
-- Odoo's "Schedule activity" asks three things: what kind (call, email,
-- meeting, to-do), when, and who. crm_tasks — the next step a kanban card
-- shows and the Tasks card schedules — had when and who, but every task was
-- the same grey dot. The type gives the card its icon (a phone, an envelope,
-- two people, a checkbox) and lets the Odoo importer keep what each open
-- activity was. Default 'todo' keeps every existing row as it reads today.

ALTER TABLE public.crm_tasks
  ADD COLUMN IF NOT EXISTS activity_type text NOT NULL DEFAULT 'todo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_activity_type_check'
  ) THEN
    ALTER TABLE public.crm_tasks
      ADD CONSTRAINT crm_tasks_activity_type_check
      CHECK (activity_type IN ('todo', 'call', 'email', 'meeting'));
  END IF;
END $$;

COMMENT ON COLUMN public.crm_tasks.activity_type IS
  'What kind of next step this is: todo, call, email or meeting. Drives the icon on the kanban card and the Tasks card; the Odoo importer maps mail.activity types onto it.';
