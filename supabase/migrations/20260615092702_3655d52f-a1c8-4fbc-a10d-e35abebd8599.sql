-- docs module → L4: in-app authoring (doc_crud), public/private visibility, versioning.
--
-- Until now docs_pages was GitHub-sync-only (repo_owner/repo_name/file_path NOT NULL,
-- no visibility flag, no in-app history). This migration adds:
--   1. source + nullable repo fields  → app-authored docs can coexist with synced ones
--   2. is_published                    → public/private visibility (RLS-enforced)
--   3. docs_page_versions + RPC        → in-app version history with atomic snapshot
--
-- Idempotent: IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE throughout.

-- 1) Schema: distinguish app-authored docs and relax GitHub-only NOT NULLs ----------
ALTER TABLE "public"."docs_pages" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'github';
ALTER TABLE "public"."docs_pages" ADD COLUMN IF NOT EXISTS "is_published" boolean NOT NULL DEFAULT true;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "repo_owner" DROP NOT NULL;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "repo_name"  DROP NOT NULL;
ALTER TABLE "public"."docs_pages" ALTER COLUMN "file_path"  DROP NOT NULL;

-- 2) public/private: only published docs are visible to anon/non-admin. Admins keep
--    full access via the existing "Admins can manage docs pages" FOR ALL policy.
DROP POLICY IF EXISTS "Public can read docs pages" ON "public"."docs_pages";
CREATE POLICY "Public can read docs pages" ON "public"."docs_pages"
  FOR SELECT TO "authenticated", "anon" USING ("is_published" = true);

-- 3) Version history -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."docs_page_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "docs_page_id" uuid NOT NULL REFERENCES "public"."docs_pages"("id") ON DELETE CASCADE,
  "version_no" integer NOT NULL,
  "title" text NOT NULL DEFAULT '',
  "content" text NOT NULL DEFAULT '',
  "category" text,
  "slug" text,
  "frontmatter" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "edited_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("docs_page_id", "version_no")
);
ALTER TABLE "public"."docs_page_versions" OWNER TO "postgres";
CREATE INDEX IF NOT EXISTS "idx_docs_page_versions_page" ON "public"."docs_page_versions" ("docs_page_id", "version_no" DESC);

ALTER TABLE "public"."docs_page_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage docs versions" ON "public"."docs_page_versions";
CREATE POLICY "Admins manage docs versions" ON "public"."docs_page_versions"
  TO "authenticated"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))
  WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));

-- 4) manage_docs_page RPC — create / update / delete / restore_version --------------
--    Transactional: update & restore snapshot the current row into docs_page_versions
--    BEFORE mutating, so history is never lost. SECURITY DEFINER (writes bypass RLS);
--    EXECUTE granted to service_role (agent/MCP path) + authenticated (admin UI).
CREATE OR REPLACE FUNCTION "public"."manage_docs_page"(
  "p_action" text,
  "p_id" uuid DEFAULT NULL,
  "p_title" text DEFAULT NULL,
  "p_content" text DEFAULT NULL,
  "p_category" text DEFAULT NULL,
  "p_slug" text DEFAULT NULL,
  "p_frontmatter" jsonb DEFAULT NULL,
  "p_is_published" boolean DEFAULT NULL,
  "p_version_no" integer DEFAULT NULL,
  "p_editor" uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row docs_pages%ROWTYPE;
  v_ver docs_page_versions%ROWTYPE;
  v_slug text;
  v_next integer;
BEGIN
  IF p_action IS NULL OR btrim(p_action) = '' THEN
    RAISE EXCEPTION 'action required (create|update|delete|restore_version)';
  END IF;

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
                              'id', v_row.id, 'slug', v_row.slug, 'category', v_row.category,
                              'is_published', v_row.is_published);

  ELSIF p_action = 'update' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for update'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = v_row.id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (v_row.id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET
      title        = COALESCE(p_title, title),
      content      = COALESCE(p_content, content),
      category     = COALESCE(NULLIF(btrim(p_category), ''), category),
      slug         = COALESCE(NULLIF(btrim(p_slug), ''), slug),
      frontmatter  = COALESCE(p_frontmatter, frontmatter),
      is_published = COALESCE(p_is_published, is_published),
      updated_at   = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'update', 'id', v_row.id,
                              'snapshot_version', v_next, 'is_published', v_row.is_published);

  ELSIF p_action = 'delete' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'id required for delete'; END IF;
    DELETE FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    RETURN jsonb_build_object('success', true, 'action', 'delete', 'id', p_id);

  ELSIF p_action = 'restore_version' THEN
    IF p_id IS NULL OR p_version_no IS NULL THEN RAISE EXCEPTION 'id and version_no required for restore_version'; END IF;
    SELECT * INTO v_row FROM docs_pages WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'docs page % not found', p_id; END IF;
    SELECT * INTO v_ver FROM docs_page_versions WHERE docs_page_id = p_id AND version_no = p_version_no;
    IF NOT FOUND THEN RAISE EXCEPTION 'version % not found for page %', p_version_no, p_id; END IF;
    -- snapshot current state first, then restore the chosen version
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next FROM docs_page_versions WHERE docs_page_id = p_id;
    INSERT INTO docs_page_versions (docs_page_id, version_no, title, content, category, slug, frontmatter, edited_by)
    VALUES (p_id, v_next, v_row.title, v_row.content, v_row.category, v_row.slug, v_row.frontmatter, p_editor);
    UPDATE docs_pages SET
      title = v_ver.title, content = v_ver.content, category = v_ver.category,
      slug = v_ver.slug, frontmatter = v_ver.frontmatter, updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'action', 'restore_version', 'id', p_id,
                              'restored_from', p_version_no, 'snapshot_version', v_next);

  ELSE
    RAISE EXCEPTION 'unknown action: % (expected create|update|delete|restore_version)', p_action;
  END IF;
END;
$$;

ALTER FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION "public"."manage_docs_page"(text, uuid, text, text, text, text, jsonb, boolean, integer, uuid) TO "authenticated";
