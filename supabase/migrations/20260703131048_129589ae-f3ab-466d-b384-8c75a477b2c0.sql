-- Expose the Supabase migrations ledger to the admin UI via a security-definer
-- RPC. The ledger schema is locked down; we return only version + name and
-- derive the timestamp from the version (Supabase uses YYYYMMDDHHMMSS_uuid).
-- Uses SELECT * so it works regardless of which optional columns exist on
-- this Supabase version — we cast the row and pick only version + name.
CREATE OR REPLACE FUNCTION public.get_recent_migrations(p_limit int DEFAULT 20)
RETURNS TABLE (
  version text,
  name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, supabase_migrations
AS $$
BEGIN
  RETURN QUERY EXECUTE
    'SELECT version::text, COALESCE(name, '''')::text
     FROM supabase_migrations.schema_migrations
     ORDER BY version DESC
     LIMIT $1'
    USING GREATEST(1, LEAST(p_limit, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.get_recent_migrations(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_migrations(int) TO authenticated, service_role;