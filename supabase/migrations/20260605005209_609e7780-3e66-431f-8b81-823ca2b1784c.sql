CREATE OR REPLACE FUNCTION public.seed_demo_ecommerce(p_run_id uuid, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_products_created int := 0;
  v_order_id uuid;
  v_item_id uuid;
  v_prod_id uuid;
  v_product_ids uuid[];
  v_product_names text[];
  v_product_prices int[];
  rec record;
  prec record;
  v_idx int;
  v_pick_id uuid;
  v_pick_name text;
  v_pick_price int;
  v_qty int;
  v_total int;
BEGIN
  FOR prec IN
    SELECT * FROM (VALUES
      ('Demo: Starter Plan',      'Entry-level product for trying things out.',     49900),
      ('Demo: Pro Plan',          'Most popular — for growing teams.',              99900),
      ('Demo: Enterprise Plan',   'Advanced features for larger organisations.',   249900),
      ('Demo: Onboarding Pack',   'One-time onboarding workshop.',                  79900),
      ('Demo: Support Add-on',    'Priority support for one month.',                29900),
      ('Demo: Training Session',  'Two-hour live training with the team.',          59900)
    ) AS t(p_name, p_desc, p_price)
  LOOP
    INSERT INTO public.products (name, description, type, price_cents, currency, is_active, sort_order)
    VALUES (prec.p_name, prec.p_desc, 'one_time', prec.p_price, 'SEK', true, v_products_created)
    RETURNING id INTO v_prod_id;

    PERFORM public._demo_register_row(p_run_id, 'products', v_prod_id);
    v_products_created := v_products_created + 1;
  END LOOP;

  SELECT array_agg(id), array_agg(name), array_agg(price_cents)
    INTO v_product_ids, v_product_names, v_product_prices
  FROM (
    SELECT id, name, price_cents
    FROM public.products
    WHERE is_active = true AND price_cents > 0
    ORDER BY sort_order NULLS LAST, created_at
    LIMIT 6
  ) p;

  IF v_product_ids IS NULL OR array_length(v_product_ids, 1) = 0 THEN
    RETURN jsonb_build_object('products_created', v_products_created, 'orders_created', 0, 'skipped', 'no active products');
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      ('Anna Lindberg',    'anna.lindberg@example.demo',   'unfulfilled', 0),
      ('Erik Johansson',   'erik.j@example.demo',          'picked',      1),
      ('Sofia Bergström',  'sofia.b@example.demo',         'packed',      2),
      ('Lars Nilsson',     'lars.nilsson@example.demo',    'shipped',     4),
      ('Maria Andersson',  'maria.a@example.demo',         'delivered',   7)
    ) AS t(customer, email, fulfillment, days_ago)
  LOOP
    v_idx := (v_count % array_length(v_product_ids, 1)) + 1;
    v_pick_id := v_product_ids[v_idx];
    v_pick_name := v_product_names[v_idx];
    v_pick_price := v_product_prices[v_idx];
    v_qty := 1 + (v_count % 2);
    v_total := v_pick_price * v_qty;

    INSERT INTO public.orders (
      customer_email, customer_name, status, fulfillment_status,
      total_cents, currency, metadata, created_at,
      picked_at, packed_at, shipped_at, delivered_at,
      tracking_number, tracking_url
    ) VALUES (
      rec.email, rec.customer, 'paid', rec.fulfillment,
      v_total, 'SEK', jsonb_build_object('demo', true), now() - (rec.days_ago || ' days')::interval,
      CASE WHEN rec.fulfillment IN ('picked','packed','shipped','delivered') THEN now() - ((rec.days_ago - 0) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('packed','shipped','delivered') THEN now() - ((rec.days_ago - 0) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN now() - ((rec.days_ago - 1) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment = 'delivered' THEN now() - ((rec.days_ago - 2) || ' days')::interval ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN 'DEMO' || lpad((v_count + 1)::text, 6, '0') ELSE NULL END,
      CASE WHEN rec.fulfillment IN ('shipped','delivered') THEN 'https://tracking.example.demo/DEMO' || lpad((v_count + 1)::text, 6, '0') ELSE NULL END
    )
    RETURNING id INTO v_order_id;

    PERFORM public._demo_register_row(p_run_id, 'orders', v_order_id);

    -- order_items has columns: order_id, product_id, product_name, quantity, price_cents
    -- (no unit_price_cents / total_cents — those caused the prior failure)
    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, price_cents)
    VALUES (v_order_id, v_pick_id, v_pick_name, v_qty, v_pick_price)
    RETURNING id INTO v_item_id;

    PERFORM public._demo_register_row(p_run_id, 'order_items', v_item_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('products_created', v_products_created, 'orders_created', v_count);
END $function$;