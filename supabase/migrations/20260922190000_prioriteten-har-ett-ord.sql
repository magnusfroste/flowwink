-- Prioriteten har ett ord — och en väljare.
--
-- Peter (optic, backlogg "Now"): "Task-prioritering: standard skala med
-- betydelse — low = nice-to-have, high = kritiskt för execution roadmap eller
-- lönsamhet, urgent = blockerar R/B, IPO eller lönsamhet. Tillämpa på alla
-- aktiva tasks." 66 av 70 uppgifter står på medium.
--
-- Skalan fanns. Det som saknades var två saker:
--   1. Uppgiftsdialogen HAR INGEN prioritetsväljare. Snabbtillägget hårdkodar
--      medium. Bara en agent kunde sätta prioritet — samma klass som wikins
--      träd (#573): funktionen fanns bara för agenter, så ingen använde den.
--   2. Betydelsen. Vad "high" betyder i just det här bolaget står i Peters
--      huvud, inte där valet görs. Det är org-konfig: fyra korta rader.
--
-- Så: en prioritetsguide per instans (site_settings.projects.priority_guide)
-- med vettiga defaults, läst av EN funktion (project_priority_guide) som
-- väljaren visar under varje alternativ och som project_attention och
-- project_portfolio_brief bär i sina svar — agenten viktar med bolagets ord.
-- Ingen bulk-knapp: att sätta prioritet på befintliga uppgifter är teamets
-- eller agentens jobb (manage_project_task update fungerar sedan #568).
--
-- Viktningen ändras inte: urgent räknas som "needs attention", high gör det
-- inte — det stämmer med Peters egen definition (urgent blockerar, high är
-- viktigt men blockerar inte).
--
-- Idempotent: CREATE OR REPLACE; de två befintliga läsarna patchas förankrat
-- med markör (bara om markören saknas), och ankaret MÅSTE finnas.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Guiden: defaults här, bolagets ord ovanpå
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.project_priority_guide()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'low',    'Nice to have. Nobody is waiting for it; it can slip without anyone noticing.',
    'medium', 'The normal flow: planned work, done in order.',
    'high',   'Matters to the plan or the money. Not blocking anyone yet, but slipping it costs.',
    'urgent', 'Blocks something — a deadline set outside the team, a payment, a decision others wait on. The project shows it as needing attention.')
  || COALESCE((SELECT s.value->'priority_guide' FROM public.site_settings s WHERE s.key = 'projects'), '{}'::jsonb);
$$;
COMMENT ON FUNCTION public.project_priority_guide() IS
  'What low/medium/high/urgent mean on this instance: defaults with the team''s own words on top (site_settings.projects.priority_guide). The priority picker shows it; project_attention and the brief carry it.';

CREATE OR REPLACE FUNCTION public.set_project_priority_guide(p_guide jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_clean jsonb := '{}'::jsonb;
  v_key text; v_val text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'projects')) THEN
    RAISE EXCEPTION 'Requires the projects module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_guide IS NULL OR jsonb_typeof(p_guide) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_guide is an object with any of the keys low, medium, high, urgent — each a short sentence.');
  END IF;
  FOR v_key, v_val IN SELECT key, value #>> '{}' FROM jsonb_each(p_guide) LOOP
    IF v_key NOT IN ('low', 'medium', 'high', 'urgent') THEN
      RETURN jsonb_build_object('success', false, 'error', format('"%s" is not a priority — the scale is low, medium, high, urgent.', v_key));
    END IF;
    IF length(btrim(COALESCE(v_val, ''))) = 0 THEN
      CONTINUE; -- an empty string means "back to the default"
    END IF;
    IF length(v_val) > 200 THEN
      RETURN jsonb_build_object('success', false, 'error', format('The meaning of "%s" is %s characters — keep it to one sentence (200).', v_key, length(v_val)));
    END IF;
    v_clean := v_clean || jsonb_build_object(v_key, btrim(v_val));
  END LOOP;

  INSERT INTO public.site_settings (key, value)
  VALUES ('projects', jsonb_build_object('priority_guide', v_clean))
  ON CONFLICT (key) DO UPDATE
    SET value = jsonb_set(COALESCE(public.site_settings.value, '{}'::jsonb), '{priority_guide}', v_clean, true),
        updated_at = now(), updated_by = auth.uid();

  RETURN jsonb_build_object('success', true, 'priority_guide', public.project_priority_guide(),
    'note', 'Only the keys you sent were set; an empty string returns a level to its default. Existing tasks keep their priority — set it with manage_project_task update.');
END; $$;

REVOKE ALL ON FUNCTION public.project_priority_guide() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_priority_guide() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_project_priority_guide(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_priority_guide(jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. De två läsarna bär guiden (förankrad patch, markör = idempotens)
-- ─────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE v_def text;
BEGIN
  -- project_attention: svaret vyn läser.
  SELECT pg_get_functiondef('public.project_attention(integer)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%priority-guide 20260922190000%' THEN
    IF v_def NOT LIKE '%''today'', public.platform_today(),%' THEN
      RAISE EXCEPTION 'project_attention has no anchor for the priority guide — the body is not the one #568 shipped';
    END IF;
    v_def := replace(v_def, '''today'', public.platform_today(),',
      '''today'', public.platform_today(), /* priority-guide 20260922190000 */ ''priority_guide'', public.project_priority_guide(),');
    EXECUTE v_def;
  END IF;

  -- project_portfolio_brief: det agenten läser först.
  SELECT pg_get_functiondef('public.project_portfolio_brief(uuid, integer)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%priority-guide 20260922190000%' THEN
    IF v_def NOT LIKE '%''projects'', v_projects,%' THEN
      RAISE EXCEPTION 'project_portfolio_brief has no anchor for the priority guide — the body is not the one #568 shipped';
    END IF;
    v_def := replace(v_def, '''projects'', v_projects,',
      '''projects'', v_projects, /* priority-guide 20260922190000 */ ''priority_guide'', public.project_priority_guide(),');
    EXECUTE v_def;
  END IF;
END
$patch$;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE v_r jsonb; v_g jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    v_g := public.project_priority_guide();
    IF v_g->>'urgent' NOT LIKE 'Blocks something%' THEN
      RAISE EXCEPTION 'proof failed: default guide → %', v_g;
    END IF;

    v_r := public.set_project_priority_guide('{"urgent": "Blockerar R/B, IPO eller lönsamhet", "high": "Kritiskt för execution roadmap eller lönsamhet"}'::jsonb);
    IF NOT (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: set → %', v_r; END IF;
    v_g := public.project_priority_guide();
    IF v_g->>'urgent' <> 'Blockerar R/B, IPO eller lönsamhet' OR v_g->>'low' NOT LIKE 'Nice to have%' THEN
      RAISE EXCEPTION 'proof failed: the team''s words sit on top of the defaults → %', v_g;
    END IF;

    -- Båda läsarna bär den.
    IF public.project_attention(5)->'priority_guide'->>'urgent' <> 'Blockerar R/B, IPO eller lönsamhet' THEN
      RAISE EXCEPTION 'proof failed: project_attention does not carry the guide';
    END IF;
    IF public.project_portfolio_brief(NULL, 5)->'priority_guide'->>'high' <> 'Kritiskt för execution roadmap eller lönsamhet' THEN
      RAISE EXCEPTION 'proof failed: the brief does not carry the guide';
    END IF;

    -- Tom sträng = tillbaka till default; okänd nivå vägras.
    v_r := public.set_project_priority_guide('{"urgent": ""}'::jsonb);
    IF public.project_priority_guide()->>'urgent' NOT LIKE 'Blocks something%' THEN
      RAISE EXCEPTION 'proof failed: an empty string should restore the default';
    END IF;
    v_r := public.set_project_priority_guide('{"critical": "x"}'::jsonb);
    IF (v_r->>'success')::boolean THEN RAISE EXCEPTION 'proof failed: an unknown level was accepted'; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: the guide has defaults, the team''s words sit on top, both readers carry it, an empty string restores the default, an unknown level is refused.';
END
$proof$;
