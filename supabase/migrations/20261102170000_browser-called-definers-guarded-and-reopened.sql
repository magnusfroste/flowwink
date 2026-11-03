-- Two functions the browser calls were closed to the browser (2026-11-02).
--
-- 20261029120000 revoked EXECUTE from anon/authenticated on 112 definer
-- functions judged "never called by the browser". Two of them are:
--   * newsletter_list_summary — Newsletter → lists (useNewsletterLists):
--     "permission denied for function newsletter_list_summary" for every
--     signed-in person, admin included. Found walking /admin/newsletter as
--     the marketing role.
--   * manage_docs_page — the Docs editor's create / update / delete /
--     restore (useManageDocsPage): every save refused the same way.
-- The sweep was right that neither guarded its body: before it, any signed-in
-- account (a customer too) could read subscriber counts or rewrite a docs
-- page. The mirror rule in CLAUDE.md: a definer function the browser calls is
-- guarded in its body with can_access_module(auth.uid(), '<module>'). So both
-- get that guard — newsletter and docs — and EXECUTE for authenticated back.
-- anon stays revoked.
--
-- Bodies are the live ones, unchanged but for the guard. Idempotent.

CREATE OR REPLACE FUNCTION public.newsletter_list_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'newsletter')) THEN
    RAISE EXCEPTION 'Only staff with the Newsletter module can read list totals' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('list', l, 'subscribers', n, 'confirmed', c) ORDER BY l), '[]'::jsonb)
    FROM (
      SELECT l, count(*) AS n, count(*) FILTER (WHERE s.status = 'confirmed') AS c
      FROM public.newsletter_subscribers s, unnest(s.lists) AS l
      GROUP BY l
    ) x
  );
END;
$$;
REVOKE ALL ON FUNCTION public.newsletter_list_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newsletter_list_summary() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manage_docs_page(p_action text, p_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_content text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_frontmatter jsonb DEFAULT NULL::jsonb, p_is_published boolean DEFAULT NULL::boolean, p_version_no integer DEFAULT NULL::integer, p_editor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row docs_pages%ROWTYPE; v_ver docs_page_versions%ROWTYPE; v_slug text; v_next integer;
BEGIN
  -- The docs editor calls this from the browser; the module decides who.
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'docs')) THEN
    RAISE EXCEPTION 'Only staff with the Docs module can edit docs pages' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'action required (create|update|delete|restore_version)'; END IF;
  IF p_action = 'create' THEN
    IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'title required'; END IF;
    IF p_content IS NULL OR btrim(p_content) = '' THEN RAISE EXCEPTION 'content required'; END IF;
    v_slug := COALESCE(NULLIF(btrim(p_slug), ''),
                       regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
    v_slug := btrim(v_slug, '-');
    INSERT INTO docs_pages (source, category, title, slug, content, frontmatter, is_published,
                            repo_owner, repo_name, file_path)
    VALUES ('app', COALESCE(NULLIF(btrim(p_category), ''), 'general'), p_title, v_slug, p_content,
            COALESCE(p_frontmatter, '{}'::jsonb), COALESCE(p_is_published, true), NULL, NULL, NULL)
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'create',
      'id', v_row.id, 'slug', v_row.slug, 'category', v_row.category, 'is_published', v_row.is_published);
  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for update'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = v_row.id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (v_row.id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET
      title = COALESCE(p_title, title), content = COALESCE(p_content, content),
      category = COALESCE(NULLIF(btrim(p_category), ''), category),
      slug = COALESCE(NULLIF(btrim(p_slug), ''), slug),
      frontmatter = COALESCE(p_frontmatter, frontmatter),
      is_published = COALESCE(p_is_published, is_published), updated_at = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'update', 'id', v_row.id,
      'snapshot_version', v_next, 'is_published', v_row.is_published);
  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for delete'; END IF;
    DELETE FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'action', 'delete', 'id', p_id);
  ELSIF p_action = 'restore_version' THEN
    IF p_id IS NULL OR p_version_no IS NULL THEN RAISE EXCEPTION 'id and version_no required'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT * INTO v_ver FROM docs_page_versions WHERE docs_page_id = p_id AND version_no = p_version_no;
    IF NOT FOUND THEN RAISE EXCEPTION 'version % not found for page %', p_version_no, p_id; END IF;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = p_id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (p_id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET title = v_ver.title, content = v_ver.content, category = v_ver.category,
      slug = v_ver.slug, frontmatter = v_ver.frontmatter, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'restore_version', 'id', p_id,
      'restored_from', p_version_no, 'snapshot_version', v_next);
  ELSE RAISE EXCEPTION 'unknown action: %', p_action; END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.manage_docs_page(p_action text, p_id uuid, p_title text, p_content text, p_category text, p_slug text, p_frontmatter jsonb, p_is_published boolean, p_version_no integer, p_editor uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_docs_page(p_action text, p_id uuid, p_title text, p_content text, p_category text, p_slug text, p_frontmatter jsonb, p_is_published boolean, p_version_no integer, p_editor uuid) TO authenticated, service_role;
