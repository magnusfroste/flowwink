-- Anon-ytan krymps till exakt det de publika ytorna behöver.
--
-- INCIDENTEN: gårdagens fynd på tickets/leads — en policy med `WITH CHECK true
-- TO public` plus Supabases blanket-GRANT till `anon` = öppen POST för
-- oinloggade från internet. Fixen där var att laga policyn. Men klassen är
-- större än de två tabellerna.
--
-- KLASSEN: "RLS är enda spärren". Supabase föder varje tabell i `public` med
-- GRANT SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER till både
-- `anon` och `authenticated` (ALTER DEFAULT PRIVILEGES, se avsnitt 4). Det
-- betyder att grant-lagret är konstant SANT för hela schemat, och hela
-- säkerheten vilar på ett enda lager: policyerna. En slarvig policy — en
-- `qual true`, ett bortglömt rollmål, en OR-gren utan grind — blir då direkt
-- en internetdörr. Två lager som båda måste säga ja är inte paranoia; det är
-- skillnaden mellan "en bugg" och "en incident".
--
-- Mätt på optic före ingreppet, över 376 relationer i `public`:
--   1502 (relation,verb)-par SELECT/INSERT/UPDATE/DELETE grantade till anon,
--        varav 63 motsvarade en policy anon faktiskt kan uppfylla.
--    376 TRUNCATE-grants till anon + 376 till authenticated (se avsnitt 3).
-- Resten — 1435 CRUD-par och 750 TRUNCATE-par — var DÖD YTA: grant utan väg,
-- som bara väntade på en slarvig policy för att bli en dörr.
--
-- REGELN som gäller härefter:
--   Ett verb som anon aldrig legitimt använder ska inte vara grantat alls.
--   Bälte och hängslen: policyn säger VILKA RADER, granten säger OM ALLS.
--   En ny publik yta kräver hädanefter ETT MEDVETET GRANT — den kan inte
--   längre uppstå av misstag genom att någon skriver en slö policy.
--
-- METOD: skillnadsanalys mellan live-grants (aclexplode på pg_class.relacl)
-- och live-policies (pg_policies där roles innehåller anon ELLER public —
-- {public} gäller anon också). Ett verb behålls bara om det finns en policy
-- anon FAKTISKT KAN UPPFYLLA. En policy `TO public` vars uttryck är grindat
-- på has_role()/auth.uid()/can_access_module() är oåtkomlig för anon (uid är
-- NULL) och räknas därför INTE som publik yta — annars hade varenda
-- "Admins manage X"-policy hållit kvar anons DELETE-grant på hela ERP:et.
-- OR-grenar granskades en och en: alla sammansatta public-policies visade sig
-- rollgrindade i BÅDA grenarna utom chat-tabellernas session_id-gren och
-- documents `visibility='shared'`-gren, som båda är anon-nåbara på riktigt.
--
-- ── DEN BEHÅLLNA PUBLIKA ATTACKYTAN (63 par) ───────────────────────────────
-- Detta ÄR ytan. Allt en oinloggad besökare kan röra går genom listan nedan.
-- Varje rad: tabell — policyn som gör den nåbar — dess villkor.
--
-- SELECT (43 st) — publik läsning:
--   pages                      "Public can view published pages"        status='published'
--   blog_posts                 "Public can view published posts"        status='published'
--   blog_categories/_tags/     "Public can view …"                      true
--     blog_post_categories/_tags
--   blog_comments              "Public can read approved comments"      status='approved'
--   docs_pages                 "Public can read docs pages"             is_published
--   handbook_chapters          "Public can read handbook chapters"      true
--   kb_articles                "Public can view published public …"     is_published AND visibility='public'
--   kb_categories              "Public can view active categories"      is_active
--   knowledge_chunks           "Anyone can read public chunks"          visibility='public'
--   products, product_variants "Public can view active …"               is_active
--   product_attributes, product_attribute_values,
--     product_variant_values, product_categories                        true / is_active
--   uoms, uom_categories       "Public can view uoms"                   true
--   shipping_rates             "Public can view active shipping rates"  is_active
--   postal_code_rules          "Anyone can read postal_code_rules"      true
--   booking_services/_availability/_blocked_dates                       is_active / true
--   business_hours, business_holidays                                   true
--   job_postings               "Public can view published jobs"         status='published'
--   consultant_profiles        "Public can view active profiles"        is_active
--   webinars                   "Public can view/read published …"       status IN (published,live,completed)
--   webinar_registrations      "Registrants can read own registrations" true          ⚠ se FYND 4
--   webmeet_rooms              "webmeet_rooms_public_read"              ej avslutat/utgånget
--   global_blocks              "Public can view active global blocks"   is_active
--   page_redirects             "page_redirects_public_read"             is_active
--   site_settings              "Anyone can view site settings"          true
--   installed_template         "Public can read installed_template"     true
--   quote_items                "Public can view items via quote token"  via quotes.accept_token
--   chat_conversations         "Users can view own conversations"       session_id = header x-chat-session
--   chat_messages              "Users can view messages in own conv."   via konversationens session_id
--   profiles_public (VY)       ingen policy — security_invoker mot profiles ⚠ se FYND 5
--   beta_test_sessions/_findings/_exchanges  "Allow anon select …"      true          ⚠ se FYND 6
--
-- INSERT (17 st) — publik skrivning (det är HÄR internetdörrarna sitter):
--   form_submissions           "Anyone can submit forms"                true
--   newsletter_subscribers     "Anyone can subscribe"                   true
--   bookings                   "Anyone can create bookings"             true
--   applications               "Public can submit applications"         via publicerad job_posting
--   blog_comments              "Anyone can submit comments"             status='pending'
--   orders, order_items        "Anyone can create orders/order items"   true
--   page_views                 "Anyone can insert page views"           true
--   utm_attributions           "Anyone can log UTM touch"               true
--   webinar_registrations      "Anyone can register for webinars"       true
--   quote_signatures           "Public can insert signature via token"  via quotes.accept_token
--   chat_conversations         "Anyone can create conversation"         session_id satt
--   chat_messages              "Users can create messages in own conv." via konversationens session_id
--   chat_feedback              "Anyone can submit feedback"             true
--   newsletter_email_opens     "System can insert opens"                true          ⚠ se FYND 3
--   newsletter_link_clicks     "System can insert clicks"               true          ⚠ se FYND 3
--
-- UPDATE (3 st):
--   chat_conversations         "Users can update own conversations"     session_id = header
--   newsletter_email_opens     "System can update opens"                true          ⚠ se FYND 3
--   newsletter_link_clicks     "System can update clicks"               true          ⚠ se FYND 3
--
-- DELETE (1 st):
--   chat_conversations         "Users can delete own conversations"     session_id = header
--
-- ── HÖGA FYND (dokumenterade här, åtgärdas separat där så anges) ───────────
-- FYND 1 (STÄNGT HÄR): agent_objective_activities hade policyn "Authenticated
--   can view objective activities" — men `qual = true` och `TO public`. Namnet
--   ljög. Verifierat live med `SET ROLE anon`: 337 rader FlowPilot-intern
--   objective-historik läsbar för vem som helst på internet. Ingen publik yta
--   rör tabellen. Granten dras in här. Policyn behöver ändå lagas (rätt
--   rollmål + auth.uid() IS NOT NULL) — grantet är hängslet, inte bältet.
--
-- FYND 2 (STÄNGT HÄR): documents-policyn "Documents are visible per their
--   visibility setting" har grenen `visibility = 'shared'` HELT UTAN
--   auth-grind. Verifierat live: anon läser dokument med visibility='shared'.
--   Det bryter mot husregeln att inget uppladdat någonsin blir publikt —
--   'shared' betyder "delad med inloggade", inte "delad med internet". Ingen
--   publik yta läser documents (grep: bara WorkspaceChatPage, admin; docs-
--   chatten går via retrieveVendorDocs med service-ögon). Granten dras in.
--   Policyn behöver ändå grenen `AND auth.uid() IS NOT NULL`.
--
-- FYND 3 (ÖPPET — behålls, kan inte stängas här): newsletter_email_opens och
--   newsletter_link_clicks har INSERT *och* UPDATE `TO public` med `true`.
--   Policyerna heter "System can …" men systemet är edge-funktionerna
--   newsletter/track.ts och newsletter/link.ts, som kör med service-nyckel
--   och därför inte behöver anon-vägen alls. Anon kan idag skriva OCH skriva
--   OM godtyckliga öppnings-/klickrader — d.v.s. förfalska nyhetsbrevs-
--   statistik. Detta är exakt tickets/leads-klassen igen. Åtgärd (egen
--   migration): begränsa policyerna till service_role och dra sedan granten.
--   Behålls här eftersom skillnadsanalysen ska följa policyerna, inte gissa.
--
-- FYND 4 (ÖPPET — behålls, publik yta beror på den): webinar_registrations-
--   policyn heter "Registrants can read own registrations" men har
--   `qual = true`. Anon kan alltså läsa SAMTLIGA registranters namn, e-post
--   och telefon. WebinarBlock.tsx behöver bara ett `count(head)` per webinar.
--   Åtgärd (egen migration): flytta räkningen till en SECURITY DEFINER-RPC och
--   ersätt policyn — då kan även SELECT-granten dras.
--
-- FYND 5 (LATENT BUGG, ingen åtgärd här): vyn profiles_public är
--   security_invoker=true och ärver därför profiles RLS, vars enda SELECT-
--   policies kräver auth.uid(). Anon får 0 rader — trots kommentaren i
--   useChat.tsx ("accessible without auth"). Agentens namn/avatar visas alltså
--   aldrig för en utloggad besökare i live-supportchatten. Granten BEHÅLLS:
--   den läcker ingenting idag, och att dra den skulle cementera buggen som ett
--   hårt 403 i stället för ett tomt resultat.
--
-- FYND 6 (MEDIUM, behålls): beta_test_sessions/_findings/_exchanges har
--   uttryckliga "Allow anon select"-policies med `true`. QA-tabeller, men
--   fynden är läsbara publikt. Avsiktligt namngivna för anon — behålls, men
--   bör ses över när beta-riggen inte längre behöver anon-ögon.
--
-- FYND 7 (HÖGT, ej åtgärdat här — eget spår): document_counters har RLS
--   AVSTÄNGT (enda tabellen i public utan RLS) och noll policies. Där var
--   granten det ENDA skyddet. Verifierat live: anon läser 2 rader. Anons
--   grants dras in nedan, vilket stänger anon-halvan — men `authenticated`
--   har fortfarande full SELECT/INSERT/UPDATE/DELETE utan någon radgrind alls,
--   d.v.s. varje inloggad användare oavsett roll kan skruva på dokument-
--   numreringen. Att slå på RLS + policy hör till ett eget beslut (tabellen
--   används av SECURITY DEFINER-numrerare) och görs inte i en grant-migration.
--
-- FYND 8 (REDAN TRASIGT, ingen regression — men värt att laga separat):
--   `.insert().select()` = RETURNING kräver LÄSRÄTT. Två publika ytor gör
--   precis det på tabeller där anon aldrig haft en SELECT-policy, och är
--   alltså trasiga redan idag — granten var aldrig det som bar dem:
--     • SmartBookingBlock.tsx gör `.insert(...).select('id').single()` mot
--       bookings och `if (error) throw error`. bookings SELECT finns bara
--       `TO authenticated` (can_access_module) ⇒ RETURNING filtreras bort ⇒
--       .single() på noll rader ⇒ kastar. Bokningen SKRIVS, men besökaren
--       får ett fel. Betalflödet efteråt (som behöver bookingData.id) nås
--       aldrig.
--     • CheckoutSuccessPage.tsx läser orders/order_items som gäst. SELECT
--       finns bara för admin eller `TO authenticated` (user_id = auth.uid())
--       ⇒ gästköpares kvittosida är tom. Sidan struntar i error och visar
--       "ingen order", så den degraderar tyst.
--   Migrationen ändrar bara FELKODEN på dessa (PGRST116/tomt → 42501), inte
--   om de fungerar. Rätt fix är en SECURITY DEFINER-RPC som returnerar den
--   egna bokningen/ordern mot token, inte en bredare policy.
--
-- ── AVGRÄNSNING ────────────────────────────────────────────────────────────
-- back_in_stock_requests RÖRS INTE (varken grants eller policies) — tabellen
-- hanteras parallellt i en annan session (upsert-buggen) och två samtidiga
-- ändringar på samma tabell är en kollision som ingen av oss kan felsöka.
-- Konsekvens: den behåller tills vidare anons TRUNCATE och sina döda
-- SELECT/UPDATE/DELETE-grants. TODO: kör samma svep på den tabellen när den
-- andra sessionen landat.
--
-- Sekvenser rörs inte. Fyra sekvenser har USAGE till anon
-- (page_experiment_events_id_seq, lead_email_blast_recipients_id_seq,
-- demo_run_items_id_seq, pos_receipt_seq). Ingen av dem hör till en behållen
-- INSERT-yta, så de blir verkningslösa när INSERT-granten försvinner — men att
-- dra USAGE ger inget skydd som granten ovan inte redan ger, och risken att
-- knäcka en legitim INSERT är större än vinsten.
--
-- REFERENCES och TRIGGER lämnas kvar. De kan inte läsa eller skriva rader.
--
-- Migrationen är idempotent: REVOKE på en rättighet man inte har är en no-op,
-- och ALTER DEFAULT PRIVILEGES är ett deklarativt sluttillstånd. Den är
-- dessutom DATADRIVEN (loopar över live-katalogen i stället för en hårdkodad
-- tabellista) så att den ger samma sluttillstånd på varje instans i flottan,
-- oavsett vilka moduler/tabeller just den instansen råkar ha.


-- ── 1+2. Död yta dras in från anon ─────────────────────────────────────────
-- Den behållna ytan står som VALUES-lista inne i frågan (ingen temptabell —
-- den hade krävt att runnern kör migrationen i en transaktion, vilket vi inte
-- kan anta). Loopen läser live-katalogen, så listan stämmer per instans:
-- varje (relation, verb) där anon har grant men saknar en policy den kan
-- uppfylla dras in. `to_regrole` i stället för en cast, så att en instans utan
-- anon-rollen ger noll träffar i stället för ett hårt fel.

DO $$
DECLARE
  r      record;
  n_done integer := 0;
BEGIN
  FOR r IN
    WITH keep(tbl, verb) AS (VALUES
      -- SELECT: publik läsning
      ('pages'::text,'SELECT'::text), ('blog_posts','SELECT'), ('blog_categories','SELECT'),
      ('blog_tags','SELECT'), ('blog_post_categories','SELECT'), ('blog_post_tags','SELECT'),
      ('blog_comments','SELECT'), ('docs_pages','SELECT'), ('handbook_chapters','SELECT'),
      ('kb_articles','SELECT'), ('kb_categories','SELECT'), ('knowledge_chunks','SELECT'),
      ('products','SELECT'), ('product_variants','SELECT'), ('product_attributes','SELECT'),
      ('product_attribute_values','SELECT'), ('product_variant_values','SELECT'),
      ('product_categories','SELECT'), ('uoms','SELECT'), ('uom_categories','SELECT'),
      ('shipping_rates','SELECT'), ('postal_code_rules','SELECT'),
      ('booking_services','SELECT'), ('booking_availability','SELECT'),
      ('booking_blocked_dates','SELECT'), ('business_hours','SELECT'),
      ('business_holidays','SELECT'), ('job_postings','SELECT'),
      ('consultant_profiles','SELECT'), ('webinars','SELECT'),
      ('webinar_registrations','SELECT'), ('webmeet_rooms','SELECT'),
      ('global_blocks','SELECT'), ('page_redirects','SELECT'), ('site_settings','SELECT'),
      ('installed_template','SELECT'), ('quote_items','SELECT'),
      ('chat_conversations','SELECT'), ('chat_messages','SELECT'), ('profiles_public','SELECT'),
      ('beta_test_sessions','SELECT'), ('beta_test_findings','SELECT'),
      ('beta_test_exchanges','SELECT'),
      -- INSERT: publik skrivning
      ('form_submissions','INSERT'), ('newsletter_subscribers','INSERT'),
      ('bookings','INSERT'), ('applications','INSERT'), ('blog_comments','INSERT'),
      ('orders','INSERT'), ('order_items','INSERT'), ('page_views','INSERT'),
      ('utm_attributions','INSERT'), ('webinar_registrations','INSERT'),
      ('quote_signatures','INSERT'), ('chat_conversations','INSERT'),
      ('chat_messages','INSERT'), ('chat_feedback','INSERT'),
      ('newsletter_email_opens','INSERT'), ('newsletter_link_clicks','INSERT'),
      -- UPDATE
      ('chat_conversations','UPDATE'), ('newsletter_email_opens','UPDATE'),
      ('newsletter_link_clicks','UPDATE'),
      -- DELETE
      ('chat_conversations','DELETE')
    )
    SELECT c.relname AS tbl, a.privilege_type AS verb
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p','v','m','f')
      AND a.grantee = to_regrole('anon')
      AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
      -- kollisionsyta: hanteras i annan session
      AND c.relname <> 'back_in_stock_requests'
      AND NOT EXISTS (
        SELECT 1 FROM keep k
        WHERE k.tbl = c.relname AND k.verb = a.privilege_type
      )
    ORDER BY c.relname, a.privilege_type
  LOOP
    -- %s för verbet är säkert: värdet kommer ur katalogen och är ett av de
    -- fyra literalerna i IN-listan ovan, aldrig användardata.
    EXECUTE format('REVOKE %s ON TABLE public.%I FROM anon', r.verb, r.tbl);
    n_done := n_done + 1;
  END LOOP;

  RAISE NOTICE 'anon-ytan: % (relation,verb)-par indragna', n_done;
END;
$$;


-- ── 3. TRUNCATE dras in överallt — RLS gäller inte TRUNCATE ────────────────
-- Det här är den obehagligaste posten i hela inventeringen. TRUNCATE styrs
-- INTE av radpolicies: har man granten tömmer man tabellen, oavsett vad varje
-- policy i schemat säger. anon OCH authenticated hade TRUNCATE på 376
-- relationer var — d.v.s. hela databasen, för vem som helst med publika
-- nyckeln. Ingen frontend eller edge-funktion truncatear någonting (verifierat
-- med grep i src/ och supabase/functions/: enda träffarna på "truncate" är
-- fältet `result.truncated` i workspace-chat, en helt annan sak).
-- service_role och postgres behåller sin — de är innanför förtroendegränsen.

DO $$
DECLARE
  r      record;
  n_done integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.grantee::regrole::text AS who
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p','v','m','f')
      AND a.grantee IN (to_regrole('anon'), to_regrole('authenticated'))
      AND a.privilege_type = 'TRUNCATE'
      AND c.relname <> 'back_in_stock_requests'
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM %I', r.tbl, r.who);
    n_done := n_done + 1;
  END LOOP;

  RAISE NOTICE 'TRUNCATE: % (relation,roll)-par indragna', n_done;
END;
$$;


-- ── 4. Framtida tabeller föds inte längre med anon-skrivrätt ───────────────
-- Utan det här steget återuppstår problemet vid nästa CREATE TABLE. Supabase
-- sätter ALTER DEFAULT PRIVILEGES för både `postgres` (rollen som kör
-- migrationer) och `supabase_admin` (dashboard/plattform), båda med
-- arwdDxtm — alltså INSERT+SELECT+UPDATE+DELETE+TRUNCATE+REFERENCES+TRIGGER
-- +MAINTAIN — till anon och authenticated.
--
-- SELECT lämnas kvar i defaulten: en ny tabell utan policies är ändå oläsbar
-- (RLS på + noll policies = noll rader), och att dra SELECT skulle göra varje
-- ny publik läsyta till ett extra manuellt steg för ingen vinst.
-- SKRIVVERBEN dras: en ny publik skrivyta ska kräva ett medvetet GRANT.
-- TRUNCATE dras från båda rollerna, av skälet i avsnitt 3.
--
-- Båda rollerna görs "best effort" med LOUD varning vid miss: runnern kör inte
-- garanterat som en roll som är medlem i den andra, och migrationen får inte
-- falla på det — men ett tyst misslyckande vore värre än inget, så utfallet
-- syns i migrationsutskriften.

DO $$
DECLARE
  owner_role text;
BEGIN
  FOREACH owner_role IN ARRAY ARRAY['postgres','supabase_admin'] LOOP
    IF to_regrole(owner_role) IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon',
        owner_role);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public '
        'REVOKE TRUNCATE ON TABLES FROM authenticated',
        owner_role);
      RAISE NOTICE 'default privileges: % justerad', owner_role;
    EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
      RAISE WARNING 'default privileges: % kunde INTE justeras (%). Tabeller '
                    'skapade av den rollen föds fortfarande med anon-skrivgrants '
                    '— kör om detta avsnitt som den rollen.',
                    owner_role, SQLERRM;
    END;
  END LOOP;
END;
$$;


-- ── 5. LACKMUS ─────────────────────────────────────────────────────────────
-- Kör mot instansen EFTER migrationen. Poängen är att skilja "RLS gav noll
-- rader" från "granten finns inte" — det är två olika fel och bara det andra
-- bevisar att bältet sitter.
--
-- A) Den legitima publika skrivytan lever fortfarande:
--
--    BEGIN;
--    SET LOCAL ROLE anon;
--    INSERT INTO public.newsletter_subscribers (email)
--    VALUES ('lackmus-' || gen_random_uuid() || '@example.com');
--    -- FÖRVÄNTAT: INSERT 0 1
--    ROLLBACK;
--
-- B) Ett verb utan anon-policy ger nu PERMISSION DENIED, inte tomt resultat.
--    (Före migrationen gav den här en RLS-avvisning — "new row violates
--    row-level security policy" — vilket betyder att granten fanns.)
--
--    BEGIN;
--    SET LOCAL ROLE anon;
--    UPDATE public.newsletter_subscribers SET status = 'active';
--    -- FÖRVÄNTAT: ERROR: permission denied for table newsletter_subscribers
--    ROLLBACK;
--
-- C) Läsytan som stängdes i FYND 1 — 337 rader före, hårt nej efter:
--
--    BEGIN;
--    SET LOCAL ROLE anon;
--    SELECT count(*) FROM public.agent_objective_activities;
--    -- FÖRVÄNTAT: ERROR: permission denied for table agent_objective_activities
--    ROLLBACK;
--
-- D) TRUNCATE är borta för både anon och authenticated:
--
--    BEGIN;
--    SET LOCAL ROLE anon;
--    TRUNCATE public.page_views;
--    -- FÖRVÄNTAT: ERROR: permission denied for table page_views
--    ROLLBACK;
--
--    BEGIN;
--    SET LOCAL ROLE authenticated;
--    TRUNCATE public.orders;
--    -- FÖRVÄNTAT: ERROR: permission denied for table orders
--    ROLLBACK;
--
-- E) Publik läsning är orörd:
--
--    BEGIN;
--    SET LOCAL ROLE anon;
--    SELECT count(*) FROM public.pages;        -- FÖRVÄNTAT: antal publicerade
--    SELECT count(*) FROM public.products;     -- FÖRVÄNTAT: antal aktiva
--    ROLLBACK;
--
-- F) Sluttillståndet, inte exit-koden — ska ge exakt 63:
--
--    SELECT count(*)
--    FROM pg_class c
--    JOIN pg_namespace n ON n.oid = c.relnamespace
--    CROSS JOIN LATERAL aclexplode(c.relacl) a
--    WHERE n.nspname = 'public'
--      AND a.grantee = 'anon'::regrole
--      AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
--      AND c.relname <> 'back_in_stock_requests';
--    -- FÖRVÄNTAT: 63 (och 0 för privilege_type = 'TRUNCATE')
