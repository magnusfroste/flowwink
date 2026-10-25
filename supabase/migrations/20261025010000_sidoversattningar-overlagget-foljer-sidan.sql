-- Sidöversättningar: överlägget följer sidan.
--
-- En sida i två språk har hittills varit två rader med två kopior av
-- blockträdet (pages.translation_group_id). Designen flyttas inte för att
-- texten byter språk, så designen ska lagras en gång och språket bara bära
-- strängarna. Den här tabellen är överlägget: en rad per (sida, språk), och
-- i `strings` en post per ENHET — <block.id>.<sökväg i blocket>, page.title,
-- page.meta.<key> — med texten och ett fingeravtryck av källtexten vid
-- skrivtillfället. Skiljer sig fingeravtrycket från källan i dag är enheten
-- inaktuell: visas fortfarande, men räknas och listas.
--
-- Steg 2 av sex (docs/architecture/page-translations.md §8). INGET skriver
-- tabellen ännu; get-page läser den när ?lang= begär ett annat språk än
-- sidans eget. Dagens syskonrader fortsätter att fungera orörda tills
-- konverteringen (steg 5) körs på en instans.
CREATE TABLE IF NOT EXISTS public.page_translations (
  page_id        uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  locale         text NOT NULL,
  status         text NOT NULL DEFAULT 'draft',
  slug           text,
  strings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage       integer,
  translated_at  timestamptz,
  translated_by  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, locale),
  CONSTRAINT page_translations_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT page_translations_locale_check CHECK (locale = lower(btrim(locale)) AND locale <> '')
);

COMMENT ON TABLE public.page_translations IS
  'Ett språköverlägg per (sida, språk): bara text, nycklad per enhet (<block.id>.<sökväg>, page.title, page.meta.<key>) med source_hash av källtexten. Designen bor i pages.content_json; en enhet utan post visar källtexten, synligt och räknat.';
COMMENT ON COLUMN public.page_translations.strings IS
  '{ "<unit>": { "text": "…" | "doc": {tiptap}, "source_hash": "<fnv1a64 hex>" } }. Hashen avgör inaktualitet per enhet — en handpolerad översättning överlever tills dess källa ändras.';
COMMENT ON COLUMN public.page_translations.slug IS
  'Frivillig adress per språk (/en/services för /tjanster). NULL = sidans slug under språkprefixet.';
COMMENT ON COLUMN public.page_translations.coverage IS
  'Cachat: färska enheter / alla enheter, i procent. Räknas om vid varje skrivning.';

CREATE INDEX IF NOT EXISTS idx_page_translations_locale_status
  ON public.page_translations (locale, status);
-- Adressuppslag per språk: /en/<slug> → vilken sida.
CREATE UNIQUE INDEX IF NOT EXISTS page_translations_locale_slug_key
  ON public.page_translations (locale, slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS page_translations_set_updated_at ON public.page_translations;
CREATE TRIGGER page_translations_set_updated_at
  BEFORE UPDATE ON public.page_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Åtkomst ────────────────────────────────────────────────────────────────
-- Besökaren läser ett PUBLICERAT överlägg på en PUBLICERAD sida — samma gräns
-- som pages har. Personal läser allt och skriver; kunder ser inget utkast.
ALTER TABLE public.page_translations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.page_translations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.page_translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.page_translations TO authenticated;
GRANT ALL ON public.page_translations TO service_role;

DROP POLICY IF EXISTS "page_translations_public_read" ON public.page_translations;
CREATE POLICY "page_translations_public_read" ON public.page_translations
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.pages p
      WHERE p.id = page_translations.page_id
        AND p.status = 'published'
        AND p.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "page_translations_staff_read" ON public.page_translations;
CREATE POLICY "page_translations_staff_read" ON public.page_translations
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "page_translations_staff_write" ON public.page_translations;
CREATE POLICY "page_translations_staff_write" ON public.page_translations
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- ── Bevis vid varje applicering ────────────────────────────────────────────
-- Ingen CI har en databas, så migrationen bevisar sig själv: en tillfällig
-- sida får ett överlägg; små bokstäver krävs, statusen är begränsad,
-- raderingen kaskaderar. Allt rullas tillbaka.
DO $$
DECLARE
  v_page uuid;
  v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.pages (slug, title, status, content_json)
    VALUES ('__page_translations_proof__', 'Proof', 'draft', '[]'::jsonb)
    RETURNING id INTO v_page;

  INSERT INTO public.page_translations (page_id, locale, strings)
    VALUES (v_page, 'en', '{"page.title": {"text": "Proof", "source_hash": "0000000000000000"}}'::jsonb);

  BEGIN
    INSERT INTO public.page_translations (page_id, locale) VALUES (v_page, 'SV');
    RAISE EXCEPTION 'page_translations accepted an upper-case locale';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.page_translations SET status = 'live' WHERE page_id = v_page;
    RAISE EXCEPTION 'page_translations accepted an unknown status';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  DELETE FROM public.pages WHERE id = v_page;
  SELECT count(*) INTO v_n FROM public.page_translations WHERE page_id = v_page;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'page_translations did not cascade on page delete (% rows left)', v_n;
  END IF;
END $$;
