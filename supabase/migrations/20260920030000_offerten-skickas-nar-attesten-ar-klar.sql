-- Offerten skickas när attesten är klar — och först då.
--
-- Paritetsrunda 3, quotes: attestkedjor (EPIC-04) nådde aldrig offerterna. Kedjan
-- fanns för inköpsorder och utlägg; en offert hade bara den äldre enregelsvägen,
-- och den höll inte ihop:
--
--   * Regeln "en offert som väntar på attest får inte skickas" bodde i två
--     anropare (agentens send, UI:ts useSendQuote) — inte på tabellen. Generisk
--     CRUD och varje framtida skrivare gick förbi den.
--   * En offert ÖVER tröskeln kunde skickas utan att attest någonsin begärts:
--     regeln var en knapp man kunde låta bli att trycka på.
--   * Efter en GODKÄND attest stod offerten kvar i 'pending_approval'. UI:ts
--     send vägrar den statusen oavsett beslut — en godkänd offert kunde alltså
--     aldrig skickas från admin. Efter ett AVSLAG stod den kvar för evigt.
--
-- Nu:
--   1. request_quote_approval — EN dörr för UI och agent. Finns en aktiv kedja
--      för 'quote' går begäran in i kedjan (advance_approval_step, flera steg);
--      annars den äldre enregelsvägen (resolve_approval).
--   2. Regeln på tabellen: draft/pending_approval → sent kräver, när en kedja
--      eller en regel träffar beloppet, en GODKÄND begäran som TÄCKER beloppet.
--      En offert som höjts efter godkännandet prövas om.
--   3. Beslutet landar på offerten: godkänd eller avslagen → tillbaka till
--      'draft' (klar att skicka, respektive klar att arbeta om).
--   4. request_entity_approval: ett tidigare godkännande räknas bara om det
--      täcker beloppet (gällde alla entiteter — en order godkänd för 10 000
--      svarade "redan godkänd" när 50 000 begärdes).
--
-- Flottan förkontrollerad läsande 2026-09-19: request_entity_approval har samma
-- kropp överallt (md5 186f8b8d…), ingen instans har en attestkedja, ingen offert
-- står i pending_approval. Två instanser har offertregler (demofrön) — där
-- börjar tröskeln nu gälla vid sändning, vilket är vad regeln säger.

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Ett godkännande täcker ett belopp
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_entity_approval(p_entity_type text, p_entity_id text, p_amount_cents bigint DEFAULT NULL::bigint, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chain RECORD;
  v_existing RECORD;
  v_id uuid;
BEGIN
  SELECT c.id, min(s.sort_order) AS first_step INTO v_chain
  FROM approval_chains c JOIN approval_steps s ON s.chain_id = c.id
  WHERE c.entity_type = p_entity_type AND c.is_active
  GROUP BY c.id ORDER BY c.id LIMIT 1;
  IF v_chain.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'chain_required', false);
  END IF;
  SELECT id, status, amount_cents INTO v_existing FROM approval_requests
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND chain_id = v_chain.id
  ORDER BY created_at DESC LIMIT 1;
  -- covers-amount 20260920030000
  -- En väntande begäran är samma begäran. En godkänd räknas bara om den täcker
  -- beloppet som nu begärs — annars är det ett nytt beslut.
  IF v_existing.id IS NOT NULL AND (
       v_existing.status = 'pending'
       OR (v_existing.status = 'approved'
           AND (p_amount_cents IS NULL OR v_existing.amount_cents IS NULL OR v_existing.amount_cents >= p_amount_cents))
     ) THEN
    RETURN jsonb_build_object('success', true, 'chain_required', true,
      'request_id', v_existing.id, 'status', v_existing.status, 'existing', true);
  END IF;
  INSERT INTO approval_requests (entity_type, entity_id, amount_cents, reason, chain_id, current_step, requested_by, step_entered_at)
  VALUES (p_entity_type, p_entity_id, p_amount_cents, p_reason, v_chain.id, v_chain.first_step, auth.uid(), now())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'chain_required', true, 'request_id', v_id, 'status', 'pending');
END $function$;

-- Samma publik som förut: inloggade (UI:ts attestflöde) och service-rollen (agenten).
REVOKE ALL ON FUNCTION public.request_entity_approval(text, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_entity_approval(text, text, bigint, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Dörren
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_quote_approval(
  p_quote_id uuid,
  p_reason text DEFAULT NULL,
  p_only_if_required boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_q public.quotes;
  v_chain jsonb;
  v_rule_id uuid;
  v_rule_role app_role;
  v_open record;
  v_request uuid;
  v_steps integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'quotes')) THEN
    RAISE EXCEPTION 'Requires the quotes module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_q FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
  IF v_q.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quote not found');
  END IF;
  IF v_q.status::text NOT IN ('draft', 'pending_approval') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Quote is %s — approval is requested on a draft, before it is sent.', v_q.status::text));
  END IF;

  -- Samma begäran två gånger är samma begäran — så länge den täcker beloppet.
  IF v_q.approval_request_id IS NOT NULL THEN
    SELECT id, status, amount_cents, chain_id INTO v_open FROM public.approval_requests WHERE id = v_q.approval_request_id;
    IF v_open.id IS NOT NULL AND (v_open.status::text = 'pending'
         OR (v_open.status::text = 'approved' AND COALESCE(v_open.amount_cents, 0) >= COALESCE(v_q.total_cents, 0))) THEN
      RETURN jsonb_build_object('success', true, 'requested', true, 'existing', true, 'quote_id', v_q.id,
        'status', v_q.status::text, 'approval_request_id', v_open.id, 'approval_status', v_open.status::text,
        'chain', v_open.chain_id IS NOT NULL);
    END IF;
  END IF;

  v_chain := public.request_entity_approval('quote', v_q.id::text, v_q.total_cents::bigint,
               COALESCE(NULLIF(btrim(p_reason), ''), format('Quote %s pending review', v_q.quote_number)));
  IF COALESCE((v_chain->>'chain_required')::boolean, false) THEN
    v_request := (v_chain->>'request_id')::uuid;
    SELECT count(*) INTO v_steps FROM public.approval_steps s
      JOIN public.approval_requests r ON r.chain_id = s.chain_id WHERE r.id = v_request;
    UPDATE public.approval_requests
       SET currency = COALESCE(v_q.currency, currency),
           context = COALESCE(context, '{}'::jsonb) || jsonb_build_object('quote_number', v_q.quote_number)
     WHERE id = v_request;
  ELSE
    SELECT e.rule_id, e.required_role INTO v_rule_id, v_rule_role
      FROM public.evaluate_approval_required('quote', v_q.total_cents::bigint, COALESCE(v_q.currency, 'SEK')) e;
    IF v_rule_id IS NULL AND COALESCE(p_only_if_required, false) THEN
      RETURN jsonb_build_object('success', true, 'requested', false, 'required', false, 'quote_id', v_q.id,
        'status', v_q.status::text, 'message', 'No approval required — ready to send');
    END IF;
    -- En uttrycklig begäran om granskning får en granskare även när ingen regel träffar.
    INSERT INTO public.approval_requests (rule_id, entity_type, entity_id, amount_cents, currency, reason, required_role, requested_by, context)
    VALUES (v_rule_id, 'quote', v_q.id::text, v_q.total_cents, COALESCE(v_q.currency, 'SEK'),
            COALESCE(NULLIF(btrim(p_reason), ''), format('Quote %s pending review', v_q.quote_number)),
            COALESCE(v_rule_role, 'admin'::app_role), auth.uid(),
            jsonb_build_object('quote_number', v_q.quote_number, 'rule_matched', v_rule_id IS NOT NULL))
    RETURNING id INTO v_request;
  END IF;

  UPDATE public.quotes SET status = 'pending_approval', approval_request_id = v_request, updated_at = now()
   WHERE id = v_q.id;

  RETURN jsonb_build_object('success', true, 'requested', true, 'required', true, 'quote_id', v_q.id,
    'status', 'pending_approval', 'approval_request_id', v_request,
    'chain', COALESCE((v_chain->>'chain_required')::boolean, false), 'chain_steps', v_steps,
    'required_role', CASE WHEN v_steps IS NULL THEN COALESCE(v_rule_role, 'admin'::app_role)::text END,
    'next', CASE WHEN v_steps IS NOT NULL
                 THEN format('A chain of %s step(s) decides: advance_approval_step(%s, ''approve'') per step. The quote returns to draft when the last step approves, and can then be sent.', v_steps, v_request)
                 ELSE format('An approver decides at /admin/approvals?request=%s. The quote returns to draft when it is approved, and can then be sent.', v_request) END);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_quote_approval(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_quote_approval(uuid, text, boolean) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Regeln på tabellen
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.quote_send_needs_its_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_chain boolean;
  v_rule_hit boolean;
  v_covered boolean;
  v_linked record;
BEGIN
  IF NEW.status::text <> 'sent' OR OLD.status::text NOT IN ('draft', 'pending_approval') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.approval_chains c JOIN public.approval_steps s ON s.chain_id = c.id
                  WHERE c.entity_type = 'quote' AND c.is_active) INTO v_has_chain;
  SELECT EXISTS (SELECT 1 FROM public.evaluate_approval_required('quote', NEW.total_cents::bigint, COALESCE(NEW.currency, 'SEK')))
    INTO v_rule_hit;

  -- Ett godkännande som täcker det belopp offerten har NU. Finns en kedja är det
  -- kedjans beslut som gäller.
  SELECT EXISTS (SELECT 1 FROM public.approval_requests r
                  WHERE r.entity_type = 'quote' AND r.entity_id = NEW.id::text AND r.status::text = 'approved'
                    AND (r.amount_cents IS NULL OR r.amount_cents >= COALESCE(NEW.total_cents, 0))
                    AND (NOT v_has_chain OR r.chain_id IS NOT NULL)) INTO v_covered;

  IF OLD.status::text = 'pending_approval' AND NOT v_covered THEN
    SELECT id, status INTO v_linked FROM public.approval_requests WHERE id = OLD.approval_request_id;
    RAISE EXCEPTION 'Quote % is pending approval (request %, %) — it cannot be sent until it has been approved.',
      NEW.quote_number, COALESCE(v_linked.id::text, 'none'), COALESCE(v_linked.status::text, 'no decision yet')
      USING ERRCODE = 'P0001';
  END IF;

  IF (v_has_chain OR v_rule_hit) AND NOT v_covered THEN
    RAISE EXCEPTION 'Quote % (% %) needs approval before it is sent — % applies to this amount and no approved request covers it. Request it with manage_quote action:"request_approval" (admin: "Request approval" on the quote).',
      NEW.quote_number, round(COALESCE(NEW.total_cents, 0) / 100.0, 2), COALESCE(NEW.currency, ''),
      CASE WHEN v_has_chain THEN 'an approval chain' ELSE 'an approval rule' END
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS quote_send_needs_its_approval ON public.quotes;
CREATE TRIGGER quote_send_needs_its_approval
  BEFORE UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.quote_send_needs_its_approval();

REVOKE ALL ON FUNCTION public.quote_send_needs_its_approval() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_send_needs_its_approval() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Beslutet landar på offerten
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_quote_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.entity_type = 'quote' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('approved', 'rejected') THEN
    -- Godkänd: klar att skicka. Avslagen: klar att arbeta om. I båda fallen ett
    -- utkast — tabellens regel avgör om det får skickas.
    UPDATE public.quotes SET status = 'draft', updated_at = now()
     WHERE id::text = NEW.entity_id AND status::text = 'pending_approval' AND approval_request_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_quote_on_approval ON public.approval_requests;
CREATE TRIGGER trg_sync_quote_on_approval
  AFTER UPDATE OF status ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_quote_on_approval();

REVOKE ALL ON FUNCTION public.sync_quote_on_approval() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_quote_on_approval() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Beviset
-- ─────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  v_quote uuid; v_chain uuid; v_r jsonb; v_req uuid; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- Beviset äger sin värld: inga andra regler eller kedjor för offerter.
    UPDATE public.approval_rules SET is_active = false WHERE entity_type = 'quote';
    UPDATE public.approval_chains SET is_active = false WHERE entity_type = 'quote';

    INSERT INTO public.quotes (quote_number, title, customer_name, customer_email, status, subtotal_cents, tax_cents, total_cents, currency)
    VALUES ('PROOF-20260920030000', 'Proof 20260920030000', 'Proof', 'proof-20260920030000@example.test', 'draft', 4000000, 1000000, 5000000, 'SEK')
    RETURNING id INTO v_quote;

    -- Utan regel och utan kedja: fritt fram.
    UPDATE public.quotes SET status = 'sent' WHERE id = v_quote;
    UPDATE public.quotes SET status = 'draft' WHERE id = v_quote;

    -- Med en tvåstegskedja: sändning vägras tills sista steget godkänt.
    INSERT INTO public.approval_chains (name, entity_type, is_active) VALUES ('Proof quote chain', 'quote', true) RETURNING id INTO v_chain;
    INSERT INTO public.approval_steps (chain_id, sort_order, required_role, min_approvals)
    VALUES (v_chain, 1, 'admin', 1), (v_chain, 2, 'admin', 1);

    BEGIN
      UPDATE public.quotes SET status = 'sent' WHERE id = v_quote;
      RAISE EXCEPTION 'proof failed: a quote under an approval chain was sent without approval';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;

    v_r := public.request_quote_approval(v_quote, 'proof');
    v_req := (v_r->>'approval_request_id')::uuid;
    IF NOT (v_r->>'chain')::boolean OR (v_r->>'chain_steps')::int <> 2 THEN
      RAISE EXCEPTION 'proof failed: the request did not enter the chain → %', v_r;
    END IF;
    PERFORM public.advance_approval_step(v_req, 'approve');
    BEGIN
      UPDATE public.quotes SET status = 'sent' WHERE id = v_quote;
      RAISE EXCEPTION 'proof failed: sent after step 1 of 2';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;
    PERFORM public.advance_approval_step(v_req, 'approve');
    SELECT status::text INTO v_status FROM public.quotes WHERE id = v_quote;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'proof failed: an approved quote should be back in draft, is %', v_status;
    END IF;

    -- Höjd efter godkännandet: prövas om.
    UPDATE public.quotes SET total_cents = 6000000 WHERE id = v_quote;
    BEGIN
      UPDATE public.quotes SET status = 'sent' WHERE id = v_quote;
      RAISE EXCEPTION 'proof failed: a quote raised after approval was sent on the old approval';
    EXCEPTION WHEN sqlstate 'P0001' THEN
      IF SQLERRM LIKE 'proof failed%' THEN RAISE; END IF;
    END;
    v_r := public.request_quote_approval(v_quote, 'proof, raised');
    IF (v_r->>'approval_request_id')::uuid = v_req THEN
      RAISE EXCEPTION 'proof failed: the old approval was reused for a higher amount';
    END IF;
    -- Avslag: tillbaka till utkast.
    PERFORM public.advance_approval_step((v_r->>'approval_request_id')::uuid, 'reject');
    SELECT status::text INTO v_status FROM public.quotes WHERE id = v_quote;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'proof failed: a rejected quote should be back in draft, is %', v_status;
    END IF;
    -- Sänkt till det godkända beloppet: det gamla godkännandet täcker igen.
    UPDATE public.quotes SET total_cents = 5000000 WHERE id = v_quote;
    UPDATE public.quotes SET status = 'sent' WHERE id = v_quote;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'proof passed: free without rule or chain; a two-step chain holds the send until the last step; the decision lands on the quote; an approval covers an amount.';
END
$proof$;
