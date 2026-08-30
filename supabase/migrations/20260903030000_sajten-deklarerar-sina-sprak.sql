-- Sajten deklarerar sina språk.
--
-- Fram till nu FANNS inte sajtens språk någonstans. De räknades fram genom att
-- skanna vilka sidor som råkade ha en locale, och vilket språk som var standard
-- härleddes ur `platform_locale` — en inställning som egentligen styr
-- sifferformat.
--
-- Konsekvenserna var tre, och alla tre är samma fel:
--   * Att lägga till ett språk blev en BIEFFEKT av att skapa en sida
--   * Det gick inte att BYTA standardspråk, för det fanns ingen ratt
--   * `pages.locale` defaultade till 'en' i schemat, så en läsare tvingades
--     gissa: "tro kolumnen bara om sidan ingår i en översättningsgrupp eller
--     värdet skiljer sig från defaulten"
--
-- Den gissningen var ett plåster på att sanningen saknades. Nu finns den:
--
--     site_settings.site_languages = {"default": "sv", "enabled": ["sv","en"]}
--
-- Ordningen blir den en människa faktiskt tänker sig: installera, lägg till
-- svenska, bygg sidorna, gör svenska till standard och låt engelska bli
-- valbar. Att kunna BYTA standard efteråt är detaljen som avslöjar att modellen
-- stämmer — den ratten fanns inte förut.

-- ── Inställningen seedas, och kan seedas om ────────────────────────────────
-- En re-asserterbar FUNKTION, inte en engångs-INSERT: en instans som föds efter
-- den här migreringen ska få samma sanning som en som redan finns.
CREATE OR REPLACE FUNCTION public.ensure_site_languages()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing jsonb;
  v_default text;
  v_enabled text[];
BEGIN
  SELECT value INTO v_existing FROM site_settings WHERE key = 'site_languages';

  -- Standardspråket ärvs från formatinställningen FÖRSTA gången, för det är
  -- den enda signal som finns om vad instansen faktiskt skriver på. Därefter
  -- är site_languages sin egen sanning och rör aldrig platform_locale igen.
  SELECT lower(split_part(coalesce(value ->> 'default_locale', 'en'), '-', 1))
    INTO v_default FROM site_settings WHERE key = 'platform_locale';
  v_default := coalesce(v_existing ->> 'default', nullif(v_default, ''), 'en');

  -- Varje språk som FAKTISKT används av en sida hör hemma i listan, oavsett hur
  -- det hamnade där. Att tappa ett skulle göra en publicerad sida onåbar ur
  -- växlaren.
  SELECT array_agg(DISTINCT x) INTO v_enabled FROM (
    SELECT v_default AS x
    UNION SELECT jsonb_array_elements_text(coalesce(v_existing -> 'enabled', '[]'::jsonb))
    UNION SELECT lower(p.locale) FROM pages p
           WHERE p.locale IS NOT NULL AND p.deleted_at IS NULL
             AND p.translation_group_id IS NOT NULL
  ) s WHERE x IS NOT NULL AND x <> '';

  INSERT INTO site_settings (key, value)
  VALUES ('site_languages', jsonb_build_object(
            'default', v_default,
            'enabled', to_jsonb(coalesce(v_enabled, ARRAY[v_default]))))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object('default', v_default, 'enabled', coalesce(v_enabled, ARRAY[v_default]));
END $$;

REVOKE ALL ON FUNCTION public.ensure_site_languages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_site_languages() TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_site_languages() IS
  'Seedar site_settings.site_languages. Standardspråket ärvs från '
  'platform_locale FÖRSTA gången; därefter är site_languages sin egen sanning.';

DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.ensure_site_languages();
END $$;

-- ── En ny sida föds i sajtens språk ────────────────────────────────────────
-- Kolumndefaulten 'en' var en lögn: den påstod engelska om varje sida på varje
-- instans, inklusive de fyra svenska. Den tas bort, och triggern fyller i
-- sanningen i stället.
ALTER TABLE public.pages ALTER COLUMN locale DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.pages_default_locale()
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

DROP TRIGGER IF EXISTS pages_set_locale ON public.pages;
CREATE TRIGGER pages_set_locale
  BEFORE INSERT ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.pages_default_locale();

COMMENT ON FUNCTION public.pages_default_locale() IS
  'Ger en ny sida sajtens standardspråk. Ersätter kolumndefaulten ''en'', som '
  'påstod engelska om varje sida på varje instans.';

-- ── Historiken riktas in ───────────────────────────────────────────────────
-- En sida UTAN översättningsgrupp har inget annat språk att vara skriven på än
-- sajtens eget — det följer av att den är ensam. Sidor som ingår i en grupp
-- rörs INTE: där har någon uttryckligen tilldelat språk.
DO $$
DECLARE v_default text; v_n int;
BEGIN
  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default
    FROM site_settings WHERE key = 'site_languages';

  UPDATE pages SET locale = v_default
   WHERE translation_group_id IS NULL
     AND coalesce(lower(locale), '') IS DISTINCT FROM v_default;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'pages.locale: % ungrouped page(s) aligned to the site language "%"', v_n, v_default;
END $$;
