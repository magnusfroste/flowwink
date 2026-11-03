-- Reports — what an agent worked out, as a page a person opens (2026-11-03).
--
-- FlowPilot, Flowwork and an external agent over MCP all work things out:
-- a quarter's costs, a reconciliation, a pipeline review. Until now the answer
-- was a chat message that scrolled away. A report is that answer as a page:
-- a title, a description, a category, a body (markdown with a few report
-- blocks, or a full HTML page), versioned, behind the staff login.
--
-- The model is AgentReports' (magnusfroste/agentreports), with the business
-- around it:
--   * Agents can add, never take away. An agent publishes a report or a new
--     version of it and changes its details; only a person archives, restores
--     an old version or renames — and what a person renamed, an agent's next
--     version keeps (locked_fields).
--   * Every publish is a version; nothing is overwritten. Identical content
--     adds no version. A stale write (expected_version) is refused.
--   * Who may READ a report is the role matrix, not a password: the reports
--     module opens the page, and a report's audience_module (accounting, hr,
--     sales …) narrows it to the roles that module is granted to.
--   * A report can belong to something in the business (subject_type /
--     subject_id: a company, a deal, a project, a fiscal year).
--
-- Agents reach it through agent-execute (internal:reports), which stamps who
-- published — FlowPilot, Flowwork, or the external agent's name — and, for a
-- person at the keyboard, who asked. People act through the person_* functions
-- below, which refuse anyone who is not a signed-in person with the module.

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,118}[a-z0-9]$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text,
  category text,
  tags text[] NOT NULL DEFAULT '{}',
  audience_module text,
  subject_type text,
  subject_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  current_version integer NOT NULL DEFAULT 0,
  locked_fields text[] NOT NULL DEFAULT '{}',
  created_by text,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_category_idx ON public.reports (category);
CREATE INDEX IF NOT EXISTS reports_subject_idx ON public.reports (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS reports_updated_idx ON public.reports (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  format text NOT NULL CHECK (format IN ('markdown', 'html')),
  content text NOT NULL,
  content_sha text NOT NULL,
  note text,
  published_by text NOT NULL,
  published_by_kind text NOT NULL CHECK (published_by_kind IN ('flowpilot', 'flowwork', 'mcp', 'person', 'agent')),
  requested_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, version)
);
CREATE INDEX IF NOT EXISTS report_versions_report_idx ON public.report_versions (report_id, version DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_versions ENABLE ROW LEVEL SECURITY;

-- Who may read: the reports module, and the report's own audience module.
CREATE OR REPLACE FUNCTION public.can_read_report(_user_id uuid, _audience_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Answers for a PERSON. The service_role (agent-execute) never asks it for
  -- itself: it reads through report_list / report_read / report_version_list,
  -- passing the person at the keyboard as p_viewer, or nobody (FlowPilot, MCP).
  SELECT public.can_access_module(_user_id, 'reports')
     AND (_audience_module IS NULL OR public.can_access_module(_user_id, _audience_module));
$$;
REVOKE ALL ON FUNCTION public.can_read_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_report(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Readers see the reports their roles allow" ON public.reports;
CREATE POLICY "Readers see the reports their roles allow" ON public.reports
  FOR SELECT TO authenticated
  USING (public.can_read_report(auth.uid(), audience_module));

DROP POLICY IF EXISTS "Readers see the versions of reports they may read" ON public.report_versions;
CREATE POLICY "Readers see the versions of reports they may read" ON public.report_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_versions.report_id AND public.can_read_report(auth.uid(), r.audience_module)
  ));
-- No INSERT/UPDATE/DELETE policies: writes go through the functions below.

-- ── Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_slugify(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(btrim(regexp_replace(
    translate(lower(coalesce(p_text, '')), 'åäöéèüæø', 'aaoeeuao'),
    '[^a-z0-9]+', '-', 'g'), '-'), 120);
$$;

CREATE OR REPLACE FUNCTION public.report_card(r public.reports)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'slug', r.slug, 'title', r.title, 'description', r.description, 'category', r.category,
    'tags', r.tags, 'audience_module', r.audience_module,
    'subject_type', r.subject_type, 'subject_id', r.subject_id,
    'status', r.status, 'version', r.current_version, 'locked_fields', r.locked_fields,
    'updated_at', r.updated_at, 'created_at', r.created_at,
    'url', '/admin/reports/' || r.slug
  );
$$;

-- ── Agents: publish ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_publish(
  p_title text,
  p_content text,
  p_format text DEFAULT 'markdown',
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_tags text[] DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_requested_by text DEFAULT NULL,
  p_audience_module text DEFAULT NULL,
  p_subject_type text DEFAULT NULL,
  p_subject_id text DEFAULT NULL,
  p_published_by text DEFAULT NULL,
  p_published_by_kind text DEFAULT 'agent'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := public.report_slugify(coalesce(nullif(btrim(p_slug), ''), p_title));
  v_format text := lower(coalesce(nullif(btrim(p_format), ''), 'markdown'));
  v_sha text;
  v_r public.reports;
  v_last public.report_versions;
  v_kept text[] := '{}';
  v_warnings text[] := '{}';
  v_by text := coalesce(nullif(btrim(p_published_by), ''), 'agent');
  v_kind text := coalesce(nullif(btrim(p_published_by_kind), ''), 'agent');
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'reports')) THEN
    RAISE EXCEPTION 'Only the platform or staff with the Reports module can publish reports' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RETURN jsonb_build_object('error', 'title is required', 'code', 'MISSING_REQUIRED_PARAMETER', 'retryable', false);
  END IF;
  IF p_content IS NULL OR btrim(p_content) = '' THEN
    RETURN jsonb_build_object('error', 'content is required — the report body, markdown or a full HTML page', 'code', 'MISSING_REQUIRED_PARAMETER', 'retryable', false);
  END IF;
  IF v_format NOT IN ('markdown', 'html') THEN
    RETURN jsonb_build_object('error', 'format is markdown or html', 'code', 'INVALID_INPUT', 'retryable', false);
  END IF;
  IF octet_length(p_content) > 2 * 1024 * 1024 THEN
    RETURN jsonb_build_object('error', 'content is over 2 MB — split the report or link the data', 'code', 'INVALID_INPUT', 'retryable', false);
  END IF;
  IF length(v_slug) < 2 THEN
    RETURN jsonb_build_object('error', 'slug must have at least two letters or digits', 'code', 'INVALID_INPUT', 'retryable', false);
  END IF;
  IF p_audience_module IS NOT NULL AND p_audience_module !~ '^[a-zA-Z][a-zA-Z0-9]*$' THEN
    RETURN jsonb_build_object('error', 'audience_module is a module id such as accounting, hr, deals', 'code', 'INVALID_INPUT', 'retryable', false);
  END IF;
  IF v_kind NOT IN ('flowpilot', 'flowwork', 'mcp', 'person', 'agent') THEN v_kind := 'agent'; END IF;
  v_sha := encode(sha256(convert_to(v_format || E'\n' || p_content, 'UTF8')), 'hex');

  SELECT * INTO v_r FROM public.reports WHERE slug = v_slug FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.reports (slug, title, description, category, tags, audience_module, subject_type, subject_id, created_by)
    VALUES (v_slug, btrim(p_title), nullif(btrim(p_description), ''), nullif(btrim(p_category), ''),
            coalesce(p_tags, '{}'), nullif(btrim(p_audience_module), ''),
            nullif(btrim(p_subject_type), ''), nullif(btrim(p_subject_id), ''), v_by)
    RETURNING * INTO v_r;
  ELSE
    IF p_expected_version IS NOT NULL AND p_expected_version <> v_r.current_version THEN
      RETURN jsonb_build_object(
        'status', 'refused', 'code', 'STALE_VERSION', 'retryable', false,
        'hint', format('You built on version %s but the report is at version %s. Read it (read_report), merge, and publish with expected_version %s.', p_expected_version, v_r.current_version, v_r.current_version),
        'report', public.report_card(v_r));
    END IF;
    SELECT * INTO v_last FROM public.report_versions WHERE report_id = v_r.id ORDER BY version DESC LIMIT 1;
    IF FOUND AND v_last.content_sha = v_sha THEN
      RETURN jsonb_build_object('success', true, 'unchanged', true, 'slug', v_r.slug, 'version', v_r.current_version,
        'url', '/admin/reports/' || v_r.slug, 'note', 'Identical content — no new version was added.');
    END IF;
    -- What a person set is kept; the agent is told.
    IF 'title' = ANY (v_r.locked_fields) AND btrim(p_title) <> v_r.title THEN v_kept := array_append(v_kept, 'title'); END IF;
    IF 'description' = ANY (v_r.locked_fields) AND p_description IS NOT NULL AND p_description IS DISTINCT FROM v_r.description THEN v_kept := array_append(v_kept, 'description'); END IF;
    IF 'category' = ANY (v_r.locked_fields) AND p_category IS NOT NULL AND p_category IS DISTINCT FROM v_r.category THEN v_kept := array_append(v_kept, 'category'); END IF;
    UPDATE public.reports SET
      title = CASE WHEN 'title' = ANY (locked_fields) THEN title ELSE btrim(p_title) END,
      description = CASE WHEN 'description' = ANY (locked_fields) OR p_description IS NULL THEN description ELSE nullif(btrim(p_description), '') END,
      category = CASE WHEN 'category' = ANY (locked_fields) OR p_category IS NULL THEN category ELSE nullif(btrim(p_category), '') END,
      tags = coalesce(p_tags, tags),
      audience_module = coalesce(nullif(btrim(p_audience_module), ''), audience_module),
      subject_type = coalesce(nullif(btrim(p_subject_type), ''), subject_type),
      subject_id = coalesce(nullif(btrim(p_subject_id), ''), subject_id)
    WHERE id = v_r.id
    RETURNING * INTO v_r;
    IF v_r.status = 'archived' THEN
      v_warnings := array_append(v_warnings, 'A person archived this report; the new version is kept but the report stays archived until a person restores it.');
    END IF;
  END IF;

  UPDATE public.reports SET current_version = current_version + 1, updated_at = now()
  WHERE id = v_r.id RETURNING * INTO v_r;
  INSERT INTO public.report_versions (report_id, version, title, format, content, content_sha, note, published_by, published_by_kind, requested_by)
  VALUES (v_r.id, v_r.current_version, v_r.title, v_format, p_content, v_sha, nullif(btrim(p_note), ''), v_by, v_kind, nullif(btrim(p_requested_by), ''));

  IF array_length(v_kept, 1) > 0 THEN
    v_warnings := array_append(v_warnings, format('A person set %s; it was kept — your value was not applied.', array_to_string(v_kept, ', ')));
  END IF;

  RETURN jsonb_build_object('success', true, 'slug', v_r.slug, 'version', v_r.current_version,
    'url', '/admin/reports/' || v_r.slug, 'kept_person_fields', to_jsonb(v_kept), 'warnings', to_jsonb(v_warnings),
    'report', public.report_card(v_r));
END;
$$;
REVOKE ALL ON FUNCTION public.report_publish(text, text, text, text, text, text, text[], text, integer, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_publish(text, text, text, text, text, text, text[], text, integer, text, text, text, text, text, text) TO authenticated, service_role;

-- ── Agents: details without new content (never what a person set) ──────────
CREATE OR REPLACE FUNCTION public.report_update_details(
  p_slug text,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r public.reports;
  v_refused text[] := '{}';
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'reports')) THEN
    RAISE EXCEPTION 'Only the platform or staff with the Reports module can change report details' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.reports WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', format('No report with slug %s — list_reports shows the slugs', p_slug), 'code', 'NOT_FOUND', 'retryable', false);
  END IF;
  IF p_title IS NOT NULL AND 'title' = ANY (v_r.locked_fields) THEN v_refused := array_append(v_refused, 'title'); END IF;
  IF p_description IS NOT NULL AND 'description' = ANY (v_r.locked_fields) THEN v_refused := array_append(v_refused, 'description'); END IF;
  IF p_category IS NOT NULL AND 'category' = ANY (v_r.locked_fields) THEN v_refused := array_append(v_refused, 'category'); END IF;
  UPDATE public.reports SET
    title = CASE WHEN p_title IS NULL OR 'title' = ANY (locked_fields) OR btrim(p_title) = '' THEN title ELSE btrim(p_title) END,
    description = CASE WHEN p_description IS NULL OR 'description' = ANY (locked_fields) THEN description ELSE nullif(btrim(p_description), '') END,
    category = CASE WHEN p_category IS NULL OR 'category' = ANY (locked_fields) THEN category ELSE nullif(btrim(p_category), '') END,
    tags = coalesce(p_tags, tags),
    updated_at = now()
  WHERE id = v_r.id RETURNING * INTO v_r;
  RETURN jsonb_build_object('success', true, 'report', public.report_card(v_r),
    'not_changed', to_jsonb(v_refused),
    'hint', CASE WHEN array_length(v_refused, 1) > 0 THEN 'A person set those fields; only a person changes them now.' END);
END;
$$;
REVOKE ALL ON FUNCTION public.report_update_details(text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_update_details(text, text, text, text, text[]) TO authenticated, service_role;

-- ── Agents and people: read ────────────────────────────────────────────────
-- p_viewer is set by the platform (agent-execute) to the person at the
-- keyboard, never by a model: a Flowwork user sees what their roles allow.
CREATE OR REPLACE FUNCTION public.report_list(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_include_archived boolean DEFAULT false,
  p_subject_type text DEFAULT NULL,
  p_subject_id text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_viewer uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := CASE WHEN auth.role() = 'service_role' THEN p_viewer ELSE auth.uid() END;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'reports')) THEN
    RAISE EXCEPTION 'Only the platform or staff with the Reports module can list reports' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'reports', coalesce((
      SELECT jsonb_agg(public.report_card(r) ORDER BY r.updated_at DESC)
      FROM (
        SELECT * FROM public.reports r
        WHERE (p_include_archived OR r.status = 'active')
          AND (p_category IS NULL OR r.category = p_category)
          AND (p_subject_type IS NULL OR r.subject_type = p_subject_type)
          AND (p_subject_id IS NULL OR r.subject_id = p_subject_id)
          AND (p_search IS NULL OR r.title ILIKE '%' || p_search || '%' OR r.description ILIKE '%' || p_search || '%' OR p_search = ANY (r.tags))
          AND (v_viewer IS NULL OR public.can_read_report(v_viewer, r.audience_module))
        ORDER BY r.updated_at DESC
        LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
      ) r), '[]'::jsonb),
    'categories', coalesce((
      SELECT jsonb_agg(DISTINCT r.category) FROM public.reports r
      WHERE r.category IS NOT NULL AND r.status = 'active'
        AND (v_viewer IS NULL OR public.can_read_report(v_viewer, r.audience_module))), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.report_list(text, text, boolean, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_list(text, text, boolean, text, text, integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.report_read(
  p_slug text,
  p_version integer DEFAULT NULL,
  p_viewer uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := CASE WHEN auth.role() = 'service_role' THEN p_viewer ELSE auth.uid() END;
  v_r public.reports;
  v_v public.report_versions;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'reports')) THEN
    RAISE EXCEPTION 'Only the platform or staff with the Reports module can read reports' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.reports WHERE slug = p_slug;
  IF NOT FOUND OR (v_viewer IS NOT NULL AND NOT public.can_read_report(v_viewer, v_r.audience_module)) THEN
    RETURN jsonb_build_object('error', format('No report with slug %s that you may read — list_reports shows the slugs', p_slug), 'code', 'NOT_FOUND', 'retryable', false);
  END IF;
  SELECT * INTO v_v FROM public.report_versions
  WHERE report_id = v_r.id AND version = coalesce(p_version, v_r.current_version);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', format('Report %s has no version %s (it is at %s)', p_slug, p_version, v_r.current_version), 'code', 'NOT_FOUND', 'retryable', false);
  END IF;
  RETURN jsonb_build_object('report', public.report_card(v_r),
    'version', v_v.version, 'is_current', v_v.version = v_r.current_version,
    'format', v_v.format, 'content', v_v.content, 'note', v_v.note,
    'published_by', v_v.published_by, 'published_by_kind', v_v.published_by_kind,
    'requested_by', v_v.requested_by, 'published_at', v_v.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.report_read(text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_read(text, integer, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.report_version_list(p_slug text, p_viewer uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := CASE WHEN auth.role() = 'service_role' THEN p_viewer ELSE auth.uid() END;
  v_r public.reports;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'reports')) THEN
    RAISE EXCEPTION 'Only the platform or staff with the Reports module can read reports' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.reports WHERE slug = p_slug;
  IF NOT FOUND OR (v_viewer IS NOT NULL AND NOT public.can_read_report(v_viewer, v_r.audience_module)) THEN
    RETURN jsonb_build_object('error', format('No report with slug %s that you may read', p_slug), 'code', 'NOT_FOUND', 'retryable', false);
  END IF;
  RETURN jsonb_build_object('report', public.report_card(v_r), 'versions', coalesce((
    SELECT jsonb_agg(jsonb_build_object('version', v.version, 'title', v.title, 'format', v.format,
      'note', v.note, 'published_by', v.published_by, 'published_by_kind', v.published_by_kind,
      'requested_by', v.requested_by, 'published_at', v.created_at) ORDER BY v.version DESC)
    FROM public.report_versions v WHERE v.report_id = v_r.id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.report_version_list(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_version_list(text, uuid) TO authenticated, service_role;

-- ── People only: archive, restore a version, rename ────────────────────────
-- The service role is refused on purpose: no skill reaches these, and the
-- line "agents add, never take away" is drawn here, not in a prompt.
CREATE OR REPLACE FUNCTION public.report_person_archive(p_slug text, p_archived boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_r public.reports;
BEGIN
  -- Agents add, never take away: the service_role (every agent rail) is
  -- refused by name, not merely by lacking auth.uid().
  IF auth.role() = 'service_role' THEN
    RAISE EXCEPTION 'Only a person archives — agents publish new versions instead' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_module(auth.uid(), 'reports') THEN
    RAISE EXCEPTION 'Only a signed-in person with the Reports module archives a report' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.reports WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND OR NOT public.can_read_report(auth.uid(), v_r.audience_module) THEN
    RAISE EXCEPTION 'No report %', p_slug USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE public.reports SET
    status = CASE WHEN p_archived THEN 'archived' ELSE 'active' END,
    archived_at = CASE WHEN p_archived THEN now() END,
    archived_by = CASE WHEN p_archived THEN auth.uid() END
  WHERE id = v_r.id RETURNING * INTO v_r;
  RETURN public.report_card(v_r);
END;
$$;
REVOKE ALL ON FUNCTION public.report_person_archive(text, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.report_person_archive(text, boolean) TO authenticated;

-- Restoring publishes the old content again as the newest version: even a
-- restore loses nothing.
CREATE OR REPLACE FUNCTION public.report_person_restore_version(p_slug text, p_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r public.reports;
  v_v public.report_versions;
  v_name text;
BEGIN
  -- Agents add, never take away: the service_role (every agent rail) is
  -- refused by name, not merely by lacking auth.uid().
  IF auth.role() = 'service_role' THEN
    RAISE EXCEPTION 'Only a person restores a version — agents publish new versions instead' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_module(auth.uid(), 'reports') THEN
    RAISE EXCEPTION 'Only a signed-in person with the Reports module restores a version' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.reports WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND OR NOT public.can_read_report(auth.uid(), v_r.audience_module) THEN
    RAISE EXCEPTION 'No report %', p_slug USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_v FROM public.report_versions WHERE report_id = v_r.id AND version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report % has no version %', p_slug, p_version USING ERRCODE = 'no_data_found'; END IF;
  SELECT coalesce(nullif(btrim(full_name), ''), email) INTO v_name FROM public.profiles WHERE id = auth.uid();
  UPDATE public.reports SET current_version = current_version + 1, updated_at = now()
  WHERE id = v_r.id RETURNING * INTO v_r;
  INSERT INTO public.report_versions (report_id, version, title, format, content, content_sha, note, published_by, published_by_kind)
  VALUES (v_r.id, v_r.current_version, v_v.title, v_v.format, v_v.content, v_v.content_sha,
          format('Restored version %s', p_version), coalesce(v_name, 'a person'), 'person');
  RETURN public.report_card(v_r);
END;
$$;
REVOKE ALL ON FUNCTION public.report_person_restore_version(text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.report_person_restore_version(text, integer) TO authenticated;

-- A person's title, description or category is locked: the agent's next
-- version keeps it. p_unlock hands named fields back to the agents.
CREATE OR REPLACE FUNCTION public.report_person_set_details(
  p_slug text,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_unlock text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_r public.reports;
  v_lock text[];
BEGIN
  -- Agents add, never take away: the service_role (every agent rail) is
  -- refused by name, not merely by lacking auth.uid().
  IF auth.role() = 'service_role' THEN
    RAISE EXCEPTION 'Only a person renames a report — agents publish new versions instead' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_module(auth.uid(), 'reports') THEN
    RAISE EXCEPTION 'Only a signed-in person with the Reports module renames a report' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM public.reports WHERE slug = p_slug FOR UPDATE;
  IF NOT FOUND OR NOT public.can_read_report(auth.uid(), v_r.audience_module) THEN
    RAISE EXCEPTION 'No report %', p_slug USING ERRCODE = 'no_data_found';
  END IF;
  v_lock := v_r.locked_fields;
  IF p_title IS NOT NULL AND btrim(p_title) <> '' AND btrim(p_title) <> v_r.title THEN
    v_r.title := btrim(p_title); v_lock := array_append(array_remove(v_lock, 'title'), 'title');
  END IF;
  IF p_description IS NOT NULL AND p_description IS DISTINCT FROM coalesce(v_r.description, '') THEN
    v_r.description := nullif(btrim(p_description), ''); v_lock := array_append(array_remove(v_lock, 'description'), 'description');
  END IF;
  IF p_category IS NOT NULL AND p_category IS DISTINCT FROM coalesce(v_r.category, '') THEN
    v_r.category := nullif(btrim(p_category), ''); v_lock := array_append(array_remove(v_lock, 'category'), 'category');
  END IF;
  IF p_unlock IS NOT NULL THEN
    SELECT coalesce(array_agg(f), '{}') INTO v_lock FROM unnest(v_lock) f WHERE NOT (f = ANY (p_unlock));
  END IF;
  UPDATE public.reports SET title = v_r.title, description = v_r.description, category = v_r.category,
    locked_fields = v_lock, updated_at = now()
  WHERE id = v_r.id RETURNING * INTO v_r;
  RETURN public.report_card(v_r);
END;
$$;
REVOKE ALL ON FUNCTION public.report_person_set_details(text, text, text, text, text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.report_person_set_details(text, text, text, text, text[]) TO authenticated;

-- ── The role matrix: every functional role may open Reports ────────────────
-- What each role then SEES is narrowed per report by its audience_module, so
-- the page itself is safe to hand to every staff role. Platform config: the
-- defaults are seeded, and a live matrix that already carries a role gets it.
INSERT INTO public.role_module_access_defaults (role, module_id)
SELECT r.role::public.app_role, 'reports'
FROM (VALUES ('sales'), ('hr'), ('accounting'), ('support'), ('warehouse'), ('marketing'), ('purchasing'), ('projects')) AS r(role)
ON CONFLICT DO NOTHING;
INSERT INTO public.role_module_access (role, module_id)
SELECT d.role, d.module_id FROM public.role_module_access_defaults d
WHERE d.module_id = 'reports'
  AND EXISTS (SELECT 1 FROM public.role_module_access a WHERE a.role = d.role)
ON CONFLICT DO NOTHING;
