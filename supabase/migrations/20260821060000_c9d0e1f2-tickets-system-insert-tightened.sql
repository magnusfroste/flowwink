-- Rollsvep #4b: hålet som rollsvepet lämnade öppet med flit — tickets INSERT.
--
-- Incidentklassen: SYSTEMPOLICY UTAN SYSTEM. Baslinjen bär två policies vars
-- namn lovar en maskin och vars uttryck inte grindar någonting:
--
--   CREATE POLICY "System can insert tickets"        ON tickets        FOR INSERT WITH CHECK (true);
--   CREATE POLICY "System can insert ticket comments" ON ticket_comments FOR INSERT WITH CHECK (true);
--
-- Båda står `TO public` — alltså anon OCH authenticated — och baslinjens
-- GRANT INSERT går till både `anon` och `authenticated`. Effekten, verifierad
-- live på optic 2026-08-21: vem som helst som har den publika anon-nyckeln
-- (den ligger i varje besökares JS-bundle) kan POSTa mot /rest/v1/tickets och
-- /rest/v1/ticket_comments. En inloggad användare UTAN någon modulroll kan
-- dessutom lägga `is_internal = true`-kommentarer på GODTYCKLIGT ärende-id —
-- interna anteckningar, i supportens ansikte, i en tråd som inte är hens.
--
-- "System" var aldrig sant. Ingen systemväg behöver policyn: edge-funktionerna
-- (agent-execute manage_ticket/email_to_ticket, composio-webhook, comms-send
-- csat_dispatch, workspace-chat) kör med service-rollen och passerar RLS helt.
-- Policyn var en öppen dörr som ingen gick igenom.
--
-- Regeln: en policy vars WITH CHECK är `true` grindar per definition ingenting;
-- den finns bara för att någon en gång inte visste vilken väg som behövde
-- släppas fram. Kartlägg vägarna, ge var och en sin egen grind, droppa `true`.
--
-- KONSUMENTKARTAN (varje faktisk skrivväg, greppad i src/ och supabase/functions/):
--
--   tickets INSERT via PostgREST
--     · useCreateTicket (src/hooks/useTickets.ts:191) ← CreateTicketDialog, ren
--       personalyta. Täcks av "Staff can manage tickets" (matrisen, #4). Den gör
--       .insert().select('id').single() — RETURNING kräver läsrätt, som
--       "Staff can read tickets" ger samma roll. Oförändrad.
--     · INGEN kundportalsväg fanns. MyTicketsPage listar och svarar, den skapar
--       inte. Att bara droppa policyn hade alltså inte brutit något — men det
--       hade också tyst tagit bort en förmåga portalen ska ha. Ersättningsrälsen
--       nedan (submit_support_request) gör kundens skapa-väg explicit och ägd.
--     · INGEN anon-väg. Noll träffar på "ticket" i src/components/public/.
--
--   ticket_comments INSERT via PostgREST
--     · useAddTicketComment (src/hooks/useTickets.ts:260) ← TicketDetailDrawer,
--       personalyta, skriver även is_internal=true. Täcks av
--       "Staff can manage ticket_comments" (matrisen, #4). Oförändrad.
--     · useAddMyTicketReply (src/hooks/useMyTickets.ts:49) ← MyTicketsPage.
--       Täcks redan av "Customers can reply on own tickets" från 20260731172326
--       (WITH CHECK is_internal = false AND can_view_ticket(ticket_id)) —
--       ägarskapsgrindad sedan juli. Oförändrad.
--
--   Slutsats: noll legitima konsumenter av de två `true`-policyerna. Det är
--   först efter #4:s matrispolicies som det går att SE det — före dem svalde
--   `true` både personalens och kundens skrivningar och dolde vem som var vem.
--
-- Noterat, inte åtgärdat här: "Approvers can view/update tickets" står också
-- `TO public`, men uttrycket är has_role(auth.uid(), …) som är falskt för anon
-- (auth.uid() IS NULL) — fail-closed by construction, ingen dörr. Eget spår att
-- städa rollistan mot matrisen.

-- ── 1. Ersättningsrälsen: kundens egen skapa-väg ───────────────────────────
--
-- Mönstret är ingest_form_lead (20260805190000): en SECURITY DEFINER-RPC med
-- hård validering i stället för en öppen tabellpolicy. Skälet är detsamma i
-- båda fallen — RPC:n löser två problem på en gång: skribenten behöver ingen
-- INSERT-policy, och den behöver inte heller läsrätt för sitt RETURNING.
--
-- Skillnaden mot ingest_form_lead: den här vägen är INTE publik. Den kräver en
-- session och stämplar ärendet med den sessionen. Kunden kan alltså inte skapa
-- ett ärende i någon annans namn — contact_email, contact_name och company_id
-- läses ur profilen och company_contacts, aldrig ur argumenten. Det är hela
-- poängen: fälten som avgör VEM ärendet tillhör får inte vara skrivbara av den
-- som skickar in det, annars är ägarskapsgrinden bara en artighetsfras.
--
-- `urgent` saknas i prioritetslistan med flit. Självdeklarerad panik är en
-- triageringsfråga, inte ett kundfält; personalen höjer via matrisvägen.
DROP FUNCTION IF EXISTS public.submit_support_request(text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_support_request(
  p_subject text,
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'medium',
  p_category text DEFAULT 'other'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_subject     text := nullif(btrim(coalesce(p_subject, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_priority    text := lower(btrim(coalesce(p_priority, 'medium')));
  v_category    text := lower(btrim(coalesce(p_category, 'other')));
  v_email       text;
  v_name        text;
  v_company_id  uuid;
  v_id          uuid;
BEGIN
  -- Fail closed. Ingen session → inget ärende. Service-rollen har medvetet
  -- ingen EXECUTE här; edge-funktionerna skriver direkt på tabellen.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'submit_support_request requires an authenticated session';
  END IF;

  IF v_subject IS NULL OR length(v_subject) < 3 THEN
    RAISE EXCEPTION 'subject is required (at least 3 characters)';
  END IF;
  IF length(v_subject) > 200 THEN
    RAISE EXCEPTION 'subject is too long (max 200 characters)';
  END IF;
  IF v_description IS NOT NULL AND length(v_description) > 10000 THEN
    RAISE EXCEPTION 'description is too long (max 10000 characters)';
  END IF;

  -- Tillåtlista, inte cast: ett okänt värde ska ge ett läsbart fel i stället
  -- för "invalid input value for enum ticket_priority".
  IF v_priority NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'priority must be one of low, medium, high';
  END IF;
  IF v_category NOT IN ('bug', 'feature', 'question', 'billing', 'other') THEN
    RAISE EXCEPTION 'category must be one of bug, feature, question, billing, other';
  END IF;

  SELECT lower(p.email), p.full_name
    INTO v_email, v_name
    FROM public.profiles p
   WHERE p.id = v_uid;

  -- Samma företagsräckvidd som can_view_ticket() läser: aktiv kontakt.
  -- Skrivs ärendet på företaget blir det synligt för kollegorna i portalen,
  -- vilket är precis vad läspolicyn redan lovar.
  SELECT cc.company_id
    INTO v_company_id
    FROM public.company_contacts cc
   WHERE cc.auth_user_id = v_uid
     AND cc.status = 'active'
   ORDER BY cc.created_at
   LIMIT 1;

  INSERT INTO public.tickets (
    subject, description, priority, category,
    contact_email, contact_name, company_id, source, created_by
  ) VALUES (
    v_subject,
    v_description,
    v_priority::ticket_priority,
    v_category::ticket_category,
    v_email,
    v_name,
    v_company_id,
    'portal',
    v_uid
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.submit_support_request(text, text, text, text) IS
  'Portalens enda skapa-ärende-väg för inloggade kunder. Ägarskapet (created_by, contact_email, company_id) stämplas ur sessionen, aldrig ur argumenten. Ersätter policyn "System can insert tickets" (WITH CHECK true). Personalen skapar via tabellen under matrispolicyn; edge-funktioner via service-rollen.';

REVOKE ALL ON FUNCTION public.submit_support_request(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_support_request(text, text, text, text) TO authenticated;

-- ── 2. Först nu: droppa `true`-policyerna ──────────────────────────────────
--
-- Ordningen är inte kosmetisk. Matrispolicyerna kom i 20260821050000,
-- kundens svarspolicy i 20260731172326, kundens skapa-väg tio rader upp.
-- Varje konsument har sin egen grind INNAN dörren stängs.
DROP POLICY IF EXISTS "System can insert tickets" ON public.tickets;
DROP POLICY IF EXISTS "System can insert ticket comments" ON public.ticket_comments;

-- ── 3. Ta bort anons INSERT-grant på köpet ─────────────────────────────────
--
-- Bälte och hängslen. Utan policy nekar RLS redan anon, men grantet är det som
-- gör att en framtida policy skriven `TO public` av misstag skulle öppna
-- dörren igen — och tabellgrantet är inget någon läser när den skriver en
-- policy. Ingen anon-väg finns (se konsumentkartan), så inget kan gå sönder.
-- SECURITY DEFINER-funktioner påverkas inte: de kör som ägaren.
REVOKE INSERT ON public.tickets FROM anon;
REVOKE INSERT ON public.ticket_comments FROM anon;

-- ── LACKMUS (recept som BEVISAR täppningen) ────────────────────────────────
--
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     '{"sub":"<uid för en KUND — company_contact, ingen modulroll>","role":"authenticated"}', true);
--
--   POSITIVT (kunden skapar sitt EGET ärende):
--     SELECT public.submit_support_request('Printer offline', 'Since Monday.');
--       → returnerar ett uuid. Kontrollera stämpeln:
--     SELECT created_by = auth.uid(), contact_email, source FROM tickets WHERE id = <uuid>;
--       → t, kundens egen e-post, 'portal'.
--
--   POSITIVT (kunden svarar på sitt eget):
--     INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type)
--     VALUES (<uuid>, 'Still down', false, 'customer');   → 1 rad.
--     ("Customers can reply on own tickets", oförändrad sedan juli.)
--
--   NEKANDE 1 (intern anteckning på EGET ärende):
--     INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type)
--     VALUES (<uuid>, 'internal', true, 'agent');
--       → new row violates row-level security policy. is_internal = false står
--         i kundpolicyns WITH CHECK; matrispolicyn kräver tickets-modulen.
--
--   NEKANDE 2 (huvudfyndet — intern anteckning på ANNANS ärende):
--     Ta ett <främmande_id> som kunden inte kan se, och kör
--     INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type)
--     VALUES (<främmande_id>, 'internal', true, 'agent');
--       → violates RLS. FÖRE denna migration: 1 rad, tyst, i supportens tråd.
--
--   NEKANDE 3 (direkt tabellskrivning förbi RPC:n):
--     INSERT INTO tickets (subject, created_by) VALUES ('x', '<annat uid>');
--       → violates RLS. Kunden har ingen INSERT-policy på tickets alls; enda
--         vägen är RPC:n, och den stämplar ägarskapet själv.
--
--   NEKANDE 4 (anon, med den publika nyckeln):
--     SET LOCAL ROLE anon;
--     INSERT INTO tickets (subject) VALUES ('spam');
--       → permission denied for table tickets (grantet är borta).
--     SELECT public.submit_support_request('spam');
--       → permission denied for function submit_support_request.
--
--   PERSONALEN LEVER (regressionen som får kosta mest om den missas):
--     Med JWT för en användare med rollen `support` (som HAR tickets i
--     role_module_access) ska både
--       INSERT INTO tickets (subject) VALUES ('staff-created')            → 1 rad
--       INSERT INTO ticket_comments (ticket_id, content, is_internal, author_type)
--         VALUES (<vilket som helst>, 'note', true, 'agent')              → 1 rad
--     fortfarande gå igenom. Gör de inte det läser matrisen fel modul.
--
--   ÅTERKALLNING: ta bort raden (support,'tickets') ur role_module_access och
--     kör om personaltestet — det MÅSTE bli RLS-fel. Blir det 1 rad finns det
--     en `true`-policy kvar någonstans.
