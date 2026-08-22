-- Rollsvep #4: SKRIVNINGARNA följer matrisen — läsrätten gjorde det redan.
--
-- Incidentklassen: TYST NO-OP. #102 gav trettiotalet tabeller en matris-LÄSPOLICY
-- ("Staff can read <tabell>" = can_access_module), men skrivpolicyn lämnades i sitt
-- gamla styre — antingen ren `has_role(uid,'admin')` eller en hårdkodad rollista
-- som namnger `writer`/`approver`, båda märkta "(legacy)" i src/types/cms.ts och
-- tilldelade åt ingen. Resultatet är en asymmetri som UI:t inte kan uttrycka:
-- rollen SER varje offert, varje ärende, varje lead — och varje skrivning
-- försvinner. PostgREST svarar "success, 0 rader" på en RLS-nekad UPDATE/DELETE,
-- och de anropande hookarna saknar genomgående `.select()`/radräkning, så toasten
-- säger "Quote sent" / "Contact deleted" / "Booking deleted" medan noll rader rörts.
--
-- Nekad behörighet renderad som frånvarande EFFEKT — systerfallet till
-- 20260820230000:s "nekad behörighet renderad som frånvarande DATA".
--
-- Värsta enskilda fyndet (rapport C): useSendQuote skriver statusraden utan
-- .select(), skickar sedan mejlet med ett accept_token som aldrig persisterades.
-- Kunden får en länk som är död vid födseln. Varje internt test passerade
-- eftersom testaren var admin i samma webbläsare.
--
-- Regeln (rollsvepet): matrisen är enda ratten. can_access_module() börjar själv
-- med has_role(_user_id,'admin'), så admin förlorar aldrig något — det som
-- TILLKOMMER är precis de roller operatören faktiskt beviljat modulen i
-- Role Permissions. Bytet är därför ett ÖPPNANDE, inte en snävning.
--
-- Två avsiktliga undantag som INTE konverteras:
--   * deals DELETE förblir admin-only ("Admins can manage deals" står kvar orörd).
--     useDeals.ts:268-273 dokumenterar den som destruktiv grind för test-/
--     träningsdata, och agentytan vägrar verbet. Samma logik som
--     admin-only-rpcs.ts-allowlisten. Beslut taget.
--   * WITH CHECK true-policierna ("System can insert tickets/ticket comments/leads",
--     "Anyone can create bookings") behålls. De är publika vägar (kontaktformulär,
--     SmartBookingBlock, portalen). Att strama åt dem är ett eget spår — men
--     matrispolicyn måste ligga på plats FÖRST, annars dör supportens svarsknapp
--     när hålet väl täpps.
--
-- Noterat, inte ett fel: modulerna `email` och `maintenance` har i dag NOLL rader
-- i role_module_access på fleeten. can_access_module returnerar alltså fortfarande
-- bara sant för admin där. Konverteringen är beteendeneutral just nu och gör
-- räckvidden STYRBAR — det är hela poängen: ratten ska finnas i matrisen, inte i
-- en policytext.

-- ── 1. Skrivpolicies → matrisen ────────────────────────────────────────────

-- approval_delegations → approvals.
-- useApprovalDelegations.ts:60-64 revokar utan radräkning ("Delegation revoked"
-- på noll rader).
DROP POLICY IF EXISTS "Admins manage approval_delegations" ON public.approval_delegations;
DROP POLICY IF EXISTS "Staff can manage approval_delegations" ON public.approval_delegations;
CREATE POLICY "Staff can manage approval_delegations"
  ON public.approval_delegations
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'approvals'))
  WITH CHECK (public.can_access_module(auth.uid(), 'approvals'));

-- bookings → bookings. UPDATE/DELETE gatades på `approver OR admin`.
-- useBookings.ts:367 raderar utan .select() ("Booking deleted" på noll rader).
-- "Anyone can create bookings" (INSERT true) BEHÅLLS — publika SmartBookingBlock
-- beror på den.
-- "Admins can view all bookings" är en död SELECT-dubblett av matrisläspolicyn.
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can delete bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can delete bookings" ON public.bookings;
CREATE POLICY "Staff can update bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'bookings'))
  WITH CHECK (public.can_access_module(auth.uid(), 'bookings'));
CREATE POLICY "Staff can delete bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'bookings'));

-- consultant_profiles → consultants.
-- ConsultantProfilesPage.tsx:296/:320 skriver och raderar utan .select().
-- BEHÅLLS: "Public can view active profiles" (anon-vyn) och
-- "System can insert consultant profiles" där den finns (WITH CHECK true —
-- asymmetrin "skapa går, rätta går inte" är just det som försvinner här).
DROP POLICY IF EXISTS "Admins can manage consultant profiles" ON public.consultant_profiles;
DROP POLICY IF EXISTS "Staff can manage consultant_profiles" ON public.consultant_profiles;
CREATE POLICY "Staff can manage consultant_profiles"
  ON public.consultant_profiles
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'consultants'))
  WITH CHECK (public.can_access_module(auth.uid(), 'consultants'));

-- deal_activities → deals. INSERT/UPDATE/DELETE gatades på `approver OR admin`.
-- useActivities.ts:203-206 raderar utan .select(): ingen toast alls, raden
-- "kommer tillbaka" vid refetch.
-- "Authenticated can view deal activities" är en död SELECT-dubblett.
DROP POLICY IF EXISTS "Authenticated can view deal activities" ON public.deal_activities;
DROP POLICY IF EXISTS "Authenticated can create deal activities" ON public.deal_activities;
DROP POLICY IF EXISTS "Authenticated can update deal activities" ON public.deal_activities;
DROP POLICY IF EXISTS "Admins can delete deal activities" ON public.deal_activities;
DROP POLICY IF EXISTS "Staff can manage deal_activities" ON public.deal_activities;
CREATE POLICY "Staff can manage deal_activities"
  ON public.deal_activities
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'deals'))
  WITH CHECK (public.can_access_module(auth.uid(), 'deals'));

-- deals → deals, MEN endast INSERT och UPDATE.
-- DELETE lämnas avsiktligt kvar under "Admins can manage deals" (FOR ALL, admin) —
-- den enda kvarvarande DELETE-vägen, och därmed den destruktiva grinden.
-- "Approvers can insert/update deals" behålls som additiva attestvägar.
-- "Approvers can view and update deals" är trots namnet en ren SELECT-policy
-- (verifierat i pg_policies) och en död dubblett av matrisläspolicyn.
DROP POLICY IF EXISTS "Approvers can view and update deals" ON public.deals;
DROP POLICY IF EXISTS "Staff can insert deals" ON public.deals;
DROP POLICY IF EXISTS "Staff can update deals" ON public.deals;
CREATE POLICY "Staff can insert deals"
  ON public.deals
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), 'deals'));
CREATE POLICY "Staff can update deals"
  ON public.deals
  FOR UPDATE
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'deals'))
  WITH CHECK (public.can_access_module(auth.uid(), 'deals'));

-- discount_codes → ecommerce.
-- useDiscountCodes.ts:118 raderar utan .select(). NB: hooken skriver via
-- from('discount_codes' as any), så en rak grep missar ytan.
DROP POLICY IF EXISTS "Admins can manage discount codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Staff can manage discount_codes" ON public.discount_codes;
CREATE POLICY "Staff can manage discount_codes"
  ON public.discount_codes
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'ecommerce'))
  WITH CHECK (public.can_access_module(auth.uid(), 'ecommerce'));

-- lead_activities → leads. Live bar tre hårdkodade rollistor
-- (admin|approver|sales, INSERT-varianten dessutom |writer) — verifierat i
-- pg_policies, alltså den listvariant som rapport B varnade för.
-- useLeads.ts:210 raderar utan att ens destrukturera `error`: värsta fallet i
-- svepet — RLS-nekad radering är helt osynlig och flödet rapporterar
-- "Contact deleted".
-- "Authenticated can view lead activities" är en död SELECT-dubblett.
DROP POLICY IF EXISTS "Authenticated can view lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Staff can log lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Staff can update lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Staff can delete lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Staff can manage lead_activities" ON public.lead_activities;
CREATE POLICY "Staff can manage lead_activities"
  ON public.lead_activities
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'leads'))
  WITH CHECK (public.can_access_module(auth.uid(), 'leads'));

-- leads → leads. Till skillnad från deals finns ingen dokumenterad avsiktlig
-- admin-grind på DELETE här, så matrisen får hela verbet.
-- BEHÅLLS: "System can insert leads" (WITH CHECK true — publika formulärvägens
-- fallback, createLeadFromForm) och "Approvers can update leads" (additiv).
DROP POLICY IF EXISTS "Admins can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Staff can manage leads" ON public.leads;
CREATE POLICY "Staff can manage leads"
  ON public.leads
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'leads'))
  WITH CHECK (public.can_access_module(auth.uid(), 'leads'));

-- maintenance_schedules → maintenance. Enda direktskrivningen i modulen
-- (MaintenancePage.tsx:531); requests och equipment går via RPC.
-- Här är felet LOUD (42501) men lika fel: en maintenance-behörig icke-admin
-- kunde inte lägga upp förebyggande schema alls.
DROP POLICY IF EXISTS "Admins manage maintenance_schedules" ON public.maintenance_schedules;
DROP POLICY IF EXISTS "Staff can manage maintenance_schedules" ON public.maintenance_schedules;
CREATE POLICY "Staff can manage maintenance_schedules"
  ON public.maintenance_schedules
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'maintenance'))
  WITH CHECK (public.can_access_module(auth.uid(), 'maintenance'));

-- outbound_communications → email. BÅDE läs- och skrivpolicyn var has_role(admin).
-- LinkCommunicationDialog.tsx:47-48 uppdaterar utan .select(): dialogen stänger
-- och säger "Message linked to contact" utan att något skrevs.
-- SELECT och UPDATE konverteras tillsammans — annars får rollen skrivrätt på
-- rader den inte kan se.
DROP POLICY IF EXISTS "admins read outbound communications" ON public.outbound_communications;
DROP POLICY IF EXISTS "admins link outbound communications" ON public.outbound_communications;
DROP POLICY IF EXISTS "Staff can read outbound_communications" ON public.outbound_communications;
DROP POLICY IF EXISTS "Staff can link outbound_communications" ON public.outbound_communications;
CREATE POLICY "Staff can read outbound_communications"
  ON public.outbound_communications
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'email'));
CREATE POLICY "Staff can link outbound_communications"
  ON public.outbound_communications
  FOR UPDATE
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'email'))
  WITH CHECK (public.can_access_module(auth.uid(), 'email'));

-- products → ecommerce (modul-id är `ecommerce`, inte `products`).
-- ProductDialog.tsx:176 uppdaterar utan att destrukturera `error`;
-- useProducts.ts:130 raderar utan .select().
-- BEHÅLLS: "Public can view active products" (butiken) och
-- "Approvers can view products".
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
CREATE POLICY "Staff can manage products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'ecommerce'))
  WITH CHECK (public.can_access_module(auth.uid(), 'ecommerce'));

-- quotes → quotes. Två admin-policies (ALL + UPDATE) blir en matrispolicy;
-- båda var rena delmängder av den, eftersom can_access_module börjar med admin.
-- Detta är fallet med den döda accept_token-länken (useQuoteWorkflow.ts:133-142).
DROP POLICY IF EXISTS "Admins can manage quotes" ON public.quotes;
DROP POLICY IF EXISTS "Admins can update quotes" ON public.quotes;
DROP POLICY IF EXISTS "Staff can manage quotes" ON public.quotes;
CREATE POLICY "Staff can manage quotes"
  ON public.quotes
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'quotes'))
  WITH CHECK (public.can_access_module(auth.uid(), 'quotes'));

-- quote_items → quotes. "Staff can manage quote items" var spöklistan
-- admin|writer; "Staff can view quote items" är en redundant SELECT-dubblett
-- bredvid matrisläspolicyn.
-- quotes-module.ts:274/:290 kastar returvärdet från .insert() helt: offerten
-- skapas, raderna gör det inte, och publish() svarar success.
-- BEHÅLLS: "Public can view items via quote token" (kundens signeringsvy).
DROP POLICY IF EXISTS "Staff can view quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Staff can manage quote items" ON public.quote_items;
DROP POLICY IF EXISTS "Staff can manage quote_items" ON public.quote_items;
CREATE POLICY "Staff can manage quote_items"
  ON public.quote_items
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'quotes'))
  WITH CHECK (public.can_access_module(auth.uid(), 'quotes'));

-- quote_templates → quotes. Samma spöklista (admin|writer) plus redundant
-- SELECT-dubblett. useQuoteTemplates.ts:77 raderar utan .select().
DROP POLICY IF EXISTS "Staff can view templates" ON public.quote_templates;
DROP POLICY IF EXISTS "Staff can manage templates" ON public.quote_templates;
DROP POLICY IF EXISTS "Staff can manage quote_templates" ON public.quote_templates;
CREATE POLICY "Staff can manage quote_templates"
  ON public.quote_templates
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'quotes'))
  WITH CHECK (public.can_access_module(auth.uid(), 'quotes'));

-- tickets → tickets. useTickets.ts:228-233 är hela ärendehanteringen — status,
-- prioritet, tilldelning, resolution — och den skriver utan .select(). För
-- support/sales (som HAR tickets i matrisen) uppdaterades noll rader utan fel:
-- statusen "hoppar tillbaka" efter refetch.
-- BEHÅLLS: "Customers can view own tickets", "System can insert tickets",
-- approver-policyerna (additiva, blir redundanta men gör ingen skada).
DROP POLICY IF EXISTS "Admins can manage tickets" ON public.tickets;
DROP POLICY IF EXISTS "Staff can manage tickets" ON public.tickets;
CREATE POLICY "Staff can manage tickets"
  ON public.tickets
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'tickets'))
  WITH CHECK (public.can_access_module(auth.uid(), 'tickets'));

-- ticket_comments → tickets. Inget går sönder i dag (insert släpps igenom av
-- "System can insert ticket comments", WITH CHECK true) — men det är också
-- hålet. Matrispolicyn måste ligga här FÖRST för att hålet ska gå att täppa
-- utan att supportens svarsknapp dör.
-- BEHÅLLS: "Customers can reply on own tickets",
-- "Customers can view public ticket comments", "System can insert ticket comments".
DROP POLICY IF EXISTS "Admins can manage ticket comments" ON public.ticket_comments;
DROP POLICY IF EXISTS "Staff can manage ticket_comments" ON public.ticket_comments;
CREATE POLICY "Staff can manage ticket_comments"
  ON public.ticket_comments
  FOR ALL
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'tickets'))
  WITH CHECK (public.can_access_module(auth.uid(), 'tickets'));

-- ── 2. Matris-LÄSNING för tabeller som stod helt utanför kartan ────────────
--
-- Mekaniken bakom glappet: 2026-08-13-svepet skrev bara om policies vars uttryck
-- redan innehöll is_staff(auth.uid()), och dessa fyra hade aldrig fått någon
-- sådan. De låg ändå i modulkartan — kartan lovade en gate som aldrig
-- applicerades. Symptomet är återigen tomma flikar och tomma fält, inte fel.
--
-- Skrivvägarna lämnas ORÖRDA: tracking-tabellerna skrivs av pixeln/edge-fn och
-- utskickstabellerna inifrån send_bulk_lead_email (SECURITY DEFINER, redan
-- matris-gatad). Här handlar det bara om att få SE sin egen statistik.
--
-- NB: policyerna finns redan LIVE på optic med exakt dessa namn (verifierat i
-- pg_policies) trots att ingen migration i repot äger dem — samma
-- "policy ingen migration äger"-klass som "Accounting can read vendor_invoices"
-- fick i 20260820230000. Blocket nedan gör repot till ägare och är no-op där de
-- redan finns.

DROP POLICY IF EXISTS "Staff can read newsletter_email_opens" ON public.newsletter_email_opens;
CREATE POLICY "Staff can read newsletter_email_opens"
  ON public.newsletter_email_opens
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'newsletter'));

DROP POLICY IF EXISTS "Staff can read newsletter_link_clicks" ON public.newsletter_link_clicks;
CREATE POLICY "Staff can read newsletter_link_clicks"
  ON public.newsletter_link_clicks
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'newsletter'));

DROP POLICY IF EXISTS "Staff can read lead_email_blasts" ON public.lead_email_blasts;
CREATE POLICY "Staff can read lead_email_blasts"
  ON public.lead_email_blasts
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'leads'));

DROP POLICY IF EXISTS "Staff can read lead_email_blast_recipients" ON public.lead_email_blast_recipients;
CREATE POLICY "Staff can read lead_email_blast_recipients"
  ON public.lead_email_blast_recipients
  FOR SELECT
  TO authenticated
  USING (public.can_access_module(auth.uid(), 'leads'));

-- ── 3. Spöklista som skrivväg vid sidan om matrisen ────────────────────────
--
-- subscriptions: "Staff can manage subscriptions" är listan admin|approver.
-- `approver` är pensionerad, så policyn ger ingen avdelningsroll någonting —
-- men den är en skrivväg som operatören inte kan återkalla i Role Permissions,
-- och alla frontendskrivningar går ändå via edge-funktionen `subscriptions`
-- och SECURITY DEFINER-RPC:er (service_role, som passerar RLS).
-- Samma städning som "Accounting can read vendor_invoices" fick i 20260820230000.
-- BEHÅLLS: "Customers can view own subscriptions", "Customers read own subscriptions",
-- "Staff can read subscriptions" (matrisläsningen).
DROP POLICY IF EXISTS "Staff can manage subscriptions" ON public.subscriptions;

-- ── 4. Död disjunkt i outreach_country_policy ──────────────────────────────
--
-- Läspolicyn lyder can_access_module(...,'salesIntelligence') OR
-- can_access_module(...,'crm'). Modul-id:t `crm` finns inte — modulen heter
-- `leads` (src/lib/modules/crm-module.ts). Andra disjunkten är alltså alltid
-- falsk och har varit det sedan den skrevs. Namnet på policyn är verifierat
-- live: "Staff can read outreach policy" (utan understreck, till skillnad från
-- systrarna). Skrivvägen ("Admins maintain outreach policy") lämnas orörd —
-- referensdata över juridisk regim per land är avsiktligt admin-underhållen och
-- migrationsseedad.
DROP POLICY IF EXISTS "Staff can read outreach policy" ON public.outreach_country_policy;
CREATE POLICY "Staff can read outreach policy"
  ON public.outreach_country_policy
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_module(auth.uid(), 'salesIntelligence')
    OR public.can_access_module(auth.uid(), 'leads')
  );

-- ── 5. RPC-grindarna manage_work_center / manage_routing_operation ─────────
--
-- INGEN ÅTGÄRD BEHÖVS — rapport C:s sidofynd #1 är stale.
-- Båda konverterades redan av 20260821010000_e1f2a3b4 (rad 4104 resp. 4593), och
-- live på optic bär pg_get_functiondef i dag
--   DECLARE v_writer boolean := (auth.role()='service_role'
--                                OR can_access_module(auth.uid(),'manufacturing'));
-- Att skriva om dem här vore ren dubblering. Raden står kvar som anteckning så
-- nästa svep inte letar igen.
--
-- Kvarstår som EGET spår (medvetet ej åtgärdat här): tabellerna work_centers och
-- routing_operations har live INGEN skrivpolicy alls, bara "Staff can read …".
-- De är fail-closed by construction och nås enbart via SECURITY DEFINER — det är
-- korrekt, inte en bugg.

-- ── LACKMUS (negativtest som BEVISAR svepet) ───────────────────────────────
--
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"<uid för en användare med enbart rollen support>","role":"authenticated"}', true);
--
--   POSITIVT: UPDATE tickets SET status='resolved' WHERE id=<id>  → 1 rad.
--             (support har `tickets` i role_module_access.)
--   NEKANDE:  UPDATE quotes  SET status='sent'     WHERE id=<id>  → 0 rader.
--             (support saknar `quotes`; den ägs av accounting+sales.)
--   ÅTERKALLNING: ta bort raden (support,'tickets') ur role_module_access och kör
--             om det positiva testet — det MÅSTE bli 0 rader. Blir det 1 rad
--             läser något annat än matrisen.
--   DESTRUKTIV GRIND: med `sales`-JWT ska DELETE FROM deals WHERE id=<id> ge
--             0 rader (admin-only kvar), medan UPDATE deals ger 1 rad.
