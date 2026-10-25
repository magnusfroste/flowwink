-- Språkversionerna kommer från båda modellerna.
--
-- get_page_translations(slug) är det växlaren, hreflang, navet och PublicPage
-- frågar: "vilka publicerade språkversioner har den här sidan?". Hittills
-- svarade den bara med SYSKONRADER (translation_group_id). Överläggsmodellen
-- (page_translations, steg 2–3) lagrar en version som en rad i en annan
-- tabell — utan den här ändringen vore en publicerad engelsk översättning
-- osynlig för varje läsare.
--
-- Svaret behåller formen {slug, locale, title} och får två fält till:
--   source     'row' (syskonrad) eller 'overlay'
--   page_slug  sidan överlägget hör till (= slug för ett överlägg; adressen
--              är /<lang>/<page_slug>)
-- Ett överlägg listas bara när det är publicerat OCH sidan är publicerad —
-- samma gräns som RLS-policyn. Titeln är överläggets page.title, annars
-- sidans. Steg 4 (docs/architecture/page-translations.md §8).
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
    RETURN jsonb_build_object('translations', '[]'::jsonb);
  END IF;

  -- Syskonraderna (den gamla modellen), som förut.
  IF v_page.translation_group_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'slug', p.slug, 'locale', p.locale, 'title', p.title,
             'source', 'row', 'page_slug', p.slug) ORDER BY p.locale), '[]'::jsonb)
      INTO v_rows
      FROM public.pages p
     WHERE p.translation_group_id = v_page.translation_group_id
       AND p.status = 'published' AND p.deleted_at IS NULL;
  END IF;

  -- Överläggen: publicerade, på en publicerad sida.
  IF v_page.status = 'published' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'slug', v_page.slug, 'locale', t.locale,
             'title', COALESCE(t.strings -> 'page.title' ->> 'text', v_page.title),
             'source', 'overlay', 'page_slug', v_page.slug) ORDER BY t.locale), '[]'::jsonb)
      INTO v_overlays
      FROM public.page_translations t
     WHERE t.page_id = v_page.id AND t.status = 'published';
  END IF;

  -- Sidan själv ingår i mängden när den har överlägg och inte redan listas
  -- som syskonrad: en uppsättning som utelämnar den nuvarande sidan
  -- ignoreras av sökmotorn, och växlaren behöver den som "nuvarande".
  IF jsonb_array_length(v_overlays) > 0 AND v_page.status = 'published'
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) e WHERE e ->> 'slug' = v_page.slug) THEN
    v_self := jsonb_build_array(jsonb_build_object(
      'slug', v_page.slug, 'locale', v_page.locale, 'title', v_page.title,
      'source', 'row', 'page_slug', v_page.slug));
  END IF;

  RETURN jsonb_build_object('translations', v_self || v_rows || v_overlays);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_page_translations(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_page_translations(text) IS
  'Publicerade språkversioner av en sida: syskonrader (source=row) och publicerade överlägg (source=overlay, slug = sidans). Växlaren, hreflang, navet och PublicPage läser detta.';

-- ── Bevis vid varje applicering ────────────────────────────────────────────
DO $$
DECLARE v_id uuid; v jsonb; v_n int;
BEGIN
  INSERT INTO public.pages (slug, title, status, locale, content_json)
    VALUES ('__gpt_proof__', 'Tjänster', 'published', 'sv', '[]'::jsonb) RETURNING id INTO v_id;
  INSERT INTO public.page_translations (page_id, locale, status, strings)
    VALUES (v_id, 'en', 'published', '{"page.title": {"text": "Services", "source_hash": "x"}}'::jsonb),
           (v_id, 'de', 'draft', '{}'::jsonb);
  v := public.get_page_translations('__gpt_proof__') -> 'translations';
  SELECT count(*) INTO v_n FROM jsonb_array_elements(v);
  DELETE FROM public.pages WHERE id = v_id;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'get_page_translations listed % version(s), expected 2 (the page + its published en overlay, not the de draft)', v_n;
  END IF;
  IF NOT (v @> '[{"locale": "en", "title": "Services", "source": "overlay"}]'::jsonb) THEN
    RAISE EXCEPTION 'get_page_translations did not surface the overlay with its own title: %', v;
  END IF;
END $$;
