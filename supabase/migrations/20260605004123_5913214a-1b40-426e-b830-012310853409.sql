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
      'body', 'A lead came in from the contact form at 03:11. By 03:14 the quote was drafted and waiting in the approval queue. Buyers research at odd hours — if the next morning starts with a polished quote in their inbox, the conversation has already moved forward.'
    ),
    jsonb_build_object(
      'title', 'Three leads, one afternoon',
      'slug', 'demo-three-leads',
      'excerpt', 'How FlowPilot triaged a sudden burst of inbound traffic.',
      'body', 'Three forms hit within twenty minutes. Each one got enriched, scored, and routed within seconds. The smallest deal turned out to be the most interesting — sometimes the obvious lead is not the right one.'
    ),
    jsonb_build_object(
      'title', 'What an autonomous operator actually does all day',
      'slug', 'demo-operator-day',
      'excerpt', 'A walkthrough of the heartbeat loop.',
      'body', 'Every minute the heartbeat fires. It checks objectives, reviews open work, and either acts or waits. Most of the day is waiting. The interesting moments are when a signal arrives and the loop turns into action.'
    )
  );
  v_post jsonb;
BEGIN
  FOR v_post IN SELECT * FROM jsonb_array_elements(v_posts) LOOP
    INSERT INTO public.blog_posts (title, slug, excerpt, content_json, status, published_at)
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
      now()
    )
    RETURNING id INTO v_post_id;

    PERFORM public._demo_register_row(p_run_id, 'blog_posts', v_post_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('blog_posts_created', v_count);
END $function$;

CREATE OR REPLACE FUNCTION public.seed_demo_kb(p_run_id uuid, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cat_id uuid;
  v_art_id uuid;
  v_arts jsonb := jsonb_build_array(
    jsonb_build_object('title', 'How FlowPilot decides what to do next', 'slug', 'demo-how-flowpilot-decides',
      'question', 'How does FlowPilot decide what to do next?',
      'answer', 'FlowPilot scores skills against the current intent and runs the highest match. Objectives and recent activity tilt the ranking.'),
    jsonb_build_object('title', 'When does a draft become a real action?', 'slug', 'demo-draft-vs-action',
      'question', 'When does a draft become a real action?',
      'answer', 'Drafts wait in the approval queue. A human reviews and either approves, edits, or rejects. Approved actions execute immediately.'),
    jsonb_build_object('title', 'Hourly reset — what stays and what resets', 'slug', 'demo-hourly-reset',
      'question', 'What stays and what resets each hour?',
      'answer', 'Static content (pages, blog, KB, products) is permanent. Dynamic data (leads, quotes, invoices) resets every hour via demo cycles.')
  );
  v_art jsonb;
  v_count int := 0;
BEGIN
  INSERT INTO public.kb_categories (name, slug, description, sort_order)
  VALUES ('Demo: How FlowPilot works', 'demo-flowpilot-' || substring(p_run_id::text, 1, 6),
          'Walkthroughs of the autonomous operator.', 100)
  RETURNING id INTO v_cat_id;

  PERFORM public._demo_register_row(p_run_id, 'kb_categories', v_cat_id);

  FOR v_art IN SELECT * FROM jsonb_array_elements(v_arts) LOOP
    INSERT INTO public.kb_articles (title, slug, question, answer_text, category_id, is_published)
    VALUES (
      v_art->>'title',
      v_art->>'slug' || '-' || substring(p_run_id::text, 1, 6),
      v_art->>'question',
      v_art->>'answer',
      v_cat_id,
      true
    )
    RETURNING id INTO v_art_id;

    PERFORM public._demo_register_row(p_run_id, 'kb_articles', v_art_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('kb_category_created', 1, 'kb_articles_created', v_count);
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

CREATE OR REPLACE FUNCTION public.reset_module_data(p_module text, p_dry_run boolean DEFAULT true, p_run_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  PROTECTED_TABLES text[] := ARRAY[
    'pages','agent_skills','agent_objectives','agent_memory','site_settings','contract_templates',
    'quote_templates','locale_packs','user_roles','profiles'
  ];
  v_module text;
  v_counts jsonb := '{}'::jsonb;
  v_tbl text;
  v_count int;
  v_total int := 0;
  v_sql text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can reset demo data';
  END IF;

  v_module := lower(trim(p_module));

  FOR v_tbl, v_count IN
    SELECT i.table_name, count(*)::int
    FROM public.demo_run_items i
    JOIN public.demo_runs r ON r.id = i.run_id
    WHERE (v_module = 'all' OR r.module = v_module)
      AND (p_run_id IS NULL OR r.id = p_run_id)
    GROUP BY i.table_name
  LOOP
    IF v_tbl = ANY(PROTECTED_TABLES) THEN
      CONTINUE;
    END IF;
    v_counts := v_counts || jsonb_build_object(v_tbl, v_count);
    v_total := v_total + v_count;

    IF NOT p_dry_run THEN
      v_sql := format(
        'DELETE FROM public.%I WHERE id IN (
           SELECT i.row_id FROM public.demo_run_items i
           JOIN public.demo_runs r ON r.id = i.run_id
           WHERE i.table_name = %L
             AND (%L = ''all'' OR r.module = %L)
             AND (%L::uuid IS NULL OR r.id = %L::uuid)
         )',
        v_tbl, v_tbl, v_module, v_module, p_run_id, p_run_id
      );
      EXECUTE v_sql;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    DELETE FROM public.demo_runs r
    WHERE (v_module = 'all' OR r.module = v_module)
      AND (p_run_id IS NULL OR r.id = p_run_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'module', v_module,
    'run_id', p_run_id,
    'total_rows', v_total,
    'counts_by_table', v_counts
  );
END $function$;