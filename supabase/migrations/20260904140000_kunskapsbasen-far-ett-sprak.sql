-- Kunskapsbasen får ett språk.
--
-- Verifierat live 2026-08-31: optictunnels.se/en/help visar engelsk chrome —
-- knappar, tomtillstånd, navigation följer besökarens språk — men VARENDA
-- KB-artikel och varje kategorinamn står på svenska. `kb_articles` hade ingen
-- språkdimension alls, så den engelska hjälpsidan kunde inte annat än ljuga:
-- den lovade engelska och levererade svenska.
--
-- Rälsen finns redan (docs/architecture/language.md §2): innehåll är en RAD
-- per språk. `pages` har den, `email_templates` har den. Det här lägger samma
-- två kolumner på artiklarna:
--
--   * `locale`                — språket raden är skriven på, BCP-47
--   * `translation_group_id`  — rader som delar det är versioner av varandra
--
-- Kategorierna får INTE rad-per-språk, och det är ett beslut, inte en slarv:
-- en kategori är en ETIKETT som artiklar pekar på (kb_articles.category_id),
-- inte ett dokument med egen adress. Rad-per-språk hade tvingat varje
-- artikelversion att peka om till "sin" språkrad av kategorin och gjort både
-- hierarki (parent_id) och räkning per-språk. En etikett översätts som chrome
-- (§3): ett `translations`-overlay på raden — baskolumnerna är sajtens eget
-- språk, `{"en": {"name": …}}` är versionerna.
--
-- INGEN kolumndefault på locale. `pages.locale` defaultade en gång till 'en'
-- och påstod därmed engelska om varje sida på varje instans — en läsare kunde
-- aldrig veta om 'en' betydde *engelska* eller *ingen valde*. Triggern fyller
-- i sajtens deklarerade språk i stället, som på pages och email_templates.

-- ── Kolumnerna ─────────────────────────────────────────────────────────────
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS locale text;
ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS translation_group_id uuid;

COMMENT ON COLUMN public.kb_articles.locale IS
  'Språket artikeln är skriven på, BCP-47. Ingen kolumndefault — triggern '
  'kb_articles_set_locale stämplar sajtens deklarerade språk på nya rader.';
COMMENT ON COLUMN public.kb_articles.translation_group_id IS
  'Artiklar som delar detta id är språkversioner av varandra. NULL = ännu '
  'inte översatt. En rad per språk per grupp (kb_articles_group_locale_key).';

CREATE INDEX IF NOT EXISTS kb_articles_translation_group_idx
  ON public.kb_articles (translation_group_id) WHERE translation_group_id IS NOT NULL;

-- En rad per språk per grupp. På pages vaktas regeln bara i
-- manage_page_translation; här får den stå i schemat från början — det är
-- billigare att ha regeln än att i efterhand städa dubbletter en agent skapat.
CREATE UNIQUE INDEX IF NOT EXISTS kb_articles_group_locale_key
  ON public.kb_articles (translation_group_id, locale)
  WHERE translation_group_id IS NOT NULL;

ALTER TABLE public.kb_categories ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.kb_categories.translations IS
  'Namn-per-språk-overlay: {"en": {"name": "Billing", "description": …}}. '
  'Baskolumnerna (name, description) är sajtens eget språk. En etikett utan '
  'overlay faller SYNLIGT tillbaka till basnamnet — att gömma kategorin hade '
  'gömt dess redan översatta artiklar.';

-- ── Historiken riktas in ───────────────────────────────────────────────────
-- Befintliga artiklar är skrivna på sajtens språk — det är det enda de kan
-- vara: kolumnen fanns inte, så ingen har någonsin valt något annat.
UPDATE public.kb_articles
   SET locale = coalesce(
         (SELECT lower(value ->> 'default') FROM site_settings WHERE key = 'site_languages'), 'en')
 WHERE locale IS NULL;

-- ── En ny artikel föds i sajtens språk ─────────────────────────────────────
-- Samma trigger som pages_default_locale och email_templates_default_locale;
-- tre tabeller, en regel, tre stämplar.
CREATE OR REPLACE FUNCTION public.kb_articles_default_locale()
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

DROP TRIGGER IF EXISTS kb_articles_set_locale ON public.kb_articles;
CREATE TRIGGER kb_articles_set_locale
  BEFORE INSERT ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.kb_articles_default_locale();

COMMENT ON FUNCTION public.kb_articles_default_locale() IS
  'Ger en ny KB-artikel sajtens standardspråk när ingen locale anges. '
  'Ersättningen för en kolumndefault, som hade varit en lögn (jfr pages).';

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- Ingen CI har en databas; migreringen bevisar sig själv vid varje applicering.
DO $$
DECLARE
  v_default text;
  v_cat uuid;
  v_a uuid;
  v_b uuid;
  v_group uuid := gen_random_uuid();
  v_got text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT lower(coalesce(value ->> 'default', 'en')) INTO v_default
    FROM site_settings WHERE key = 'site_languages';
  v_default := coalesce(v_default, 'en');

  INSERT INTO kb_categories (name, slug, description, is_active)
  VALUES ('__locale_probe__', '__locale-probe__', 'probe', false)
  RETURNING id INTO v_cat;

  -- 1. Triggern stämplar sajtens språk på en rad utan locale.
  INSERT INTO kb_articles (category_id, title, slug, question, answer_text, is_published)
  VALUES (v_cat, '__probe a__', '__probe-a__', 'q', 'a', false)
  RETURNING id, locale INTO v_a, v_got;
  IF v_got IS DISTINCT FROM v_default THEN
    RAISE EXCEPTION 'kb_articles_set_locale: expected the site language "%", got "%"', v_default, v_got;
  END IF;

  -- 2. En uttrycklig locale normaliseras men skrivs inte över.
  INSERT INTO kb_articles (category_id, title, slug, question, answer_text, is_published, locale, translation_group_id)
  VALUES (v_cat, '__probe b__', '__probe-b__', 'q', 'a', false, ' DE ', v_group)
  RETURNING id, locale INTO v_b, v_got;
  IF v_got IS DISTINCT FROM 'de' THEN
    RAISE EXCEPTION 'kb_articles_set_locale: '' DE '' should normalize to ''de'', got "%"', v_got;
  END IF;

  -- 3. En rad per språk per grupp — dubbletten avvisas av nyckeln.
  BEGIN
    INSERT INTO kb_articles (category_id, title, slug, question, answer_text, is_published, locale, translation_group_id)
    VALUES (v_cat, '__probe c__', '__probe-c__', 'q', 'a', false, 'de', v_group);
    RAISE EXCEPTION 'kb_articles_group_locale_key: a second ''de'' row in the same group must be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- exakt det nyckeln finns för
  END;

  DELETE FROM kb_articles WHERE category_id = v_cat;
  -- Raderingstriggern loggar även proberna till revisionerna — städa dem med.
  DELETE FROM kb_article_revisions WHERE article_id IN (v_a, v_b);
  DELETE FROM kb_categories WHERE id = v_cat;
  RAISE NOTICE 'kb language rail: trigger stamps "%", (group, locale) key holds', v_default;
END $$;
