-- instance_sync_status() — the live side of the Instance Manifest (root fix #2).
--
-- The repo's desired state per layer lives in supabase/seed/instance-manifest.json
-- (generated, deterministic). This function returns what THIS instance actually
-- runs, so any consumer holding the manifest (the admin Instance Sync card,
-- whose bundle ships the manifest via the frontend's auto-deploy; the gateway;
-- fleet tooling) can diff desired vs actual per layer:
--
--   schema: the migrate ledger HEAD (supabase_migrations.schema_migrations) —
--           the definitive answer to "did that migration actually apply?",
--           which this July repeatedly required archaeology to answer.
--   skills: row counts + max(updated_at) + the seed-bundle stamp written by
--           "Sync skills from code" (site_settings key 'instance_manifest_stamp')
--           — stamp hash vs manifest hash is an exact bundle-version compare.
--   edge:   not observable from SQL (deploy state lives outside the DB) — the
--           manifest's expected list is diffed by CLI tooling instead.
--
-- Read-only. SECURITY DEFINER with the service_role escape so the MCP gateway
-- can call it (auth.uid() is NULL under the service key). All foreign-schema
-- reads are to_regclass-guarded so the function degrades to nulls instead of
-- erroring on an instance without those relations. Idempotent, forward-dated.

CREATE OR REPLACE FUNCTION public.instance_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, supabase_migrations
AS $fn$
DECLARE
  v_migration_head  text;
  v_migrations_cnt  bigint;
  v_skills_total    bigint;
  v_skills_enabled  bigint;
  v_skills_updated  timestamptz;
  v_stamp           jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'instance_sync_status: admin or service_role required';
  END IF;

  -- Schema layer: the migrate ledger this instance has actually applied.
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    BEGIN
      SELECT max(version), count(*) INTO v_migration_head, v_migrations_cnt
      FROM supabase_migrations.schema_migrations;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'instance_sync_status: ledger read failed (%).', SQLERRM;
    END;
  END IF;

  -- Skills layer: live rows + the bundle stamp from the last code-sync.
  IF to_regclass('public.agent_skills') IS NOT NULL THEN
    SELECT count(*), count(*) FILTER (WHERE enabled), max(updated_at)
    INTO v_skills_total, v_skills_enabled, v_skills_updated
    FROM public.agent_skills;
  END IF;

  SELECT value INTO v_stamp
  FROM public.site_settings WHERE key = 'instance_manifest_stamp';

  RETURN jsonb_build_object(
    'checked_at', now(),
    'schema', jsonb_build_object(
      'migration_head', v_migration_head,
      'migrations_count', v_migrations_cnt
    ),
    'skills', jsonb_build_object(
      'total', v_skills_total,
      'enabled', v_skills_enabled,
      'last_updated_at', v_skills_updated,
      'stamp', v_stamp
    )
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.instance_sync_status() TO anon, authenticated, service_role;
