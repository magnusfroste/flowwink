-- Reports: who asked, as a person — and "Mine" as a lens (2026-11-04).
--
-- Reports are shared within the role matrix, like projects and every other
-- list: ownership is a lens and a label, never a security boundary
-- (docs/architecture/ownership-and-coverage.md). The versions already carry
-- the requester's NAME (requested_by, stamped by the platform); the lens needs
-- the person, so the report row now carries the first requester's user id,
-- set by agent-execute when a signed-in person asked for it. report_list takes
-- p_mine for the same filter over MCP. Nothing here narrows who may read.
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS requested_by_user_id uuid;
CREATE INDEX IF NOT EXISTS reports_requester_idx ON public.reports (requested_by_user_id);

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
    'requested_by_user_id', r.requested_by_user_id,
    'updated_at', r.updated_at, 'created_at', r.created_at,
    'url', '/admin/reports/' || r.slug
  );
$$;

-- The platform stamps the requester once: the person who first asked for the
-- report. A later version by someone else does not take it over — the lens
-- answers "what did I ask for", not "who wrote the last version".
CREATE OR REPLACE FUNCTION public.report_mark_requester(p_slug text, p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.reports SET requested_by_user_id = p_user
   WHERE slug = p_slug AND requested_by_user_id IS NULL AND p_user IS NOT NULL
     AND auth.role() = 'service_role';
$$;
REVOKE ALL ON FUNCTION public.report_mark_requester(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_mark_requester(text, uuid) TO service_role;

-- report_list gains p_mine; the seven-parameter overload goes, or a named call
-- that leaves p_mine out would match both.
DROP FUNCTION IF EXISTS public.report_list(text, text, boolean, text, text, integer, uuid);
CREATE OR REPLACE FUNCTION public.report_list(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_include_archived boolean DEFAULT false,
  p_subject_type text DEFAULT NULL,
  p_subject_id text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_viewer uuid DEFAULT NULL,
  p_mine boolean DEFAULT false
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
          -- "Mine" is a filter for a person; without a viewer there is no "me".
          AND (NOT coalesce(p_mine, false) OR (v_viewer IS NOT NULL AND r.requested_by_user_id = v_viewer))
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
REVOKE ALL ON FUNCTION public.report_list(text, text, boolean, text, text, integer, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_list(text, text, boolean, text, text, integer, uuid, boolean) TO authenticated, service_role;

-- Proof, rolled back: the requester is stamped once, and p_mine filters on it.
DO $$
DECLARE v_pub jsonb; v_u uuid := '00000000-0000-4000-8000-00000000aa01'; v_n int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_pub := public.report_publish('proof: mine', '# proof', 'markdown', 'proof-mine-lens');
    PERFORM public.report_mark_requester('proof-mine-lens', v_u);
    PERFORM public.report_mark_requester('proof-mine-lens', '00000000-0000-4000-8000-00000000aa02');
    SELECT count(*) INTO v_n FROM public.reports WHERE slug = 'proof-mine-lens' AND requested_by_user_id = v_u;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: the first requester should stay'; END IF;
    SELECT jsonb_array_length(public.report_list(p_viewer => NULL, p_mine => true) -> 'reports') INTO v_n;
    IF v_n <> 0 THEN RAISE EXCEPTION 'proof: p_mine without a viewer lists nothing, got %', v_n; END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $$;
