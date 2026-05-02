-- 1. get_order_status: public RPC for order lookup (replaces order-status edge function)
CREATE OR REPLACE FUNCTION public.get_order_status(p_id uuid, p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
  v_is_sandbox boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  -- Lightweight guest auth: if email passed, must match
  IF p_email IS NOT NULL AND lower(coalesce(v_order.customer_email, '')) <> lower(p_email) THEN
    RETURN jsonb_build_object('error', 'Order not found');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'product_name', oi.product_name,
    'quantity', oi.quantity,
    'price_cents', oi.price_cents
  )), '[]'::jsonb) INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_id;

  v_is_sandbox := coalesce((v_order.metadata->>'sandbox')::boolean, false);

  RETURN jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id,
      'status', v_order.status,
      'total_cents', v_order.total_cents,
      'currency', v_order.currency,
      'customer_name', v_order.customer_name,
      'customer_email', v_order.customer_email,
      'created_at', v_order.created_at,
      'updated_at', v_order.updated_at,
      'sandbox', v_is_sandbox
    ),
    'items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_status(uuid, text) TO anon, authenticated, service_role;

-- 2. bump_kb_article_feedback: public RPC for feedback counters (replaces update-kb-feedback)
CREATE OR REPLACE FUNCTION public.bump_kb_article_feedback(p_slugs text[], p_rating text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_updated int := 0;
BEGIN
  IF p_rating NOT IN ('positive', 'negative') THEN
    RAISE EXCEPTION 'rating must be positive or negative';
  END IF;

  FOREACH v_slug IN ARRAY p_slugs LOOP
    UPDATE public.kb_articles
    SET
      positive_feedback_count = coalesce(positive_feedback_count, 0)
        + CASE WHEN p_rating = 'positive' THEN 1 ELSE 0 END,
      negative_feedback_count = coalesce(negative_feedback_count, 0)
        + CASE WHEN p_rating = 'negative' THEN 1 ELSE 0 END,
      needs_improvement = (
        (coalesce(negative_feedback_count, 0) + CASE WHEN p_rating = 'negative' THEN 1 ELSE 0 END) >= 3
        OR (
          (coalesce(positive_feedback_count, 0) + coalesce(negative_feedback_count, 0)
            + CASE WHEN p_rating IN ('positive','negative') THEN 1 ELSE 0 END) >= 5
          AND
          (coalesce(negative_feedback_count, 0) + CASE WHEN p_rating = 'negative' THEN 1 ELSE 0 END)::numeric
          / NULLIF(
              (coalesce(positive_feedback_count, 0) + coalesce(negative_feedback_count, 0)
                + CASE WHEN p_rating IN ('positive','negative') THEN 1 ELSE 0 END), 0
            ) > 0.3
        )
      )
    WHERE slug = v_slug;
    IF FOUND THEN v_updated := v_updated + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_kb_article_feedback(text[], text) TO anon, authenticated, service_role;

-- 3. log_cache_invalidation: authenticated RPC for cache invalidation audit (replaces invalidate-cache)
CREATE OR REPLACE FUNCTION public.log_cache_invalidation(p_slug text DEFAULT NULL, p_all boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES (
    'cache_invalidate',
    'cache',
    coalesce(p_slug, 'all'),
    v_user_id,
    jsonb_build_object('slug', p_slug, 'all', p_all, 'timestamp', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN p_all THEN 'All page caches marked for invalidation'
                    ELSE 'Cache for "' || coalesce(p_slug, '') || '" marked for invalidation' END,
    'invalidated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_cache_invalidation(text, boolean) TO authenticated, service_role;