-- KB parity round 8: article version history + feedback analytics skill surface.
-- Mirrors the wiki_page_revisions pattern (20260708070000). Idempotent, forward-dated.

-- ============================================================
-- 1. ARTICLE VERSION HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.kb_article_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  question text NOT NULL,
  answer_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_text text,
  category_id uuid,
  revision_no integer NOT NULL,
  action text NOT NULL DEFAULT 'update',
  edited_by uuid,
  revised_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kb_article_revisions_article_idx
  ON public.kb_article_revisions (article_id, revision_no DESC);
CREATE INDEX IF NOT EXISTS kb_article_revisions_slug_idx
  ON public.kb_article_revisions (slug, revision_no DESC);

ALTER TABLE public.kb_article_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kb_revisions_admin_read" ON public.kb_article_revisions;
CREATE POLICY "kb_revisions_admin_read" ON public.kb_article_revisions
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_kb_article_revision()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.question IS NOT DISTINCT FROM NEW.question
     AND OLD.answer_json IS NOT DISTINCT FROM NEW.answer_json
     AND OLD.answer_text IS NOT DISTINCT FROM NEW.answer_text
     AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW; -- metadata-only change (views, feedback counts, publish flags) — no revision
  END IF;
  INSERT INTO public.kb_article_revisions
    (article_id, slug, title, question, answer_json, answer_text, category_id,
     revision_no, action, edited_by)
  VALUES (OLD.id, OLD.slug, OLD.title, OLD.question, OLD.answer_json, OLD.answer_text,
          OLD.category_id,
          (SELECT COALESCE(MAX(revision_no), 0) + 1
           FROM public.kb_article_revisions WHERE article_id = OLD.id),
          lower(TG_OP), auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_kb_articles_revision ON public.kb_articles;
CREATE TRIGGER trg_kb_articles_revision
  BEFORE UPDATE OR DELETE ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.log_kb_article_revision();

CREATE OR REPLACE FUNCTION public.kb_article_history(
  p_action text,
  p_slug text DEFAULT NULL,
  p_article_id uuid DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rev public.kb_article_revisions;
  v_rows jsonb;
  v_cat uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can access KB article history';
  END IF;

  IF p_action = 'list' THEN
    IF p_slug IS NULL AND p_article_id IS NULL THEN
      RAISE EXCEPTION 'list requires p_slug or p_article_id';
    END IF;
    SELECT COALESCE(jsonb_agg(r ORDER BY r.revision_no DESC), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, article_id, slug, title, question, revision_no, action, edited_by, revised_at,
             length(COALESCE(answer_text, '')) AS answer_length
      FROM public.kb_article_revisions
      WHERE (p_article_id IS NOT NULL AND article_id = p_article_id)
         OR (p_article_id IS NULL AND slug = p_slug)
      ORDER BY revision_no DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    ) r;
    RETURN jsonb_build_object('success', true, 'revisions', v_rows);

  ELSIF p_action = 'get' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'get requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.kb_article_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    RETURN jsonb_build_object('success', true, 'revision', to_jsonb(v_rev));

  ELSIF p_action = 'restore' THEN
    IF p_revision_id IS NULL THEN RAISE EXCEPTION 'restore requires p_revision_id'; END IF;
    SELECT * INTO v_rev FROM public.kb_article_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision % not found', p_revision_id; END IF;
    UPDATE public.kb_articles
      SET title = v_rev.title, question = v_rev.question, answer_json = v_rev.answer_json,
          answer_text = v_rev.answer_text, updated_at = now(), updated_by = auth.uid()
      WHERE id = v_rev.article_id;
    IF NOT FOUND THEN
      -- Article was deleted — recreate it (fall back to any category if the original is gone).
      SELECT id INTO v_cat FROM public.kb_categories WHERE id = v_rev.category_id;
      IF v_cat IS NULL THEN
        SELECT id INTO v_cat FROM public.kb_categories ORDER BY created_at LIMIT 1;
      END IF;
      IF v_cat IS NULL THEN
        RAISE EXCEPTION 'Cannot restore: no KB categories exist';
      END IF;
      INSERT INTO public.kb_articles
        (id, category_id, title, slug, question, answer_json, answer_text, is_published, created_by, updated_by)
      VALUES (v_rev.article_id, v_cat, v_rev.title, v_rev.slug, v_rev.question,
              v_rev.answer_json, v_rev.answer_text, false, auth.uid(), auth.uid());
    END IF;
    RETURN jsonb_build_object('success', true, 'slug', v_rev.slug,
      'restored_revision_no', v_rev.revision_no);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|get|restore', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_article_history(text, text, uuid, uuid, integer) TO authenticated, service_role;

-- ============================================================
-- 2. FEEDBACK ANALYTICS (over existing positive/negative counters)
-- ============================================================
CREATE OR REPLACE FUNCTION public.kb_feedback_report(
  p_action text DEFAULT 'report',
  p_slug text DEFAULT NULL,
  p_limit integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_rows jsonb;
  v_article public.kb_articles;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can view KB feedback analytics';
  END IF;

  IF p_action = 'report' THEN
    SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT jsonb_build_object(
        'slug', slug, 'title', title,
        'positive', positive_feedback_count, 'negative', negative_feedback_count,
        'total', positive_feedback_count + negative_feedback_count,
        'negative_ratio', CASE WHEN positive_feedback_count + negative_feedback_count > 0
          THEN round(negative_feedback_count::numeric
                     / (positive_feedback_count + negative_feedback_count), 2) END,
        'needs_improvement', needs_improvement,
        'views', views_count, 'is_published', is_published) AS r
      FROM public.kb_articles
      WHERE positive_feedback_count + negative_feedback_count > 0
      ORDER BY needs_improvement DESC,
               (CASE WHEN positive_feedback_count + negative_feedback_count > 0
                     THEN negative_feedback_count::numeric
                          / (positive_feedback_count + negative_feedback_count) ELSE 0 END) DESC,
               negative_feedback_count DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    ) t;
    RETURN jsonb_build_object('success', true, 'articles', v_rows,
      'totals', (SELECT jsonb_build_object(
        'articles_with_feedback', count(*) FILTER (WHERE positive_feedback_count + negative_feedback_count > 0),
        'flagged_needs_improvement', count(*) FILTER (WHERE needs_improvement),
        'total_positive', COALESCE(sum(positive_feedback_count), 0),
        'total_negative', COALESCE(sum(negative_feedback_count), 0))
        FROM public.kb_articles));

  ELSIF p_action = 'list_flagged' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'slug', slug, 'title', title, 'positive', positive_feedback_count,
      'negative', negative_feedback_count, 'views', views_count)
      ORDER BY negative_feedback_count DESC), '[]'::jsonb) INTO v_rows
    FROM public.kb_articles WHERE needs_improvement;
    RETURN jsonb_build_object('success', true, 'flagged', v_rows);

  ELSIF p_action = 'clear_flag' THEN
    IF p_slug IS NULL THEN RAISE EXCEPTION 'clear_flag requires p_slug'; END IF;
    UPDATE public.kb_articles SET needs_improvement = false, updated_at = now()
      WHERE slug = p_slug RETURNING * INTO v_article;
    IF v_article.id IS NULL THEN RAISE EXCEPTION 'Article % not found', p_slug; END IF;
    RETURN jsonb_build_object('success', true, 'slug', p_slug, 'needs_improvement', false);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use report|list_flagged|clear_flag', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kb_feedback_report(text, text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
