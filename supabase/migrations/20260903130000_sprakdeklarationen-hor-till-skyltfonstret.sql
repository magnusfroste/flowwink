-- Språkdeklarationen hör till skyltfönstret.
--
-- `site_languages` infördes i går som sanningen om vilka språk sajten publicerar
-- i och vilket en besökare får. Sedan lästes den av tre publika ytor — <html
-- lang>, hreflang-uppsättningen och ui_text-packets baslagerregel — utan att
-- någon kollade om en ANONYM besökare kommer åt raden.
--
-- Det gör den inte. Nyckelknippan (20260823120000) är avsiktligt fail closed:
-- en nyckel som inte står i listan är osynlig för anon, just så att nästa
-- utvecklare inte råkar publicera en hemlighet genom att skriva en rad. Den
-- disciplinen fungerade precis som den skulle — den fångade mig.
--
-- Symptomet var tyst och exakt så illa som en tyst sak brukar vara: på
-- optictunnels.se pekade `x-default` på den ENGELSKA sidan trots att sajtens
-- deklarerade standard är svenska. Hooken föll till sin inbyggda fallback
-- ('en') eftersom frågan gav noll rader, inte fel. Ingen varning, inget i
-- konsolen — bara fel marknad utpekad för sökmotorerna på en sajt som ska
-- lanseras.
--
-- site_languages innehåller inga hemligheter: två språkkoder och en lista.
-- Samma klass som platform_locale, som redan står i listan.
DO $$
DECLARE v_keys text[];
BEGIN
  SELECT array_agg(DISTINCT k ORDER BY k) INTO v_keys FROM (
    SELECT unnest(ARRAY[
      'aeo','blog','branding','chat','cookie_banner','cookie_consent_v2',
      'custom_scripts','customer_portal','demo_mode','general','maintenance',
      'modules','performance','platform_locale','quotes','sandbox_mode',
      'seo','store','ui_text','site_languages'
    ]) AS k
  ) s;

  DROP POLICY IF EXISTS "Public site config is readable" ON public.site_settings;
  EXECUTE format(
    'CREATE POLICY "Public site config is readable" ON public.site_settings '
    'FOR SELECT TO public USING (key = ANY (%L))', v_keys);

  RAISE NOTICE 'site_settings: % public keys', array_length(v_keys, 1);
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- Utan det här är den här migreringen bara ett påstående. Med den kan den inte
-- appliceras på en instans där den inte håller.
DO $$
DECLARE v_visible boolean; v_secret boolean;
BEGIN
  PERFORM public.ensure_site_languages();

  SET LOCAL ROLE anon;
  SELECT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'site_languages') INTO v_visible;
  -- Fail closed måste fortfarande gälla: en nyckel utanför listan får inte ha
  -- blivit synlig på köpet.
  SELECT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'integrations') INTO v_secret;
  RESET ROLE;

  IF NOT v_visible THEN
    RAISE EXCEPTION 'site_languages is still invisible to anon — the public site cannot read its own languages';
  END IF;
  IF v_secret THEN
    RAISE EXCEPTION 'the allowlist leaked: anon can now read "integrations", which is not public config';
  END IF;
  RAISE NOTICE 'anon sees site_languages, and still not integrations';
END $$;
