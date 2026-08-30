-- Kundryggraden, steg 12: bankkontot hör till den juridiska personen.
--
-- Odoos res.partner.bank, kontrollerad mot 18.0:s res_bank.py. Två beslut i
-- den modellen är viktigare än de ser ut.
--
-- DET FÖRSTA: partner_id har domänen
--     ['|', ('is_company', '=', True), ('parent_id', '=', False)]
-- Ett bankkonto kan alltså bara höra till en KOMMERSIELL enhet — ett bolag
-- eller en fristående privatperson. Aldrig till en kontaktperson under ett
-- bolag. Skälet är detsamma som för huvudboken: pengar rör sig mellan
-- juridiska personer, inte mellan anställda. Ett konto på "Maja Sol" i stället
-- för på "Bageriet Solrosen AB" är en betalning till fel rättssubjekt.
--
-- DET ANDRA: allow_out_payment har default FALSE. Ett nyregistrerat konto är
-- inte utbetalningsbart förrän någon uttryckligen säger det. Det är en
-- bedrägerispärr: den som hinner ändra en leverantörs kontonummer kan inte
-- därmed ta emot pengar.
--
-- VÅRT TILLÄGG, och jag skriver ut att det ÄR ett tillägg: vi nollställer
-- allow_out_payment när kontonumret ändras. Odoo gör inte det, för Odoo antar
-- en människa i ett formulär. Hos oss skriver agenter direkt mot databasen, och
-- då är "kontot var godkänt igår" inte ett godkännande av dagens kontonummer.
--
-- Ingen migrering behövs: vendors bär inga bankfält hos oss i dag, och
-- bank_accounts är VÅRA egna konton (gl_account, avstämning, Stripe) — en
-- motparts konto är något annat.

CREATE TABLE IF NOT EXISTS public.partner_bank_accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  acc_number           text NOT NULL,
  -- Normaliserat för unikhetskontrollen: "SE45 5000 0000 0583 9825 7466" och
  -- "se4550000000058398257466" är samma konto.
  sanitized_acc_number text GENERATED ALWAYS AS
    (upper(regexp_replace(acc_number, '[^A-Za-z0-9]', '', 'g'))) STORED,
  acc_holder_name      text,
  bank_name            text,
  bic                  text,
  currency             text,
  allow_out_payment    boolean NOT NULL DEFAULT false,
  sequence             integer NOT NULL DEFAULT 10,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_bank_accounts_number_not_blank CHECK (trim(acc_number) <> '')
);

COMMENT ON TABLE public.partner_bank_accounts IS
  'Motparternas bankkonton (Odoo res.partner.bank). Hör ALLTID till en '
  'kommersiell enhet — ett bolag eller en fristående person, aldrig en '
  'kontaktperson. Våra egna konton bor kvar i bank_accounts.';
COMMENT ON COLUMN public.partner_bank_accounts.allow_out_payment IS
  'Utbetalningsbart. Default FALSE: ett nyregistrerat konto godkänns av en '
  'människa, och godkännandet FÖRFALLER när kontonumret ändras.';

CREATE UNIQUE INDEX IF NOT EXISTS partner_bank_accounts_uniq
  ON public.partner_bank_accounts (partner_id, sanitized_acc_number);
CREATE INDEX IF NOT EXISTS partner_bank_accounts_partner_idx
  ON public.partner_bank_accounts (partner_id) WHERE active;

DROP TRIGGER IF EXISTS partner_bank_accounts_set_updated_at ON public.partner_bank_accounts;
CREATE TRIGGER partner_bank_accounts_set_updated_at
  BEFORE UPDATE ON public.partner_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Domänen: bara kommersiella enheter ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_bank_holder_must_be_commercial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v partners%ROWTYPE;
BEGIN
  SELECT * INTO v FROM partners WHERE id = NEW.partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such partner %', NEW.partner_id;
  END IF;

  IF NOT (v.is_company OR v.parent_id IS NULL) THEN
    RAISE EXCEPTION
      'A bank account cannot belong to % — it is a contact under %. Money moves between legal '
      'entities, not between employees; register the account on the company instead.',
      v.name, (SELECT name FROM partners WHERE id = v.commercial_partner_id);
  END IF;

  -- Kontohavarens namn följer parten om ingen skrivit ett eget.
  IF NEW.acc_holder_name IS NULL OR trim(NEW.acc_holder_name) = '' THEN
    NEW.acc_holder_name := v.name;
  END IF;

  -- Godkännandet förfaller när numret ändras. VÅRT tillägg, inte Odoos: hos
  -- dem sitter en människa i formuläret, hos oss skriver agenter direkt.
  IF TG_OP = 'UPDATE'
     AND NEW.sanitized_acc_number IS DISTINCT FROM OLD.sanitized_acc_number
     AND NEW.allow_out_payment IS NOT DISTINCT FROM OLD.allow_out_payment THEN
    NEW.allow_out_payment := false;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partner_bank_holder_check ON public.partner_bank_accounts;
CREATE TRIGGER partner_bank_holder_check
  BEFORE INSERT OR UPDATE ON public.partner_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.partner_bank_holder_must_be_commercial();

-- ── RLS: samma matris som resten av partsregistret ─────────────────────────
ALTER TABLE public.partner_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner bank accounts readable by party-owning roles" ON public.partner_bank_accounts;
CREATE POLICY "Partner bank accounts readable by party-owning roles" ON public.partner_bank_accounts
  FOR SELECT TO authenticated
  USING (can_access_module(auth.uid(), 'accounting')
      OR can_access_module(auth.uid(), 'purchasing')
      OR can_access_module(auth.uid(), 'companies'));

-- Skrivning är snävare än läsning: ett kontonummer är en betalningsinstruktion.
DROP POLICY IF EXISTS "Partner bank accounts writable by accounting or purchasing" ON public.partner_bank_accounts;
CREATE POLICY "Partner bank accounts writable by accounting or purchasing" ON public.partner_bank_accounts
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'accounting') OR can_access_module(auth.uid(), 'purchasing'))
  WITH CHECK (can_access_module(auth.uid(), 'accounting') OR can_access_module(auth.uid(), 'purchasing'));

REVOKE ALL ON public.partner_bank_accounts FROM anon;

-- ── Mottagarkontot på dokumentet ───────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS partner_bank_id uuid REFERENCES public.partner_bank_accounts(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.invoices.partner_bank_id IS
  'Kontot betalningen går TILL (Odoo account.move.partner_bank_id). För en '
  'leverantörsfaktura leverantörens konto; för en kundfaktura vårt eget.';

DO $$
BEGIN
  IF to_regclass('public.vendor_invoices') IS NOT NULL THEN
    ALTER TABLE public.vendor_invoices
      ADD COLUMN IF NOT EXISTS partner_bank_id uuid REFERENCES public.partner_bank_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Vilket konto ska pengarna till ─────────────────────────────────────────
-- Odoos bank_partner_id: för en leverantörsbetalning den KOMMERSIELLA parten,
-- aldrig kontaktpersonen. Funktionen säger ifrån i stället för att returnera
-- NULL, för "inget konto" och "kontot är inte godkänt" är helt olika problem
-- och ska inte se likadana ut för den som ska betala.
CREATE OR REPLACE FUNCTION public.partner_payout_account(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_commercial uuid; v_rec record; v_any int;
BEGIN
  SELECT commercial_partner_id INTO v_commercial FROM partners WHERE id = p_partner_id;
  IF v_commercial IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no such partner');
  END IF;

  SELECT id, acc_number, acc_holder_name, allow_out_payment
    INTO v_rec
    FROM partner_bank_accounts
   WHERE partner_id = v_commercial AND active AND allow_out_payment
   ORDER BY sequence, created_at
   LIMIT 1;

  IF v_rec.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'bank_account_id', v_rec.id,
      'acc_number', v_rec.acc_number, 'acc_holder_name', v_rec.acc_holder_name,
      'paid_to', (SELECT name FROM partners WHERE id = v_commercial));
  END IF;

  SELECT count(*) INTO v_any FROM partner_bank_accounts
   WHERE partner_id = v_commercial AND active;

  RETURN jsonb_build_object(
    'ok', false,
    'paid_to', (SELECT name FROM partners WHERE id = v_commercial),
    'accounts_on_file', v_any,
    'reason', CASE WHEN v_any = 0
      THEN 'no bank account is registered for this legal entity'
      ELSE 'an account exists but is not approved for outgoing payments — someone must set allow_out_payment, and that approval lapses whenever the account number changes'
    END);
END $$;

REVOKE ALL ON FUNCTION public.partner_payout_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_payout_account(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.partner_payout_account(uuid) IS
  'Kontot en utbetalning till parten ska gå till — alltid den KOMMERSIELLA '
  'partens. Skiljer "inget konto" från "kontot är inte godkänt"; för den som '
  'ska betala är det två olika problem.';

-- ── Godkännandet är en egen handling ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_partner_bank_account(
  p_bank_account_id uuid,
  p_approve         boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec record;
BEGIN
  -- Snävare än att skriva raden: att godkänna en utbetalningsväg är inte
  -- samma sak som att registrera ett kontonummer.
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)
          OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Forbidden: approving a payout account requires the accounting module or the admin role';
  END IF;

  UPDATE partner_bank_accounts SET allow_out_payment = p_approve
   WHERE id = p_bank_account_id
  RETURNING id, acc_number, allow_out_payment, partner_id INTO v_rec;
  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'No such partner bank account %', p_bank_account_id;
  END IF;

  RETURN jsonb_build_object(
    'bank_account_id', v_rec.id,
    'acc_number', v_rec.acc_number,
    'allow_out_payment', v_rec.allow_out_payment,
    'holder', (SELECT name FROM partners WHERE id = v_rec.partner_id),
    'note', 'This approval lapses automatically if the account number is changed.');
END $$;

REVOKE ALL ON FUNCTION public.approve_partner_bank_account(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_partner_bank_account(uuid, boolean) TO authenticated, service_role;

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_bank_account_rules()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_co uuid; v_person uuid; v_acc uuid; v_res jsonb; v_failed boolean;
BEGIN
  INSERT INTO partners (name, is_company) VALUES ('Bankbolaget AB', true) RETURNING id INTO v_co;
  INSERT INTO partners (name, is_company, parent_id, email)
  VALUES ('Bankkontakten', false, v_co, 'bank@sandbox.local') RETURNING id INTO v_person;

  -- 1. Ett konto på en kontaktperson måste vägras.
  v_failed := false;
  BEGIN
    INSERT INTO partner_bank_accounts (partner_id, acc_number) VALUES (v_person, 'SE111');
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'bank check: a bank account was accepted on a contact person — a payment would go to the wrong legal entity';
  END IF;

  -- 2. Ett nytt konto är INTE utbetalningsbart.
  INSERT INTO partner_bank_accounts (partner_id, acc_number)
  VALUES (v_co, 'SE45 5000 0000 0583 9825 7466') RETURNING id INTO v_acc;
  v_res := partner_payout_account(v_person);
  IF (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'bank check: a freshly registered account was payable without approval';
  END IF;

  -- 3. Godkänt konto hittas — via kontaktpersonen, men betalas till BOLAGET.
  PERFORM approve_partner_bank_account(v_acc, true);
  v_res := partner_payout_account(v_person);
  IF NOT (v_res->>'ok')::boolean OR v_res->>'paid_to' <> 'Bankbolaget AB' THEN
    RAISE EXCEPTION 'bank check: the approved account was not found for the contact, or is paid to the wrong entity (%)', v_res->>'paid_to';
  END IF;

  -- 4. Ändrat kontonummer river godkännandet.
  UPDATE partner_bank_accounts SET acc_number = 'SE99 9999 9999 9999' WHERE id = v_acc;
  IF (SELECT allow_out_payment FROM partner_bank_accounts WHERE id = v_acc) THEN
    RAISE EXCEPTION 'bank check: changing the account number kept the payout approval — whoever edits a vendor bank number would redirect money without a second look';
  END IF;

  DELETE FROM partner_bank_accounts WHERE id = v_acc;
  DELETE FROM partners WHERE id IN (v_person, v_co);
END $$;

REVOKE ALL ON FUNCTION public.assert_bank_account_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_bank_account_rules() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $outer$
DECLARE v jsonb;
BEGIN
  v := public.sandbox_seed_subscriptions_core();
  PERFORM public.assert_ledger_rolls_up_to_company();
  PERFORM public.assert_invoiced_customer_is_visible();
  PERFORM public.assert_no_silently_unbillable_subscriptions();
  PERFORM public.assert_commercial_fields_inherit();
  PERFORM public.assert_bank_account_rules();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true,
    'bank_accounts_belong_to_the_legal_entity', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
