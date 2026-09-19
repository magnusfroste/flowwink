-- Webinarets enda dörr.
--
-- Processbatteriet 2026-09-19 (register-to-attend) fann att kapacitet och
-- status bara levde INUTI register_for_webinar — och att tre vägar gick runt:
--
--   ANON      Policyn "Anyone can register for webinars" var INSERT WITH CHECK
--             (true). Det publika blocket gjorde exakt den inserten: en tredje
--             plats på ett webinar med två platser svarade 201, mot ett utkast
--             lika gärna, och med vilket lead_id som helst.
--   AGENT     manage_webinar bar en odeklarerad gren `register` med rå insert.
--   RACE      RPC:n räknade och satte sedan in, utan lås: fyra samtidiga
--             anmälningar till EN plats satte tre–fyra personer.
--
-- Och poängen ljög åt två håll: RPC:n lade +15/+10 direkt på leads.score utan
-- rad i aktivitetsliggaren, och qualify_lead räknar om poängen UR liggaren —
-- varje webinarfött lead föll till 0 vid första kvalificering. Närvaro gav +10
-- på varje false→true, så ett rättat felklick blev +20.
--
-- Principen: regeln bor på TABELLEN, inte i en av dess skrivare. En
-- BEFORE INSERT-trigger låser webinarraden, kräver öppet webinar och en ledig
-- plats — då lyder varje skrivare, även service-rollen och generiska CRUD.
-- Poäng skrivs som liggarrader, idempotent per (lead, webinar, typ).
--
-- Idempotent: CREATE OR REPLACE, DROP … IF EXISTS.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Regeln på tabellen
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.webinar_registration_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_status text;
  v_max integer;
  v_taken integer;
BEGIN
  NEW.email := lower(trim(NEW.email));
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RAISE EXCEPTION 'email required';
  END IF;

  -- Låset serialiserar rusningen till sista platsen: nästa anmälan räknar
  -- först när den här har landat.
  SELECT w.status, w.max_attendees INTO v_status, v_max
    FROM public.webinars w WHERE w.id = NEW.webinar_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'webinar % not found', NEW.webinar_id;
  END IF;
  IF v_status NOT IN ('published', 'live') THEN
    RAISE EXCEPTION 'webinar not open for registration (status %)', v_status;
  END IF;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_taken FROM public.webinar_registrations r WHERE r.webinar_id = NEW.webinar_id;
    IF v_taken >= v_max THEN
      RAISE EXCEPTION 'webinar is full (% of % seats taken)', v_taken, v_max;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.webinar_registration_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_webinar_registration_gate ON public.webinar_registrations;
CREATE TRIGGER trg_webinar_registration_gate
  BEFORE INSERT ON public.webinar_registrations
  FOR EACH ROW EXECUTE FUNCTION public.webinar_registration_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Den anonyma dörren stängs; besökaren går genom RPC:n
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can register for webinars" ON public.webinar_registrations;
DROP POLICY IF EXISTS "Webinar staff can add registrations" ON public.webinar_registrations;
CREATE POLICY "Webinar staff can add registrations" ON public.webinar_registrations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), 'webinars'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Poängen bor i liggaren
-- ═══════════════════════════════════════════════════════════════════════════
-- En rad per (lead, webinar, typ). Returnerar true när raden är NY — bara då
-- rör sig leads.score, så poäng och liggare alltid säger samma tal.
-- Inte SECURITY DEFINER: den anropas bara inifrån de två definer-funktionerna
-- nedan och ärver deras rättigheter; ensam når den ingenting.
CREATE OR REPLACE FUNCTION public.webinar_score_once(p_lead_id uuid, p_webinar_id uuid, p_type text, p_points integer)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_title text;
BEGIN
  IF p_lead_id IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.lead_activities la
              WHERE la.lead_id = p_lead_id AND la.type = p_type
                AND la.metadata->>'webinar_id' = p_webinar_id::text) THEN
    RETURN false;
  END IF;
  SELECT w.title INTO v_title FROM public.webinars w WHERE w.id = p_webinar_id;
  INSERT INTO public.lead_activities (lead_id, type, points, metadata)
  VALUES (p_lead_id, p_type, p_points, jsonb_build_object('webinar_id', p_webinar_id, 'webinar_title', v_title));
  RETURN true;
END $fn$;

REVOKE ALL ON FUNCTION public.webinar_score_once(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_for_webinar(p_webinar_id uuid, p_name text, p_email text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(p_email));
  v_lead_id uuid;
  v_reg_id uuid;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'a valid email is required'; END IF;

  -- Samma anmälan igen (vilket skiftläge som helst) är samma anmälan: uppdatera
  -- namn/telefon och svara. Den passerar aldrig kapacitetsgrinden en gång till.
  SELECT id, lead_id INTO v_reg_id, v_lead_id FROM webinar_registrations WHERE webinar_id = p_webinar_id AND email = v_email;
  IF v_reg_id IS NOT NULL THEN
    UPDATE webinar_registrations SET name = COALESCE(NULLIF(trim(p_name), ''), name), phone = COALESCE(p_phone, phone) WHERE id = v_reg_id;
    RETURN jsonb_build_object('success', true, 'registration_id', v_reg_id, 'lead_id', v_lead_id, 'already_registered', true);
  END IF;

  -- Status, kapacitet och låset: trg_webinar_registration_gate. Platsen tas
  -- FÖRE leadet skapas, så ett fullt webinar lämnar ingen kontakt efter sig.
  INSERT INTO webinar_registrations (webinar_id, name, email, phone)
  VALUES (p_webinar_id, p_name, v_email, p_phone)
  RETURNING id INTO v_reg_id;

  SELECT id INTO v_lead_id FROM leads WHERE lower(email) = v_email LIMIT 1;
  IF v_lead_id IS NULL THEN
    INSERT INTO leads (email, name, phone, source, source_id, score)
    VALUES (v_email, NULLIF(trim(p_name), ''), p_phone, 'webinar', p_webinar_id::text, 0)
    RETURNING id INTO v_lead_id;
  ELSE
    UPDATE leads SET updated_at = now(), name = COALESCE(name, NULLIF(trim(p_name), '')), phone = COALESCE(phone, p_phone)
     WHERE id = v_lead_id;
  END IF;
  UPDATE webinar_registrations SET lead_id = v_lead_id WHERE id = v_reg_id;

  IF public.webinar_score_once(v_lead_id, p_webinar_id, 'webinar_register', 15) THEN
    UPDATE leads SET score = COALESCE(score, 0) + 15, updated_at = now() WHERE id = v_lead_id;
  END IF;

  PERFORM emit_platform_event('webinar.registered',
    jsonb_build_object('webinar_id', p_webinar_id, 'registration_id', v_reg_id, 'lead_id', v_lead_id, 'email', v_email),
    'webinars');

  RETURN jsonb_build_object('success', true, 'registration_id', v_reg_id, 'lead_id', v_lead_id);
END $function$;

-- Besökarens dörr (det publika blocket) och operatörens är samma funktion.
GRANT EXECUTE ON FUNCTION public.register_for_webinar(uuid, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_webinar_attendance(p_registration_id uuid, p_attended boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg webinar_registrations%ROWTYPE;
BEGIN
  -- The matrix is the only dial: whoever has the webinars module marks attendance.
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'webinars')) THEN
    RAISE EXCEPTION 'Marking attendance requires the webinars module' USING ERRCODE = '42501';
  END IF;
  UPDATE webinar_registrations SET attended = p_attended WHERE id = p_registration_id RETURNING * INTO v_reg;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration % not found', p_registration_id; END IF;
  -- Närvaron poängsätts EN gång per (lead, webinar): liggarraden är minnet, så
  -- ett felklick som rättas (av → på igen) ger inte tio poäng till.
  IF p_attended AND public.webinar_score_once(v_reg.lead_id, v_reg.webinar_id, 'webinar_attend', 10) THEN
    UPDATE leads SET score = COALESCE(score, 0) + 10, updated_at = now() WHERE id = v_reg.lead_id;
  END IF;
  PERFORM emit_platform_event('webinar.attended', jsonb_build_object('webinar_id', v_reg.webinar_id, 'registration_id', v_reg.id, 'lead_id', v_reg.lead_id, 'attended', p_attended), 'webinars');
  RETURN jsonb_build_object('success', true, 'id', v_reg.id, 'attended', p_attended);
END $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Livscykeln bor också på tabellen
-- ═══════════════════════════════════════════════════════════════════════════
-- manage_webinar update skrev status rakt igenom: ett genomfört webinar gick
-- tillbaka till utkast, förbi publish/start/complete/cancel. Övergångarna är de
-- som livscykel-RPC:erna redan gör; allt annat vägras för VARJE skrivare.
CREATE OR REPLACE FUNCTION public.webinar_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'draft'     AND NEW.status IN ('published', 'live', 'cancelled'))
    OR (OLD.status = 'published' AND NEW.status IN ('draft', 'live', 'completed', 'cancelled'))
    OR (OLD.status = 'live'      AND NEW.status IN ('completed', 'cancelled'))
    OR (OLD.status = 'cancelled' AND NEW.status = 'draft')
  ) THEN
    RAISE EXCEPTION 'webinar status cannot go from % to % (draft → published → live → completed; cancel from any open state; a completed webinar is final)', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_webinar_status_transitions ON public.webinars;
CREATE TRIGGER trg_webinar_status_transitions
  BEFORE UPDATE OF status ON public.webinars
  FOR EACH ROW EXECUTE FUNCTION public.webinar_status_transitions();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Beviset — körs mot sig själv och rullas tillbaka
-- ═══════════════════════════════════════════════════════════════════════════
DO $proof$
DECLARE
  v_web uuid; v_draft uuid; v_r jsonb; v_lead uuid; v_score int; v_n int; v_reg uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO webinars (title, date, status, max_attendees) VALUES ('proof: two seats', now() + interval '14 days', 'published', 2) RETURNING id INTO v_web;
    INSERT INTO webinars (title, date, status) VALUES ('proof: draft', now() + interval '14 days', 'draft') RETURNING id INTO v_draft;

    v_r := register_for_webinar(v_web, 'A', 'Proof.A@example.test');
    v_lead := (v_r->>'lead_id')::uuid;
    v_r := register_for_webinar(v_web, 'A again', 'proof.a@EXAMPLE.test');
    IF NOT COALESCE((v_r->>'already_registered')::boolean, false) THEN RAISE EXCEPTION 'proof: the same address in another case was a second registration'; END IF;
    SELECT score INTO v_score FROM leads WHERE id = v_lead;
    IF v_score <> 15 THEN RAISE EXCEPTION 'proof: registration scored % (expected 15, once)', v_score; END IF;
    SELECT count(*) INTO v_n FROM lead_activities WHERE lead_id = v_lead AND type = 'webinar_register';
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: % ledger rows for one registration', v_n; END IF;

    PERFORM register_for_webinar(v_web, 'B', 'proof.b@example.test');
    BEGIN
      PERFORM register_for_webinar(v_web, 'C', 'proof.c@example.test');
      RAISE EXCEPTION 'proof: a third seat on a two-seat webinar was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'webinar is full%' THEN RAISE; END IF;
    END;
    IF EXISTS (SELECT 1 FROM leads WHERE email = 'proof.c@example.test') THEN RAISE EXCEPTION 'proof: a refused registration left a lead behind'; END IF;

    -- Regeln bor på tabellen: även en rå insert som service-roll vägras.
    BEGIN
      INSERT INTO webinar_registrations (webinar_id, name, email) VALUES (v_web, 'raw', 'proof.raw@example.test');
      RAISE EXCEPTION 'proof: a raw insert walked past capacity';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'webinar is full%' THEN RAISE; END IF;
    END;
    BEGIN
      INSERT INTO webinar_registrations (webinar_id, name, email) VALUES (v_draft, 'raw', 'proof.raw@example.test');
      RAISE EXCEPTION 'proof: a draft webinar took a registration';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'webinar not open%' THEN RAISE; END IF;
    END;

    -- Närvaro: på, av, på igen = tio poäng, inte tjugo.
    SELECT id INTO v_reg FROM webinar_registrations WHERE webinar_id = v_web AND email = 'proof.a@example.test';
    PERFORM mark_webinar_attendance(v_reg, true);
    PERFORM mark_webinar_attendance(v_reg, false);
    PERFORM mark_webinar_attendance(v_reg, true);
    SELECT score INTO v_score FROM leads WHERE id = v_lead;
    IF v_score <> 25 THEN RAISE EXCEPTION 'proof: score after a corrected mis-click is % (expected 25)', v_score; END IF;
    SELECT COALESCE(sum(points), 0) INTO v_n FROM lead_activities WHERE lead_id = v_lead;
    IF v_n <> 25 THEN RAISE EXCEPTION 'proof: the ledger says % while the score says 25', v_n; END IF;

    -- Ett genomfört webinar är slutgiltigt, vem som än skriver.
    UPDATE webinars SET status = 'completed' WHERE id = v_web;
    BEGIN
      UPDATE webinars SET status = 'draft' WHERE id = v_web;
      RAISE EXCEPTION 'proof: a completed webinar walked back to draft';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'webinar status cannot go%' THEN RAISE; END IF;
    END;

    -- Den anonyma dörren är stängd.
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'webinar_registrations' AND cmd = 'INSERT' AND with_check = 'true') THEN
      RAISE EXCEPTION 'proof: an INSERT policy WITH CHECK (true) is still on webinar_registrations';
    END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'webinarets-enda-dorr: proof passed';
END $proof$;
