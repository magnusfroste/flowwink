-- translate_site: the whole site into a language, continued by a sweep (2026-11-20).
--
-- translate_site records the languages it is working on in
-- site_settings.translation_sweep ({ "<locale>": { "status": "running" | "done"
-- | "stuck", … } }). The automation "Finish site translations" runs every ten
-- minutes; this probe lets it sleep unless a language is still running.

CREATE OR REPLACE FUNCTION public.work_probe_translation_sweep_running()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.site_settings s,
           LATERAL jsonb_each(CASE WHEN jsonb_typeof(s.value) = 'object' THEN s.value ELSE '{}'::jsonb END) AS l(locale, state)
     WHERE s.key = 'translation_sweep'
       AND l.state->>'status' = 'running'
  )
$$;
REVOKE ALL ON FUNCTION public.work_probe_translation_sweep_running() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_probe_translation_sweep_running() TO service_role;
