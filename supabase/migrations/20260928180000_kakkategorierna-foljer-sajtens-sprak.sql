-- Kakkategorierna följer sajtens språk.
--
-- 20260704141730 seedade cookie_consent_v2 med SVENSKA etiketter och
-- beskrivningar ("Essentiella — Krävs för att sajten ska fungera.") på varje
-- instans, oavsett språk. Bannern låter operatörens ord vinna på sajtens eget
-- språk (operatorText), och seedens svenska ser ut som operatörens ord — så en
-- engelsk sajt visade svenska kategorier under engelska rubriker (MJP-demon och
-- www.flowwink.com, 2026-09-28). Samma klass som #513: kodens ord är inget
-- operatörsval.
--
-- Rättelsen läser sajtens DEKLARERADE språk (site_languages.default — den enda
-- läsaren av "vilket språk är sajten") och tömmer en kategoritext bara när
--   * sajtens språk inte är svenska (eller inte deklarerat), och
--   * texten fortfarande är EXAKT seedens — ingen har rört den.
-- Då svarar bannerns språkkedja: ui_text för sajtens språk, annars kodens
-- engelska. En svensk sajt behåller sina svenska kategorier; en redigerad text
-- (optic: "Nödvändiga") rörs aldrig; `required` rörs aldrig.
--
-- Idempotent: en andra körning hittar ingen seedtext kvar.

CREATE OR REPLACE FUNCTION public.cookie_categories_without_seed_swedish(p_value jsonb, p_site_lang text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  v_seed jsonb := '{
    "essential": {"label": "Essentiella", "description": "Krävs för att sajten ska fungera."},
    "analytics": {"label": "Analys", "description": "Anonym mätning av sidbesök och trafik."},
    "marketing": {"label": "Marknadsföring", "description": "Personalisering och beteendesignaler för säljteamet."}
  }'::jsonb;
  v_out jsonb := p_value;
  v_cat text; v_field text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value->'categories') <> 'object' THEN RETURN p_value; END IF;
  -- A Swedish site: the seed's words ARE in its language.
  IF lower(split_part(coalesce(p_site_lang, ''), '-', 1)) = 'sv' THEN RETURN p_value; END IF;
  FOR v_cat IN SELECT jsonb_object_keys(v_seed) LOOP
    FOREACH v_field IN ARRAY ARRAY['label', 'description'] LOOP
      IF v_out->'categories'->v_cat->>v_field = v_seed->v_cat->>v_field THEN
        v_out := v_out #- ARRAY['categories', v_cat, v_field];
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION public.cookie_categories_without_seed_swedish(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cookie_categories_without_seed_swedish(jsonb, text) TO authenticated, service_role;

UPDATE public.site_settings s
   SET value = public.cookie_categories_without_seed_swedish(s.value,
         (SELECT l.value->>'default' FROM public.site_settings l WHERE l.key = 'site_languages'))
 WHERE s.key = 'cookie_consent_v2'
   AND public.cookie_categories_without_seed_swedish(s.value,
         (SELECT l.value->>'default' FROM public.site_settings l WHERE l.key = 'site_languages')) IS DISTINCT FROM s.value;

-- Beviset
DO $proof$
DECLARE v jsonb := '{"enabled":true,"categories":{"essential":{"label":"Essentiella","description":"Krävs för att sajten ska fungera.","required":true},"analytics":{"label":"Analys","description":"Egen text","required":false},"marketing":{"label":"Nödvändiga","description":"Personalisering och beteendesignaler för säljteamet.","required":false}}}';
  r jsonb;
BEGIN
  r := public.cookie_categories_without_seed_swedish(v, 'en');
  IF r->'categories'->'essential' <> '{"required":true}'::jsonb THEN RAISE EXCEPTION 'proof failed: seed text on an English site stays → %', r->'categories'->'essential'; END IF;
  IF r->'categories'->'analytics'->>'description' <> 'Egen text' OR r->'categories'->'analytics' ? 'label' THEN RAISE EXCEPTION 'proof failed: an edited description must stay, the seed label must go → %', r->'categories'->'analytics'; END IF;
  IF r->'categories'->'marketing'->>'label' <> 'Nödvändiga' OR r->'categories'->'marketing' ? 'description' THEN RAISE EXCEPTION 'proof failed: per-field → %', r->'categories'->'marketing'; END IF;
  IF public.cookie_categories_without_seed_swedish(v, 'sv-SE') <> v THEN RAISE EXCEPTION 'proof failed: a Swedish site keeps the seed'; END IF;
  IF public.cookie_categories_without_seed_swedish(r, 'en') <> r THEN RAISE EXCEPTION 'proof failed: not idempotent'; END IF;
  IF (public.cookie_categories_without_seed_swedish(v, NULL)->'categories'->'essential') <> '{"required":true}'::jsonb THEN RAISE EXCEPTION 'proof failed: an undeclared language is treated as the product English'; END IF;
  RAISE NOTICE 'proof passed: seed Swedish leaves non-Swedish sites field by field, edited text and required stay, Swedish sites untouched, idempotent.';
END
$proof$;
