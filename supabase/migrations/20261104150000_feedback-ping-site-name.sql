-- The ping carries the site's name (2026-11-04). The fleet view on www showed
-- three "localhost:5173" rows, each a new instance id — a fresh local install
-- every morning — and nothing to tell them from each other or from a person's
-- own dev machine. The name an operator already set (Branding → organisation
-- name, else Business Identity → company name) now travels with the ping, so
-- the board reads "Nordbrygg", not a host. No new setting.
ALTER TABLE public.feedback_instances ADD COLUMN IF NOT EXISTS site_name text;

-- One function, seven parameters: the six-parameter overload goes, or a
-- positional call with six arguments would match both.
DROP FUNCTION IF EXISTS public.feedback_record_ping(uuid, text, text, text, text, text[]);
CREATE OR REPLACE FUNCTION public.feedback_record_ping(
  p_instance_id uuid,
  p_site_url text DEFAULT NULL,
  p_app text DEFAULT 'flowwink',
  p_skills_sha text DEFAULT NULL,
  p_migration_head text DEFAULT NULL,
  p_modules_enabled text[] DEFAULT '{}',
  p_site_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_count int;
BEGIN
  IF p_instance_id IS NULL THEN RAISE EXCEPTION 'instance_id is required' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.feedback_instances (instance_id, site_url, site_name, app, skills_sha, migration_head, modules_enabled, module_count)
    VALUES (p_instance_id, left(p_site_url, 300), nullif(left(btrim(p_site_name), 120), ''), left(COALESCE(p_app, 'flowwink'), 40), left(p_skills_sha, 64), left(p_migration_head, 32),
            (COALESCE(p_modules_enabled, '{}'::text[]))[1:200], COALESCE(array_length(p_modules_enabled, 1), 0))
    ON CONFLICT (instance_id) DO UPDATE SET
      site_url = EXCLUDED.site_url, site_name = COALESCE(EXCLUDED.site_name, public.feedback_instances.site_name),
      app = EXCLUDED.app, skills_sha = EXCLUDED.skills_sha, migration_head = EXCLUDED.migration_head,
      modules_enabled = EXCLUDED.modules_enabled, module_count = EXCLUDED.module_count,
      last_seen_at = now(), ping_count = public.feedback_instances.ping_count + 1
    RETURNING ping_count INTO v_count;
  RETURN jsonb_build_object('success', true, 'instance_id', p_instance_id, 'ping_count', v_count);
END $fn$;
GRANT EXECUTE ON FUNCTION public.feedback_record_ping(uuid, text, text, text, text, text[], text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.feedback_record_ping(uuid, text, text, text, text, text[], text) IS
  'The daily ping from another instance (feedback module): upsert by instance id, count. Public by design — it carries nothing but an id, a URL, the site''s name and a version.';

-- Proof, rolled back: a ping with a name keeps it, one without does not erase it.
DO $$
DECLARE v_name text; v_n int;
BEGIN
  BEGIN
    PERFORM public.feedback_record_ping('00000000-0000-4000-8000-00000000f00e', 'http://localhost:5173', 'flowwink', 'sha', NULL, ARRAY['pages'], 'Proof AB');
    PERFORM public.feedback_record_ping('00000000-0000-4000-8000-00000000f00e', 'http://localhost:5173', 'flowwink', 'sha', NULL, ARRAY['pages'], NULL);
    SELECT site_name, ping_count INTO v_name, v_n FROM public.feedback_instances WHERE instance_id = '00000000-0000-4000-8000-00000000f00e';
    IF v_name IS DISTINCT FROM 'Proof AB' OR v_n <> 2 THEN RAISE EXCEPTION 'proof: expected Proof AB / 2, got % / %', v_name, v_n; END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $$;
