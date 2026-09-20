-- Vilken sida gav affären?
--
-- Paritetsrunda 8, analytics (58 %). Odoos webbanalys har MÅL: man säger vad
-- som räknas som en omvandling och mäter hur många besökare som når dit.
-- FlowWink hade alla delar utom den frågan — och utom svaret på den mest
-- FlowWink-egna varianten av den: VILKEN SIDA gav leadet?
--
-- Delarna fanns redan och används som de är (leta rälsen först):
--   * page_views bär utm_*, landing_url, visitor_id och lead_id.
--   * stitch_visitor_to_lead kopplar besökare till lead och fyller lead_id
--     bakåt på besöken.
--   * leads och orders bär first_/last_utm_*, och utm_attribution_report
--     summerar per kampanj.
--
-- Det som saknades:
--   1. Ingen definition av en omvandling. Nu conversion_goals: vad räknas,
--      och vad är en sådan värd när posten inte bär ett eget belopp.
--   2. Ingen rapport per SIDA. page_conversion_report svarar på vilken sida
--      besökaren först kom in på, hur många leads den gav och vad de köpte.
--      Kopplingen sida → lead → order går via leadets e-post, eftersom en
--      order bär kundens adress men inget lead-id.
--   3. En lucka som gjorde attributionen tyst felaktig: en lead som föds i
--      chatten eller av en agent fick ALDRIG sina utm-fält ifyllda, trots att
--      besökarens sidvisningar bar dem. utm_attribution_report räknade den som
--      "(none)". stitch_visitor_to_lead stämplar nu leadets första och sista
--      kontaktpunkt ur besöken — men skriver aldrig över det formuläret redan
--      satt (formulärvägen vet mer: den var där när det hände).
--   4. Ingen skill läste det översikten visar. analytics_dashboard svarar med
--      samma siffror som sidan, så agenten och människan ser samma sak.
--
-- Flottan förkontrollerad läsande 2026-09-20: stitch_visitor_to_lead har
-- identisk kropp på alla sju instanser (md5 e947a68d…), och ingen lead någon
-- stans har utm-fält satta — stämplingen kan bara fylla tomma fält.

CREATE TABLE IF NOT EXISTS public.conversion_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lead', 'booking', 'order', 'quote_accepted', 'subscription', 'page_reached')),
  page_slug text,
  value_cents bigint CHECK (value_cents IS NULL OR value_cents >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_reached_needs_a_page CHECK (kind <> 'page_reached' OR page_slug IS NOT NULL)
);
-- Ett mål per sak som räknas: två mål med samma definition dubbelräknar.
CREATE UNIQUE INDEX IF NOT EXISTS conversion_goals_one_per_definition
  ON public.conversion_goals (kind, COALESCE(page_slug, '')) WHERE is_active;

ALTER TABLE public.conversion_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Analytics module manages conversion goals" ON public.conversion_goals;
CREATE POLICY "Analytics module manages conversion goals" ON public.conversion_goals
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'analytics'))
  WITH CHECK (can_access_module(auth.uid(), 'analytics'));
REVOKE ALL ON public.conversion_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversion_goals TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- EN definition av vad en omvandling är
-- ─────────────────────────────────────────────────────────────────────────
-- Båda rapporterna läser härifrån. Vill man ändra vad som räknas som en
-- omvandling ändrar man på ETT ställe, och sida- och kampanjrapporten följer med.
CREATE OR REPLACE FUNCTION public.conversion_completions(p_kind text, p_page_slug text, p_from timestamptz)
RETURNS TABLE (
  entity_id uuid,
  occurred_at timestamptz,
  value_cents bigint,
  value_is_actual boolean,
  lead_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Sidan besökaren FÖRST kom in på, för den lead omvandlingen hör till.
  WITH first_page AS (
    SELECT pv.lead_id, (array_agg(pv.page_slug ORDER BY pv.created_at))[1] AS slug
      FROM public.page_views pv WHERE pv.lead_id IS NOT NULL GROUP BY pv.lead_id
  )
  SELECT l.id, l.created_at, NULL::bigint, false, l.id,
         l.last_utm_source, l.last_utm_medium, l.last_utm_campaign, fp.slug
    FROM public.leads l LEFT JOIN first_page fp ON fp.lead_id = l.id
   WHERE p_kind = 'lead' AND l.created_at >= p_from
  UNION ALL
  SELECT b.id, b.created_at, s.price_cents::bigint, s.price_cents IS NOT NULL, lb.id,
         lb.last_utm_source, lb.last_utm_medium, lb.last_utm_campaign, fp.slug
    FROM public.bookings b
    LEFT JOIN public.booking_services s ON s.id = b.service_id
    LEFT JOIN public.leads lb ON lower(lb.email) = lower(b.customer_email)
    LEFT JOIN first_page fp ON fp.lead_id = lb.id
   WHERE p_kind = 'booking' AND b.created_at >= p_from AND b.status <> 'cancelled'
  UNION ALL
  SELECT o.id, o.created_at, o.total_cents::bigint, true, lo.id,
         COALESCE(o.last_utm_source, lo.last_utm_source), COALESCE(o.last_utm_medium, lo.last_utm_medium),
         COALESCE(o.last_utm_campaign, lo.last_utm_campaign), fp.slug
    FROM public.orders o
    LEFT JOIN public.leads lo ON lower(lo.email) = lower(o.customer_email)
    LEFT JOIN first_page fp ON fp.lead_id = lo.id
   WHERE p_kind = 'order' AND o.created_at >= p_from AND o.status::text <> 'cancelled'
  UNION ALL
  SELECT q.id, q.accepted_at, q.total_cents::bigint, true, q.lead_id,
         lq.last_utm_source, lq.last_utm_medium, lq.last_utm_campaign, fp.slug
    FROM public.quotes q
    LEFT JOIN public.leads lq ON lq.id = q.lead_id
    LEFT JOIN first_page fp ON fp.lead_id = q.lead_id
   WHERE p_kind = 'quote_accepted' AND q.accepted_at IS NOT NULL AND q.accepted_at >= p_from
  UNION ALL
  SELECT sub.id, sub.created_at, (sub.unit_amount_cents * COALESCE(sub.quantity, 1))::bigint, true, ls.id,
         ls.last_utm_source, ls.last_utm_medium, ls.last_utm_campaign, fp.slug
    FROM public.subscriptions sub
    LEFT JOIN public.leads ls ON lower(ls.email) = lower(sub.customer_email)
    LEFT JOIN first_page fp ON fp.lead_id = ls.id
   WHERE p_kind = 'subscription' AND sub.created_at >= p_from AND sub.status::text NOT IN ('canceled', 'incomplete_expired')
  UNION ALL
  -- En sida som nås räknas EN gång per besökare, inte en gång per omladdning.
  SELECT NULL::uuid, min(pv.created_at), NULL::bigint, false,
         (array_agg(pv.lead_id ORDER BY pv.created_at) FILTER (WHERE pv.lead_id IS NOT NULL))[1],
         max(pv.utm_source), max(pv.utm_medium), max(pv.utm_campaign), p_page_slug
    FROM public.page_views pv
   WHERE p_kind = 'page_reached' AND pv.created_at >= p_from AND pv.page_slug = p_page_slug
   GROUP BY pv.visitor_id;
$function$;

CREATE OR REPLACE FUNCTION public.conversion_report(p_days integer DEFAULT 30, p_goal_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_from timestamptz := now() - make_interval(days => v_days);
  v_visitors bigint;
  v_goals jsonb := '[]'::jsonb;
  g record;
  v_completions bigint;
  v_value bigint;
  v_actual boolean;
  v_by_source jsonb;
  v_by_page jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'analytics')) THEN
    RAISE EXCEPTION 'Requires the analytics module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT count(DISTINCT visitor_id) INTO v_visitors FROM public.page_views WHERE created_at >= v_from AND visitor_id IS NOT NULL;

  FOR g IN SELECT * FROM public.conversion_goals
            WHERE is_active AND (p_goal_id IS NULL OR id = p_goal_id) ORDER BY name
  LOOP
    SELECT count(*), COALESCE(SUM(COALESCE(c.value_cents, g.value_cents)), 0), bool_and(COALESCE(c.value_is_actual, false))
      INTO v_completions, v_value, v_actual
      FROM public.conversion_completions(g.kind, g.page_slug, v_from) c;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('source', src, 'medium', med, 'campaign', camp, 'completions', n) ORDER BY n DESC), '[]'::jsonb)
      INTO v_by_source
      FROM (SELECT COALESCE(c.utm_source, '(direct)') AS src, COALESCE(c.utm_medium, '(none)') AS med,
                   COALESCE(c.utm_campaign, '(none)') AS camp, count(*) AS n
              FROM public.conversion_completions(g.kind, g.page_slug, v_from) c
             GROUP BY 1, 2, 3) s;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('page', pg, 'completions', n) ORDER BY n DESC), '[]'::jsonb)
      INTO v_by_page
      FROM (SELECT COALESCE(c.landing_slug, '(not tracked)') AS pg, count(*) AS n
              FROM public.conversion_completions(g.kind, g.page_slug, v_from) c
             GROUP BY 1) p;

    v_goals := v_goals || jsonb_build_array(jsonb_build_object(
      'goal_id', g.id, 'name', g.name, 'kind', g.kind, 'page_slug', g.page_slug,
      'completions', v_completions,
      'value_cents', CASE WHEN v_completions > 0 AND (v_actual OR g.value_cents IS NOT NULL) THEN v_value END,
      -- Ett antaget värde är inte en intäkt. Rapporten säger vilket det är.
      'value_source', CASE WHEN v_completions = 0 THEN NULL WHEN v_actual THEN 'actual'
                           WHEN g.value_cents IS NOT NULL THEN 'assumed from the goal value' END,
      'conversion_rate_pct', CASE WHEN v_visitors > 0 THEN round(100.0 * v_completions / v_visitors, 2) END,
      'by_source', v_by_source, 'by_landing_page', v_by_page));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'days', v_days, 'from', v_from,
    'unique_visitors', v_visitors, 'goals', v_goals,
    'note', CASE WHEN v_visitors = 0
                 THEN 'No page views in the window: conversion rates are absent, not zero — nothing was measured. The tracker runs in the visitor''s browser.'
                 ELSE 'A conversion rate is completions divided by unique visitors in the window; a visitor who converted before the window still counts as a completion.' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.page_conversion_report(p_days integer DEFAULT 30, p_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_from timestamptz := now() - make_interval(days => v_days);
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'analytics')) THEN
    RAISE EXCEPTION 'Requires the analytics module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('success', true, 'days', v_days, 'from', v_from,
    'pages', COALESCE((
      SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.leads DESC, x.views DESC)
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
           LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 200))
        ) x), '[]'::jsonb),
    'note', 'A page is credited with a lead when the lead browsed it — the visitor is stitched to the lead by stitch_visitor_to_lead, which also fills the lead_id backwards on earlier views. Revenue is every order of those leads, matched on e-mail; a lead that browsed several pages is credited to each of them, so the revenue column does not sum to total revenue.');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Samma siffror som översikten visar — läsbara för en agent
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analytics_dashboard(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_from timestamptz := now() - make_interval(days => v_days);
  v_views bigint; v_visitors bigint; v_leads bigint; v_customers bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'analytics')) THEN
    RAISE EXCEPTION 'Requires the analytics module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT count(*), count(DISTINCT visitor_id) INTO v_views, v_visitors
    FROM public.page_views WHERE created_at >= v_from;
  SELECT count(*) FILTER (WHERE created_at >= v_from),
         count(*) FILTER (WHERE created_at >= v_from AND status::text = 'customer')
    INTO v_leads, v_customers FROM public.leads;

  RETURN jsonb_build_object('success', true, 'days', v_days, 'from', v_from,
    'page_views', v_views, 'unique_visitors', v_visitors, 'new_leads', v_leads, 'new_customers', v_customers,
    'visitor_to_lead_pct', CASE WHEN v_visitors > 0 THEN round(100.0 * v_leads / v_visitors, 2) END,
    'lead_to_customer_pct', CASE WHEN v_leads > 0 THEN round(100.0 * v_customers / v_leads, 2) END,
    'top_pages', COALESCE((SELECT jsonb_agg(jsonb_build_object('page', page_slug, 'views', n, 'visitors', u) ORDER BY n DESC)
                             FROM (SELECT page_slug, count(*) AS n, count(DISTINCT visitor_id) AS u
                                     FROM public.page_views WHERE created_at >= v_from AND page_slug IS NOT NULL
                                    GROUP BY page_slug ORDER BY count(*) DESC LIMIT 10) t), '[]'::jsonb),
    'top_sources', COALESCE((SELECT jsonb_agg(jsonb_build_object('source', src, 'medium', med, 'visitors', u) ORDER BY u DESC)
                               FROM (SELECT COALESCE(utm_source, '(direct)') AS src, COALESCE(utm_medium, '(none)') AS med,
                                            count(DISTINCT visitor_id) AS u
                                       FROM public.page_views WHERE created_at >= v_from
                                      GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10) t), '[]'::jsonb),
    'goals', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', g->>'name', 'completions', g->'completions',
                                                           'conversion_rate_pct', g->'conversion_rate_pct'))
                         FROM jsonb_array_elements(public.conversion_report(v_days)->'goals') g), '[]'::jsonb),
    'note', CASE WHEN v_views = 0 THEN 'No page views in the window — the tracker runs in the visitor''s browser, so an instance with no traffic (or no tracking script) reports nothing rather than zero conversion.' END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_conversion_goal(
  p_action text,
  p_goal_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_page_slug text DEFAULT NULL,
  p_value_cents bigint DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_row public.conversion_goals;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'analytics')) THEN
    RAISE EXCEPTION 'Requires the analytics module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'list' THEN
    RETURN jsonb_build_object('success', true, 'goals', COALESCE((
      SELECT jsonb_agg(to_jsonb(g) ORDER BY g.name) FROM public.conversion_goals g
       WHERE p_is_active IS NULL OR g.is_active = p_is_active), '[]'::jsonb));
  ELSIF p_action = 'create' THEN
    IF p_name IS NULL OR p_kind IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'p_name and p_kind are required (kind: lead | booking | order | quote_accepted | subscription | page_reached).');
    END IF;
    IF p_kind = 'page_reached' AND NULLIF(btrim(COALESCE(p_page_slug, '')), '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'A page_reached goal needs p_page_slug — which page counts.');
    END IF;
    BEGIN
      INSERT INTO public.conversion_goals (name, kind, page_slug, value_cents, is_active, created_by)
      VALUES (p_name, p_kind, NULLIF(btrim(COALESCE(p_page_slug, '')), ''), p_value_cents, COALESCE(p_is_active, true), auth.uid())
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('An active goal already counts %s%s — two goals with the same definition would count the same thing twice.',
               p_kind, COALESCE(' on ' || p_page_slug, '')));
    END;
    RETURN jsonb_build_object('success', true, 'goal_id', v_id);
  ELSIF p_action = 'update' THEN
    IF p_goal_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'p_goal_id is required');
    END IF;
    UPDATE public.conversion_goals SET
      name = COALESCE(p_name, name),
      page_slug = COALESCE(NULLIF(btrim(COALESCE(p_page_slug, '')), ''), page_slug),
      value_cents = COALESCE(p_value_cents, value_cents),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
    WHERE id = p_goal_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Goal not found'); END IF;
    RETURN jsonb_build_object('success', true, 'goal_id', v_row.id, 'goal', to_jsonb(v_row));
  ELSIF p_action = 'delete' THEN
    DELETE FROM public.conversion_goals WHERE id = p_goal_id;
    RETURN jsonb_build_object('success', true, 'deleted', p_goal_id);
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'p_action is list | create | update | delete');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Leadet som föddes i chatten får sin attribution
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stitch_visitor_to_lead(p_visitor_id text, p_lead_id uuid, p_source text DEFAULT 'unknown'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_backfilled integer := 0;
  v_first_seen timestamptz;
  v_first record;
  v_last record;
  v_stamped boolean := false;
BEGIN
  IF p_visitor_id IS NULL OR p_lead_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'visitor_id and lead_id required');
  END IF;

  SELECT MIN(created_at) INTO v_first_seen
  FROM public.page_views WHERE visitor_id = p_visitor_id;

  INSERT INTO public.visitor_identities (visitor_id, lead_id, first_seen_at, identification_source)
  VALUES (p_visitor_id, p_lead_id, COALESCE(v_first_seen, now()), p_source)
  ON CONFLICT (visitor_id, lead_id) DO UPDATE
    SET identified_at = EXCLUDED.identified_at,
        identification_source = EXCLUDED.identification_source,
        updated_at = now();

  UPDATE public.page_views
     SET lead_id = p_lead_id
   WHERE visitor_id = p_visitor_id AND lead_id IS NULL;
  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  -- attribution-stamp 20260920080000
  -- Ett lead som föds i chatten eller av en agent bar ingen attribution alls,
  -- fast besökarens sidvisningar bar den — kampanjrapporten räknade det som
  -- "(none)". Stämpla ur besöken, men skriv ALDRIG över det som redan står:
  -- formulärvägen skickar med attributionen från webbläsaren och vet mer.
  SELECT utm_source, utm_medium, utm_campaign INTO v_first
    FROM public.page_views
   WHERE visitor_id = p_visitor_id AND utm_source IS NOT NULL
   ORDER BY created_at LIMIT 1;
  SELECT utm_source, utm_medium, utm_campaign INTO v_last
    FROM public.page_views
   WHERE visitor_id = p_visitor_id AND utm_source IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;

  IF v_first.utm_source IS NOT NULL THEN
    UPDATE public.leads
       SET first_utm_source = COALESCE(first_utm_source, v_first.utm_source),
           first_utm_medium = COALESCE(first_utm_medium, v_first.utm_medium),
           first_utm_campaign = COALESCE(first_utm_campaign, v_first.utm_campaign),
           last_utm_source = COALESCE(last_utm_source, v_last.utm_source),
           last_utm_medium = COALESCE(last_utm_medium, v_last.utm_medium),
           last_utm_campaign = COALESCE(last_utm_campaign, v_last.utm_campaign),
           updated_at = now()
     WHERE id = p_lead_id
       AND (first_utm_source IS NULL OR last_utm_source IS NULL);
    v_stamped := FOUND;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'backfilled_page_views', v_backfilled,
    'attribution_stamped', v_stamped,
    'first_seen_at', v_first_seen
  );
END;
$function$;

-- Samma publik som förut (20260704141730): chattens leadfångst körs som BESÖKARE,
-- och det är den som vet vilket visitor_id webbläsaren bär. Funktionen skriver bara
-- på den lead anroparen anger, och fyller bara tomma attributionsfält ur den
-- besökarens egna sidvisningar — samma räckvidd som backfillen redan hade.
REVOKE ALL ON FUNCTION public.stitch_visitor_to_lead(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stitch_visitor_to_lead(text, uuid, text) TO anon, authenticated, service_role;

DO $grants$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.conversion_completions(text, text, timestamptz)',
    'public.conversion_report(integer, uuid)',
    'public.page_conversion_report(integer, integer)',
    'public.analytics_dashboard(integer)',
    'public.manage_conversion_goal(text, uuid, text, text, text, bigint, boolean)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END
$grants$;

REVOKE ALL ON FUNCTION public.conversion_completions(text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversion_completions(text, text, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversion_report(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversion_report(integer, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.page_conversion_report(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.page_conversion_report(integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.analytics_dashboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_dashboard(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.manage_conversion_goal(text, uuid, text, text, text, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_conversion_goal(text, uuid, text, text, text, bigint, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_lead uuid; v_goal uuid; v_r jsonb; v_g jsonb; v_page jsonb; v_visitor text := 'proof-080000-visitor';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.leads (name, email, status, source)
    VALUES ('Proof 080000', 'proof-080000@example.test', 'lead', 'chat') RETURNING id INTO v_lead;

    -- Trafiken: två besök, ett med kampanj, innan leadet blev känt.
    -- Egna sidnamn: instansen kan redan ha trafik, och beviset ska pröva sin egen.
    INSERT INTO public.page_views (page_slug, page_title, visitor_id, session_id, utm_source, utm_medium, utm_campaign, created_at)
    VALUES ('proof-080000-priser', 'Priser', v_visitor, 'sess-1', 'linkedin', 'social', 'host-2026', now() - interval '2 hours'),
           ('proof-080000-kontakt', 'Kontakt', v_visitor, 'sess-1', NULL, NULL, NULL, now() - interval '1 hour');

    v_r := public.stitch_visitor_to_lead(v_visitor, v_lead, 'chat');
    IF (v_r->>'backfilled_page_views')::int <> 2 OR NOT (v_r->>'attribution_stamped')::boolean THEN
      RAISE EXCEPTION 'proof failed: stitching should backfill both views and stamp the attribution → %', v_r;
    END IF;
    IF (SELECT first_utm_source FROM public.leads WHERE id = v_lead) <> 'linkedin' THEN
      RAISE EXCEPTION 'proof failed: the lead did not get its first touch';
    END IF;
    -- Det som redan står skrivs aldrig över.
    UPDATE public.leads SET last_utm_source = 'newsletter' WHERE id = v_lead;
    PERFORM public.stitch_visitor_to_lead(v_visitor, v_lead, 'chat');
    IF (SELECT last_utm_source FROM public.leads WHERE id = v_lead) <> 'newsletter' THEN
      RAISE EXCEPTION 'proof failed: stitching overwrote an attribution that was already set';
    END IF;

    -- Målet: leads räknas, och rapporten vet vilken sida de kom in på.
    v_r := public.manage_conversion_goal('create', NULL, 'New leads', 'lead', NULL, 500000);
    v_goal := (v_r->>'goal_id')::uuid;
    v_r := public.manage_conversion_goal('create', NULL, 'New leads again', 'lead');
    IF (v_r->>'success')::boolean THEN
      RAISE EXCEPTION 'proof failed: two active goals counted the same thing';
    END IF;

    v_g := public.conversion_report(30, v_goal)->'goals'->0;
    IF (v_g->>'completions')::int < 1 THEN
      RAISE EXCEPTION 'proof failed: the lead is not counted → %', v_g;
    END IF;
    IF v_g->>'value_source' <> 'assumed from the goal value' THEN
      RAISE EXCEPTION 'proof failed: an assumed value must say so → %', v_g;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_g->'by_landing_page') p WHERE p->>'page' = 'proof-080000-priser') THEN
      RAISE EXCEPTION 'proof failed: the goal does not know which page they came in on → %', v_g->'by_landing_page';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_g->'by_source') s WHERE s->>'source' = 'newsletter') THEN
      RAISE EXCEPTION 'proof failed: the goal does not carry the campaign → %', v_g->'by_source';
    END IF;

    -- 200 rader räcker för att bevisets sida är med även på en instans med trafik.
    v_page := public.page_conversion_report(30, 200);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_page->'pages') p
                    WHERE p->>'page' = 'proof-080000-priser' AND (p->>'leads')::int = 1) THEN
      RAISE EXCEPTION 'proof failed: the page that produced the lead is not credited → %', v_page->'pages';
    END IF;

    v_r := public.analytics_dashboard(30);
    IF (v_r->>'unique_visitors')::int < 1 OR jsonb_array_length(v_r->'goals') < 1 THEN
      RAISE EXCEPTION 'proof failed: the dashboard answer is missing its numbers → %', v_r;
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: stitching stamps attribution without overwriting it, a goal counts once, an assumed value says so, and the page that brought the lead is credited.';
END
$proof$;
