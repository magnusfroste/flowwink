-- Bloggen får språk; överlägget blir generiskt.
--
-- Steg 7 (docs/architecture/page-translations.md §9). En sida är en struktur
-- och ett överlägg per språk med bara text — page_translations. Ett
-- blogginlägg är samma sak: ett källinlägg i sitt språk, och per annat språk
-- titel, utdrag, meta, alt-text och brödtexten som EN dokumentenhet. I stället
-- för en tabell per innehållstyp blir överlägget generiskt:
--
--   content_translations (entity, entity_id, locale, …)   nyckel (entity, entity_id, locale)
--
-- page_translations flyttas in som entity = 'page' och ersätts av en vy med
-- samma kolumner, så en läsare som ännu inte är omdeployad (Vercel-frontend,
-- en gammal edge-funktion) fortsätter att läsa. Vyn är för LÄSNING; all kod i
-- repot skriver content_translations.
--
-- blog_posts får `locale` — källspråket PER INLÄGG (nordbrygg har både svenska
-- och engelska källinlägg). Det föds ur site_languages.default av en trigger,
-- samma regel som pages och kb_articles; befintliga inlägg får sajtens språk
-- och rättas per inlägg av den som driver instansen.
--
-- Bevisar sig själv vid varje applicering (ingen CI har en databas).

-- ── Tabellen ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_translations (
  entity         text NOT NULL,
  entity_id      uuid NOT NULL,
  locale         text NOT NULL,
  status         text NOT NULL DEFAULT 'draft',
  slug           text,
  strings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage       integer,
  translated_at  timestamptz,
  translated_by  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, entity_id, locale),
  CONSTRAINT content_translations_entity_check CHECK (entity IN ('page', 'blog_post')),
  CONSTRAINT content_translations_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT content_translations_locale_check CHECK (locale = lower(btrim(locale)) AND locale <> '')
);

COMMENT ON TABLE public.content_translations IS
  'Språköverlägg per (innehåll, språk): bara text, nycklad per enhet med source_hash av källtexten. '
  'entity = page (enheter <block.id>.<sökväg>, page.title, page.meta.<key>) eller blog_post '
  '(post.title, post.excerpt, post.meta.<key>, post.content, post.featured_image_alt). '
  'Strukturen bor i källraden; en enhet utan post visar källtexten, synligt och räknat.';
COMMENT ON COLUMN public.content_translations.slug IS
  'Frivillig adress per språk. NULL = källradens slug under språkprefixet. Unik per (entity, locale).';

CREATE INDEX IF NOT EXISTS idx_content_translations_entity_locale_status
  ON public.content_translations (entity, locale, status);
CREATE INDEX IF NOT EXISTS idx_content_translations_entity_id
  ON public.content_translations (entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS content_translations_entity_locale_slug_key
  ON public.content_translations (entity, locale, slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS content_translations_set_updated_at ON public.content_translations;
CREATE TRIGGER content_translations_set_updated_at
  BEFORE UPDATE ON public.content_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Flytten: page_translations → entity = 'page' ───────────────────────────
-- Bara när page_translations fortfarande är en TABELL; vid nästa applicering
-- är den en vy och inget flyttas igen.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'page_translations' AND c.relkind = 'r'
  ) THEN
    INSERT INTO public.content_translations
      (entity, entity_id, locale, status, slug, strings, coverage, translated_at, translated_by, created_at, updated_at)
    SELECT 'page', page_id, locale, status, slug, strings, coverage, translated_at, translated_by, created_at, updated_at
      FROM public.page_translations
    ON CONFLICT (entity, entity_id, locale) DO NOTHING;
    DROP TABLE public.page_translations;
  END IF;
END $$;

-- Läskompatibiliteten: samma kolumner som tabellen hade. security_invoker så
-- att läsarens RLS gäller, inte vyägarens.
CREATE OR REPLACE VIEW public.page_translations WITH (security_invoker = true) AS
  SELECT entity_id AS page_id, locale, status, slug, strings, coverage,
         translated_at, translated_by, created_at, updated_at
    FROM public.content_translations
   WHERE entity = 'page';

COMMENT ON VIEW public.page_translations IS
  'Läskompatibilitet: content_translations WHERE entity = ''page''. Skriv content_translations.';

REVOKE ALL ON public.page_translations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.page_translations TO anon, authenticated, service_role;

-- ── Källan försvinner → överläggen försvinner ─────────────────────────────
-- Ingen främmande nyckel kan peka på två tabeller; triggrar gör kaskaden.
CREATE OR REPLACE FUNCTION public.content_translations_cascade()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.content_translations
   WHERE entity = TG_ARGV[0] AND entity_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS pages_content_translations_cascade ON public.pages;
CREATE TRIGGER pages_content_translations_cascade
  AFTER DELETE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.content_translations_cascade('page');

DROP TRIGGER IF EXISTS blog_posts_content_translations_cascade ON public.blog_posts;
CREATE TRIGGER blog_posts_content_translations_cascade
  AFTER DELETE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.content_translations_cascade('blog_post');

-- ── Åtkomst ────────────────────────────────────────────────────────────────
-- Besökaren läser ett PUBLICERAT överlägg av PUBLICERAT innehåll — samma
-- gräns som källtabellen har. Personal läser allt och skriver.
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_translations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.content_translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.content_translations TO authenticated;
GRANT ALL ON public.content_translations TO service_role;

DROP POLICY IF EXISTS "content_translations_public_read" ON public.content_translations;
CREATE POLICY "content_translations_public_read" ON public.content_translations
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND (
      (entity = 'page' AND EXISTS (
        SELECT 1 FROM public.pages p
         WHERE p.id = content_translations.entity_id
           AND p.status = 'published' AND p.deleted_at IS NULL))
      OR
      (entity = 'blog_post' AND EXISTS (
        SELECT 1 FROM public.blog_posts b
         WHERE b.id = content_translations.entity_id
           AND b.status = 'published'))
    )
  );

DROP POLICY IF EXISTS "content_translations_staff_read" ON public.content_translations;
CREATE POLICY "content_translations_staff_read" ON public.content_translations
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "content_translations_staff_write" ON public.content_translations;
CREATE POLICY "content_translations_staff_write" ON public.content_translations
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ── Ett blogginlägg föds i sajtens språk ──────────────────────────────────
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS locale text;

COMMENT ON COLUMN public.blog_posts.locale IS
  'Inläggets källspråk. Övriga språk är överlägg i content_translations (entity = blog_post). '
  'Föds ur site_languages.default av triggern blog_posts_set_locale — aldrig en kolumndefault.';

-- Befintliga inlägg: sajtens språk — det enda de kan sägas vara skrivna på
-- när kolumnen inte fanns. Ett inlägg i ett annat språk rättas per inlägg.
UPDATE public.blog_posts
   SET locale = coalesce(
         (SELECT lower(value ->> 'default') FROM public.site_settings WHERE key = 'site_languages'), 'en')
 WHERE locale IS NULL OR btrim(locale) = '';

CREATE OR REPLACE FUNCTION public.blog_posts_default_locale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.locale IS NULL OR trim(NEW.locale) = '' THEN
    SELECT lower(coalesce(value ->> 'default', 'en')) INTO NEW.locale
      FROM site_settings WHERE key = 'site_languages';
    NEW.locale := coalesce(NEW.locale, 'en');
  ELSE
    NEW.locale := lower(trim(NEW.locale));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS blog_posts_set_locale ON public.blog_posts;
CREATE TRIGGER blog_posts_set_locale
  BEFORE INSERT OR UPDATE OF locale ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.blog_posts_default_locale();

COMMENT ON FUNCTION public.blog_posts_default_locale() IS
  'Ger ett nytt blogginlägg sajtens standardspråk när ingen locale anges (samma regel som pages och kb_articles).';

CREATE INDEX IF NOT EXISTS idx_blog_posts_locale ON public.blog_posts (locale);

-- ── Bloggen i ett språk ────────────────────────────────────────────────────
-- "Vilka inlägg finns på svenska?" — de skrivna på svenska och de med ett
-- publicerat svenskt överlägg. Returnerar blog_posts-rader så att PostgREST
-- kan bädda in författare, kategorier och taggar och sidbryta som vanligt;
-- SECURITY INVOKER, så läsarens RLS gäller (besökaren ser bara publicerat).
CREATE OR REPLACE FUNCTION public.blog_posts_in_language(p_lang text)
RETURNS SETOF public.blog_posts
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT b.*
    FROM public.blog_posts b
   WHERE split_part(lower(coalesce(b.locale, '')), '-', 1) = split_part(lower(btrim(p_lang)), '-', 1)
      OR EXISTS (
           SELECT 1 FROM public.content_translations t
            WHERE t.entity = 'blog_post' AND t.entity_id = b.id
              AND t.status = 'published'
              AND split_part(t.locale, '-', 1) = split_part(lower(btrim(p_lang)), '-', 1))
$$;

GRANT EXECUTE ON FUNCTION public.blog_posts_in_language(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.blog_posts_in_language(text) IS
  'Blogginläggen som finns i ett språk: skrivna i det, eller med ett publicerat överlägg i det. Läsarna lägger texten på (post-language.ts).';

-- ── Språkversionerna av en sida läser den generiska tabellen ──────────────
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

  IF v_page.translation_group_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'slug', p.slug, 'locale', p.locale, 'title', p.title,
             'source', 'row', 'page_slug', p.slug) ORDER BY p.locale), '[]'::jsonb)
      INTO v_rows
      FROM public.pages p
     WHERE p.translation_group_id = v_page.translation_group_id
       AND p.status = 'published' AND p.deleted_at IS NULL;
  END IF;

  IF v_page.status = 'published' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'slug', v_page.slug, 'locale', t.locale,
             'title', COALESCE(t.strings -> 'page.title' ->> 'text', v_page.title),
             'source', 'overlay', 'page_slug', v_page.slug) ORDER BY t.locale), '[]'::jsonb)
      INTO v_overlays
      FROM public.content_translations t
     WHERE t.entity = 'page' AND t.entity_id = v_page.id AND t.status = 'published';
  END IF;

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

-- ── Bevis vid varje applicering ────────────────────────────────────────────
-- En tillfällig sida och ett tillfälligt inlägg; allt raderas igen.
DO $$
DECLARE
  v_page uuid;
  v_post uuid;
  v_n int;
  v_default text;
  v_locale text;
  v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT lower(value ->> 'default') INTO v_default FROM site_settings WHERE key = 'site_languages';
  v_default := coalesce(v_default, 'en');

  -- En sida: överlägget i den generiska tabellen syns i vyn och i RPC:n.
  INSERT INTO public.pages (slug, title, status, locale, content_json)
    VALUES ('__content_translations_proof__', 'Tjänster', 'published', 'sv', '[]'::jsonb)
    RETURNING id INTO v_page;
  INSERT INTO public.content_translations (entity, entity_id, locale, status, strings)
    VALUES ('page', v_page, 'en', 'published', '{"page.title": {"text": "Services", "source_hash": "x"}}'::jsonb);
  SELECT count(*) INTO v_n FROM public.page_translations WHERE page_id = v_page;
  IF v_n <> 1 THEN RAISE EXCEPTION 'page_translations view does not show the page overlay (% rows)', v_n; END IF;
  v := public.get_page_translations('__content_translations_proof__') -> 'translations';
  IF NOT (v @> '[{"locale": "en", "title": "Services", "source": "overlay"}]'::jsonb) THEN
    RAISE EXCEPTION 'get_page_translations does not read content_translations: %', v;
  END IF;

  -- Ett inlägg föds i sajtens språk.
  INSERT INTO public.blog_posts (slug, title, status, content_json)
    VALUES ('__content_translations_proof__', 'Proof', 'draft', '{"type":"doc","content":[]}'::jsonb)
    RETURNING id, locale INTO v_post, v_locale;
  IF v_locale IS DISTINCT FROM v_default THEN
    RAISE EXCEPTION 'blog_posts.locale was born %, expected the site default %', v_locale, v_default;
  END IF;

  BEGIN
    INSERT INTO public.content_translations (entity, entity_id, locale) VALUES ('blog_post', v_post, 'SV');
    RAISE EXCEPTION 'content_translations accepted an upper-case locale';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.content_translations (entity, entity_id, locale) VALUES ('product', v_post, 'sv');
    RAISE EXCEPTION 'content_translations accepted an unknown entity';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.content_translations (entity, entity_id, locale, status, strings)
    VALUES ('blog_post', v_post, 'zz', 'published', '{"post.title": {"text": "Bevis", "source_hash": "x"}}'::jsonb);
  SELECT count(*) INTO v_n FROM public.blog_posts_in_language('zz') WHERE id = v_post;
  IF v_n <> 1 THEN RAISE EXCEPTION 'blog_posts_in_language does not list a post with a published overlay'; END IF;
  UPDATE public.content_translations SET status = 'draft' WHERE entity = 'blog_post' AND entity_id = v_post;
  SELECT count(*) INTO v_n FROM public.blog_posts_in_language('zz') WHERE id = v_post;
  IF v_n <> 0 THEN RAISE EXCEPTION 'blog_posts_in_language lists a post whose overlay is a draft'; END IF;
  SELECT count(*) INTO v_n FROM public.blog_posts_in_language(v_default) WHERE id = v_post;
  IF v_n <> 1 THEN RAISE EXCEPTION 'blog_posts_in_language does not list a post in its own language'; END IF;

  -- Källan raderas → överläggen följer med.
  DELETE FROM public.blog_posts WHERE id = v_post;
  -- Revisionen raderingen lämnade efter sig (trg_blog_posts_revision) är provets, inte innehåll.
  DELETE FROM public.blog_post_revisions WHERE post_id = v_post;
  DELETE FROM public.pages WHERE id = v_page;
  SELECT count(*) INTO v_n FROM public.content_translations WHERE entity_id IN (v_post, v_page);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'content_translations did not follow its source on delete (% rows left)', v_n;
  END IF;
END $$;
