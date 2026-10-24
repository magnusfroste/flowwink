-- Inloggad kund ser det besökaren ser.
--
-- Säkerhetssvepet (20261022010000, #725) gjorde rätt i att "authenticated" inte
-- är "personal": ~72 interna tabeller läses nu av is_staff(). Men fyra av
-- tabellerna i listan bar OCKSÅ en publik läsregel för anon — pages,
-- blog_posts, handbook_chapters, profiles — och när den öppna authenticated-
-- regeln blev is_staff() förlorade en INLOGGAD KUND (portalkonto, ingen
-- personalroll) det anon har: PublicNavigation och PublicFooter frågar pages
-- med besökarens JWT, så en kund som är inloggad i portalen fick en tom meny
-- på den publika sajten; samma för bloggens lista, handboksblocket och
-- författarbylinen. Hittat 2026-10-24 när RLS för page_translations testades
-- med en authenticated-roll utan personalroll.
--
-- Regeln här är generell, inte en lista: för VARJE SELECT-policy som ger anon
-- läsning men inte authenticated, speglas villkoret till authenticated. En
-- inloggad användare kan alltid släppa sin JWT och bli anon, så authenticated
-- smalare än anon är aldrig avsikten — det är bara en lucka. Den körs vid varje
-- applicering och fångar därmed även nästa tabell någon ger en publik regel
-- utan att tänka på de inloggade.
DO $$
DECLARE r record; v_name text; v_n int := 0;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.qual
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.cmd IN ('SELECT', 'ALL')
      AND 'anon' = ANY (p.roles)
      AND NOT ('authenticated' = ANY (p.roles))
      AND NOT ('public' = ANY (p.roles))
      AND p.qual IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies q
        WHERE q.schemaname = 'public' AND q.tablename = p.tablename
          AND q.cmd IN ('SELECT', 'ALL')
          AND ('authenticated' = ANY (q.roles) OR 'public' = ANY (q.roles))
          AND (q.qual = p.qual OR q.qual = 'true')
      )
  LOOP
    v_name := left(r.policyname || ' (signed in)', 63);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_name, r.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', v_name, r.tablename, r.qual);
    v_n := v_n + 1;
    RAISE NOTICE 'mirrored anon read to authenticated: %.% — %', r.tablename, r.policyname, r.qual;
  END LOOP;
  RAISE NOTICE '% anon read rule(s) mirrored to signed-in users', v_n;
END $$;

-- ── Bevis vid varje applicering ────────────────────────────────────────────
-- En publicerad sida måste synas för en inloggad användare UTAN personalroll,
-- och ett utkast får inte. Rullas tillbaka.
DO $$
DECLARE v_pub int; v_draft int;
BEGIN
  INSERT INTO public.pages (slug, title, status, content_json)
    VALUES ('__signed_in_proof_pub__', 'P', 'published', '[]'::jsonb),
           ('__signed_in_proof_draft__', 'D', 'draft', '[]'::jsonb);

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000c0de"}', true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_pub   FROM public.pages WHERE slug = '__signed_in_proof_pub__';
  SELECT count(*) INTO v_draft FROM public.pages WHERE slug = '__signed_in_proof_draft__';
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  DELETE FROM public.pages WHERE slug IN ('__signed_in_proof_pub__', '__signed_in_proof_draft__');

  IF v_pub <> 1 THEN
    RAISE EXCEPTION 'a signed-in non-staff user cannot read a published page (% rows) — the anon rule was not mirrored', v_pub;
  END IF;
  IF v_draft <> 0 THEN
    RAISE EXCEPTION 'a signed-in non-staff user can read a DRAFT page (% rows)', v_draft;
  END IF;
END $$;
