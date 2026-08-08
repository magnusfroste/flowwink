-- ============================================================================
-- Revert the manage_site_template capture detour.
--
-- Capturing the live site as a template is a real gap, but it already has a
-- name: export_site_template, which three other skill descriptions point at by
-- name ("NOT for: exporting the current site (use export_site_template)"). A
-- second verb for the same job in a different skill is how a surface grows two
-- generations that both half-work — the exact drift this repo has cleaned up
-- before. So capture moves into export_site_template, and the 10-argument
-- overload introduced on the way there is removed.
--
-- Idempotent: instances that never received the overload skip the DROP.
-- ============================================================================

DROP FUNCTION IF EXISTS public.manage_site_template(text, text, text, text, text, text, text, jsonb, boolean, text[]);

CREATE OR REPLACE FUNCTION public.manage_site_template(
  p_action text,
  p_template text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_icon text DEFAULT NULL,
  p_tagline text DEFAULT NULL,
  p_template_json jsonb DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_row public.site_templates;
  v_id uuid;
  v_matches int;
  v_report jsonb;
BEGIN
  -- The MCP gateway runs RPC skills with the service key, so auth.uid() is NULL
  -- inside this function — without the escape an operator only ever sees
  -- "Only admins…".
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage site templates';
  END IF;

  IF p_action = 'list' THEN
    RETURN jsonb_build_object('templates', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.name, 'description', t.description,
               'category', t.category, 'tagline', t.tagline, 'is_active', t.is_active,
               'pages', CASE WHEN jsonb_typeof(t.template_json -> 'pages') = 'array'
                             THEN jsonb_array_length(t.template_json -> 'pages') ELSE 0 END,
               'updated_at', t.updated_at)
             ORDER BY t.name)
      FROM public.site_templates t
      WHERE t.is_active OR COALESCE(p_is_active, true) = false), '[]'::jsonb));
  END IF;

  -- ── Resolve an existing template: id, or name (exact then unique prefix) ──
  IF p_action IN ('get', 'update', 'archive') THEN
    IF COALESCE(btrim(p_template), '') = '' THEN
      RAISE EXCEPTION '% requires p_template (the template name or its UUID)', p_action;
    END IF;

    SELECT * INTO v_row FROM public.site_templates
    WHERE id = CASE WHEN p_template ~* '^[0-9a-f-]{36}$' THEN p_template::uuid END
    LIMIT 1;

    IF v_row.id IS NULL THEN
      SELECT * INTO v_row FROM public.site_templates
      WHERE lower(name) = lower(btrim(p_template)) LIMIT 1;
    END IF;

    IF v_row.id IS NULL THEN
      -- Unique prefix only. Ambiguity must be an error, never a silent pick.
      SELECT count(*) INTO v_matches FROM public.site_templates
      WHERE lower(name) LIKE lower(btrim(p_template)) || '%';
      IF v_matches > 1 THEN
        RAISE EXCEPTION 'Several templates start with "%": %', p_template,
          (SELECT string_agg(name, ' | ' ORDER BY name) FROM public.site_templates
           WHERE lower(name) LIKE lower(btrim(p_template)) || '%');
      END IF;
      SELECT * INTO v_row FROM public.site_templates
      WHERE lower(name) LIKE lower(btrim(p_template)) || '%' LIMIT 1;
    END IF;

    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'Template "%" not found. Run manage_site_template action=list to see the names.', p_template;
    END IF;
  END IF;

  IF p_action = 'get' THEN
    RETURN jsonb_build_object('template', to_jsonb(v_row));

  ELSIF p_action = 'create' THEN
    IF COALESCE(btrim(p_name), '') = '' THEN
      RAISE EXCEPTION 'create requires p_name';
    END IF;
    IF p_template_json IS NULL THEN
      RAISE EXCEPTION 'create requires p_template_json (the StarterTemplate body: pages[], blogPosts[], branding, settings)';
    END IF;

    -- Idempotent on name, exactly like manage_contract_template.
    SELECT * INTO v_row FROM public.site_templates WHERE lower(name) = lower(btrim(p_name));
    IF FOUND THEN
      RETURN jsonb_build_object('created', false, 'already_existed', true,
                                'template_id', v_row.id, 'template', to_jsonb(v_row));
    END IF;

    -- A structurally broken template is refused rather than stored, the way the
    -- contracts guard refuses an empty agreement body. Warnings do not block.
    v_report := public._site_template_structure_report(p_template_json);
    IF NOT (v_report ->> 'valid')::boolean THEN
      RAISE EXCEPTION 'Template structure is invalid: %',
        (SELECT string_agg(value #>> '{}', ' | ') FROM jsonb_array_elements(v_report -> 'errors'));
    END IF;

    INSERT INTO public.site_templates (name, description, category, icon, tagline, template_json, is_active, created_by)
    VALUES (btrim(p_name), p_description, COALESCE(p_category, 'enterprise'),
            COALESCE(p_icon, 'Sparkles'), p_tagline, p_template_json,
            COALESCE(p_is_active, true), auth.uid())
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('created', true, 'template_id', v_row.id,
                              'template', to_jsonb(v_row), 'validation', v_report);

  ELSIF p_action = 'update' THEN
    IF p_template_json IS NOT NULL THEN
      v_report := public._site_template_structure_report(p_template_json);
      IF NOT (v_report ->> 'valid')::boolean THEN
        RAISE EXCEPTION 'Template structure is invalid: %',
          (SELECT string_agg(value #>> '{}', ' | ') FROM jsonb_array_elements(v_report -> 'errors'));
      END IF;
    END IF;

    UPDATE public.site_templates SET
      name = COALESCE(nullif(btrim(COALESCE(p_name, '')), ''), name),
      description = COALESCE(p_description, description),
      category = COALESCE(p_category, category),
      icon = COALESCE(p_icon, icon),
      tagline = COALESCE(p_tagline, tagline),
      template_json = COALESCE(p_template_json, template_json),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('updated', true, 'template_id', v_row.id,
                              'template', to_jsonb(v_row),
                              'validation', COALESCE(v_report, public._site_template_structure_report(v_row.template_json)));

  ELSIF p_action = 'archive' THEN
    UPDATE public.site_templates SET is_active = false, updated_at = now()
      WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN jsonb_build_object('archived', true, 'template_id', v_row.id);
  END IF;

  RAISE EXCEPTION 'Unknown action %. Use list|get|create|update|archive', p_action;
END; $fn$;


GRANT EXECUTE ON FUNCTION public.manage_site_template(text, text, text, text, text, text, text, jsonb, boolean) TO authenticated, service_role;
