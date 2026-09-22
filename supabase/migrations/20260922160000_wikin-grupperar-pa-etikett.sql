-- Wikin grupperar på etikett, inte på träd.
--
-- Peter (optic, backlogg "Now") bad om "hierarki för instruktioner och
-- mötesanteckningar". Plattformen HAR ett träd (parent_slug, manage_wiki_
-- hierarchy) — men optics 37 sidor ligger alla på roten, för en människa kan
-- inte sätta förälder i UI:t. Och titta på titlarna: "Sälj - …", "Produkt - …",
-- "Platform - …", "Tisdagsmöte v38 – 2026". Peter och agenten har redan byggt
-- ett etikettsystem för hand, i titlarna, för att plattformen inte gav dem
-- något en människa kan använda.
--
-- Så: etiketter (Gmail/Bear-modellen, inte Confluence-trädet). En sida kan
-- handla om flera saker — "Sälj v38" är både Sälj och ett möte — och
-- grupperingen är en VY, inte en placering. Vänsterspalten grupperar på
-- etikett, alltid öppen, inga expanders; nyast först inom gruppen, så att
-- "Tisdagsmöte v39, v38, v37" blir en serie av sig själv.
--
-- Två kolumner, en läsare:
--   * tags      — det fältet säger (UI:t, agenten); normaliseras av trigger:
--                 gemener, trimmade, utan inledande #, unika, sorterade
--   * all_tags  — GENERERAD: tags ∪ varje #etikett SKRIVEN I TEXTEN (Bear-
--                 stil). Så en agent som avslutar en anteckning med
--                 "#tisdagsmöte #sälj" har grupperat den utan att känna till
--                 något fält, och en människa likaså. En etikett i texten
--                 följer texten: den försvinner när den stryks, och kan inte
--                 plockas bort via fältet — texten är sanningen.
-- Vänsterspalten, wiki_tags() och sökfiltret läser all_tags.
-- En rubrik ("# Titel", med mellanslag) är ingen etikett; en färgkod (#fff)
-- eller ett URL-ankare (sida.html#avsnitt) inte heller — etiketten måste börja
-- med en bokstav och stå efter blanksteg eller radstart.
--
-- Trädet (parent_slug) rörs inte: rälsen finns kvar för agenter som vill ha den.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF EXISTS.

ALTER TABLE public.wiki_pages ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.wiki_pages.tags IS
  'Etiketter satta via fältet (gemener, unika). Läs all_tags för vad sidan bär: fältet plus varje #etikett i texten.';

-- Etiketter skrivna i texten: "#sälj", "#tisdagsmöte-v38". Regexen speglas i
-- src/lib/wiki-tags.ts — vakten wiki-tags-group-not-tree håller dem lika.
CREATE OR REPLACE FUNCTION public.wiki_inline_tags(p_content text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT lower(m[1]) ORDER BY lower(m[1])), '{}'::text[])
    FROM regexp_matches(COALESCE(p_content, ''), '(?:^|[[:space:](])#([[:alpha:]][[:alnum:]_-]*)', 'g') AS m
   -- En färgkod (#fff, #1a2b3c) är ingen etikett.
   WHERE m[1] !~* '^[0-9a-f]{3}([0-9a-f]{3})?$';
$$;

CREATE OR REPLACE FUNCTION public.wiki_normalize_tags(p_tags text[])
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}'::text[])
    FROM (SELECT lower(btrim(regexp_replace(x, '^#+', ''))) AS t FROM unnest(COALESCE(p_tags, '{}'::text[])) x) s
   WHERE t <> '' AND length(t) <= 40;
$$;

CREATE OR REPLACE FUNCTION public.wiki_pages_normalize_tags()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.tags := public.wiki_normalize_tags(NEW.tags);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS wiki_pages_collect_tags ON public.wiki_pages;
DROP TRIGGER IF EXISTS wiki_pages_normalize_tags ON public.wiki_pages;
CREATE TRIGGER wiki_pages_normalize_tags
  BEFORE INSERT OR UPDATE ON public.wiki_pages
  FOR EACH ROW EXECUTE FUNCTION public.wiki_pages_normalize_tags();

-- Det sidan bär: fältet plus texten. Genererad, så ingen backfill och ingen
-- stämpel — och ingen skrivare kan komma ur takt med texten.
-- (Ändras wiki_inline_tags senare måste kolumnen släppas och skapas om;
-- lagrade genererade värden räknas inte om av sig själva.)
ALTER TABLE public.wiki_pages ADD COLUMN IF NOT EXISTS all_tags text[]
  GENERATED ALWAYS AS (public.wiki_normalize_tags(tags || public.wiki_inline_tags(content_md))) STORED;
CREATE INDEX IF NOT EXISTS wiki_pages_all_tags ON public.wiki_pages USING gin (all_tags);
COMMENT ON COLUMN public.wiki_pages.all_tags IS
  'Genererad: tags ∪ varje #etikett skriven i content_md. Det vänsterspalten grupperar på och wiki_tags() räknar.';

-- Vilka etiketter finns, och hur många sidor bär var och en. INVOKER: samma
-- ögon som sidlistan. Agenten läser den innan den hittar på en ny etikett.
CREATE OR REPLACE FUNCTION public.wiki_tags()
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'success', true,
    'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('tag', t.tag, 'pages', t.n) ORDER BY t.n DESC, t.tag)
                        FROM (SELECT tag, count(*) AS n FROM public.wiki_pages, unnest(all_tags) AS tag GROUP BY tag) t), '[]'::jsonb),
    'untagged', (SELECT count(*) FROM public.wiki_pages WHERE cardinality(all_tags) = 0),
    'note', 'Prefer an existing tag over a new spelling of the same thing. A #tag written in a page body is collected automatically.');
$$;

REVOKE ALL ON FUNCTION public.wiki_inline_tags(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wiki_inline_tags(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wiki_normalize_tags(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wiki_normalize_tags(text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wiki_pages_normalize_tags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wiki_pages_normalize_tags() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wiki_tags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wiki_tags() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE v_tags text[]; v_r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO public.wiki_pages (slug, title, content_md, tags)
    VALUES ('Proof160000', 'Proof', E'# Rubriken är ingen etikett\n\nText om färgen #fff och sida.html#avsnitt.\n\n#Sälj #tisdagsmöte-v38 (#möte)', ARRAY['#Produkt', ' sälj ', '']);
    SELECT all_tags INTO v_tags FROM public.wiki_pages WHERE slug = 'Proof160000';
    IF v_tags <> ARRAY['möte', 'produkt', 'sälj', 'tisdagsmöte-v38'] THEN
      RAISE EXCEPTION 'proof failed: all_tags → %', v_tags;
    END IF;
    SELECT tags INTO v_tags FROM public.wiki_pages WHERE slug = 'Proof160000';
    IF v_tags <> ARRAY['produkt', 'sälj'] THEN
      RAISE EXCEPTION 'proof failed: the field is normalised → %', v_tags;
    END IF;

    -- En etikett i texten kan inte plockas bort via fältet: texten är sanningen.
    UPDATE public.wiki_pages SET tags = ARRAY['produkt'] WHERE slug = 'Proof160000';
    SELECT all_tags INTO v_tags FROM public.wiki_pages WHERE slug = 'Proof160000';
    IF NOT ('sälj' = ANY(v_tags)) OR ('x' = ANY(v_tags)) THEN
      RAISE EXCEPTION 'proof failed: inline tags should survive a field write → %', v_tags;
    END IF;
    -- …men försvinner med texten.
    UPDATE public.wiki_pages SET content_md = 'Inga etiketter här.' WHERE slug = 'Proof160000';
    SELECT all_tags INTO v_tags FROM public.wiki_pages WHERE slug = 'Proof160000';
    IF v_tags <> ARRAY['produkt'] THEN
      RAISE EXCEPTION 'proof failed: inline tags should go with the text → %', v_tags;
    END IF;

    v_r := public.wiki_tags();
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_r->'tags') t WHERE t->>'tag' = 'produkt') THEN
      RAISE EXCEPTION 'proof failed: wiki_tags does not list the tag → %', v_r;
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: tags normalise, #tags in the text are collected and follow the text, headings and colours are not tags, wiki_tags counts them.';
END
$proof$;
