-- En ny instans föds engelsk — uttryckligen, inte av en slump.
--
-- Föregående steg lät standardspråket ÄRVAS från `platform_locale` första
-- gången. Det är rätt för en instans som redan har innehåll: den enda signal
-- som finns om vad som faktiskt är skrivet där.
--
-- MEN ARVET VAR EN LATENT KOPPLING. En färsk instans har ingen
-- platform_locale-rad — ingen migrering seedar den; sv-SE finns bara som
-- klient-fallback vid VISNING — så den föll redan igenom till 'en'. Alltså rätt
-- svar av fel skäl: språket hängde på att en rad råkade saknas. Första gången
-- något skriver platform_locale under onboarding hade sajtens språk tyst följt
-- med formatinställningen.
--
-- Historiskt hade Sverige en riktig anledning att sippra in: bokföringsmodulen
-- kunde inte födas utan kontoplan, så BAS 2024 laddades för att modulen
-- behövde något. Det är redan avvecklat — 20260822234500 ("a country is a
-- CHOICE, not a default") tog bort de 26 svenska konton som fyra migreringar
-- planterat, och account_for() vägrar nu högljutt när ingen kontoplan valts.
-- Kvar finns bara formatfallbacken, som styr sifferformat och inte språk.
--
-- Så: beslutet skrivs ut. En instans utan sidor har inget innehåll att ha fel
-- om och föds engelsk. Har den sidor är formatinställningen fortfarande den
-- bästa ledtråden om vilket språk de är skrivna på, och ärvs som förut — det är
-- vad som skyddar de fyra svenska sajter som ännu inte kört migreringen från
-- att få sina sidor märkta som engelska.
--
-- Ordningen blir den avsedda:
--   installera  → engelska
--   lägg till svenska, gör den till standard
--   bygg sidorna  → de föds svenska
--   publicera engelska versioner när ni vill

CREATE OR REPLACE FUNCTION public.ensure_site_languages()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing jsonb;
  v_default text;
  v_enabled text[];
  v_has_pages boolean;
BEGIN
  SELECT value INTO v_existing FROM site_settings WHERE key = 'site_languages';

  SELECT EXISTS (SELECT 1 FROM pages WHERE deleted_at IS NULL) INTO v_has_pages;

  IF v_has_pages THEN
    -- Instansen har innehåll. Formatinställningen är den enda ledtråden om
    -- vilket språk det är skrivet på, så den ärvs — en gång.
    SELECT lower(split_part(coalesce(value ->> 'default_locale', 'en'), '-', 1))
      INTO v_default FROM site_settings WHERE key = 'platform_locale';
  ELSE
    -- Ingenting är skrivet än. Då finns inget att ha fel om, och produkten
    -- föds på sitt eget språk i stället för på Sveriges.
    v_default := 'en';
  END IF;

  -- Ett redan fattat beslut vinner alltid över härledningen.
  v_default := coalesce(v_existing ->> 'default', nullif(v_default, ''), 'en');

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

  RETURN jsonb_build_object(
    'default', v_default,
    'enabled', coalesce(v_enabled, ARRAY[v_default]),
    'inherited_from_platform_locale', v_has_pages AND (v_existing ->> 'default') IS NULL);
END $$;

COMMENT ON FUNCTION public.ensure_site_languages() IS
  'Seedar site_settings.site_languages. En instans UTAN sidor föds engelsk; '
  'en med sidor ärver språket från platform_locale en gång, eftersom det är '
  'den enda ledtråden om vad som redan är skrivet. Ett fattat beslut vinner '
  'alltid över härledningen.';

DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.ensure_site_languages();
END $$;
