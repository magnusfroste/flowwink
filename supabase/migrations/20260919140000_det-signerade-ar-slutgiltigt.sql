-- Det signerade är slutgiltigt — och signaturen föder tjänsten.
--
-- Processbatteriet 2026-09-19 (sign-to-serve):
--
--   OMSKRIVNING  Ett aktivt, signerat avtal kunde skrivas om via manage_contract
--                update (brödtext, värde) och dess bilagor via
--                manage_contract_appendix. Innehållshashen stämde inte längre med
--                contract_signatures.content_hash. "Redigera inte efter signering"
--                stod som råd i skilltexten; ingenting vägrade.
--   OMSÄNDNING   send_contract_for_signature saknade statusvakt: ett signerat
--                avtal gick tillbaka till pending_signature med levande länk.
--   TJÄNSTEN     Signeringen skapade ALDRIG tjänsten. Triggern
--                subscriptions_provider_needs_reference (20260901210000) vägrar
--                varje provider ≠ 'manual' utan provider_subscription_id — och
--                create_subscription_from_contract sätter provider 'contract'.
--                contract-sign loggade felet och svarade 200. Noll avtalsfödda
--                abonnemang i hela flottan sedan 1 september.
--
-- Principen: signaturen täcker ett bestämt innehåll (det contract-sign hashar:
-- titel, motpart, brödtext, värde, valuta, version + varje bilaga). Det innehållet
-- är oföränderligt från signed_at, för VARJE skrivare. En ändring av ett signerat
-- avtal är ett nytt avtal eller en ny version som signeras på nytt — aldrig en
-- UPDATE. Och ett avtalsabonnemang HAR en referens: avtalet.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Det signerade innehållet
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.contract_signed_content_is_final()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF OLD.signed_at IS NULL THEN RETURN NEW; END IF;

  IF NEW.title             IS DISTINCT FROM OLD.title
  OR NEW.counterparty_name IS DISTINCT FROM OLD.counterparty_name
  OR NEW.body_markdown     IS DISTINCT FROM OLD.body_markdown
  OR NEW.value_cents       IS DISTINCT FROM OLD.value_cents
  OR NEW.currency          IS DISTINCT FROM OLD.currency
  OR NEW.version           IS DISTINCT FROM OLD.version
  OR NEW.file_url          IS DISTINCT FROM OLD.file_url
  OR NEW.signed_at         IS DISTINCT FROM OLD.signed_at THEN
    RAISE EXCEPTION 'Contract % was signed % — its content (title, counterparty, body, value, currency, version, file) is final. Draft a new contract or a new version and send THAT for signature.',
      COALESCE(OLD.contract_number, OLD.id::text), OLD.signed_at::date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ett signerat avtal kan löpa ut eller sägas upp, aldrig bli osignerat.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('draft', 'pending_signature') THEN
    RAISE EXCEPTION 'Contract % is signed — it cannot go back to %.', COALESCE(OLD.contract_number, OLD.id::text), NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS contract_signed_content_is_final_trg ON public.contracts;
CREATE TRIGGER contract_signed_content_is_final_trg
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.contract_signed_content_is_final();

-- Bilagan är en DEL av avtalet: efter signering varken ändras eller tas någon
-- bort. Ett TILLÄGG läggs som en ny bilaga (skillens dokumenterade väg) — den
-- bär sitt eget created_at efter signed_at, så det syns att signaturen inte
-- täcker den — och när den väl finns är också den orubblig.
CREATE OR REPLACE FUNCTION public.contract_appendix_follows_the_signature()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_contract uuid := COALESCE(NEW.contract_id, OLD.contract_id);
  v_signed timestamptz;
  v_number text;
BEGIN
  SELECT c.signed_at, COALESCE(c.contract_number, c.id::text) INTO v_signed, v_number
    FROM public.contracts c WHERE c.id = v_contract;
  -- Avtalet raderas (kaskad) → raden får följa med.
  IF NOT FOUND OR v_signed IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF; -- ett tillägg

  IF TG_OP = 'UPDATE'
     AND NEW.label         IS NOT DISTINCT FROM OLD.label
     AND NEW.title         IS NOT DISTINCT FROM OLD.title
     AND NEW.kind          IS NOT DISTINCT FROM OLD.kind
     AND NEW.body_markdown IS NOT DISTINCT FROM OLD.body_markdown
     AND NEW.file_url      IS NOT DISTINCT FROM OLD.file_url
     AND NEW.sort_order    IS NOT DISTINCT FROM OLD.sort_order
     AND NEW.contract_id   IS NOT DISTINCT FROM OLD.contract_id THEN
    RETURN NEW; -- inget av det signaturen täcker rördes
  END IF;

  RAISE EXCEPTION 'Contract % was signed % — its appendices are part of what was signed and can no longer be changed or removed. Add an amendment as a NEW appendix.',
    v_number, v_signed::date USING ERRCODE = 'check_violation';
END $fn$;

DROP TRIGGER IF EXISTS contract_appendix_follows_the_signature_trg ON public.contract_documents;
CREATE TRIGGER contract_appendix_follows_the_signature_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.contract_appendix_follows_the_signature();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Avtalet ÄR referensen
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.subscriptions_provider_needs_reference()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- På UPDATE: bara när kombinationen NYSS uppstod. En gammal rad med det här
  -- felet ska inte blockera varje orelaterad uppdatering på den; den fångas av
  -- find_unreferenced_provider_subscriptions() i stället.
  IF TG_OP = 'UPDATE'
     AND NEW.provider IS NOT DISTINCT FROM OLD.provider
     AND NEW.provider_subscription_id IS NOT DISTINCT FROM OLD.provider_subscription_id
     AND NEW.contract_id IS NOT DISTINCT FROM OLD.contract_id THEN
    RETURN NEW;
  END IF;

  -- Ett avtalsabonnemang faktureras av AVTALET (generate_contract_invoice) och
  -- bär sin referens i contract_id. Den här triggern vägrade det i tre veckor,
  -- och felmeddelandet rådde till provider 'manual' — vilket hade gett två
  -- fakturerare för samma tjänst.
  IF NEW.provider = 'contract' THEN
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'Subscription claims provider "contract" but carries no contract_id — the contract is its reference and its invoicer.';
    END IF;
    RETURN NEW;
  END IF;

  IF coalesce(NEW.provider, '') <> 'manual'
     AND (NEW.provider_subscription_id IS NULL OR trim(NEW.provider_subscription_id) = '') THEN
    RAISE EXCEPTION
      'Subscription claims provider "%" but carries no provider_subscription_id. '
      'If WE invoice it from the subscription, set provider => ''manual''; if a signed contract invoices it, '
      'set provider => ''contract'' with contract_id. The column defaults to ''stripe'', so leaving it out '
      'makes the subscription silently unbillable. If it really is provider-backed, set the provider''s own id.',
      NEW.provider;
  END IF;

  RETURN NEW;
END $$;

-- Avtal som signerades medan triggern vägrade saknar sin tjänst. Migrationen
-- RAPPORTERAR dem men föder dem inte: en ny tjänst sänder händelser (portal-
-- inbjudan, automationer) mot en riktig kund, och det beslutet är operatörens.
-- Åtgärd per avtal: skillen create_service_from_contract (idempotent, en per avtal).
DO $report$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.contracts c
   WHERE c.signed_at IS NOT NULL AND c.status::text = 'active'
     AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.contract_id = c.id);
  RAISE NOTICE 'det-signerade: % signed, active contract(s) have no service — run the create_service_from_contract skill for each when ready', v_n;
END $report$;

-- Reparationsdörren: föder tjänsten för ETT signerat avtal som saknar den.
-- create_subscription_from_contract frågar varken vem som anropar eller om
-- avtalet är signerat (den anropas av contract-sign i signeringsögonblicket);
-- som skill behövs båda frågorna.
CREATE OR REPLACE FUNCTION public.create_service_from_signed_contract(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_signed timestamptz; v_status text; v_existing uuid; v_sub uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'contracts')) THEN
    RAISE EXCEPTION 'Creating a service from a contract requires the contracts module' USING ERRCODE = '42501';
  END IF;
  SELECT c.signed_at, c.status::text INTO v_signed, v_status FROM public.contracts c WHERE c.id = p_contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contract % not found', p_contract_id; END IF;
  IF v_signed IS NULL OR v_status <> 'active' THEN
    RAISE EXCEPTION 'Contract % is % and % — a service is born from a SIGNED, active contract only',
      p_contract_id, v_status, CASE WHEN v_signed IS NULL THEN 'unsigned' ELSE 'signed' END;
  END IF;
  SELECT id INTO v_existing FROM public.subscriptions WHERE contract_id = p_contract_id;
  v_sub := public.create_subscription_from_contract(p_contract_id);
  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub, 'already_existed', v_existing IS NOT NULL);
END $fn$;

REVOKE ALL ON FUNCTION public.create_service_from_signed_contract(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_from_signed_contract(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Beviset
-- ═══════════════════════════════════════════════════════════════════════════
DO $proof$
DECLARE v_c uuid; v_doc uuid; v_doc2 uuid; v_sub uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO contracts (title, counterparty_name, counterparty_email, status, body_markdown, value_cents, currency, start_date, end_date,
                           billing_enabled, billing_amount_cents, billing_interval, billing_interval_count, billing_next_date)
    VALUES ('proof: signed', 'Proof AB', 'proof-signed@example.test', 'pending_signature', '## §1 Proof' || repeat(' lorem ipsum avtalstext', 12), 1200000, 'SEK',
            current_date, current_date + 365, true, 100000, 'month', 1, current_date)
    RETURNING id INTO v_c;
    INSERT INTO contract_documents (contract_id, kind, label, title, body_markdown, sort_order)
    VALUES (v_c, 'document', 'Bilaga 1', 'Proof appendix', 'SLA 99,9 %', 1) RETURNING id INTO v_doc;

    -- Före signering är allt skrivbart.
    UPDATE contracts SET body_markdown = '## §1 Proof (rev)' || repeat(' lorem ipsum avtalstext', 12) WHERE id = v_c;
    UPDATE contract_documents SET body_markdown = 'SLA 99,95 %' WHERE id = v_doc;

    BEGIN
      PERFORM public.create_service_from_signed_contract(v_c);
      RAISE EXCEPTION 'proof: an unsigned contract got a service';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%SIGNED, active contract only%' THEN RAISE; END IF;
    END;

    -- Signeringen (det contract-sign gör).
    UPDATE contracts SET status = 'active', signed_at = now(), signer_name = 'Proof Signer' WHERE id = v_c;

    v_sub := public.create_subscription_from_contract(v_c);
    IF v_sub IS NULL OR NOT EXISTS (SELECT 1 FROM subscriptions WHERE id = v_sub AND provider = 'contract' AND contract_id = v_c) THEN
      RAISE EXCEPTION 'proof: signing did not give the contract its service';
    END IF;

    BEGIN
      UPDATE contracts SET body_markdown = '## §1 rewritten' || repeat(' lorem ipsum avtalstext', 12), value_cents = 1 WHERE id = v_c;
      RAISE EXCEPTION 'proof: a signed contract was rewritten';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE contracts SET status = 'pending_signature' WHERE id = v_c;
      RAISE EXCEPTION 'proof: a signed contract went back to pending_signature';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      UPDATE contract_documents SET body_markdown = 'SLA 90 %' WHERE id = v_doc;
      RAISE EXCEPTION 'proof: a signed appendix was rewritten';
    EXCEPTION WHEN check_violation THEN NULL; END;
    -- Ett tillägg är en NY bilaga — och sedan lika orubblig som de andra.
    INSERT INTO contract_documents (contract_id, kind, label, title, body_markdown, sort_order)
    VALUES (v_c, 'document', 'Bilaga 2', 'Tillägg', 'added after signing', 2) RETURNING id INTO v_doc2;
    BEGIN
      UPDATE contract_documents SET body_markdown = 'rewritten amendment' WHERE id = v_doc2;
      RAISE EXCEPTION 'proof: an amendment on a signed contract was rewritten';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      DELETE FROM contract_documents WHERE id = v_doc;
      RAISE EXCEPTION 'proof: a signed appendix was removed';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- Det som ska fortsätta fungera på ett signerat avtal: fakturering och uppsägning.
    UPDATE contracts SET billing_next_date = current_date + 30, notes = 'ops note' WHERE id = v_c;
    UPDATE contracts SET status = 'terminated', terminated_at = now() WHERE id = v_c;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'det-signerade-ar-slutgiltigt: proof passed';
END $proof$;
