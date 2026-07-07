-- Pages parity round 8: URL redirects, multi-language pages, A/B testing.
-- Idempotent. Forward-dated for managed-instance migrate runners.

-- ============================================================
-- 1. URL REDIRECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.page_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path text NOT NULL,
  to_path text NOT NULL,
  status_code integer NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
  is_active boolean NOT NULL DEFAULT true,
  note text,
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS page_redirects_from_path_uq
  ON public.page_redirects (lower(from_path));

ALTER TABLE public.page_redirects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_redirects_public_read" ON public.page_redirects;
CREATE POLICY "page_redirects_public_read" ON public.page_redirects
  FOR SELECT USING (is_active);

DROP POLICY IF EXISTS "page_redirects_admin_all" ON public.page_redirects;
CREATE POLICY "page_redirects_admin_all" ON public.page_redirects
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Normalize a path: strip domain-less leading slash + trailing slash, lowercase.
CREATE OR REPLACE FUNCTION public.fw_normalize_path(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(regexp_replace(COALESCE(p, ''), '^/+', ''), '/+$', ''))
$$;

CREATE OR REPLACE FUNCTION public.manage_redirect(
  p_action text,
  p_redirect_id uuid DEFAULT NULL,
  p_from_path text DEFAULT NULL,
  p_to_path text DEFAULT NULL,
  p_status_code integer DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_row public.page_redirects;
  v_rows jsonb;
  v_from text;
  v_to text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage redirects';
  END IF;

  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM (SELECT * FROM public.page_redirects
          ORDER BY created_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) r;
    RETURN jsonb_build_object('success', true, 'redirects', v_rows);

  ELSIF p_action = 'create' THEN
    IF p_from_path IS NULL OR p_to_path IS NULL THEN
      RAISE EXCEPTION 'create requires p_from_path and p_to_path';
    END IF;
    v_from := public.fw_normalize_path(p_from_path);
    v_to := CASE WHEN p_to_path ~ '^https?://' THEN p_to_path
                 ELSE public.fw_normalize_path(p_to_path) END;
    IF v_from = '' THEN RAISE EXCEPTION 'from_path cannot be empty'; END IF;
    IF v_from = v_to THEN RAISE EXCEPTION 'Redirect would point to itself'; END IF;
    -- immediate 2-hop loop guard
    IF EXISTS (SELECT 1 FROM public.page_redirects
               WHERE lower(from_path) = lower(v_to) AND public.fw_normalize_path(to_path) = v_from) THEN
      RAISE EXCEPTION 'Redirect loop: % already redirects back to %', v_to, v_from;
    END IF;
    INSERT INTO public.page_redirects (from_path, to_path, status_code, note, created_by, is_active)
    VALUES (v_from, v_to, COALESCE(p_status_code, 301), p_note, auth.uid(), COALESCE(p_is_active, true))
    ON CONFLICT (lower(from_path)) DO UPDATE
      SET to_path = EXCLUDED.to_path,
          status_code = EXCLUDED.status_code,
          note = COALESCE(EXCLUDED.note, page_redirects.note),
          is_active = EXCLUDED.is_active,
          updated_at = now()
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'redirect', to_jsonb(v_row));

  ELSIF p_action = 'update' THEN
    IF p_redirect_id IS NULL THEN RAISE EXCEPTION 'update requires p_redirect_id'; END IF;
    UPDATE public.page_redirects SET
      from_path = COALESCE(public.fw_normalize_path(p_from_path), from_path),
      to_path = COALESCE(CASE WHEN p_to_path ~ '^https?://' THEN p_to_path
                              ELSE public.fw_normalize_path(p_to_path) END, to_path),
      status_code = COALESCE(p_status_code, status_code),
      is_active = COALESCE(p_is_active, is_active),
      note = COALESCE(p_note, note),
      updated_at = now()
    WHERE id = p_redirect_id
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Redirect % not found', p_redirect_id; END IF;
    RETURN jsonb_build_object('success', true, 'redirect', to_jsonb(v_row));

  ELSIF p_action = 'delete' THEN
    IF p_redirect_id IS NULL THEN RAISE EXCEPTION 'delete requires p_redirect_id'; END IF;
    DELETE FROM public.page_redirects WHERE id = p_redirect_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Redirect % not found', p_redirect_id; END IF;
    RETURN jsonb_build_object('success', true, 'deleted', to_jsonb(v_row));

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use list|create|update|delete', p_action;
  END IF;
END;
$$;

-- Public: resolve a path through the redirect table (follows chains, max 5 hops).
CREATE OR REPLACE FUNCTION public.resolve_redirect(p_path text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_path text := public.fw_normalize_path(p_path);
  v_row public.page_redirects;
  v_status integer;
  v_hops integer := 0;
BEGIN
  LOOP
    SELECT * INTO v_row FROM public.page_redirects
    WHERE lower(from_path) = v_path AND is_active
    LIMIT 1;
    EXIT WHEN v_row.id IS NULL OR v_hops >= 5;
    UPDATE public.page_redirects
      SET hit_count = hit_count + 1, last_hit_at = now()
      WHERE id = v_row.id;
    v_status := COALESCE(v_status, v_row.status_code);
    v_hops := v_hops + 1;
    IF v_row.to_path ~ '^https?://' THEN
      RETURN jsonb_build_object('found', true, 'to_path', v_row.to_path,
                                'status_code', v_status, 'hops', v_hops, 'external', true);
    END IF;
    v_path := public.fw_normalize_path(v_row.to_path);
  END LOOP;
  IF v_hops = 0 THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'to_path', '/' || v_path,
                            'status_code', v_status, 'hops', v_hops, 'external', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_redirect(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_redirect(text, uuid, text, text, integer, boolean, text, integer) TO authenticated, service_role;

-- ============================================================
-- 2. MULTI-LANGUAGE PAGES
-- ============================================================
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en';
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS translation_group_id uuid;
CREATE INDEX IF NOT EXISTS pages_translation_group_idx
  ON public.pages (translation_group_id) WHERE translation_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.manage_page_translation(
  p_action text,
  p_slug text DEFAULT NULL,
  p_locale text DEFAULT NULL,
  p_target_slug text DEFAULT NULL,
  p_title text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_page public.pages;
  v_target public.pages;
  v_group uuid;
  v_new public.pages;
  v_new_slug text;
  v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage page translations';
  END IF;
  IF p_slug IS NULL THEN RAISE EXCEPTION 'p_slug is required'; END IF;

  SELECT * INTO v_page FROM public.pages WHERE slug = p_slug AND deleted_at IS NULL;
  IF v_page.id IS NULL THEN RAISE EXCEPTION 'Page with slug % not found', p_slug; END IF;

  IF p_action = 'set_locale' THEN
    IF p_locale IS NULL THEN RAISE EXCEPTION 'set_locale requires p_locale (e.g. en, sv, de)'; END IF;
    UPDATE public.pages SET locale = lower(p_locale), updated_at = now() WHERE id = v_page.id;
    RETURN jsonb_build_object('success', true, 'slug', p_slug, 'locale', lower(p_locale));

  ELSIF p_action = 'link' THEN
    IF p_target_slug IS NULL THEN RAISE EXCEPTION 'link requires p_target_slug'; END IF;
    SELECT * INTO v_target FROM public.pages WHERE slug = p_target_slug AND deleted_at IS NULL;
    IF v_target.id IS NULL THEN RAISE EXCEPTION 'Page with slug % not found', p_target_slug; END IF;
    IF v_page.locale = v_target.locale THEN
      RAISE EXCEPTION 'Both pages have locale %. Set different locales first (set_locale).', v_page.locale;
    END IF;
    v_group := COALESCE(v_page.translation_group_id, v_target.translation_group_id, gen_random_uuid());
    UPDATE public.pages SET translation_group_id = v_group, updated_at = now()
      WHERE id IN (v_page.id, v_target.id);
    RETURN jsonb_build_object('success', true, 'translation_group_id', v_group);

  ELSIF p_action = 'unlink' THEN
    UPDATE public.pages SET translation_group_id = NULL, updated_at = now() WHERE id = v_page.id;
    RETURN jsonb_build_object('success', true, 'slug', p_slug);

  ELSIF p_action = 'create' THEN
    IF p_locale IS NULL THEN RAISE EXCEPTION 'create requires p_locale for the new translation'; END IF;
    IF lower(p_locale) = v_page.locale THEN
      RAISE EXCEPTION 'Source page is already locale %', p_locale;
    END IF;
    v_group := COALESCE(v_page.translation_group_id, gen_random_uuid());
    IF EXISTS (SELECT 1 FROM public.pages
               WHERE translation_group_id = v_group AND locale = lower(p_locale) AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'A % translation already exists in this group', p_locale;
    END IF;
    UPDATE public.pages SET translation_group_id = v_group WHERE id = v_page.id;
    v_new_slug := v_page.slug || '-' || lower(p_locale);
    IF EXISTS (SELECT 1 FROM public.pages WHERE slug = v_new_slug) THEN
      v_new_slug := v_new_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
    END IF;
    INSERT INTO public.pages (slug, title, status, content_json, meta_json, locale,
                              translation_group_id, show_in_menu, menu_order, created_by)
    VALUES (v_new_slug, COALESCE(p_title, v_page.title || ' (' || lower(p_locale) || ')'),
            'draft', v_page.content_json, v_page.meta_json, lower(p_locale),
            v_group, false, v_page.menu_order, auth.uid())
    RETURNING * INTO v_new;
    RETURN jsonb_build_object('success', true, 'slug', v_new.slug, 'locale', v_new.locale,
                              'status', 'draft', 'translation_group_id', v_group,
                              'note', 'Content copied from source — translate it, then publish.');

  ELSIF p_action = 'list' THEN
    IF v_page.translation_group_id IS NULL THEN
      RETURN jsonb_build_object('success', true, 'translations',
        jsonb_build_array(jsonb_build_object('slug', v_page.slug, 'locale', v_page.locale,
                                             'status', v_page.status, 'title', v_page.title)));
    END IF;
    SELECT jsonb_agg(jsonb_build_object('slug', slug, 'locale', locale, 'status', status,
                                        'title', title) ORDER BY locale) INTO v_rows
    FROM public.pages
    WHERE translation_group_id = v_page.translation_group_id AND deleted_at IS NULL;
    RETURN jsonb_build_object('success', true, 'translations', v_rows);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use set_locale|link|unlink|create|list', p_action;
  END IF;
END;
$$;

-- Public: published translations of a page (for the language switcher).
CREATE OR REPLACE FUNCTION public.get_page_translations(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_group uuid;
  v_rows jsonb;
BEGIN
  SELECT translation_group_id INTO v_group
  FROM public.pages WHERE slug = p_slug AND deleted_at IS NULL;
  IF v_group IS NULL THEN
    RETURN jsonb_build_object('translations', '[]'::jsonb);
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('slug', slug, 'locale', locale, 'title', title)
                            ORDER BY locale), '[]'::jsonb) INTO v_rows
  FROM public.pages
  WHERE translation_group_id = v_group AND status = 'published' AND deleted_at IS NULL;
  RETURN jsonb_build_object('translations', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_page_translations(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_page_translation(text, text, text, text, text) TO authenticated, service_role;

-- ============================================================
-- 3. A/B TESTING
-- ============================================================
CREATE TABLE IF NOT EXISTS public.page_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  variant_page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  traffic_split numeric NOT NULL DEFAULT 0.5 CHECK (traffic_split > 0 AND traffic_split < 1),
  goal text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'stopped', 'concluded')),
  winner text CHECK (winner IN ('a', 'b')),
  started_at timestamptz,
  stopped_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (page_id <> variant_page_id)
);

CREATE TABLE IF NOT EXISTS public.page_experiment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES public.page_experiments(id) ON DELETE CASCADE,
  variant text NOT NULL CHECK (variant IN ('a', 'b')),
  event_type text NOT NULL CHECK (event_type IN ('impression', 'conversion')),
  visitor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_experiment_events_exp_idx
  ON public.page_experiment_events (experiment_id, event_type);

ALTER TABLE public.page_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_experiment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_experiments_admin_all" ON public.page_experiments;
CREATE POLICY "page_experiments_admin_all" ON public.page_experiments
  FOR ALL USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "page_experiment_events_admin_read" ON public.page_experiment_events;
CREATE POLICY "page_experiment_events_admin_read" ON public.page_experiment_events
  FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Deterministic sticky assignment: hash(experiment_id || visitor_id) → bucket.
CREATE OR REPLACE FUNCTION public.fw_experiment_variant_for(
  p_experiment_id uuid, p_visitor_id text, p_split numeric
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN (abs(hashtext(p_experiment_id::text || COALESCE(p_visitor_id, ''))) % 1000) / 1000.0 < p_split
    THEN 'b' ELSE 'a' END
$$;

CREATE OR REPLACE FUNCTION public.manage_page_experiment(
  p_action text,
  p_experiment_id uuid DEFAULT NULL,
  p_page_slug text DEFAULT NULL,
  p_variant_slug text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_traffic_split numeric DEFAULT NULL,
  p_goal text DEFAULT NULL,
  p_winner text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_exp public.page_experiments;
  v_page_id uuid;
  v_variant_id uuid;
  v_rows jsonb;
  v_a_imp bigint; v_a_conv bigint; v_b_imp bigint; v_b_conv bigint;
  v_a_rate numeric; v_b_rate numeric;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can manage page experiments';
  END IF;

  IF p_action = 'create' THEN
    IF p_page_slug IS NULL OR p_variant_slug IS NULL OR p_name IS NULL THEN
      RAISE EXCEPTION 'create requires p_name, p_page_slug (control A) and p_variant_slug (variant B)';
    END IF;
    SELECT id INTO v_page_id FROM public.pages WHERE slug = p_page_slug AND deleted_at IS NULL;
    SELECT id INTO v_variant_id FROM public.pages WHERE slug = p_variant_slug AND deleted_at IS NULL;
    IF v_page_id IS NULL THEN RAISE EXCEPTION 'Control page % not found', p_page_slug; END IF;
    IF v_variant_id IS NULL THEN RAISE EXCEPTION 'Variant page % not found', p_variant_slug; END IF;
    INSERT INTO public.page_experiments (name, page_id, variant_page_id, traffic_split, goal, created_by)
    VALUES (p_name, v_page_id, v_variant_id, COALESCE(p_traffic_split, 0.5), p_goal, auth.uid())
    RETURNING * INTO v_exp;
    RETURN jsonb_build_object('success', true, 'experiment', to_jsonb(v_exp));

  ELSIF p_action = 'start' THEN
    IF p_experiment_id IS NULL THEN RAISE EXCEPTION 'start requires p_experiment_id'; END IF;
    SELECT * INTO v_exp FROM public.page_experiments WHERE id = p_experiment_id;
    IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Experiment % not found', p_experiment_id; END IF;
    IF EXISTS (SELECT 1 FROM public.page_experiments
               WHERE page_id = v_exp.page_id AND status = 'running' AND id <> v_exp.id) THEN
      RAISE EXCEPTION 'Another experiment is already running on this page';
    END IF;
    UPDATE public.page_experiments
      SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
      WHERE id = p_experiment_id RETURNING * INTO v_exp;
    RETURN jsonb_build_object('success', true, 'experiment', to_jsonb(v_exp));

  ELSIF p_action = 'stop' THEN
    UPDATE public.page_experiments
      SET status = 'stopped', stopped_at = now(), updated_at = now()
      WHERE id = p_experiment_id RETURNING * INTO v_exp;
    IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Experiment % not found', p_experiment_id; END IF;
    RETURN jsonb_build_object('success', true, 'experiment', to_jsonb(v_exp));

  ELSIF p_action = 'conclude' THEN
    IF p_winner IS NULL THEN RAISE EXCEPTION 'conclude requires p_winner (a or b)'; END IF;
    UPDATE public.page_experiments
      SET status = 'concluded', winner = p_winner,
          stopped_at = COALESCE(stopped_at, now()), updated_at = now()
      WHERE id = p_experiment_id RETURNING * INTO v_exp;
    IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Experiment % not found', p_experiment_id; END IF;
    RETURN jsonb_build_object('success', true, 'experiment', to_jsonb(v_exp));

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'status', e.status, 'traffic_split', e.traffic_split,
      'goal', e.goal, 'winner', e.winner, 'page_slug', pa.slug, 'variant_slug', pb.slug,
      'started_at', e.started_at, 'stopped_at', e.stopped_at
    ) ORDER BY e.created_at DESC), '[]'::jsonb) INTO v_rows
    FROM public.page_experiments e
    JOIN public.pages pa ON pa.id = e.page_id
    JOIN public.pages pb ON pb.id = e.variant_page_id;
    RETURN jsonb_build_object('success', true, 'experiments', v_rows);

  ELSIF p_action = 'results' THEN
    IF p_experiment_id IS NULL THEN RAISE EXCEPTION 'results requires p_experiment_id'; END IF;
    SELECT * INTO v_exp FROM public.page_experiments WHERE id = p_experiment_id;
    IF v_exp.id IS NULL THEN RAISE EXCEPTION 'Experiment % not found', p_experiment_id; END IF;
    SELECT count(DISTINCT visitor_id) FILTER (WHERE variant = 'a' AND event_type = 'impression'),
           count(DISTINCT visitor_id) FILTER (WHERE variant = 'a' AND event_type = 'conversion'),
           count(DISTINCT visitor_id) FILTER (WHERE variant = 'b' AND event_type = 'impression'),
           count(DISTINCT visitor_id) FILTER (WHERE variant = 'b' AND event_type = 'conversion')
      INTO v_a_imp, v_a_conv, v_b_imp, v_b_conv
    FROM public.page_experiment_events WHERE experiment_id = p_experiment_id;
    v_a_rate := CASE WHEN v_a_imp > 0 THEN round(v_a_conv::numeric / v_a_imp, 4) ELSE NULL END;
    v_b_rate := CASE WHEN v_b_imp > 0 THEN round(v_b_conv::numeric / v_b_imp, 4) ELSE NULL END;
    RETURN jsonb_build_object('success', true, 'experiment_id', p_experiment_id,
      'status', v_exp.status, 'winner', v_exp.winner,
      'a', jsonb_build_object('impressions', v_a_imp, 'conversions', v_a_conv, 'rate', v_a_rate),
      'b', jsonb_build_object('impressions', v_b_imp, 'conversions', v_b_conv, 'rate', v_b_rate),
      'lift_pct', CASE WHEN v_a_rate IS NOT NULL AND v_a_rate > 0 AND v_b_rate IS NOT NULL
                       THEN round((v_b_rate - v_a_rate) / v_a_rate * 100, 1) ELSE NULL END);

  ELSE
    RAISE EXCEPTION 'Unknown action %. Use create|start|stop|conclude|list|results', p_action;
  END IF;
END;
$$;

-- Public: assign a visitor to a variant for a running experiment on a page.
-- Returns variant content when the visitor lands in bucket B. Records an impression.
CREATE OR REPLACE FUNCTION public.get_experiment_variant(p_slug text, p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_exp public.page_experiments;
  v_variant text;
  v_page public.pages;
BEGIN
  SELECT e.* INTO v_exp
  FROM public.page_experiments e
  JOIN public.pages p ON p.id = e.page_id
  WHERE p.slug = p_slug AND e.status = 'running'
  LIMIT 1;
  IF v_exp.id IS NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;
  v_variant := public.fw_experiment_variant_for(v_exp.id, p_visitor_id, v_exp.traffic_split);
  -- one impression per visitor per experiment
  IF NOT EXISTS (SELECT 1 FROM public.page_experiment_events
                 WHERE experiment_id = v_exp.id AND visitor_id = p_visitor_id
                   AND event_type = 'impression') THEN
    INSERT INTO public.page_experiment_events (experiment_id, variant, event_type, visitor_id)
    VALUES (v_exp.id, v_variant, 'impression', p_visitor_id);
  END IF;
  IF v_variant = 'a' THEN
    RETURN jsonb_build_object('active', true, 'experiment_id', v_exp.id, 'variant', 'a');
  END IF;
  SELECT * INTO v_page FROM public.pages WHERE id = v_exp.variant_page_id AND deleted_at IS NULL;
  IF v_page.id IS NULL THEN
    RETURN jsonb_build_object('active', true, 'experiment_id', v_exp.id, 'variant', 'a');
  END IF;
  RETURN jsonb_build_object('active', true, 'experiment_id', v_exp.id, 'variant', 'b',
    'content_json', v_page.content_json, 'title', v_page.title, 'meta_json', v_page.meta_json);
END;
$$;

-- Public: record a conversion for the visitor's assigned variant.
CREATE OR REPLACE FUNCTION public.record_experiment_conversion(p_slug text, p_visitor_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_exp public.page_experiments;
  v_variant text;
BEGIN
  SELECT e.* INTO v_exp
  FROM public.page_experiments e
  JOIN public.pages p ON p.id = e.page_id
  WHERE p.slug = p_slug AND e.status = 'running'
  LIMIT 1;
  IF v_exp.id IS NULL THEN RETURN jsonb_build_object('recorded', false); END IF;
  v_variant := public.fw_experiment_variant_for(v_exp.id, p_visitor_id, v_exp.traffic_split);
  IF NOT EXISTS (SELECT 1 FROM public.page_experiment_events
                 WHERE experiment_id = v_exp.id AND visitor_id = p_visitor_id
                   AND event_type = 'conversion') THEN
    INSERT INTO public.page_experiment_events (experiment_id, variant, event_type, visitor_id)
    VALUES (v_exp.id, v_variant, 'conversion', p_visitor_id);
  END IF;
  RETURN jsonb_build_object('recorded', true, 'variant', v_variant);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_experiment_variant(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_experiment_conversion(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_page_experiment(text, uuid, text, text, text, numeric, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
