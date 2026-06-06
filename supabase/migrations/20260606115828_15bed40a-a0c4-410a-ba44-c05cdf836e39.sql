
CREATE OR REPLACE FUNCTION public.seed_demo_blog(p_run_id uuid, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_post_id uuid;
  v_count int := 0;
  v_posts jsonb := jsonb_build_array(
    jsonb_build_object(
      'title', 'Why I drafted this quote at 03:14',
      'slug', 'demo-quote-0314',
      'excerpt', 'A short note from FlowPilot on why the night shift matters.',
      'body', 'A lead came in from the contact form at 03:11. By 03:14 the quote was drafted and waiting in the approval queue. Buyers research at odd hours — if the next morning starts with a polished quote in their inbox, the conversation has already moved forward.',
      'image_seed', 'flowpilot-night-shift',
      'image_alt', 'A dim desk lamp glowing over a keyboard at night'
    ),
    jsonb_build_object(
      'title', 'Three leads, one afternoon',
      'slug', 'demo-three-leads',
      'excerpt', 'How FlowPilot triaged a sudden burst of inbound traffic.',
      'body', 'Three forms hit within twenty minutes. Each one got enriched, scored, and routed within seconds. The smallest deal turned out to be the most interesting — sometimes the obvious lead is not the right one.',
      'image_seed', 'flowpilot-three-leads',
      'image_alt', 'A scattered set of paper notes arranged on a wooden table'
    ),
    jsonb_build_object(
      'title', 'What an autonomous operator actually does all day',
      'slug', 'demo-operator-day',
      'excerpt', 'A walkthrough of the heartbeat loop.',
      'body', 'Every minute the heartbeat fires. It checks objectives, reviews open work, and either acts or waits. Most of the day is waiting. The interesting moments are when a signal arrives and the loop turns into action.',
      'image_seed', 'flowpilot-heartbeat',
      'image_alt', 'A clean, minimal control room with soft monitor light'
    )
  );
  v_post jsonb;
BEGIN
  FOR v_post IN SELECT * FROM jsonb_array_elements(v_posts) LOOP
    INSERT INTO public.blog_posts (title, slug, excerpt, content_json, status, published_at, featured_image, featured_image_alt)
    VALUES (
      v_post->>'title',
      v_post->>'slug' || '-' || substring(p_run_id::text, 1, 6),
      v_post->>'excerpt',
      jsonb_build_object(
        'type', 'doc',
        'content', jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(
              jsonb_build_object('type', 'text', 'text', v_post->>'body')
            )
          )
        )
      ),
      'published',
      now(),
      'https://picsum.photos/seed/' || (v_post->>'image_seed') || '/1200/630',
      v_post->>'image_alt'
    )
    RETURNING id INTO v_post_id;

    PERFORM public._demo_register_row(p_run_id, 'blog_posts', v_post_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('blog_posts_created', v_count);
END $function$;

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
  v_total int;
BEGIN
  FOR prec IN
    SELECT * FROM (VALUES
      ('Demo: Starter Plan',      'Entry-level product for trying things out.',     49900, 'demo-starter-plan'),
      ('Demo: Pro Plan',          'Most popular — for growing teams.',              99900, 'demo-pro-plan'),
      ('Demo: Enterprise Plan',   'Advanced features for larger organisations.',   249900, 'demo-enterprise-plan'),
      ('Demo: Onboarding Pack',   'One-time onboarding workshop.',                  79900, 'demo-onboarding-pack'),
      ('Demo: Support Add-on',    'Priority support for one month.',                29900, 'demo-support-addon'),
      ('Demo: Training Session',  'Two-hour live training with the team.',          59900, 'demo-training-session')
    ) AS t(p_name, p_desc, p_price, p_seed)
  LOOP
    INSERT INTO public.products (name, description, type, price_cents, currency, is_active, sort_order, image_url)
    VALUES (
      prec.p_name, prec.p_desc, 'one_time', prec.p_price, 'SEK', true, v_products_created,
      'https://picsum.photos/seed/' || prec.p_seed || '/800/600'
    )
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
    v_total := v_pick_price * (1 + (v_count % 2));

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

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price_cents, total_cents)
    VALUES (v_order_id, v_pick_id, v_pick_name, 1 + (v_count % 2), v_pick_price, v_total)
    RETURNING id INTO v_item_id;

    PERFORM public._demo_register_row(p_run_id, 'order_items', v_item_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('products_created', v_products_created, 'orders_created', v_count);
END $function$;
