-- Sidrapporten väljer topp INNAN den kapar.
--
-- page_conversion_report grupperade per sida, kapade till p_limit (25, max
-- 200) — och sorterade FÖRST EFTER kapningen. Vilka 25 sidor som kom med när
-- fler hade trafik var planerarens val, inte rapportens: batteriet 2026-09-30
-- (26 sidor i fönstret) fick prissidan med i en körning och inte i nästa —
-- "expected 2, got NaN". Samma klass som #599: ett tak utan ordning är en
-- slumpad frånvaro.
--
-- Nu: ORDER BY leads, views, sida före LIMIT; svaret bär total_pages och
-- truncated så en läsare ser att listan är kapad. Idempotent: CREATE OR
-- REPLACE; beviset rullar tillbaka.
CREATE OR REPLACE FUNCTION public.page_conversion_report(p_days integer DEFAULT 30, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_from timestamptz := now() - make_interval(days => v_days);
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 25), 200));
  v_total integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'analytics')) THEN
    RAISE EXCEPTION 'Requires the analytics module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT count(DISTINCT pv.page_slug) INTO v_total
    FROM public.page_views pv WHERE pv.created_at >= v_from AND pv.page_slug IS NOT NULL;
  RETURN jsonb_build_object('success', true, 'days', v_days, 'from', v_from,
    'total_pages', v_total, 'limit', v_limit, 'truncated', v_total > v_limit,
    'pages', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.leads DESC, x.views DESC, x.page)
        FROM (
          SELECT pv.page_slug AS page,
                 count(*) AS views,
                 count(DISTINCT pv.visitor_id) AS unique_visitors,
                 count(DISTINCT pv.lead_id) AS leads,
                 count(DISTINCT pv.lead_id) FILTER (WHERE l.status::text = 'customer') AS customers,
                 -- Ordern bär kundens adress, inte ett lead-id: kopplingen går via e-posten.
                 COALESCE((SELECT SUM(o.total_cents) FROM public.orders o
                            WHERE o.status::text <> 'cancelled'
                              AND lower(o.customer_email) IN (
                                SELECT lower(l2.email) FROM public.leads l2
                                 WHERE l2.id IN (SELECT pv2.lead_id FROM public.page_views pv2
                                                  WHERE pv2.page_slug = pv.page_slug AND pv2.lead_id IS NOT NULL))), 0) AS revenue_cents
            FROM public.page_views pv
            LEFT JOIN public.leads l ON l.id = pv.lead_id
           WHERE pv.created_at >= v_from AND pv.page_slug IS NOT NULL
           GROUP BY pv.page_slug
           -- Toppen först, SEDAN taket — inte tvärtom.
           ORDER BY count(DISTINCT pv.lead_id) DESC, count(*) DESC, pv.page_slug
           LIMIT v_limit
        ) x), '[]'::jsonb),
    'note', 'A page is credited with a lead when the lead browsed it — the visitor is stitched to the lead by stitch_visitor_to_lead, which also fills the lead_id backwards on earlier views. Revenue is every order of those leads, matched on e-mail; a lead that browsed several pages is credited to each of them, so the revenue column does not sum to total revenue. Pages are ordered by leads, then views; total_pages says how many had traffic and truncated whether the list is capped (limit, max 200).');
END;
$function$;

-- Beviset: tre sidor, taket 1 — den med ett lead vinner, och svaret säger att det är kapat.
DO $proof$
DECLARE v_lead uuid; v_r jsonb; v_tag text := 'proof-' || substr(gen_random_uuid()::text, 1, 8);
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.leads (name, email, source) VALUES ('Proof lead', v_tag || '@example.invalid', 'proof') RETURNING id INTO v_lead;
    INSERT INTO public.page_views (page_slug, visitor_id, session_id, created_at) VALUES
      (v_tag || '-a', v_tag, v_tag, now()), (v_tag || '-a', v_tag, v_tag, now()), (v_tag || '-a', v_tag, v_tag, now()),
      (v_tag || '-b', v_tag, v_tag, now()),
      (v_tag || '-c', v_tag, v_tag, now());
    UPDATE public.page_views SET lead_id = v_lead WHERE page_slug = v_tag || '-b';
    -- Bara våra sidor räknas: fönstret 1 dag och ett tak på 1 räcker inte om instansen har annan trafik idag,
    -- så beviset läser ordningen i stället: b (1 lead) före a (3 visningar) före c.
    v_r := public.page_conversion_report(1, 200);
    IF (SELECT array_agg(p->>'page' ORDER BY ord) FROM jsonb_array_elements(v_r->'pages') WITH ORDINALITY AS t(p, ord)
         WHERE p->>'page' LIKE v_tag || '-%') <> ARRAY[v_tag || '-b', v_tag || '-a', v_tag || '-c'] THEN
      RAISE EXCEPTION 'proof failed: pages are not ordered leads, views, name → %', v_r->'pages';
    END IF;
    IF (v_r->>'total_pages')::int < 3 OR (v_r->>'truncated')::boolean THEN
      RAISE EXCEPTION 'proof failed: total_pages/truncated wrong → % / %', v_r->>'total_pages', v_r->>'truncated';
    END IF;
    v_r := public.page_conversion_report(1, 1);
    IF NOT (v_r->>'truncated')::boolean OR jsonb_array_length(v_r->'pages') <> 1 THEN
      RAISE EXCEPTION 'proof failed: a cap of 1 should list one page and say truncated → %', v_r;
    END IF;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: the page report orders by leads, views, name before it caps, and says when it is capped.';
END
$proof$;
