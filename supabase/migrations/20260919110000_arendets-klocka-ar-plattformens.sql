-- Ärendets klocka är plattformens.
--
-- Processbatteriet 2026-09-19 (support-to-resolution): manage_ticket går på den
-- generiska db-handlern, och den skriver varje kolumn den får. Två följder:
--
--   * resolved_at / closed_at stämplades ALDRIG när en agent löste ett ärende —
--     bara admin-UI:t satte dem, från klientens klocka. Ett återöppnat ärende
--     behöll sin resolved_at, så lösningsklockan stod still och ärendet saknade
--     deadline.
--   * Samma öppna kolumner lät en agent skriva resolved_at själv: ett ärende
--     som brutit sin SLA kunde dateras "löst i tid". En sensor som den mätte
--     kan ställa om är ingen sensor.
--
-- Regeln bor på tabellen: statusbytet stämplar, återöppning nollar, och en
-- UPDATE kan aldrig flytta klockslagen. INSERT får bära historiska tider
-- (import, e-postens Date-huvud) men aldrig framtida, och aldrig en lösning
-- före ärendets födelse.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.ticket_clock()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_done boolean := NEW.status::text IN ('resolved', 'closed');
  -- Import och test behöver kunna säga "det här hände då". Det görs med en
  -- transaktionslokal inställning — nåbar bara för den som redan har SQL mot
  -- databasen (operatören), aldrig via en kolumn i en skill eller PostgREST.
  v_now timestamptz := COALESCE(NULLIF(current_setting('flowwink.ticket_clock', true), '')::timestamptz, now());
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL OR NEW.created_at > now() THEN NEW.created_at := now(); END IF;
    IF v_done THEN
      IF NEW.resolved_at IS NULL OR NEW.resolved_at > now() OR NEW.resolved_at < NEW.created_at THEN NEW.resolved_at := now(); END IF;
      IF NEW.status::text = 'closed' AND (NEW.closed_at IS NULL OR NEW.closed_at > now() OR NEW.closed_at < NEW.resolved_at) THEN
        NEW.closed_at := now();
      END IF;
    ELSE
      NEW.resolved_at := NULL;
      NEW.closed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: födelsen och klockslagen är inte skrivbara fält.
  NEW.created_at := OLD.created_at;
  NEW.resolved_at := OLD.resolved_at;
  NEW.closed_at := OLD.closed_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT v_done THEN
      -- Återöppnat: klockan går igen.
      NEW.resolved_at := NULL;
      NEW.closed_at := NULL;
    ELSE
      IF NEW.resolved_at IS NULL THEN NEW.resolved_at := v_now; END IF;
      IF NEW.status::text = 'closed' THEN
        IF NEW.closed_at IS NULL THEN NEW.closed_at := v_now; END IF;
      ELSE
        NEW.closed_at := NULL; -- closed → resolved: inte längre stängt
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

-- Namnet sorterar EFTER sync_ticket_stage_trg: stage → status måste vara klar
-- innan klockan läser statusen (BEFORE-triggrar går i namnordning).
DROP TRIGGER IF EXISTS ticket_clock_trg ON public.tickets;
CREATE TRIGGER ticket_clock_trg
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.ticket_clock();

-- Lösta ärenden från tiden före stämpeln: updated_at är det närmaste vi vet.
-- Triggern stängs av runt backfillen (den skulle annars återställa värdet).
ALTER TABLE public.tickets DISABLE TRIGGER ticket_clock_trg;
UPDATE public.tickets SET resolved_at = COALESCE(updated_at, created_at)
 WHERE status::text IN ('resolved', 'closed') AND resolved_at IS NULL;
UPDATE public.tickets SET closed_at = COALESCE(updated_at, resolved_at)
 WHERE status::text = 'closed' AND closed_at IS NULL;
UPDATE public.tickets SET resolved_at = NULL, closed_at = NULL
 WHERE status::text NOT IN ('resolved', 'closed') AND (resolved_at IS NOT NULL OR closed_at IS NOT NULL);
ALTER TABLE public.tickets ENABLE TRIGGER ticket_clock_trg;

DO $proof$
DECLARE v_id uuid; v_t record;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO tickets (subject, status, created_at, resolved_at)
    VALUES ('proof: clock', 'open', now() - interval '3 days', now() - interval '2 days') RETURNING id INTO v_id;
    SELECT * INTO v_t FROM tickets WHERE id = v_id;
    IF v_t.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'proof: an open ticket was born resolved'; END IF;
    IF v_t.created_at > now() - interval '2 days' THEN RAISE EXCEPTION 'proof: a historical created_at was not kept on insert'; END IF;

    UPDATE tickets SET status = 'resolved' WHERE id = v_id;
    SELECT * INTO v_t FROM tickets WHERE id = v_id;
    IF v_t.resolved_at IS NULL OR v_t.resolved_at < now() - interval '1 minute' THEN RAISE EXCEPTION 'proof: resolving did not stamp resolved_at now'; END IF;

    -- En agent försöker datera lösningen till före SLA-brottet.
    UPDATE tickets SET resolved_at = now() - interval '2 days', created_at = now() WHERE id = v_id;
    SELECT * INTO v_t FROM tickets WHERE id = v_id;
    IF v_t.resolved_at < now() - interval '1 minute' THEN RAISE EXCEPTION 'proof: resolved_at could be backdated by an update'; END IF;
    IF v_t.created_at > now() - interval '2 days' THEN RAISE EXCEPTION 'proof: created_at could be moved by an update'; END IF;

    UPDATE tickets SET status = 'closed' WHERE id = v_id;
    SELECT * INTO v_t FROM tickets WHERE id = v_id;
    IF v_t.closed_at IS NULL THEN RAISE EXCEPTION 'proof: closing did not stamp closed_at'; END IF;

    UPDATE tickets SET status = 'open' WHERE id = v_id;
    SELECT * INTO v_t FROM tickets WHERE id = v_id;
    IF v_t.resolved_at IS NOT NULL OR v_t.closed_at IS NOT NULL THEN RAISE EXCEPTION 'proof: a reopened ticket kept its resolved/closed stamp'; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'arendets-klocka: proof passed';
END $proof$;
