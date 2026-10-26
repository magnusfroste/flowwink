-- Sidan får sin adress per språk (2026-10-26).
--
-- Översättningsöverlägget har länge kunnat bära en egen slug
-- (content_translations.slug, satt av publish_translation translated_slug) —
-- bloggen läser den redan (/en/blog/<engelsk slug>), men sidorna gjorde det
-- inte: /villkor blev /en/villkor för en engelsk läsare hur man än satte
-- översättningens slug. Regeln blir densamma för sidor som för inlägg:
--
--   språket bor i prefixet, sluggen får vara språkets egen —
--   /villkor (sajtens språk) och /en/terms (överlägget med slug 'terms').
--
-- get_page_translations:
--   * varje version bär `path_slug` — den slug adressen ska visa (överläggets
--     egen, annars sidans). `slug` är oförändrad: sidans identitet, det
--     get-page slår upp.
--   * en översatt slug löses upp: p_slug som inte är en sida men väl ett
--     publicerat överläggs slug svarar för den sidan. Sidans egen slug vinner
--     alltid — ingen befintlig adress byter betydelse.
-- Samma signatur, idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_page_translations(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_page record;
  v_rows jsonb := '[]'::jsonb;
  v_overlays jsonb := '[]'::jsonb;
  v_self jsonb := '[]'::jsonb;
BEGIN
  SELECT id, slug, title, locale, status, translation_group_id INTO v_page
    FROM public.pages WHERE slug = p_slug AND deleted_at IS NULL;
  IF v_page IS NULL THEN
    -- /en/terms: 'terms' is the English overlay's own slug of some page.
    SELECT p.id, p.slug, p.title, p.locale, p.status, p.translation_group_id INTO v_page
      FROM public.content_translations t
      JOIN public.pages p ON p.id = t.entity_id AND p.deleted_at IS NULL
     WHERE t.entity = 'page' AND t.slug = p_slug AND t.status = 'published'
     ORDER BY t.locale
     LIMIT 1;
  END IF;
  IF v_page IS NULL THEN
    RETURN jsonb_build_object('translations', '[]'::jsonb);
  END IF;

  IF v_page.translation_group_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'slug', p.slug, 'path_slug', p.slug, 'locale', p.locale, 'title', p.title,
             'source', 'row', 'page_slug', p.slug) ORDER BY p.locale), '[]'::jsonb)
      INTO v_rows
      FROM public.pages p
     WHERE p.translation_group_id = v_page.translation_group_id
       AND p.status = 'published' AND p.deleted_at IS NULL;
  END IF;

  IF v_page.status = 'published' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'slug', v_page.slug,
             'path_slug', COALESCE(NULLIF(trim(t.slug), ''), v_page.slug),
             'locale', t.locale,
             'title', COALESCE(t.strings -> 'page.title' ->> 'text', v_page.title),
             'source', 'overlay', 'page_slug', v_page.slug) ORDER BY t.locale), '[]'::jsonb)
      INTO v_overlays
      FROM public.content_translations t
     WHERE t.entity = 'page' AND t.entity_id = v_page.id AND t.status = 'published';
  END IF;

  IF jsonb_array_length(v_overlays) > 0 AND v_page.status = 'published'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) e WHERE e ->> 'slug' = v_page.slug) THEN
    v_self := jsonb_build_array(jsonb_build_object(
      'slug', v_page.slug, 'path_slug', v_page.slug, 'locale', v_page.locale, 'title', v_page.title,
      'source', 'row', 'page_slug', v_page.slug));
  END IF;

  RETURN jsonb_build_object('translations', v_self || v_rows || v_overlays);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_page_translations(text) TO anon, authenticated, service_role;

-- ── Bevis vid varje applicering ────────────────────────────────────────────
DO $$
DECLARE
  v_page uuid;
  v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.pages (slug, title, status, locale, content_json)
    VALUES ('__adress_per_sprak__', 'Villkor', 'published', 'sv', '[]'::jsonb)
    RETURNING id INTO v_page;
  INSERT INTO public.content_translations (entity, entity_id, locale, status, slug, strings)
    VALUES ('page', v_page, 'en', 'published', '__address_per_language__',
            '{"page.title": {"text": "Terms", "source_hash": "x"}}'::jsonb);

  v := public.get_page_translations('__adress_per_sprak__') -> 'translations';
  IF NOT (v @> '[{"locale": "en", "path_slug": "__address_per_language__", "slug": "__adress_per_sprak__"}]'::jsonb) THEN
    RAISE EXCEPTION 'get_page_translations: the overlay does not carry its own slug: %', v;
  END IF;
  v := public.get_page_translations('__address_per_language__') -> 'translations';
  IF NOT (v @> '[{"locale": "en", "slug": "__adress_per_sprak__"}]'::jsonb) THEN
    RAISE EXCEPTION 'get_page_translations: a translated slug does not resolve to its page: %', v;
  END IF;

  DELETE FROM public.content_translations WHERE entity = 'page' AND entity_id = v_page;
  DELETE FROM public.pages WHERE id = v_page;
END $$;
