-- ============================================================================
-- The purchase is confirmed to the one who bought (2026-11-19).
--
-- Found by buying in the shop in a browser, as a visitor with no account: the
-- page after the purchase said "Awaiting payment…" and stayed there — for a
-- paid order. It read `orders` directly, and a visitor may read no order (the
-- rows are their owner's: user_id, or the account's confirmed address). The
-- same page serves the return from Stripe, so every guest purchase ended on
-- "Awaiting payment…", paid or not.
--
-- get_order_confirmation answers whoever holds the order's own key — its id
-- (what the test-mode checkout returns) or its Stripe checkout session (what
-- Stripe returns the buyer with) — with what the confirmation shows and
-- nothing more: no address, no phone, no internal field.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_order_confirmation(p_order_id uuid DEFAULT NULL, p_session_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Answers the holder of the order's key only (token_is_plausible refuses a
  -- short or empty session id); NULL otherwise.
  SELECT jsonb_build_object(
           'id', o.id,
           'status', o.status,
           'total_cents', o.total_cents,
           'currency', o.currency,
           'customer_email', o.customer_email,
           'customer_name', o.customer_name,
           'created_at', o.created_at,
           'items', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', i.id, 'product_name', i.product_name, 'quantity', i.quantity, 'price_cents', i.price_cents)
                    ORDER BY i.created_at, i.id)
               FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
    FROM public.orders o
   WHERE (p_order_id IS NOT NULL AND o.id = p_order_id)
      OR (p_order_id IS NULL AND public.token_is_plausible(p_session_id)
          AND o.stripe_checkout_id IS NOT NULL AND o.stripe_checkout_id = btrim(p_session_id))
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_order_confirmation(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_confirmation(uuid, text) TO anon, authenticated, service_role;

-- ── Proof: reads only ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_row record;
  v jsonb;
BEGIN
  IF public.get_order_confirmation(NULL, NULL) IS NOT NULL
     OR public.get_order_confirmation(NULL, '') IS NOT NULL
     OR public.get_order_confirmation(NULL, 'short') IS NOT NULL
     OR public.get_order_confirmation(gen_random_uuid(), NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'get_order_confirmation answered a key no order holds';
  END IF;
  SELECT id INTO v_row FROM public.orders LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'order confirmation: no order on this instance, the read is proven on the next one made';
    RETURN;
  END IF;
  v := public.get_order_confirmation(v_row.id, NULL);
  IF v IS NULL OR (v->>'id')::uuid <> v_row.id OR NOT (v ? 'items')
     OR v ? 'shipping_address' OR v ? 'customer_phone' OR v ? 'metadata' THEN
    RAISE EXCEPTION 'get_order_confirmation did not answer its holder as it should: %', v;
  END IF;
END $$;
