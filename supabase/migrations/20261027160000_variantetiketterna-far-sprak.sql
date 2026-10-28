-- ─────────────────────────────────────────────────────────────────────────────
-- Variantetiketterna får språk — attribute names and values on the overlay model (§10)
-- ─────────────────────────────────────────────────────────────────────────────
-- A variant's label ("Red / M") is its attribute values; the selector's
-- headings are the attribute names. product_attributes and their values are
-- site-wide (an attribute's name is unique), so a label is translated ONCE
-- per attribute and every product that uses it follows: entity
-- product_attribute, one overlay per attribute per language, units
-- attribute.name and attribute.value.<value id>. Price delta, SKU and stock
-- are facts and stay. A missing translation shows the source text, as for
-- the product itself.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER TABLE public.content_translations DROP CONSTRAINT IF EXISTS content_translations_entity_check;
  ALTER TABLE public.content_translations
    ADD CONSTRAINT content_translations_entity_check
    CHECK (entity IN ('page', 'blog_post', 'product', 'product_category', 'product_attribute'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Attributes are readable by everyone (anon-surface policies), so their
-- published overlays are too.
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
      OR
      (entity = 'product_attribute' AND EXISTS (
        SELECT 1 FROM public.product_attributes pa
         WHERE pa.id = content_translations.entity_id))
    )
  );

-- An attribute is born in the site's language, like a product.
ALTER TABLE public.product_attributes ADD COLUMN IF NOT EXISTS locale text;
COMMENT ON COLUMN public.product_attributes.locale IS
  'The attribute''s source language (its name and values). Other languages are overlays in content_translations (entity = product_attribute). Born from site_languages.default by the trigger product_attributes_set_locale.';

DROP TRIGGER IF EXISTS product_attributes_set_locale ON public.product_attributes;
CREATE TRIGGER product_attributes_set_locale
  BEFORE INSERT OR UPDATE OF locale ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.content_default_locale();

DO $$
DECLARE v_default text;
BEGIN
  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default FROM public.site_settings WHERE key = 'site_languages';
  UPDATE public.product_attributes SET locale = coalesce(v_default, 'en') WHERE locale IS NULL OR trim(locale) = '';
END $$;

DROP TRIGGER IF EXISTS product_attributes_content_translations_cascade ON public.product_attributes;
CREATE TRIGGER product_attributes_content_translations_cascade
  AFTER DELETE ON public.product_attributes
  FOR EACH ROW EXECUTE FUNCTION public.content_translations_cascade('product_attribute');

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- An attribute is born in the site's language; its published overlay is
-- readable as anon; deleting the attribute takes the overlay with it. Rolled back.
DO $$
DECLARE v_id uuid; v_val uuid; v_locale text; v_default text; v_n int;
BEGIN
  BEGIN
    SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default FROM public.site_settings WHERE key = 'site_languages';
    v_default := coalesce(v_default, 'en');
    INSERT INTO public.product_attributes (name) VALUES ('proof: colour ' || gen_random_uuid()::text) RETURNING id, locale INTO v_id, v_locale;
    IF v_locale IS DISTINCT FROM v_default THEN RAISE EXCEPTION 'proof: attribute locale should be % got %', v_default, v_locale; END IF;
    INSERT INTO public.product_attribute_values (attribute_id, value) VALUES (v_id, 'Red') RETURNING id INTO v_val;
    INSERT INTO public.content_translations (entity, entity_id, locale, status, strings, coverage)
      VALUES ('product_attribute', v_id, CASE WHEN v_default = 'sv' THEN 'en' ELSE 'sv' END, 'published',
              jsonb_build_object('attribute.name', jsonb_build_object('text', 'Färg', 'source_hash', 'x'),
                                 'attribute.value.' || v_val::text, jsonb_build_object('text', 'Röd', 'source_hash', 'x')), 100);
    EXECUTE 'SET LOCAL ROLE anon';
    SELECT COUNT(*) INTO v_n FROM public.content_translations WHERE entity = 'product_attribute' AND entity_id = v_id;
    EXECUTE 'RESET ROLE';
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: anon should read the attribute''s published overlay, got %', v_n; END IF;
    DELETE FROM public.product_attributes WHERE id = v_id;
    SELECT COUNT(*) INTO v_n FROM public.content_translations WHERE entity = 'product_attribute' AND entity_id = v_id;
    IF v_n <> 0 THEN RAISE EXCEPTION 'proof: the overlay should cascade with the attribute'; END IF;
    RAISE NOTICE 'variant labels language proof ok';
    RAISE EXCEPTION '__variant_labels_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
      IF SQLERRM <> '__variant_labels_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
