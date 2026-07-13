ALTER TABLE public.flowtable_tables
  ADD COLUMN IF NOT EXISTS view_config JSONB NOT NULL DEFAULT '{}'::jsonb;