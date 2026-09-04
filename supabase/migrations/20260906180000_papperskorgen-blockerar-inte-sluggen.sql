-- Papperskorgen blockerar inte sluggen.
--
-- manage_page_translation('create') frågade "finns sluggen?" utan att titta på
-- deleted_at. En sida i papperskorgen räknades som upptagen, och den nya
-- versionen fick ett hash-suffix: "flowpilot-se-c6b7" i stället för
-- "flowpilot-se". På www.flowwink.com (2026-09-04) blev det så för alla 16
-- kopior efter att en första omgång raderats, och sluggarna gick inte längre
-- att känna igen. Det unika indexet (pages_slug_unique_active) gäller bara
-- aktiva rader — kontrollen ska göra detsamma.
--
-- Kroppen är 20260708090000:s ordagrant, med ett enda tillägg i create-grenen.

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
    -- Only an ACTIVE page occupies a slug; the trash does not (matches the
    -- partial unique index pages_slug_unique_active).
    IF EXISTS (SELECT 1 FROM public.pages WHERE slug = v_new_slug AND deleted_at IS NULL) THEN
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
GRANT EXECUTE ON FUNCTION public.manage_page_translation(text, text, text, text, text) TO authenticated, service_role;
