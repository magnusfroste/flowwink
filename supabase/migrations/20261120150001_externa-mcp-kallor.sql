-- External MCP servers as a source of skills (#862, part 2).
--
-- A business keeps its books in another system and will not move them. The
-- agent should still be able to answer across the border — "is invoice 1042
-- paid?" — without a line of system-specific code in the platform. The bridge
-- to that system speaks MCP; this is the generic half: connect an MCP server,
-- choose which of its tools the agent may use, and they become skills.
--
-- What is stored where:
--   mcp_sources            the connection: address, what the server offered at
--                          the last look, which tools were chosen. Admin only.
--   vault                  the key, under the name mcp_source:<id>. Never in a
--                          table, never in a setting every staff member reads,
--                          never through a skill's arguments (those are logged).
--   agent_skills           one row per chosen tool, origin 'mcp', handler
--                          mcp:<source id>/<tool>. Written by the executor.
--
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS.

ALTER TYPE public.skill_origin ADD VALUE IF NOT EXISTS 'mcp';

CREATE TABLE IF NOT EXISTS public.mcp_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short handle that goes into the skill names: query_<slug>__<tool>.
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9]{1,15}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  url text NOT NULL CHECK (url ~* '^https?://'),
  enabled boolean NOT NULL DEFAULT true,
  -- The default the issue asks for: only tools that READ. A source must be
  -- opened for writing on purpose before a writing tool can be chosen.
  read_only boolean NOT NULL DEFAULT true,
  has_key boolean NOT NULL DEFAULT false,
  server_name text,
  -- What tools/list answered at the last look: [{ name, description, read_only_hint }].
  available_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- What was chosen: [{ name, mode: 'read' | 'write' }].
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mcp_sources IS
  'External MCP servers connected as skill sources (#862). The key is in the vault (mcp_source:<id>), never here.';

ALTER TABLE public.mcp_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage MCP sources" ON public.mcp_sources;
CREATE POLICY "Admins manage MCP sources" ON public.mcp_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE ALL ON TABLE public.mcp_sources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.mcp_sources TO authenticated;
GRANT ALL ON TABLE public.mcp_sources TO service_role;

CREATE OR REPLACE FUNCTION public.mcp_sources_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  -- The address is what the key was given for. Another address is another
  -- server: its tools are not the ones that were chosen, and the old key must
  -- not be sent to it.
  IF TG_OP = 'UPDATE' AND NEW.url IS DISTINCT FROM OLD.url THEN
    NEW.has_key := false;
    NEW.available_tools := '[]'::jsonb;
    NEW.tools := '[]'::jsonb;
    NEW.server_name := NULL;
    NEW.last_checked_at := NULL;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS mcp_sources_touch ON public.mcp_sources;
CREATE TRIGGER mcp_sources_touch BEFORE UPDATE ON public.mcp_sources
  FOR EACH ROW EXECUTE FUNCTION public.mcp_sources_touch();

-- ── The key ───────────────────────────────────────────────────────────────────
-- Written by an admin at the keyboard (the page calls this function), read by
-- the executor alone. Nothing a browser or an agent can call returns it.

CREATE OR REPLACE FUNCTION public.set_mcp_source_key(p_source_id uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_name text := 'mcp_source:' || p_source_id::text;
  v_id uuid;
  v_key text := trim(coalesce(p_key, ''));
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Only an admin can set the key of an MCP source' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mcp_sources WHERE id = p_source_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MCP source not found');
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name LIMIT 1;

  IF v_key = '' THEN
    -- An empty key takes the key away: the server is called without one.
    IF v_id IS NOT NULL THEN DELETE FROM vault.secrets WHERE id = v_id; END IF;
    UPDATE public.mcp_sources SET has_key = false WHERE id = p_source_id;
    RETURN jsonb_build_object('success', true, 'has_key', false);
  END IF;

  IF length(v_key) > 4096 THEN
    RETURN jsonb_build_object('success', false, 'error', 'The key is longer than 4096 characters');
  END IF;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_key, v_name, 'Key of an external MCP source');
  ELSE
    PERFORM vault.update_secret(v_id, v_key);
  END IF;
  UPDATE public.mcp_sources SET has_key = true WHERE id = p_source_id;
  RETURN jsonb_build_object('success', true, 'has_key', true);
END $fn$;

REVOKE ALL ON FUNCTION public.set_mcp_source_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_mcp_source_key(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mcp_source_key(p_source_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
BEGIN
  -- The executor's own read. No session, admin or not, is handed a key back.
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'The key of an MCP source is read by the platform only' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets
           WHERE name = 'mcp_source:' || p_source_id::text LIMIT 1);
END $fn$;

REVOKE ALL ON FUNCTION public.mcp_source_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_source_key(uuid) TO service_role;

-- A source that goes takes its key and its skills with it.
CREATE OR REPLACE FUNCTION public.mcp_sources_forget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'mcp_source:' || OLD.id::text;
  DELETE FROM public.agent_skills WHERE handler LIKE 'mcp:' || OLD.id::text || '/%';
  RETURN OLD;
END $fn$;

REVOKE ALL ON FUNCTION public.mcp_sources_forget() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mcp_sources_forget ON public.mcp_sources;
CREATE TRIGGER mcp_sources_forget AFTER DELETE ON public.mcp_sources
  FOR EACH ROW EXECUTE FUNCTION public.mcp_sources_forget();

-- ── Proof ─────────────────────────────────────────────────────────────────────
-- On its own rows only, rolled back: the key goes in, comes back to the
-- service role, and leaves with the source. Nothing of the instance's is read.
DO $proof$
DECLARE
  v_id uuid;
  v_res jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE NOTICE 'mcp_sources proof skipped: not run by the migration role';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.mcp_sources (slug, name, url)
      VALUES ('proofsrc' || floor(random() * 1e6)::int::text, 'Proof', 'https://example.invalid/mcp')
      RETURNING id INTO v_id;
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_res := public.set_mcp_source_key(v_id, 'proof-key');
    IF NOT (v_res ->> 'success')::boolean THEN RAISE EXCEPTION 'set_mcp_source_key refused: %', v_res; END IF;
    IF public.mcp_source_key(v_id) IS DISTINCT FROM 'proof-key' THEN RAISE EXCEPTION 'the key did not come back'; END IF;
    IF NOT (SELECT has_key FROM public.mcp_sources WHERE id = v_id) THEN RAISE EXCEPTION 'has_key was not set'; END IF;
    UPDATE public.mcp_sources SET url = 'https://example.invalid/other' WHERE id = v_id;
    IF (SELECT has_key FROM public.mcp_sources WHERE id = v_id) THEN RAISE EXCEPTION 'a new address kept the old key flag'; END IF;
    DELETE FROM public.mcp_sources WHERE id = v_id;
    IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'mcp_source:' || v_id::text) THEN
      RAISE EXCEPTION 'the key outlived its source';
    END IF;
    RAISE EXCEPTION 'mcp_sources proof ok — rolling back' USING ERRCODE = 'P0002';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    RAISE NOTICE 'mcp_sources: key in, key back to the platform, key gone with the source';
  END;
END $proof$;
