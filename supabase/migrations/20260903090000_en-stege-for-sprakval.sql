-- En stege för språkval, i stället för fyra stavningar av samma sak.
--
-- FlowWink svarar nu på frågan "vilken version ska visas?" på fyra ställen:
-- besökarens sida, adminens arbetsspråk, ui_text-packet, och härnäst
-- e-postmallen som väljs åt en mottagare. Var och en hade börjat odla sin egen
-- stavning av samma stege — vilket är hur tre implementationer blir tre
-- beteenden.
--
-- Stegen, en gång:
--   1. exakt tagg          'sv-SE' svarar på 'sv-SE'
--   2. samma språk         'sv' svarar på 'sv-SE', och 'en-GB' svarar på 'en'
--   3. sajtens standard    det operatören deklarerat
--   4. ingenting           anroparen avgör vad en frånvaro betyder
--
-- Steg 4 är avsiktligt. En sida utan version i det önskade språket får INTE
-- tyst bli ett annat språk; en sträng utan översättning ska falla till
-- engelskan i koden. Det är olika svar på samma frånvaro, så funktionen
-- rapporterar den i stället för att välja.
--
-- Tvillingen bor i src/lib/pick-locale.ts. Ändras den ena ska den andra ändras
-- — de delade fallen är pinnade i pick-locale.guardrails.test.ts.
CREATE OR REPLACE FUNCTION public.pick_locale(
  p_available text[],
  p_wanted    text DEFAULT NULL,
  p_fallback  text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_candidate text;
  v_tag text;
  v_hit text;
BEGIN
  IF p_available IS NULL OR array_length(p_available, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_candidate IN ARRAY ARRAY[p_wanted, p_fallback] LOOP
    v_tag := lower(trim(coalesce(v_candidate, '')));
    CONTINUE WHEN v_tag = '';

    -- 1. Exakt tagg.
    SELECT a INTO v_hit FROM unnest(p_available) AS a
     WHERE lower(trim(a)) = v_tag LIMIT 1;
    IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;

    -- 2. Samma språk. Den MINST specifika stavningen vinner, så en sajt med
    --    både 'en' och 'en-GB' svarar på 'en' med 'en'.
    SELECT a INTO v_hit FROM unnest(p_available) AS a
     WHERE split_part(lower(trim(a)), '-', 1) = split_part(v_tag, '-', 1)
     ORDER BY length(trim(a)), lower(trim(a)) LIMIT 1;
    IF v_hit IS NOT NULL THEN RETURN v_hit; END IF;
  END LOOP;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.pick_locale(text[], text, text) IS
  'Vilken språkversion som ska användas: exakt tagg → samma språk → sajtens '
  'standard → NULL. Returnerar aldrig en gissning. Tvilling till '
  'src/lib/pick-locale.ts.';

GRANT EXECUTE ON FUNCTION public.pick_locale(text[], text, text) TO authenticated, service_role, anon;

-- ── Stegen bevisas där den körs ────────────────────────────────────────────
-- Tvillingen i TypeScript pinnas av pick-locale.guardrails.test.ts. Den här
-- sidan kan inte nås därifrån — ingen CI har en databas — så den bevisar sig
-- själv vid varje applicering. Samma fall, samma ordning, båda språken.
DO $$
DECLARE
  v_cases jsonb := jsonb_build_array(
    jsonb_build_array('exact tag',            'sv,en',    'sv',    'en', 'sv'),
    jsonb_build_array('same language',        'sv,en',    'sv-SE', 'en', 'sv'),
    jsonb_build_array('en-GB answers en',     'en,sv',    'en-GB', 'sv', 'en'),
    jsonb_build_array('least specific wins',  'en-GB,en', 'en',    '',   'en'),
    jsonb_build_array('falls to the default', 'sv,en',    'de',    'en', 'en'),
    jsonb_build_array('no match is NULL',     'sv',       'de',    'fr', ''),
    jsonb_build_array('empty list is NULL',   '',         'sv',    'en', '')
  );
  c jsonb; v_got text; v_want text;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(v_cases) LOOP
    v_got := public.pick_locale(
      CASE WHEN c->>1 = '' THEN ARRAY[]::text[] ELSE string_to_array(c->>1, ',') END,
      nullif(c->>2, ''), nullif(c->>3, ''));
    v_want := nullif(c->>4, '');
    IF v_got IS DISTINCT FROM v_want THEN
      RAISE EXCEPTION 'pick_locale: % — expected %, got %',
        c->>0, coalesce(v_want, 'NULL'), coalesce(v_got, 'NULL');
    END IF;
  END LOOP;
  RAISE NOTICE 'pick_locale: % ladder case(s) hold', jsonb_array_length(v_cases);
END $$;
