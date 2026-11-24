-- One vote per conversation (2026-11-24).
--
-- bump_kb_article_feedback is open to visitors (the chat's "was this
-- helpful?") and counted every call: any number of slugs per call, any number
-- of calls. needs_improvement is set at three negatives, and the knowledge
-- base's workflow tells an agent to rewrite a flagged article — so a stranger
-- could flag every article and steer what the agent rewrites.
--
-- Now a vote counts once per chat session and article (chat_feedback.
-- kb_counted_slugs keeps which), and only when the session's own feedback row
-- cites the article (the chat writes that row first); at most five articles per call — what one answer cites. The old
-- two-argument form is dropped: without a session there is nothing to count
-- once.
--
-- chain_approval_satisfied answered a visitor whether an entity's approval
-- chain was satisfied. Its callers are the purchase-order and expense guards,
-- which run as the signed-in user: authenticated keeps it, anon does not.

DROP FUNCTION IF EXISTS public.bump_kb_article_feedback(text[], text);

-- Which articles a feedback row has already voted for: the vote is counted
-- once per session and article, and this is where "once" is kept.
ALTER TABLE public.chat_feedback ADD COLUMN IF NOT EXISTS kb_counted_slugs text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.bump_kb_article_feedback(p_slugs text[], p_rating text, p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text;
  v_updated int := 0;
  v_row uuid;
BEGIN
  IF p_rating NOT IN ('positive', 'negative') THEN
    RAISE EXCEPTION 'rating must be positive or negative';
  END IF;
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RETURN jsonb_build_object('success', true, 'updated', 0, 'reason', 'no_session');
  END IF;

  FOREACH v_slug IN ARRAY (p_slugs)[1:5] LOOP
    -- Counted already for this session? Then nothing.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.chat_feedback f
       WHERE f.session_id = p_session_id AND v_slug = ANY (f.kb_counted_slugs));
    -- The session's own feedback row that cites the article with this rating
    -- (the chat writes it before it calls here). None: no vote.
    SELECT f.id INTO v_row
      FROM public.chat_feedback f
     WHERE f.session_id = p_session_id
       AND f.rating = p_rating
       AND v_slug = ANY (f.context_kb_articles)
     ORDER BY f.created_at DESC
     LIMIT 1;
    CONTINUE WHEN v_row IS NULL;
    UPDATE public.chat_feedback SET kb_counted_slugs = array_append(kb_counted_slugs, v_slug) WHERE id = v_row;

    UPDATE public.kb_articles
    SET
      positive_feedback_count = coalesce(positive_feedback_count, 0)
        + CASE WHEN p_rating = 'positive' THEN 1 ELSE 0 END,
      negative_feedback_count = coalesce(negative_feedback_count, 0)
        + CASE WHEN p_rating = 'negative' THEN 1 ELSE 0 END,
      needs_improvement = (
        (coalesce(negative_feedback_count, 0) + CASE WHEN p_rating = 'negative' THEN 1 ELSE 0 END) >= 3
        OR (
          (coalesce(positive_feedback_count, 0) + coalesce(negative_feedback_count, 0) + 1) >= 5
          AND
          (coalesce(negative_feedback_count, 0) + CASE WHEN p_rating = 'negative' THEN 1 ELSE 0 END)::numeric
          / (coalesce(positive_feedback_count, 0) + coalesce(negative_feedback_count, 0) + 1) > 0.3
        )
      )
    WHERE slug = v_slug;
    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bump_kb_article_feedback(text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_kb_article_feedback(text[], text, text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.chain_approval_satisfied(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chain_approval_satisfied(text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.bump_kb_article_feedback(text[], text)') IS NOT NULL THEN
    RAISE EXCEPTION 'the uncounted two-argument vote is still there';
  END IF;
  IF has_function_privilege('anon', 'public.chain_approval_satisfied(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a visitor still reads approval state';
  END IF;
END $$;
