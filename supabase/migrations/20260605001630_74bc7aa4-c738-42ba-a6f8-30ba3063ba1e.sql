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

  INSERT INTO public.demo_run_items (run_id, entity_table, entity_id)
  VALUES (p_run_id, 'kb_categories', v_cat_id);

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

    INSERT INTO public.demo_run_items (run_id, entity_table, entity_id)
    VALUES (p_run_id, 'kb_articles', v_art_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('kb_category_created', 1, 'kb_articles_created', v_count);
END $function$;