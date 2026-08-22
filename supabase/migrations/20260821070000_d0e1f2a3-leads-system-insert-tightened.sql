-- Dörren som blev kvar när konsumenten flyttade ut.
--
-- INCIDENT: `leads` bar policyn "System can insert leads" — FOR INSERT TO public
-- WITH CHECK (true). Sedan ingest_form_lead (SECURITY DEFINER, 2026-08-05) tog
-- över det publika formulärinflödet hade den ingen legitim konsument kvar, men
-- den stod öppen: anon HAR INSERT-grant på tabellen, så vem som helst på
-- internet — och varje inloggad användare utan leads-modul i rollmatrisen —
-- kunde skriva godtyckliga rader rakt in i CRM:et via PostgREST. Rollsvep 4
-- (20260821050000) gav leads matrisens ALL-policy och lämnade den här stående
-- med motiveringen "publika formulärvägens fallback". Fallbacken kan ändå inte
-- fungera för en besökare: den gör .insert().select().single(), och RETURNING
-- kräver läsrätt som anon inte har. Motiveringen beskrev alltså en väg som
-- redan var död — kvar fanns bara hålet.
--
-- KLASS: "kvarlämnad WITH CHECK true". När en publik skrivväg flyttas till en
-- namngiven RPC måste den gamla tabellpolicyn dö i samma andetag. Annars lever
-- en öppen INSERT vidare med en kommentar som pekar på en konsument som inte
-- finns — och nästa läsare tror att den behövs.
--
-- REGEL: en publik skrivyta är en NAMNGIVEN SECURITY DEFINER-RPC med
-- fail-closed validering (giltig e-post, existerande målobjekt, serverläst
-- innehåll). Tabellen själv följer matrisen — inga WITH CHECK (true) på
-- affärsdata.
--
-- KONSUMENTKARTAN som gjorde beslutet (svept 2026-08-21):
--   * FormBlock → createLeadFromForm → ingest_form_lead (RPC). Redan flyttad.
--   * WebinarBlock → createLeadFromWebinar → DIREKTINSERT som anon. Enda kvar-
--     varande publika konsumenten — och trasig på exakt samma sätt som formulär-
--     vägen var (RETURNING utan läsrätt, plus lead_activities som saknar
--     anon-policy). Flyttas till ingest_webinar_lead nedan.
--   * createLeadFromBooking — DÖD kod, ingen anropare i src/ (docs påstod
--     BookingBlock; BookingBlock nämner inte lead). Bokningsleads föds
--     server-side i comms-send/booking_confirmation.ts med service-nyckel.
--   * Nyhetsbrev → newsletter/subscribe.ts, service-nyckel → passerar RLS.
--   * CreateLeadDialog, useCsvImportExport, useFlowtable, crm-module — staff-
--     ytor, täcks av "Staff can manage leads" (can_access_module 'leads').
--   * agent-execute / prospect-research — service-nyckel, passerar RLS.
-- Inga triggers på form_submissions/bookings/webinar_registrations skriver
-- leads (och de som finns är SECURITY DEFINER).

-- ─── 1. Webinaranmälan får sin egen fail-closed ingång ──────────────────────
-- Samma mönster som ingest_form_lead: SECURITY DEFINER så dedupen faktiskt kan
-- se tabellen, ingen läsrätt krävs av anroparen, hård validering.
--
-- Skillnad mot formulärvägen: den här RETURNERAR lead-id, eftersom blocket
-- stämplar det på webinar_registrations.lead_id. Det läcker ingenting — ett id
-- returneras alltid (skapat eller befintligt), så en utomstående kan inte
-- avgöra om adressen redan fanns i CRM:et, och `leads` är fortsatt oläsbar.
-- Därför returneras heller INGEN is_new-flagga: den frågan är precis vad en
-- sondare vill ha svar på.
--
-- Fail closed på tre punkter: ogiltig e-post → NULL, okänt webinar → NULL,
-- och titeln läses ur databasen i stället för att tros på klientens ord.
CREATE OR REPLACE FUNCTION public.ingest_webinar_lead(
  p_email text,
  p_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_webinar_id uuid DEFAULT NULL::uuid,
  p_visitor_id text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(p_email));
  v_lead_id uuid;
  v_title text;
  v_existing public.leads%ROWTYPE;
BEGIN
  -- Publik, oautentiserad yta: validera hårt, misslyckas tyst.
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN NULL;
  END IF;

  IF p_webinar_id IS NULL OR to_regclass('public.webinars') IS NULL THEN
    RETURN NULL;
  END IF;

  -- Målobjektet måste finnas. Utan den här grinden vore RPC:n en generell
  -- lead-fabrik med godtyckligt source_id — samma öppna dörr, ny dörrpost.
  SELECT w.title INTO v_title FROM public.webinars w WHERE w.id = p_webinar_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_existing FROM public.leads WHERE lower(email) = v_email LIMIT 1;

  IF FOUND THEN
    v_lead_id := v_existing.id;
    -- Progressiv berikning: fyll bara det som saknas, skriv aldrig över.
    UPDATE public.leads SET
      name  = COALESCE(name,  NULLIF(trim(p_name), '')),
      phone = COALESCE(phone, NULLIF(trim(p_phone), '')),
      updated_at = now()
    WHERE id = v_lead_id;
  ELSE
    -- Endast kolumner varje instans i flottan är känd att ha (optic saknar
    -- t.ex. `company` — företaget bor på company_id).
    INSERT INTO public.leads (email, name, phone, source, source_id, status, score)
    VALUES (v_email,
            NULLIF(trim(p_name), ''),
            NULLIF(trim(p_phone), ''),
            'webinar', p_webinar_id::text, 'lead', 15)
    RETURNING id INTO v_lead_id;
  END IF;

  -- Aktiviteten är idempotent per (lead, webinar): en besökare som skickar
  -- formuläret två gånger ska inte få två anmälningsspår. Registreringsraden
  -- själv skyddas av sitt unique-index i webinar_registrations.
  IF to_regclass('public.lead_activities') IS NOT NULL THEN
    INSERT INTO public.lead_activities (lead_id, type, points, metadata)
    SELECT v_lead_id, 'webinar_register', 15,
           jsonb_build_object('webinar_id', p_webinar_id, 'webinar_title', v_title)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.lead_activities la
      WHERE la.lead_id = v_lead_id
        AND la.type = 'webinar_register'
        AND la.metadata->>'webinar_id' = p_webinar_id::text
    );
  END IF;

  -- Identifiera webbläsaren bakom anmälan: backfillar page_views.lead_id så
  -- CRM:ets Visitor behavior-panel visar resan som ledde hit. Guardad — alla
  -- instanser i flottan har inte hunnit få stitch-funktionen.
  IF p_visitor_id IS NOT NULL AND trim(p_visitor_id) <> ''
     AND to_regprocedure('public.stitch_visitor_to_lead(text,uuid,text)') IS NOT NULL THEN
    PERFORM public.stitch_visitor_to_lead(trim(p_visitor_id), v_lead_id, 'webinar_register');
  END IF;

  RETURN v_lead_id;
END;
$function$;

-- Poängen med funktionen är att besökare får anropa den.
GRANT EXECUTE ON FUNCTION public.ingest_webinar_lead(text, text, text, uuid, text)
  TO anon, authenticated, service_role;

-- ─── 2. Först NU stängs dörren ──────────────────────────────────────────────
-- Ersättningen finns ovan (webinar) och sedan 20260805190000 (formulär), i
-- SAMMA migration som droppen — aldrig före. Kvar på tabellen:
--   * "Staff can manage leads" (ALL, can_access_module 'leads') — matrisen
--   * "Staff can read leads" / "Approvers can view and update leads" — läsning
-- Efter det här kan ingen anon-roll skriva i leads, och en inloggad användare
-- utan leads i sin modulmatris kan inte heller det. Service-nyckeln passerar
-- RLS som förut, så edge-funktionerna är oberörda.
DROP POLICY IF EXISTS "System can insert leads" ON public.leads;

-- ─── LACKMUS ────────────────────────────────────────────────────────────────
-- POSITIVT (de publika vägarna lever):
--   1. Formulär, med enbart anon-nyckeln:
--      curl -s -X POST "$URL/rest/v1/rpc/ingest_form_lead" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--        -H 'Content-Type: application/json' \
--        -d '{"p_email":"lackmus+form@example.com","p_name":"Lackmus","p_form_name":"contact"}'
--      → 204. Verifiera som admin: raden finns i leads med source='form'.
--   2. Webinar, med enbart anon-nyckeln (byt ut ett riktigt webinar-id):
--      curl -s -X POST "$URL/rest/v1/rpc/ingest_webinar_lead" \
--        -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--        -H 'Content-Type: application/json' \
--        -d '{"p_email":"lackmus+web@example.com","p_name":"Lackmus","p_webinar_id":"<uuid>"}'
--      → 200 med ett lead-id. Med ett påhittat p_webinar_id → null, ingen rad.
-- NEGATIVT (dörren är stängd):
--   3. Rå INSERT som anon:
--      curl -s -X POST "$URL/rest/v1/leads" -H "apikey: $ANON" \
--        -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' \
--        -d '{"email":"intrang@example.com","source":"manual","status":"lead"}'
--      → 42501 new row violates row-level security policy for table "leads".
--   4. Samma INSERT med en INLOGGAD användare vars roll saknar leads i
--      role_module_access → också 42501. Ge rollen leads i matrisen → går igenom.
--      Det är hela poängen: matrisen är enda ratten.
--   5. select policyname, cmd, roles, with_check from pg_policies
--        where tablename='leads';
--      → ingen rad med with_check = 'true'.
