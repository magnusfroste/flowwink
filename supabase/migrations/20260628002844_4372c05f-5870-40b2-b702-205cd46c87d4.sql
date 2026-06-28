-- Migration auditing: log every migration run with metadata + checksum

CREATE TABLE IF NOT EXISTS public.migration_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name text NOT NULL,
  sql_checksum text NOT NULL,
  status text NOT NULL CHECK (status IN ('started','success','failed')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_label text,
  source text NOT NULL DEFAULT 'manual',
  error_message text,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_audit_log_started_at
  ON public.migration_audit_log (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_audit_log_name
  ON public.migration_audit_log (migration_name);
CREATE INDEX IF NOT EXISTS idx_migration_audit_log_checksum
  ON public.migration_audit_log (sql_checksum);

GRANT SELECT ON public.migration_audit_log TO authenticated;
GRANT ALL ON public.migration_audit_log TO service_role;

ALTER TABLE public.migration_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read; nobody writes from client (service_role/SECURITY DEFINER only)
DROP POLICY IF EXISTS "Admins can read migration audit log"
  ON public.migration_audit_log;
CREATE POLICY "Admins can read migration audit log"
  ON public.migration_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Helpers --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_migration_run(
  p_migration_name text,
  p_sql_text       text,
  p_source         text DEFAULT 'manual',
  p_triggered_by_label text DEFAULT NULL,
  p_metadata       jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.migration_audit_log(
    migration_name, sql_checksum, status, triggered_by,
    triggered_by_label, source, metadata
  )
  VALUES (
    p_migration_name,
    encode(digest(coalesce(p_sql_text, ''), 'sha256'), 'hex'),
    'started',
    auth.uid(),
    p_triggered_by_label,
    coalesce(p_source, 'manual'),
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_migration_run(
  p_run_id        uuid,
  p_status        text,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('success','failed') THEN
    RAISE EXCEPTION 'p_status must be success or failed';
  END IF;
  UPDATE public.migration_audit_log
     SET status         = p_status,
         error_message  = p_error_message,
         completed_at   = now(),
         duration_ms    = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::int * 1000)
   WHERE id = p_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_migration_run(text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_migration_run(uuid, text, text) TO service_role;

-- Auto-capture supabase_migrations.schema_migrations inserts ----------
-- supabase tracks applied migrations there; mirror each new row into our audit log.

CREATE OR REPLACE FUNCTION public.tg_audit_schema_migration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.migration_audit_log(
    migration_name, sql_checksum, status,
    source, completed_at, metadata
  )
  VALUES (
    coalesce(NEW.name, NEW.version),
    encode(digest(coalesce(array_to_string(NEW.statements, E'\n'), NEW.version), 'sha256'), 'hex'),
    'success',
    'supabase_cli',
    now(),
    jsonb_build_object('version', NEW.version)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never break a real migration because audit failed
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
      AND table_name = 'schema_migrations'
  ) THEN
    DROP TRIGGER IF EXISTS trg_audit_schema_migration
      ON supabase_migrations.schema_migrations;
    CREATE TRIGGER trg_audit_schema_migration
      AFTER INSERT ON supabase_migrations.schema_migrations
      FOR EACH ROW EXECUTE FUNCTION public.tg_audit_schema_migration();
  END IF;
END $$;
