-- A website template becomes instance data, so an agent can author one.
--
-- The contract side proved the anatomy: a template that lives in a TABLE can be
-- created by an external operator, survives, shows up in the picker, and travels
-- with the instance. Site templates lived in src/data/templates/*.ts — compiled
-- into the bundle — so the one thing an agent could never do was make a new one.
-- Import made it worse: the admin UI parked an imported template in
-- sessionStorage, so "save it and install it on the next instance" had no
-- durable middle.
--
-- This is the storage half of the mirror:
--   contract_templates          → site_templates
--   manage_contract_template    → manage_site_template
--   _contract_template_unrendered_tokens → _site_template_structure_report
--
-- ONE THING DELIBERATELY ABSENT: the block vocabulary. Which block types exist
-- and what fields they carry has exactly one home — src/lib/block-reference.ts,
-- synced to _shared/block-schema.ts by scripts/sync-block-schema.ts. Today's
-- lesson (a third copy of the contract token list appearing one day after the
-- second was reconciled) says a DB copy would be stale within the week. So this
-- function validates what the DATABASE knows — shape, slugs, homepage
-- resolution, stringified rich text — and the vocabulary check stays where the
-- vocabulary is. Idempotent throughout.

CREATE TABLE IF NOT EXISTS public.site_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'enterprise',
  icon text NOT NULL DEFAULT 'Sparkles',
  tagline text,
  -- The StarterTemplate body: pages[], blogPosts[], branding, *Settings.
  template_json jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- A template outlives the colleague who wrote it (business record, not a
  -- personal artifact) — SET NULL, per the 20260808290000 doctrine.
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Name is the handle an author resolves by, so it must be unique the way
-- contract templates are: create is idempotent on it.
CREATE UNIQUE INDEX IF NOT EXISTS site_templates_name_lower_key
  ON public.site_templates (lower(name));

ALTER TABLE public.site_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage site templates" ON public.site_templates;
CREATE POLICY "Admins manage site templates"
  ON public.site_templates FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated view site templates" ON public.site_templates;
CREATE POLICY "Authenticated view site templates"
  ON public.site_templates FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));


-- ── the structural report ───────────────────────────────────────────────────
-- The counterpart of unrendered_tokens: a machine-readable answer the agent can
-- act on without a human. Errors block the write; warnings are advice.
CREATE OR REPLACE FUNCTION public._site_template_structure_report(p_template jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_errors text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_pages jsonb;
  v_page jsonb;
  v_blocks jsonb;
  v_block jsonb;
  v_slugs text[] := ARRAY[]::text[];
  v_slug text;
  v_home text;
  v_home_found boolean := false;
  v_block_count int := 0;
  v_page_idx int := 0;
  v_key text;
  v_val jsonb;
BEGIN
  IF p_template IS NULL OR jsonb_typeof(p_template) <> 'object' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', jsonb_build_array('template_json must be a JSON object (the StarterTemplate body)'),
      'warnings', '[]'::jsonb,
      'stats', jsonb_build_object('pages', 0, 'blocks', 0, 'blog_posts', 0));
  END IF;

  v_pages := p_template -> 'pages';
  IF v_pages IS NULL OR jsonb_typeof(v_pages) <> 'array' OR jsonb_array_length(v_pages) = 0 THEN
    -- Bare string literals are `unknown` to the || operator, which then reads
    -- them as array literals and dies on the first word. Every append in this
    -- function is explicitly text — caught live, not in review.
    v_errors := v_errors || 'A template must have at least one page (pages: [])'::text;
    v_pages := '[]'::jsonb;
  END IF;

  -- The homepage may be declared per page (isHomePage) or by slug in
  -- siteSettings.homepageSlug. Either resolves; neither is an error.
  v_home := COALESCE(p_template #>> '{siteSettings,homepageSlug}', 'home');

  FOR v_page IN SELECT * FROM jsonb_array_elements(v_pages) LOOP
    v_page_idx := v_page_idx + 1;

    IF COALESCE(btrim(v_page ->> 'title'), '') = '' THEN
      v_errors := v_errors || format('Page %s: title is required', v_page_idx);
    END IF;

    v_slug := COALESCE(btrim(v_page ->> 'slug'), '');
    IF v_slug = '' THEN
      v_errors := v_errors || format('Page %s ("%s"): slug is required', v_page_idx, COALESCE(v_page ->> 'title', '?'));
    ELSE
      IF v_slug = ANY (v_slugs) THEN
        v_errors := v_errors || format('Duplicate page slug "%s" — a slug is the page''s address and must be unique', v_slug);
      END IF;
      v_slugs := v_slugs || v_slug;
      IF v_slug = v_home OR COALESCE((v_page ->> 'isHomePage')::boolean, false) THEN
        v_home_found := true;
      END IF;
    END IF;

    v_blocks := v_page -> 'blocks';
    IF v_blocks IS NULL OR jsonb_typeof(v_blocks) <> 'array' OR jsonb_array_length(v_blocks) = 0 THEN
      v_warnings := v_warnings || format('Page "%s": has no content blocks', COALESCE(v_page ->> 'title', v_slug));
    ELSE
      FOR v_block IN SELECT * FROM jsonb_array_elements(v_blocks) LOOP
        v_block_count := v_block_count + 1;

        IF COALESCE(btrim(v_block ->> 'type'), '') = '' THEN
          v_errors := v_errors || format('Page "%s": a block is missing its "type"', COALESCE(v_page ->> 'title', v_slug));
          CONTINUE;
        END IF;

        IF v_block -> 'data' IS NULL OR jsonb_typeof(v_block -> 'data') <> 'object' THEN
          v_errors := v_errors || format('Page "%s", block "%s": "data" must be an object',
                                         COALESCE(v_page ->> 'title', v_slug), v_block ->> 'type');
          CONTINUE;
        END IF;

        -- The single most common authoring mistake: a Tiptap document sent as a
        -- STRING instead of JSON. It renders as nothing, and it looks correct in
        -- the payload — so the agent has no way to notice without being told.
        FOR v_key, v_val IN SELECT * FROM jsonb_each(v_block -> 'data') LOOP
          IF jsonb_typeof(v_val) = 'string'
             AND (v_val #>> '{}') ~ '^\s*\{.*"type"\s*:\s*"doc"' THEN
            v_errors := v_errors || format(
              'Page "%s", block "%s": field "%s" is a Tiptap document sent as a string — send it as JSON ({"type":"doc","content":[…]}), not as text',
              COALESCE(v_page ->> 'title', v_slug), v_block ->> 'type', v_key);
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_pages) > 0 AND NOT v_home_found THEN
    v_errors := v_errors || format(
      'No homepage: no page has slug "%s" and none is marked isHomePage — a template without a landing page installs into a site with no front door', v_home);
  END IF;

  IF COALESCE(btrim(p_template ->> 'tagline'), '') = '' THEN
    v_warnings := v_warnings || 'No tagline — the gallery card reads better with one'::text;
  END IF;

  RETURN jsonb_build_object(
    'valid', cardinality(v_errors) = 0,
    'errors', to_jsonb(v_errors),
    'warnings', to_jsonb(v_warnings),
    'stats', jsonb_build_object(
      'pages', jsonb_array_length(v_pages),
      'blocks', v_block_count,
      'blog_posts', CASE WHEN jsonb_typeof(p_template -> 'blogPosts') = 'array'
                         THEN jsonb_array_length(p_template -> 'blogPosts') ELSE 0 END));
END; $fn$;


-- ── the authoring RPC ───────────────────────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION public._site_template_structure_report(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_site_template(text, text, text, text, text, text, text, jsonb, boolean) TO authenticated, service_role;
