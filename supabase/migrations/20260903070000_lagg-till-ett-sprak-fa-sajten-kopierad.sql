-- Lägg till ett språk, få sajten kopierad.
--
-- En mall installeras och sajten är engelsk. Vill man ha en svensk variant av
-- launchpad snabbt är arbetet inte att bygga om något — det är att kopiera
-- sidorna och byta text. Men att kopiera fanns bara EN SIDA I TAGET
-- (manage_page_translation create), så en tiosidig mall betydde tio anrop och
-- att komma ihåg vilka som var gjorda.
--
-- Det gjorde att "lägg till ett språk" i praktiken inte var en handling utan ett
-- projekt, och det är precis varför språk kändes svårare än det är. Ordningen
-- ska vara:
--
--   installera mallen        → engelsk sajt
--   lägg till svenska        → varenda sida finns som svenskt utkast
--   översätt texten          → för hand eller av FlowPilot
--   gör svenska till standard
--
-- Funktionen ANROPAR manage_page_translation i stället för att göra om dess
-- arbete. Slug-regler, grupphantering och krockar bor kvar på ett ställe; det
-- här steget lägger bara till svaret på "alla".
CREATE OR REPLACE FUNCTION public.translate_site_into(
  p_locale  text,
  p_dry_run boolean DEFAULT true,
  p_limit   integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_locale text;
  v_default text;
  v_copied jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_pending int := 0;
  r record;
  v_res jsonb;
  v_enabled jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'pages')) THEN
    RAISE EXCEPTION 'Requires the pages module — an admin can grant it under Users → Role Permissions';
  END IF;

  v_locale := lower(trim(coalesce(p_locale, '')));
  IF v_locale !~ '^[a-z]{2}(-[a-z0-9]{2,8})?$' THEN
    RAISE EXCEPTION 'Not a language tag: "%". Use a form like "sv", "de" or "en-GB".', p_locale;
  END IF;

  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default
    FROM site_settings WHERE key = 'site_languages';
  v_default := coalesce(v_default, 'en');

  IF v_locale = v_default THEN
    RETURN jsonb_build_object('ok', false,
      'reason', format('%s is already the site''s language — there is nothing to copy from.', v_locale));
  END IF;

  -- Källan är sidorna på sajtens eget språk som ännu SAKNAR en version i
  -- målspråket. Att köra funktionen två gånger kopierar alltså ingenting extra.
  FOR r IN
    SELECT p.id, p.slug, p.title
      FROM pages p
     WHERE p.deleted_at IS NULL
       AND p.status = 'published'
       AND lower(coalesce(p.locale, v_default)) = v_default
       AND NOT EXISTS (
         SELECT 1 FROM pages q
          WHERE q.translation_group_id IS NOT NULL
            AND q.translation_group_id = p.translation_group_id
            AND lower(q.locale) = v_locale
            AND q.deleted_at IS NULL)
     ORDER BY p.menu_order NULLS LAST, p.title
     LIMIT greatest(1, least(coalesce(p_limit, 200), 1000))
  LOOP
    v_pending := v_pending + 1;
    CONTINUE WHEN p_dry_run;
    BEGIN
      -- Titeln följer med som den är. Standardsuffixet "(sv)" hade varit en
      -- att-göra-lapp som blir kvar som skräp när texten väl är översatt.
      v_res := public.manage_page_translation('create', r.slug, v_locale, NULL, r.title);
      v_copied := v_copied || jsonb_build_object('from', r.slug, 'to', v_res ->> 'slug');
    EXCEPTION WHEN others THEN
      v_failed := v_failed || jsonb_build_object('page', r.slug, 'why', SQLERRM);
    END;
  END LOOP;

  -- Språket in i deklarationen, annars vore kopiorna osynliga i växlaren.
  IF NOT p_dry_run AND jsonb_array_length(v_copied) > 0 THEN
    SELECT coalesce(value -> 'enabled', '[]'::jsonb) INTO v_enabled
      FROM site_settings WHERE key = 'site_languages';
    IF NOT (v_enabled @> to_jsonb(v_locale)) THEN
      UPDATE site_settings
         SET value = jsonb_set(value, '{enabled}', v_enabled || to_jsonb(v_locale))
       WHERE key = 'site_languages';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'locale', v_locale,
    'source_language', v_default,
    'pages_without_a_version', v_pending,
    'copied', v_copied,
    'failed', v_failed,
    'note', CASE
      WHEN v_pending = 0 THEN format('Every published %s page already has a %s version.', v_default, v_locale)
      WHEN p_dry_run THEN format('%s published page(s) would be copied into %s as DRAFTS. Nothing is written until dry_run is false.', v_pending, v_locale)
      ELSE format('%s page(s) copied into %s as drafts — translate the text, then publish each one.', jsonb_array_length(v_copied), v_locale)
    END);
END $$;

REVOKE ALL ON FUNCTION public.translate_site_into(text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.translate_site_into(text, boolean, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.translate_site_into(text, boolean, integer) IS
  'Kopierar varje publicerad sida på sajtens språk till ett utkast i ett nytt '
  'språk, och lägger till språket i site_languages. Anropar '
  'manage_page_translation — slug-regler och grupphantering bor kvar där. '
  'Idempotent: sidor som redan har en version hoppas över.';
