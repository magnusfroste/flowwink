-- Ett avtal är inte allas att läsa.
--
-- (Punkt 7 svepte in SLA-familjen i samma migration: sla_policies,
-- sla_violations och support_escalations bar samma konstruktion och samma
-- korsläsning mellan kunder. Samma klass, samma fix, ett granskningstillfälle.)
--
-- INCIDENTEN (nordbrygg, negativtestat skarpt med en kunds egen JWT):
-- `contracts` bar sedan baselinen exakt en läspolicy:
--
--   CREATE POLICY "Authenticated users can view contracts"
--     ON public.contracts FOR SELECT TO authenticated USING (true);
--
-- `USING (true)` betyder "varje inloggad identitet ser varje rad". Ett
-- KUNDPORTALKONTO är en inloggad identitet. Hotell Norrskens portalkonto läste
-- alltså Café Ekots fullständiga avtal — rubrik, belopp, villkorstext och
-- kolumnen `accept_token`, som ÄR signeringsnyckeln. Detta är en korsläsning
-- mellan kunder, inte ett rollglapp internt, och ytan växer av sig själv:
-- portalkonton föds automatiskt vid varje signatur.
--
-- VARFÖR HÅLET ÖVERLEVDE ROLLSVEPEN: 20260813140000 (rls-reads-the-matrix)
-- skrev om policies TEXTUELLT — den letade efter `is_staff(auth.uid())` och
-- bytte mot `can_access_module(...)`. En policy vars hela uttryck är `true`
-- innehåller ingen `is_staff` att byta ut, så den passerade orörd. `contracts`
-- stod dessutom inte ens i migrationens MAP (bara `contract_versions` och
-- `contract_documents` gjorde det). Lärdomen: en textuell omskrivning kan bara
-- rätta policies som redan uttrycker en tanke. `USING (true)` uttrycker ingen.
--
-- FAMILJEN: samma hål satt i syskonen, och två av dem läcker samma data.
--   • contract_versions  — SELECT USING (true) OCH INSERT WITH CHECK (true).
--     `snapshot jsonb` är en HEL radkopia av avtalet, `accept_token` inräknad.
--     Att bara täppa `contracts` hade lämnat läckan öppen en tabell bort.
--   • contract_documents — SELECT USING (true). Bilagorna ÄR delar av avtalet.
--   • contract_signatures — läspolicyn var `admin OR contracts.created_by`,
--     alltså en ägarlista i policytexten i stället för matrisen.
--   • contract_obligations / contract_invoice_reminders — SELECT USING (true).
--   • contract_obligations_with_status — vanlig vy, och en vy körs med ÄGARENS
--     rättigheter om inte `security_invoker` är på. Den hade alltså fortsatt
--     servera obligations FÖRBI den nya policyn. En RLS-fix som lämnar en
--     definer-vy kvar över samma tabell är ingen fix.
--
-- REGELN: matrisen är enda ratten. Personal når avtal genom
-- can_access_module(auth.uid(), 'contracts') — modulen finns i
-- role_module_access-defaults (rollen `hr`), och can_access_module börjar med
-- has_role(admin), så admin förlorar inget.
--
-- KUNDENS EGET AVTAL: kunden matchas på `counterparty_email` mot
-- `auth.jwt() ->> 'email'` — exakt samma mönster som "Customers read own
-- subscriptions" (20260808320000), inklusive lärdomen därifrån: läs ALDRIG
-- auth.users i en policy, `authenticated` saknar select på den tabellen och
-- HELA policyn faller med "permission denied" i stället för att neka snyggt.
--
-- `signer_email` är MEDVETET utelämnad ur ägarskapet. Det fältet skrivs av den
-- anonyma besökaren i signeringsformuläret (sign_contract_by_token tar
-- p_signer_email rakt av). Ägarskap får bara hänga på ett fält PERSONALEN sätter.
--
-- ACCEPT_TOKEN: RLS är radnivå, inte kolumnnivå. Efter den här migrationen kan
-- en kund fortfarande se sin EGEN rads token — den bar hon redan i sin
-- signerings-URL, så det är ingen ny kunskap. Det som dör är att hon ser NÅGON
-- ANNANS. Kolumnrättigheter (REVOKE SELECT (accept_token)) övervägdes och
-- valdes bort: de gäller hela rollen `authenticated`, alltså även personalen,
-- och hade sänkt admin-vyn för att lösa ett problem radpolicyn redan löser.
--
-- INGET PUBLIKT GÅR SÖNDER — verifierat i koden, inte antaget:
--   /contract/:token          → usePublicContract (useContractWorkflow.ts:193)
--                               anropar RPC get_public_contract (SECURITY
--                               DEFINER). Den returnerar en FAST kolumnlista
--                               UTAN accept_token, och bakar in bilagorna som
--                               jsonb — så contract_documents behöver ingen
--                               anon-läsning alls.
--   /contract/:token/certificate → RPC get_contract_certificate (SECURITY DEFINER).
--   signering                 → edge-funktionen contract-sign (service_role,
--                               RLS-befriad).
-- Alla tre går förbi RLS via definer-funktioner. Token BÄRS av besökaren; den
-- läses aldrig ur tabellen. Det är därför den här åtstramningen är möjlig.
--
-- ── NEGATIVTEST-RECEPT (återupprepa beviset) ───────────────────────────────
-- Tre JWT:er mot PostgREST, samma instans, samma ögonblick:
--
--   A. KUNDENS PORTAL-JWT (Hotell Norrsken, e-post = counterparty_email på
--      Norrskens avtal, INGEN rad i user_roles):
--        GET /rest/v1/contracts?select=id,title,accept_token
--        FÖRE : alla avtal på instansen, Café Ekots accept_token inräknad.
--        EFTER: exakt Norrskens egna rader. Café Ekot syns inte.
--        GET /rest/v1/contracts?select=*&counterparty_email=eq.<ekots-adress>
--          → [] (tom lista, inte 403 — RLS filtrerar, den vägrar inte)
--        GET /rest/v1/contract_versions?select=snapshot   → []
--        GET /rest/v1/contract_documents?select=*         → []
--        GET /rest/v1/contract_obligations?select=*       → []
--        GET /rest/v1/contract_obligations_with_status?select=*  → []
--        PATCH /rest/v1/contracts?id=eq.<egen-rad> {"value_cents":1}
--          → 0 rader (kunden LÄSER, skriver aldrig)
--      SLA-familjen, samma JWT — här finns ingen egen-rad-gren alls:
--        GET /rest/v1/sla_violations?select=*
--          FÖRE : varje brottsrad på instansen, inklusive konkurrentens.
--          EFTER: []
--        GET /rest/v1/sla_policies?select=name,threshold_minutes,escalation_actions
--          FÖRE : hela den interna eskaleringskonfigurationen, kreditbelopp
--                 inräknat.
--          EFTER: []
--        GET /rest/v1/support_escalations?select=*  → []
--
--   B. PERSONAL UTAN MODULEN I MATRISEN (t.ex. en roll som bara har
--      `inventory` i role_module_access):
--        GET /rest/v1/contracts  → []   (såg tidigare allt)
--        POST /rest/v1/contract_versions {...} → 0 rader (WITH CHECK-hålet)
--        GET /rest/v1/sla_violations → []
--        GET /rest/v1/support_escalations → []
--      Ge rollen `contracts` (resp. `sla`, `tickets`) i Role Permissions →
--      samma anrop returnerar allt. Det är ratten: den sitter i matrisen, inte
--      i policytexten.
--
--   C. ADMIN-JWT: oförändrad i alla anrop ovan (can_access_module börjar med
--      has_role(admin)). Faller något för admin är migrationen fel, inte
--      matrisen. Gäller uttryckligen även SlaMonitorPage, FieldServicePage och
--      ComplianceTab — de tre admin-ytorna som läser SLA-tabellerna.
--
--   D. ANON (publishable key, ingen inloggning):
--        POST /rest/v1/rpc/get_public_contract {"p_token":"<giltig token>"}
--          → avtalet, UTAN accept_token i svaret.  ← måste fortsätta funka
--        GET /rest/v1/contracts?select=*  → []
--
-- Fallgrop vid återtestning: `service_role`-nyckeln är RLS-BEFRIAD och visar
-- alltid allt. Ett negativtest som kör med service-nyckeln bevisar ingenting.

-- ── 1. contracts ───────────────────────────────────────────────────────────

-- Hålet självt. "Public can view contract by token" droppades redan
-- 20260616190226 men droppas om — instanser som aldrig fick den migrationen
-- (backdaterad mot en managed ledger-HEAD) bär den fortfarande, och den är
-- anon-läsbar över VARJE pending/active avtal.
DROP POLICY IF EXISTS "Authenticated users can view contracts" ON public.contracts;
DROP POLICY IF EXISTS "Public can view contract by token" ON public.contracts;

DROP POLICY IF EXISTS "Staff read contracts" ON public.contracts;
CREATE POLICY "Staff read contracts"
  ON public.contracts
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'contracts'));

-- Kundens egen rad. nullif() gör frånvarande/tom JWT-e-post till NULL, så
-- uttrycket blir NULL (=falskt) i stället för att '' matchar '' på en rad med
-- tom counterparty_email.
DROP POLICY IF EXISTS "Counterparty reads own contract" ON public.contracts;
CREATE POLICY "Counterparty reads own contract"
  ON public.contracts
  FOR SELECT
  TO authenticated
  USING (
    lower(trim(coalesce(counterparty_email, '')))
      = nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '')
  );

-- Skrivningarna följer matrisen. Tidigare: INSERT WITH CHECK (uid = created_by)
-- utan modulgrind, UPDATE på `created_by = uid OR admin` — en ägarlista i
-- policytexten, precis det rollsvep #4 tog bort på trettiotalet tabeller.
DROP POLICY IF EXISTS "Authenticated users can create contracts" ON public.contracts;
DROP POLICY IF EXISTS "Staff create contracts" ON public.contracts;
CREATE POLICY "Staff create contracts"
  ON public.contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_module(auth.uid(), 'contracts')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated users can update contracts" ON public.contracts;
DROP POLICY IF EXISTS "Owners or admins can update contracts" ON public.contracts;
DROP POLICY IF EXISTS "Staff update contracts" ON public.contracts;
CREATE POLICY "Staff update contracts"
  ON public.contracts
  FOR UPDATE
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'contracts'))
  WITH CHECK (public.can_access_module(auth.uid(), 'contracts'));

-- DELETE förblir admin-only. MEDVETET UNDANTAG, samma resonemang som
-- `deals` DELETE i rollsvep #4 (20260821050000): att radera ett signerat avtal
-- är destruktivt och har ingen legitim vardagsanvändning. Termination är en
-- STATUS (terminated_at), inte en radering. Policyn "Admins can delete
-- contracts" från 20260616190226 återupprepas här så att filen är komplett och
-- så att instanser som missade den migrationen får den.
DROP POLICY IF EXISTS "Authenticated users can delete contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admins can delete contracts" ON public.contracts;
CREATE POLICY "Admins can delete contracts"
  ON public.contracts
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── 2. contract_versions ───────────────────────────────────────────────────
-- snapshot = hel radkopia inkl. accept_token. Personal-only: portalen visar
-- ingen versionshistorik, och kundens egen token ligger redan i hennes URL —
-- det finns inget kundbehov att öppna en andra väg till samma hemlighet.
-- INSERT WITH CHECK (true) var dessutom ett av de "WITH CHECK true"-hål som
-- släpper igenom skrivningar USING-ledet aldrig ser.
DROP POLICY IF EXISTS "Authenticated can view contract versions" ON public.contract_versions;
DROP POLICY IF EXISTS "Staff read contract versions" ON public.contract_versions;
CREATE POLICY "Staff read contract versions"
  ON public.contract_versions
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'contracts'));

DROP POLICY IF EXISTS "Authenticated can insert contract versions" ON public.contract_versions;
DROP POLICY IF EXISTS "Staff insert contract versions" ON public.contract_versions;
CREATE POLICY "Staff insert contract versions"
  ON public.contract_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), 'contracts'));

-- ── 3. contract_documents (bilagor) ────────────────────────────────────────
-- Skrivgrinden sattes 20260808400000 med is_staff() och skrevs om till
-- can_access_module av 20260813140000 — men LÄSpolicyn USING (true) låg kvar
-- vid sidan av, och permissiva policies OR:as: en enda `true` upphäver
-- grannens grind. Den droppas, och skrivpolicyn skrivs ut explicit så att
-- filen inte är beroende av att den textuella omskrivningen har körts.
-- Kundens bilagor levereras av get_public_contract som inbakad jsonb.
DROP POLICY IF EXISTS "Authenticated users can view contract documents" ON public.contract_documents;
DROP POLICY IF EXISTS "Staff manage contract appendices" ON public.contract_documents;
CREATE POLICY "Staff manage contract appendices"
  ON public.contract_documents
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'contracts'))
  WITH CHECK (public.can_access_module(auth.uid(), 'contracts'));

-- ── 4. contract_signatures (signeringsloggen) ──────────────────────────────
-- Läspolicyn var `admin OR contracts.created_by = uid`: en kollega som inte
-- råkade skapa avtalet såg inte vem som signerat det, medan matrisen sa att
-- hon har contracts. Ägarlista → matris.
-- INGEN INSERT-policy skapas: den publika signeringen går via
-- sign_contract_by_token / contract-sign (SECURITY DEFINER resp. service_role).
DROP POLICY IF EXISTS "Authenticated can view contract signatures" ON public.contract_signatures;
DROP POLICY IF EXISTS "Owners or admins can view signatures" ON public.contract_signatures;
DROP POLICY IF EXISTS "Staff read contract signatures" ON public.contract_signatures;
CREATE POLICY "Staff read contract signatures"
  ON public.contract_signatures
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'contracts'));

-- ── 5. contract_obligations / contract_invoice_reminders ───────────────────
-- Två `USING (true)` till i samma familj. Åtaganden och påminnelseloggen är
-- rena personalvyer — ingen kundgren behövs. Skrivpolicierna
-- ("obligations_admin_write", "reminders_admin_write") är admin-only och
-- lämnas orörda: de är redan snävare än matrisen.
DO $obligations$
BEGIN
  IF to_regclass('public.contract_obligations') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "obligations_read_auth" ON public.contract_obligations';
    EXECUTE 'DROP POLICY IF EXISTS "Staff read contract obligations" ON public.contract_obligations';
    EXECUTE 'CREATE POLICY "Staff read contract obligations"'
         || ' ON public.contract_obligations FOR SELECT TO authenticated'
         || ' USING (public.can_access_module(auth.uid(), ''contracts''))';
  END IF;

  IF to_regclass('public.contract_invoice_reminders') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "reminders_read_auth" ON public.contract_invoice_reminders';
    EXECUTE 'DROP POLICY IF EXISTS "Staff read contract invoice reminders" ON public.contract_invoice_reminders';
    EXECUTE 'CREATE POLICY "Staff read contract invoice reminders"'
         || ' ON public.contract_invoice_reminders FOR SELECT TO authenticated'
         || ' USING (public.can_access_module(auth.uid(), ''contracts''))';
  END IF;
END
$obligations$;

-- ── 6. Vyn får inte vara en genväg förbi policyn ───────────────────────────
-- contract_obligations_with_status skapades utan security_invoker. En vy körs
-- då med ÄGARENS (postgres) rättigheter, och postgres äger tabellen — RLS
-- appliceras alltså inte alls. Vyn hade fortsatt lämna ut varje åtagande till
-- varje inloggad identitet, oavsett punkt 5 ovan. security_invoker flyttar
-- utvärderingen till anroparen, som är den som ska mätas mot matrisen.
DO $view_invoker$
BEGIN
  IF to_regclass('public.contract_obligations_with_status') IS NOT NULL THEN
    BEGIN
      EXECUTE 'ALTER VIEW public.contract_obligations_with_status SET (security_invoker = on)';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'contract_obligations_with_status: security_invoker kunde inte sättas (%). Vyn förblir en definer-genväg — undersök.', SQLERRM;
    END;
  END IF;
END
$view_invoker$;

-- ── 7. SLA-familjen: samma hål, samma klass ────────────────────────────────
--
-- En parallell QA-körning negativtestade `sla_violations` och `sla_policies`
-- och fann exakt samma konstruktion: `USING (true)` för `authenticated`. En
-- portalkund läste en KONKURRERANDE kunds brottsrad, och Nordbryggs interna
-- eskaleringskonfiguration inklusive kreditbeloppet. Samma klass som
-- contracts-hålet, samma orsak (inget `is_staff` att skriva om, och `sla_*`
-- stod inte i MAP:en för de här två tabellerna), samma växande yta.
--
-- BÅDA STÄNGS HELT MOT KUND. Det är kontrollerat, inte antaget:
--   • Ingen kundvänd yta läser dem. `sla_violations`/`sla_policies` förekommer
--     i src/ endast i useSla.ts och sla-module.ts, och de enda konsumenterna är
--     admin/SlaMonitorPage.tsx, admin/FieldServicePage.tsx,
--     admin/sla/ComplianceTab.tsx och admin/field-service/
--     ServiceOrderDetailDialog.tsx. src/pages/account/, src/components/account/
--     och src/components/public/ nämner SLA med noll träffar.
--   • `sla_violations` KAN inte ens uttrycka en kundgren: tabellen har ingen
--     company_id, ingen customer_email — bara entity_type + entity_id (en
--     textpekare mot ett ärende). Ett kundfilter hade krävt en join genom
--     tickets, alltså ny funktionalitet, inte en säkerhetsfix. Vill man senare
--     visa kunden hennes egen SLA-status är rätt väg en SECURITY DEFINER-RPC
--     som tar ärende-id:t hon redan äger — samma mönster som
--     get_public_contract.
--   • `sla_policies` är ren INTERN konfiguration (namn, metric, tröskel,
--     escalation_actions med kreditbelopp). Den har ingen kunddimension alls.
--
-- MODULVAL: 'sla'. Det är den modul matrisen redan tilldelat resten av
-- familjen (sla_tiers, sla_tier_assignments, sla_clock_pauses, service_credits
-- i 20260813140000:s MAP).
-- OBSERVERA att `sla` i dag saknar rader i role_module_access — sla-module.ts
-- bär `id: 'sla' as any` med kommentaren "not in user-facing ModulesSettings
-- yet". can_access_module('sla') är alltså tills vidare sann bara för admin.
-- Det är INTE en ny inskränkning i praktiken: syskonpolicyn "Staff view
-- sla_tiers" (20260708030000) gatar redan på admin/approver/writer, och
-- approver/writer är legacy-roller som per rollsvepet inte är tilldelade
-- någon. SLA-vyerna var alltså redan admin i praktiken. Det som ändras är att
-- ratten nu SITTER I MATRISEN: operatören kan ge `sla` till supportrollen i
-- Role Permissions, och då öppnas den — utan ny migration.
DROP POLICY IF EXISTS "Authenticated users can read sla_policies" ON public.sla_policies;
DROP POLICY IF EXISTS "Staff read sla_policies" ON public.sla_policies;
CREATE POLICY "Staff read sla_policies"
  ON public.sla_policies
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'sla'));

DROP POLICY IF EXISTS "Authenticated users can read sla_violations" ON public.sla_violations;
DROP POLICY IF EXISTS "Staff read sla_violations" ON public.sla_violations;
CREATE POLICY "Staff read sla_violations"
  ON public.sla_violations
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'sla'));

-- support_escalations bar samma `USING (true)` och hittades i samma svep. Den
-- STÅR i 20260813140000:s MAP (→ 'tickets') men gick fri av exakt samma skäl:
-- omskrivningen letade efter is_staff, och `true` innehåller inget att byta.
-- Eskaleringsraderna namnger vem som larmades och varför — internt, ingen
-- kundyta (enda konsumenten är admin/tickets/TicketEscalationRulesTab.tsx).
DROP POLICY IF EXISTS "Authenticated users can view escalations" ON public.support_escalations;
DROP POLICY IF EXISTS "Staff read support escalations" ON public.support_escalations;
CREATE POLICY "Staff read support escalations"
  ON public.support_escalations
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'tickets'));

-- MEDVETET LÄMNADE i samma familj (funna, motiverade, inte ändrade):
--   • "Service role full access sla_policies/sla_violations" — TO service_role.
--     service_role är RLS-BEFRIAD ändå; policyn är dekoration, inte en yta.
--   • "Admins can manage sla_policies/sla_violations" (FOR ALL, has_role admin)
--     — redan snävare än matrisen; OR:as in utan att öppna något.
--   • "Staff view sla_tiers / sla_tier_assignments / sla_clock_pauses /
--     service_credits" (20260708030000) — hårdkodade rollistor
--     (admin OR approver OR writer). Det är ett rollsvep-ärende, inte ett hål:
--     de LÄCKER inte, de är för snäva. Att konvertera dem till matrisen är ett
--     ÖPPNANDE och hör därför inte hemma i en säkerhetsfix som ska gå att
--     granska på en rad. Eget spår.
--
-- STÖRRE FYND, UTANFÖR DENNA MIGRATION: `USING (true)` för `authenticated` är
-- en KLASS i baselinen, inte tre enskilda buggar — svepet listade 60+ tabeller
-- med samma konstruktion (bl.a. employees, employee_documents, leave_requests,
-- journal_entries, opening_balances, documents, pos_sales, approval_requests).
-- Många är sedan dess ersatta av rollsvepen; resten är inte inventerade. Det
-- behöver ett eget, mätt svep — inte en blind massomskrivning. Rapporterat
-- uppåt, medvetet inte påbörjat här.

-- ── 8. Kvitto i loggen ─────────────────────────────────────────────────────
-- Räknar policies på de tabeller migrationen rör som fortfarande säger `true`
-- rakt av. service_role undantas: den rollen är RLS-befriad ändå, så en
-- `true`-policy där är dekoration och inte en yta.
-- Förväntat: 0. Blir det >0 har någon lagt tillbaka ett hål.
DO $receipt$
DECLARE
  n_true int;
  leftovers text;
BEGIN
  SELECT count(*), string_agg(tablename || '.' || policyname, ', ')
    INTO n_true, leftovers
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('contracts', 'contract_versions', 'contract_documents',
                       'contract_signatures', 'contract_obligations',
                       'contract_invoice_reminders',
                       'sla_policies', 'sla_violations', 'support_escalations')
     AND NOT (coalesce(roles::text[], ARRAY[]::text[]) @> ARRAY['service_role'])
     AND (btrim(coalesce(qual, '')) = 'true' OR btrim(coalesce(with_check, '')) = 'true');

  IF n_true > 0 THEN
    RAISE WARNING 'avtals-/SLA-familjen: % policies bär fortfarande USING/WITH CHECK true (%)', n_true, leftovers;
  ELSE
    RAISE NOTICE 'avtals-/SLA-familjen: inga USING/WITH CHECK true kvar — läsning följer matrisen, kunden ser sin egen avtalsrad och inget annat';
  END IF;
END
$receipt$;
