-- Add a lifecycle `status` column to projects so manage_project's create
-- contract (status: active|completed|on_hold) is real. The skill uses the
-- generic-CRUD handler (db:projects) and inserts `status` directly; without
-- this column the insert failed with "Could not find the 'status' column of
-- 'projects' in the schema cache". Reported by OpenClaw's company simulation
-- (finding aa6ed760). Idempotent.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_status_check
      CHECK (status IN ('active', 'completed', 'on_hold'));
  END IF;
END $$;
