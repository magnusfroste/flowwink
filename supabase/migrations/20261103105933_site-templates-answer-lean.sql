-- Site templates answer LEAN — the stored body is counted, never echoed.
--
-- Review round 3 of #797: export_site_template learned to answer with the
-- lean body when it SAVES (the binaries stay in the row), but the natural next
-- call — manage_site_template action=get — still returned to_jsonb(v_row) with
-- the whole template_json: up to 40 MB of base64 (document files, media) into
-- the agent's tool result, truncated, taking the structured fields with it.
-- And the export's save path read the previously stored template_json back
-- into the edge worker only to count six array lengths.
--
-- Two things, idempotent:
--   1. _site_template_section_counts(jsonb) — the per-section counts of a
--      body (pages, blog posts, KB categories, products, wiki pages,
--      documents, embedded document files, media files), and
--      site_template_section_counts(uuid), the same for a STORED row (admin
--      or service role) — what the export's save path reads instead of the body.
--   2. manage_site_template: get / create / update answer the row with
--      template_json stripped of media[] and documents[].file, plus a
--      template_payload that says what was omitted and how much of it there
--      is; list carries the section counts beside `pages`.
-- The signature is unchanged (CREATE OR REPLACE over the same arguments).

CREATE OR REPLACE FUNCTION public._site_template_section_counts(p_template jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'pages',          CASE WHEN jsonb_typeof(p_template -> 'pages') = 'array' THEN jsonb_array_length(p_template -> 'pages') ELSE 0 END,
    'blog_posts',     CASE WHEN jsonb_typeof(p_template -> 'blogPosts') = 'array' THEN jsonb_array_length(p_template -> 'blogPosts') ELSE 0 END,
    'kb_categories',  CASE WHEN jsonb_typeof(p_template -> 'kbCategories') = 'array' THEN jsonb_array_length(p_template -> 'kbCategories') ELSE 0 END,
    'products',       CASE WHEN jsonb_typeof(p_template -> 'products') = 'array' THEN jsonb_array_length(p_template -> 'products') ELSE 0 END,
    'wiki_pages',     CASE WHEN jsonb_typeof(p_template -> 'wikiPages') = 'array' THEN jsonb_array_length(p_template -> 'wikiPages') ELSE 0 END,
    'documents',      CASE WHEN jsonb_typeof(p_template -> 'documents') = 'array' THEN jsonb_array_length(p_template -> 'documents') ELSE 0 END,
    'document_files', CASE WHEN jsonb_typeof(p_template -> 'documents') = 'array'
                           THEN (SELECT count(*) FROM jsonb_array_elements(p_template -> 'documents') d WHERE jsonb_typeof(d) = 'object' AND d ? 'file')
                           ELSE 0 END,
    'media_files',    CASE WHEN jsonb_typeof(p_template -> 'media') = 'array' THEN jsonb_array_length(p_template -> 'media') ELSE 0 END
  );
$fn$;

COMMENT ON FUNCTION public._site_template_section_counts(jsonb) IS
  'Per-section counts of a StarterTemplate body: pages, blog_posts, kb_categories, products, wiki_pages, documents, document_files (entries carrying bytes), media_files.';

GRANT EXECUTE ON FUNCTION public._site_template_section_counts(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.site_template_section_counts(p_template_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'))
      THEN NULL
    ELSE (SELECT public._site_template_section_counts(t.template_json) FROM public.site_templates t WHERE t.id = p_template_id)
  END;
$fn$;

COMMENT ON FUNCTION public.site_template_section_counts(uuid) IS
  'The section counts of a STORED site template, without reading its body out of the database (admin or service role; NULL otherwise).';

REVOKE ALL ON FUNCTION public.site_template_section_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_template_section_counts(uuid) TO authenticated, service_role;

-- The row as an answer: everything but the binary payloads, which are
-- described, not carried. install_template reads the row itself.
CREATE OR REPLACE FUNCTION public._site_template_lean(p_row public.site_templates)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_json jsonb := COALESCE(p_row.template_json, '{}'::jsonb);
  v_counts jsonb := public._site_template_section_counts(COALESCE(p_row.template_json, '{}'::jsonb));
  v_media int := (v_counts ->> 'media_files')::int;
  v_files int := (v_counts ->> 'document_files')::int;
BEGIN
  IF v_media > 0 THEN
    v_json := v_json - 'media';
  END IF;
  IF v_files > 0 THEN
    v_json := jsonb_set(v_json, '{documents}',
      COALESCE((SELECT jsonb_agg(CASE WHEN jsonb_typeof(d) = 'object' THEN d - 'file' ELSE d END)
                FROM jsonb_array_elements(v_json -> 'documents') d), '[]'::jsonb));
  END IF;
  RETURN to_jsonb(p_row) || jsonb_build_object(
    'template_json', v_json,
    'sections', v_counts,
    'template_payload', jsonb_build_object(
      'omitted_from_response', (v_media > 0 OR v_files > 0),
      'document_files', v_files,
      'media_files', v_media,
      'where', CASE WHEN (v_media > 0 OR v_files > 0)
                    THEN 'Stored with the template — install_template carries the files; the answer describes them.'
                    ELSE 'Nothing omitted — the template carries no embedded files.' END));
END; $fn$;

COMMENT ON FUNCTION public._site_template_lean(public.site_templates) IS
  'A site_templates row as a tool answer: template_json without media[] and documents[].file, plus sections (counts) and template_payload (what was omitted).';

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
               'sections', public._site_template_section_counts(t.template_json),
               'carries_restricted_content', t.carries_restricted_content,
               'updated_at', t.updated_at)
             ORDER BY t.name)
      FROM public.site_templates t
      WHERE t.is_active OR COALESCE(p_is_active, true) = false), '[]'::jsonb));
  END IF;

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
    RETURN jsonb_build_object('template', public._site_template_lean(v_row));

  ELSIF p_action = 'create' THEN
    IF COALESCE(btrim(p_name), '') = '' THEN
      RAISE EXCEPTION 'create requires p_name';
    END IF;
    IF p_template_json IS NULL THEN
      RAISE EXCEPTION 'create requires p_template_json (the StarterTemplate body: pages[], blogPosts[], branding, settings)';
    END IF;

    SELECT * INTO v_row FROM public.site_templates WHERE lower(name) = lower(btrim(p_name));
    IF FOUND THEN
      RETURN jsonb_build_object('created', false, 'already_existed', true,
                                'template_id', v_row.id, 'template', public._site_template_lean(v_row));
    END IF;

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
                              'template', public._site_template_lean(v_row), 'validation', v_report);

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
                              'template', public._site_template_lean(v_row),
                              'validation', COALESCE(v_report, public._site_template_structure_report(v_row.template_json)));

  ELSIF p_action = 'archive' THEN
    UPDATE public.site_templates SET is_active = false, updated_at = now()
      WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN jsonb_build_object('archived', true, 'template_id', v_row.id);
  END IF;

  RAISE EXCEPTION 'Unknown action %. Use list|get|create|update|archive', p_action;
END; $fn$;

GRANT EXECUTE ON FUNCTION public.manage_site_template(text, text, text, text, text, text, text, jsonb, boolean) TO authenticated, service_role;
