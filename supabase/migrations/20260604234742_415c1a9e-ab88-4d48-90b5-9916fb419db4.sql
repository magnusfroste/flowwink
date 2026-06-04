
-- seed_demo_blog: creates 3 demo blog posts tagged via demo_run_items
CREATE OR REPLACE FUNCTION public.seed_demo_blog(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      jsonb_build_array(jsonb_build_object(
        'id', 'text-' || substring(md5(random()::text), 1, 8),
        'type', 'text',
        'data', jsonb_build_object('content', jsonb_build_object(
          'type', 'doc',
          'content', jsonb_build_array(jsonb_build_object(
            'type', 'paragraph',
            'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_post->>'body'))
          ))
        ))
      )),
      'published',
      now()
    )
    RETURNING id INTO v_post_id;

    INSERT INTO public.demo_run_items (run_id, entity_table, entity_id)
    VALUES (p_run_id, 'blog_posts', v_post_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('blog_posts_created', v_count);
END $$;

-- seed_demo_kb: creates 1 demo category + 3 articles
CREATE OR REPLACE FUNCTION public.seed_demo_kb(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
  v_art_id uuid;
  v_arts jsonb := jsonb_build_array(
    jsonb_build_object('title', 'How FlowPilot decides what to do next', 'slug', 'demo-how-flowpilot-decides',
      'body', 'FlowPilot scores skills against the current intent and runs the highest match. Objectives and recent activity tilt the ranking.'),
    jsonb_build_object('title', 'When does a draft become a real action?', 'slug', 'demo-draft-vs-action',
      'body', 'Drafts wait in the approval queue. A human reviews and either approves, edits, or rejects. Approved actions execute immediately.'),
    jsonb_build_object('title', 'Hourly reset — what stays and what resets', 'slug', 'demo-hourly-reset',
      'body', 'Static content (pages, blog, KB, products) is permanent. Dynamic data (leads, quotes, invoices) resets every hour via demo cycles.')
  );
  v_art jsonb;
  v_count int := 0;
BEGIN
  INSERT INTO public.kb_categories (name, slug, description, sort_order)
  VALUES ('Demo: How FlowPilot works', 'demo-flowpilot-' || substring(p_run_id::text, 1, 6),
          'Walkthroughs of the autonomous operator.', 100)
  RETURNING id INTO v_cat_id;

  INSERT INTO public.demo_run_items (run_id, entity_table, entity_id)
  VALUES (p_run_id, 'kb_categories', v_cat_id);

  FOR v_art IN SELECT * FROM jsonb_array_elements(v_arts) LOOP
    INSERT INTO public.kb_articles (title, slug, content, category_id, status, published_at)
    VALUES (
      v_art->>'title',
      v_art->>'slug' || '-' || substring(p_run_id::text, 1, 6),
      v_art->>'body',
      v_cat_id,
      'published',
      now()
    )
    RETURNING id INTO v_art_id;

    INSERT INTO public.demo_run_items (run_id, entity_table, entity_id)
    VALUES (p_run_id, 'kb_articles', v_art_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('kb_category_created', 1, 'kb_articles_created', v_count);
END $$;

-- Wire blog + kb into the dispatcher
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb;
  v_module text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can seed demo data';
  END IF;

  v_module := lower(trim(p_module));

  INSERT INTO public.demo_runs(module, scenario, created_by)
  VALUES (v_module, p_scenario, auth.uid())
  RETURNING id INTO v_run_id;

  CASE v_module
    WHEN 'crm'         THEN v_result := public.seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes'      THEN v_result := public.seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices'    THEN v_result := public.seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses'    THEN v_result := public.seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'ecommerce'   THEN v_result := public.seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'consultants' THEN v_result := public.seed_demo_consultants(v_run_id, p_scenario);
    WHEN 'blog'        THEN v_result := public.seed_demo_blog(v_run_id, p_scenario);
    WHEN 'kb'          THEN v_result := public.seed_demo_kb(v_run_id, p_scenario);
    ELSE
      DELETE FROM public.demo_runs WHERE id = v_run_id;
      RAISE EXCEPTION 'Unsupported module: %. Supported: crm, quotes, invoices, expenses, ecommerce, consultants, blog, kb', v_module;
  END CASE;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'module', v_module,
    'scenario', p_scenario,
    'detail', v_result
  );
END $$;
