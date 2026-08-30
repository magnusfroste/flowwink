-- Kundryggraden, steg 13: parten har ett eget språk.
--
-- Invändningen "det finns ju i site settings" är halvt rätt, och den halvan
-- som fattas är hela poängen.
--
-- site_settings bär INSTANSENS språk: platform_locale styr hur vi formaterar,
-- accounting_locale vilken kontoplan vi kör, ui_text vad besökaren läser på
-- sajten. Ett värde per instans.
--
-- res.partner.lang är något annat: vilket språk DEN HÄR MOTPARTEN läser. Ett
-- värde per part. Ett svenskt bolag som säljer till en tysk kund behöver båda —
-- vår administration på svenska, deras faktura på tyska. I dag har vi bara det
-- första, så varje dokument går ut på instansens språk oavsett vem som får det.
--
-- OCH EN VIKTIG SKILLNAD MOT STEG 11: språk ärvs INTE som de kommersiella
-- fälten gör. Odoo kopierar förälderns språk som ett DEFAULTVÄRDE när barnet
-- skapas, men synkar det aldrig efteråt. Skälet är att momsnummer tillhör
-- bolaget medan språk tillhör människan: en tysktalande inköpare på ett
-- svenskt bolag ska ha sin post på tyska, och att bolaget byter språk får inte
-- skriva om hennes val. Vi gör likadant, och kontrasten står utskriven i
-- regressionskedjan så att ingen "harmoniserar" de två senare.
--
-- Och en regel som inte får glömmas: språket GISSAS ALDRIG ur landet. Ett
-- engelsktalande bolag i Sverige finns, och en gissning som är rätt nio gånger
-- av tio är fel på ett sätt som ingen upptäcker förrän kunden svarar på fel
-- språk.

-- ── Titlarna: en tabell, inte en enum ──────────────────────────────────────
-- Odoo har res.partner.title som en egen modell just för att listan är
-- organisationens, inte plattformens. Doktor, professor, greve — vad som
-- behövs skiljer sig åt, och en enum i koden hade krävt en migration för att
-- lägga till ett värde.
CREATE TABLE IF NOT EXISTS public.partner_titles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  shortcut  text,
  sequence  integer NOT NULL DEFAULT 10,
  active    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_titles_name_uniq ON public.partner_titles (lower(name));

COMMENT ON TABLE public.partner_titles IS
  'Tilltal (Odoo res.partner.title). Organisationens lista, inte plattformens '
  '— därför en tabell och inte en enum.';

ALTER TABLE public.partner_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Titles readable by authenticated" ON public.partner_titles;
CREATE POLICY "Titles readable by authenticated" ON public.partner_titles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Titles writable by party-owning roles" ON public.partner_titles;
CREATE POLICY "Titles writable by party-owning roles" ON public.partner_titles
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'companies') OR can_access_module(auth.uid(), 'leads'))
  WITH CHECK (can_access_module(auth.uid(), 'companies') OR can_access_module(auth.uid(), 'leads'));
REVOKE ALL ON public.partner_titles FROM anon;

-- Re-asserterbar seed: en engångs-INSERT överlever ingen konsolidering, och
-- listan ska gå att utöka utan att den här raden skriver över tillägget.
INSERT INTO public.partner_titles (name, shortcut, sequence)
VALUES ('Fru', 'Fru', 10), ('Herr', 'Herr', 20), ('Doktor', 'Dr', 30), ('Professor', 'Prof', 40)
-- Nyckeln namngiven: ett naket ON CONFLICT sväljer VILKEN kollision som helst
-- och hade dolt ett riktigt fel. Grinden on-conflict-is-not-a-guard fångade
-- det innan det hann bli en vana.
ON CONFLICT (lower(name)) DO NOTHING;

-- ── Fälten på parten ───────────────────────────────────────────────────────
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS title_id uuid REFERENCES public.partner_titles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lang     text,
  ADD COLUMN IF NOT EXISTS tz       text;

COMMENT ON COLUMN public.partners.lang IS
  'Språket MOTPARTEN läser, BCP-47 som resten av plattformen (sv-SE, de-DE). '
  'NULL betyder "inte angivet" och faller tillbaka på instansens locale — det '
  'gissas ALDRIG ur landet.';
COMMENT ON COLUMN public.partners.tz IS
  'Motpartens tidszon (IANA). Används för mötestider och utskickstider, inte '
  'för bokföring.';

-- ── Default vid skapande, INTE arv ─────────────────────────────────────────
-- Kontrasten mot steg 11 är avsiktlig: kommersiella fält TRYCKS ned vid varje
-- ändring, språk kopieras EN gång och lämnas sedan i fred.
CREATE OR REPLACE FUNCTION public.partners_default_lang_from_parent()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent partners%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.lang IS NOT NULL AND NEW.tz IS NOT NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_parent FROM partners WHERE id = NEW.parent_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  NEW.lang := coalesce(NEW.lang, v_parent.lang);
  NEW.tz   := coalesce(NEW.tz,   v_parent.tz);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partners_zzz_default_lang ON public.partners;
CREATE TRIGGER partners_zzz_default_lang
  BEFORE INSERT ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_default_lang_from_parent();

-- ── Vilket språk skriver vi till dem på ────────────────────────────────────
-- Svaret bär sin HÄRKOMST. En funktion som bara returnerar 'sv-SE' går inte
-- att skilja från en som inte visste, och skillnaden avgör om någon behöver
-- fråga kunden.
CREATE OR REPLACE FUNCTION public.partner_language(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lang text; v_tz text; v_name text; v_default text; v_default_tz text;
BEGIN
  SELECT lang, tz, name INTO v_lang, v_tz, v_name FROM partners WHERE id = p_partner_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no such partner');
  END IF;

  SELECT coalesce(value ->> 'locale', value #>> '{}') INTO v_default
    FROM site_settings WHERE key = 'platform_locale';
  SELECT coalesce(value ->> 'timezone', NULL) INTO v_default_tz
    FROM site_settings WHERE key = 'platform_locale';

  RETURN jsonb_build_object(
    'ok', true,
    'partner', v_name,
    'lang', coalesce(v_lang, v_default, 'sv-SE'),
    'lang_source', CASE
      WHEN v_lang IS NOT NULL THEN 'the partner''s own'
      WHEN v_default IS NOT NULL THEN 'the instance default — nobody has asked this customer'
      ELSE 'the platform fallback — neither the partner nor the instance has a locale' END,
    'tz', coalesce(v_tz, v_default_tz, 'Europe/Stockholm'),
    'note', 'Never inferred from the country: an English-speaking company in Sweden '
         || 'exists, and a guess that is right nine times out of ten is wrong in a way '
         || 'nobody notices until the customer replies in another language.');
END $$;

REVOKE ALL ON FUNCTION public.partner_language(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_language(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.partner_language(uuid) IS
  'Språket vi ska skriva till parten på, MED härkomst: partens eget, '
  'instansens default, eller plattformens sista utväg. Gissar aldrig ur landet.';

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
-- Poängen är kontrasten mot steg 11, och den är lätt att "harmonisera" bort.
CREATE OR REPLACE FUNCTION public.assert_language_is_personal_not_commercial()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_co uuid; v_person uuid; v_lang text; v_res jsonb;
BEGIN
  INSERT INTO partners (name, is_company, lang, payment_terms)
  VALUES ('Språkbolaget AB', true, 'sv-SE', 'net_30') RETURNING id INTO v_co;
  INSERT INTO partners (name, is_company, parent_id, email)
  VALUES ('Sprachkontakt', false, v_co, 'sprach@sandbox.local') RETURNING id INTO v_person;

  -- 1. Barnet ÄRVDE språket som ett default vid skapandet.
  SELECT lang INTO v_lang FROM partners WHERE id = v_person;
  IF v_lang IS DISTINCT FROM 'sv-SE' THEN
    RAISE EXCEPTION 'language check: the new contact did not get the company''s language as a default (got %)', v_lang;
  END IF;

  -- 2. Kontakten talar tyska. Det är HENNES val.
  UPDATE partners SET lang = 'de-DE' WHERE id = v_person;

  -- 3. Bolaget byter språk. Det får INTE skriva om hennes.
  UPDATE partners SET lang = 'en-GB', payment_terms = 'net_10' WHERE id = v_co;

  SELECT lang INTO v_lang FROM partners WHERE id = v_person;
  IF v_lang IS DISTINCT FROM 'de-DE' THEN
    RAISE EXCEPTION 'language check: the company''s language change overwrote the contact''s own (% instead of de-DE) — language belongs to the person, unlike VAT and payment terms which belong to the legal entity', v_lang;
  END IF;

  -- 4. Men betalningsvillkoren SKA ha följt med — kontrasten är hela poängen.
  IF (SELECT payment_terms FROM partners WHERE id = v_person) IS DISTINCT FROM 'net_10' THEN
    RAISE EXCEPTION 'language check: payment terms did NOT follow the company — the commercial-field inheritance from step 11 has been broken';
  END IF;

  -- 5. Svaret bär sin härkomst.
  v_res := partner_language(v_person);
  IF v_res->>'lang_source' NOT LIKE '%own%' THEN
    RAISE EXCEPTION 'language check: the resolver did not report that the language came from the partner itself (%)', v_res->>'lang_source';
  END IF;

  DELETE FROM partners WHERE id IN (v_person, v_co);
END $$;

REVOKE ALL ON FUNCTION public.assert_language_is_personal_not_commercial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_language_is_personal_not_commercial() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  PERFORM public.assert_no_silently_unbillable_subscriptions();
  PERFORM public.assert_commercial_fields_inherit();
  PERFORM public.assert_bank_account_rules();
  PERFORM public.assert_language_is_personal_not_commercial();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true,
    'bank_accounts_belong_to_the_legal_entity', true,
    'language_is_personal_not_commercial', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
