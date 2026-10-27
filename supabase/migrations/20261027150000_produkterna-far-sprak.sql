-- ─────────────────────────────────────────────────────────────────────────────
-- Produkterna får språk — products and categories on the overlay model (§10)
-- ─────────────────────────────────────────────────────────────────────────────
-- A product is stored ONCE, in the site's language; every other language is
-- an overlay of its text (name, description) in content_translations, the
-- same table pages and blog posts use — stale per unit when the source
-- changes, published per language. This is also Shopify's model: translations
-- live beside the product per field and locale, the primary locale is the
-- record, and untranslated content falls back to it. One difference from a
-- blog post: a product is never absent in a language — a shop sells the same
-- products everywhere, so a missing translation shows the source text.
--
-- The entity CHECK and the public-read policy learn the two new entities (an
-- overlay of an inactive product is not public); products and categories get
-- a source `locale` born from site_languages.default; deleting a product
-- deletes its overlays.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER TABLE public.content_translations DROP CONSTRAINT IF EXISTS content_translations_entity_check;
  ALTER TABLE public.content_translations
    ADD CONSTRAINT content_translations_entity_check CHECK (entity IN ('page', 'blog_post', 'product', 'product_category'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
      OR
      (entity = 'product' AND EXISTS (
        SELECT 1 FROM public.products pr
         WHERE pr.id = content_translations.entity_id
           AND pr.is_active = true))
      OR
      (entity = 'product_category' AND EXISTS (
        SELECT 1 FROM public.product_categories pc
         WHERE pc.id = content_translations.entity_id
           AND pc.is_active = true))
    )
  );

-- ── A product is born in the site's language ───────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS locale text;
COMMENT ON COLUMN public.products.locale IS
  'The product''s source language. Other languages are overlays in content_translations (entity = product). Born from site_languages.default by the trigger products_set_locale — never a column default.';
COMMENT ON COLUMN public.product_categories.locale IS
  'The category''s source language; overlays in content_translations (entity = product_category).';

-- One trigger body for every content row that is born in the site's language.
CREATE OR REPLACE FUNCTION public.content_default_locale()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.locale IS NULL OR trim(NEW.locale) = '' THEN
    SELECT lower(coalesce(value ->> 'default', 'en')) INTO NEW.locale
      FROM site_settings WHERE key = 'site_languages';
    NEW.locale := coalesce(NEW.locale, 'en');
  ELSE
    NEW.locale := lower(trim(NEW.locale));
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS products_set_locale ON public.products;
CREATE TRIGGER products_set_locale
  BEFORE INSERT OR UPDATE OF locale ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.content_default_locale();
DROP TRIGGER IF EXISTS product_categories_set_locale ON public.product_categories;
CREATE TRIGGER product_categories_set_locale
  BEFORE INSERT OR UPDATE OF locale ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.content_default_locale();

-- Existing rows: the site's language — the only one they can be said to be written in.
DO $$
DECLARE v_default text;
BEGIN
  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default FROM public.site_settings WHERE key = 'site_languages';
  v_default := coalesce(v_default, 'en');
  UPDATE public.products SET locale = v_default WHERE locale IS NULL OR trim(locale) = '';
  UPDATE public.product_categories SET locale = v_default WHERE locale IS NULL OR trim(locale) = '';
END $$;

-- Deleting the product deletes its overlays (no FK can point at two tables).
DROP TRIGGER IF EXISTS products_content_translations_cascade ON public.products;
CREATE TRIGGER products_content_translations_cascade
  AFTER DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.content_translations_cascade('product');
DROP TRIGGER IF EXISTS product_categories_content_translations_cascade ON public.product_categories;
CREATE TRIGGER product_categories_content_translations_cascade
  AFTER DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.content_translations_cascade('product_category');

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A product is born in the site's language; its published Swedish overlay is
-- readable as anon while the product is active and invisible once archived;
-- deleting the product takes the overlay with it. Rolled back.
DO $$
DECLARE v_id uuid; v_locale text; v_default text; v_n int;
BEGIN
  BEGIN
    SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default FROM public.site_settings WHERE key = 'site_languages';
    v_default := coalesce(v_default, 'en');
    INSERT INTO public.products (name, description, price_cents, currency, is_active)
      VALUES ('proof: wool sweater', 'Warm, knitted, lasts.', 129900, public.business_currency(), true) RETURNING id, locale INTO v_id, v_locale;
    IF v_locale IS DISTINCT FROM v_default THEN RAISE EXCEPTION 'proof: product locale should be % got %', v_default, v_locale; END IF;
    INSERT INTO public.content_translations (entity, entity_id, locale, status, strings, coverage)
      VALUES ('product', v_id, CASE WHEN v_default = 'sv' THEN 'en' ELSE 'sv' END, 'published',
              jsonb_build_object('product.name', jsonb_build_object('text', 'proof: ulltröja', 'source_hash', 'x')), 50);
    -- Anon sees the published overlay of an active product …
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT COUNT(*) INTO v_n FROM public.content_translations WHERE entity = 'product' AND entity_id = v_id;
    EXECUTE 'RESET ROLE';
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: anon should read the active product''s published overlay, got %', v_n; END IF;
    -- … and not of an archived one.
    UPDATE public.products SET is_active = false WHERE id = v_id;
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT COUNT(*) INTO v_n FROM public.content_translations WHERE entity = 'product' AND entity_id = v_id;
    EXECUTE 'RESET ROLE';
    IF v_n <> 0 THEN RAISE EXCEPTION 'proof: anon should not read an archived product''s overlay, got %', v_n; END IF;
    -- Deleting the product deletes the overlay.
    DELETE FROM public.products WHERE id = v_id;
    SELECT COUNT(*) INTO v_n FROM public.content_translations WHERE entity = 'product' AND entity_id = v_id;
    IF v_n <> 0 THEN RAISE EXCEPTION 'proof: the overlay should cascade with the product'; END IF;
    RAISE NOTICE 'products language proof ok';
    RAISE EXCEPTION '__products_language_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
      IF SQLERRM <> '__products_language_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
