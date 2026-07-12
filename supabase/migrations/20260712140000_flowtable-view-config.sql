-- Flowtable per-table view config (filters / sort / group / kanban field).
-- Additive + idempotent; forward-dated so the managed ledger applies it.
ALTER TABLE public.flowtable_tables
  ADD COLUMN IF NOT EXISTS view_config JSONB NOT NULL DEFAULT '{}'::jsonb;
