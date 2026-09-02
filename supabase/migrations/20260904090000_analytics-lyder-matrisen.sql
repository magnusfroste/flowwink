-- Analytics lyder matrisen.
--
-- Magnus gav rollen sales modulen analytics i matrisen. Navet lydde direkt —
-- Analytics dök upp i vänsterpanelen för Svante — men sidan var tom: varje
-- diagram läser page_views, och page_views hade EN läspolicy, has_role(admin).
-- Matrisen är enda ratten (rollsvep #102/4) — men den här tabellen, och de
-- besökardata som hör till samma modul, skrevs aldrig om. Klassen "frånvarande
-- effekt": ratten vrids, ingenting händer, ingen felrad.
--
-- Fixen är rollsvepets idiom: en "Staff can read"-policy per tabell gatad på
-- can_access_module(auth.uid(), 'analytics'). Admin-policierna står kvar
-- (can_access_module innehåller admin ändå). Idempotent: DROP IF EXISTS +
-- CREATE. Tabellerna är de modulen faktiskt visar: sidvisningar,
-- besökaridentiteter/-signaler, UTM-attribution och sidexperiment.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'page_views', 'visitor_identities', 'visitor_signals',
    'utm_attributions', 'page_experiments', 'page_experiment_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'analytics matrix policy: % does not exist here — skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS "Staff can read %s" ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "Staff can read %s" ON public.%I FOR SELECT TO authenticated
         USING (public.can_access_module(auth.uid(), ''analytics''))', t, t);
  END LOOP;
END $$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- Automatiskt: varje tabell som finns bär nu en matris-läspolicy. Manuellt
-- negativtest (rollsvepets idiom, kräver en riktig användare):
--   PERFORM set_config('request.jwt.claims',
--     '{"sub":"<uid med enbart rollen sales>","role":"authenticated"}', true);
--   SELECT count(*) FROM page_views;   → rader, när sales har analytics i
--                                         role_module_access; 0 när raden tas bort.
DO $$
DECLARE t text; n int;
BEGIN
  FOREACH t IN ARRAY ARRAY['page_views','visitor_identities','visitor_signals','utm_attributions'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT'
       AND qual LIKE '%can_access_module(auth.uid(), ''analytics''%';
    IF n <> 1 THEN
      RAISE EXCEPTION 'analytics matrix policy missing on % (found % matrix read policies)', t, n;
    END IF;
  END LOOP;
  RAISE NOTICE 'analytics: the dashboard tables follow the matrix';
END $$;
