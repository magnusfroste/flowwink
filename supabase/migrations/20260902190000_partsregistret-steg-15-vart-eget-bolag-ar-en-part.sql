-- Kundryggraden, steg 15: vårt eget bolag är en part.
--
-- Magnus satte fingret på det genom att fråga om Odoo återanvänder company som
-- kund. Svaret var tvärtom — Odoo har ingen kundbolagstabell — men frågan
-- avslöjade något vi verkligen saknade: hos Odoo har res.company en
-- partner_id. VÅRT EGET BOLAG står i samma register som alla andra.
--
-- Tre saker faller ut av det, och alla tre saknas hos oss i dag:
--
-- 1. SYMMETRIN. "Vem är skyldig oss" och "vem är vi skyldiga" läser samma
--    register. I dag ligger vi själva i en JSON-klump i site_settings medan
--    alla motparter ligger i partners.
--
-- 2. MOTTAGARKONTOT. Odoos bank_partner_id: för en KUNDfaktura är mottagaren
--    vårt eget bolag, för en leverantörsfaktura motpartens. Utan oss i
--    registret går den regeln inte att uttrycka — bara halva den.
--
-- 3. VÅR IDENTITET PÅ DOKUMENTET. Organisationsnummer och momsnummer läses i
--    dag ur en inställningsblob varje gång en faktura ska ställas ut.
--
-- EN SKRIVARE PER SANNING. company_profile är där en människa redigerar; parten
-- är en SPEGEL. Synken går bara åt ett håll, och den går att köra om. Att låta
-- båda vara redigerbara vore att skapa två sanningar om vilket bolag vi är.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS is_self boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.partners.is_self IS
  'Vårt EGET bolag (Odoo res.company.partner_id). Exakt en rad per instans. '
  'Speglar site_settings.company_profile — redigera där, inte här.';

-- Exakt en. Två "vi" är inte ett datafel utan en identitetskris.
CREATE UNIQUE INDEX IF NOT EXISTS partners_only_one_self
  ON public.partners ((true)) WHERE is_self;

-- ── Spegeln ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_own_company_partner()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile jsonb;
  v_name text; v_id uuid; v_created boolean := false;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)
          OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Forbidden: syncing the own-company party requires the accounting module or the admin role';
  END IF;

  SELECT value INTO v_profile FROM site_settings WHERE key = 'company_profile';
  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'reason', 'this instance has no company_profile — fill in Business Identity first; '
             || 'we cannot invent who we are');
  END IF;

  -- legal_name före company_name: fakturan ställs ut av den juridiska
  -- personen, inte av varumärket. Samma regel som exportidentiteten (#353).
  v_name := coalesce(
    nullif(trim(v_profile ->> 'legal_name'), ''),
    nullif(trim(v_profile ->> 'company_name'), ''));
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'reason', 'the company profile has neither a legal name nor a company name');
  END IF;

  SELECT id INTO v_id FROM partners WHERE is_self;

  IF v_id IS NULL THEN
    INSERT INTO partners (name, is_company, type, is_self,
                          company_registry, vat, email, phone,
                          street, city, country_code, active)
    VALUES (v_name, true, 'contact', true,
            nullif(trim(v_profile ->> 'org_number'), ''),
            nullif(trim(v_profile ->> 'vat_number'), ''),
            nullif(trim(v_profile ->> 'contact_email'), ''),
            nullif(trim(v_profile ->> 'contact_phone'), ''),
            nullif(trim(v_profile ->> 'address'), ''),
            nullif(trim(v_profile ->> 'city'), ''),
            upper(nullif(trim(v_profile ->> 'country'), '')),
            true)
    RETURNING id INTO v_id;
    v_created := true;
  ELSE
    UPDATE partners SET
      name = v_name,
      company_registry = nullif(trim(v_profile ->> 'org_number'), ''),
      vat = nullif(trim(v_profile ->> 'vat_number'), ''),
      email = nullif(trim(v_profile ->> 'contact_email'), ''),
      phone = nullif(trim(v_profile ->> 'contact_phone'), ''),
      street = nullif(trim(v_profile ->> 'address'), ''),
      city = nullif(trim(v_profile ->> 'city'), ''),
      country_code = upper(nullif(trim(v_profile ->> 'country'), ''))
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'partner_id', v_id, 'name', v_name, 'created', v_created,
    'gaps', (SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM (
        SELECT 'no organisation number — our own invoices need it' AS g
          WHERE coalesce(trim(v_profile ->> 'org_number'), '') = ''
        UNION ALL SELECT 'no VAT number — required on an invoice that charges VAT'
          WHERE coalesce(trim(v_profile ->> 'vat_number'), '') = ''
        UNION ALL SELECT 'no address — an invoice must state who issued it and from where'
          WHERE coalesce(trim(v_profile ->> 'address'), '') = '') x),
    'note', 'The party mirrors Business Identity. Edit the profile; this only re-asserts.');
END $$;

REVOKE ALL ON FUNCTION public.ensure_own_company_partner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_own_company_partner() TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_own_company_partner() IS
  'Speglar site_settings.company_profile till partsregistrets self-rad. En '
  'skrivare per sanning: profilen redigeras, parten speglas.';

-- ── Vi går inte att radera ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partners_protect_self()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_self THEN
    RAISE EXCEPTION 'The own-company party cannot be deleted — every document we ever issued points at it';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_self AND NOT NEW.active THEN
    RAISE EXCEPTION 'The own-company party cannot be archived — we are still here';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS partners_self_protection ON public.partners;
CREATE TRIGGER partners_self_protection
  BEFORE UPDATE OR DELETE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.partners_protect_self();

-- ── Våra egna konton hör till oss ──────────────────────────────────────────
-- bank_accounts är VÅR avstämningsräls: gl_account, Stripe-koppling,
-- bankflöden. partner_bank_accounts är motparternas. Hos Odoo är det EN tabell
-- eftersom vårt bolag är en part som alla andra, och det är dit vi ska — men
-- att slå ihop dem nu vore att flytta avstämningen samtidigt som identiteten.
-- Tills dess: kolumnen säger vem kontona tillhör, så regeln nedan kan uttryckas.
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.bank_accounts.partner_id IS
  'Kontohavaren — alltid vårt eget bolags part. Finns för att uttrycka Odoos '
  'bank_partner_id-regel; de två banktabellerna slås ihop i ett senare steg.';

-- ── Odoos bank_partner_id, hela regeln ─────────────────────────────────────
-- För en KUNDfaktura är mottagaren vi; för en leverantörsfaktura motparten.
-- Utan oss i registret gick bara halva regeln att uttrycka.
CREATE OR REPLACE FUNCTION public.document_bank_partner(
  p_partner_id uuid,
  p_direction  text          -- 'incoming' = kunden betalar oss, 'outgoing' = vi betalar dem
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_self uuid; v_acc record;
BEGIN
  IF p_direction NOT IN ('incoming', 'outgoing') THEN
    RAISE EXCEPTION 'Direction must be incoming (they pay us) or outgoing (we pay them), not %', p_direction;
  END IF;

  IF p_direction = 'outgoing' THEN
    RETURN public.partner_payout_account(p_partner_id);
  END IF;

  SELECT id INTO v_self FROM partners WHERE is_self;
  IF v_self IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'reason', 'this instance has no own-company party — run ensure_own_company_partner()');
  END IF;

  SELECT id, name, account_number INTO v_acc
    FROM bank_accounts
   WHERE NOT coalesce(archived, false)
   ORDER BY coalesce(is_default, false) DESC, created_at
   LIMIT 1;

  IF v_acc.id IS NULL THEN
    RETURN jsonb_build_object('ok', false,
      'paid_to', (SELECT name FROM partners WHERE id = v_self),
      'reason', 'we have no bank account on file — a customer invoice cannot say where to pay');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'direction', 'incoming',
    'bank_account_id', v_acc.id, 'acc_number', v_acc.account_number,
    'label', v_acc.name,
    'paid_to', (SELECT name FROM partners WHERE id = v_self),
    'note', 'A customer invoice is paid to US. Our own accounts still live in bank_accounts '
         || '(they carry the reconciliation rail); the party register says whose they are.');
END $$;

REVOKE ALL ON FUNCTION public.document_bank_partner(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.document_bank_partner(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.document_bank_partner(uuid, text) IS
  'Vem pengarna går TILL (Odoo bank_partner_id): vårt eget bolag för en '
  'kundfaktura, motparten för en leverantörsfaktura.';

-- ── Invarianten in i kedjan ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_own_company_is_a_party()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb; v_self uuid; v_failed boolean;
BEGIN
  v_res := ensure_own_company_partner();
  IF (v_res ->> 'ok')::boolean IS NOT TRUE THEN
    -- En instans utan Business Identity är inte ett fel i modellen; kedjan
    -- kan bara inte påstå något om den.
    RETURN;
  END IF;
  v_self := (v_res ->> 'partner_id')::uuid;

  IF (SELECT count(*) FROM partners WHERE is_self) <> 1 THEN
    RAISE EXCEPTION 'self check: this instance has % own-company parties — two "we" is an identity crisis, not a data error',
      (SELECT count(*) FROM partners WHERE is_self);
  END IF;

  -- Omkörning får inte skapa en andra.
  PERFORM ensure_own_company_partner();
  IF (SELECT count(*) FROM partners WHERE is_self) <> 1 THEN
    RAISE EXCEPTION 'self check: re-running the mirror created a second own-company party';
  END IF;

  v_failed := false;
  BEGIN
    DELETE FROM partners WHERE id = v_self;
  EXCEPTION WHEN others THEN v_failed := true;
  END;
  IF NOT v_failed THEN
    RAISE EXCEPTION 'self check: the own-company party was deleted — every document we ever issued points at it';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_own_company_is_a_party() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_own_company_is_a_party() TO authenticated, service_role;

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
  PERFORM public.assert_language_is_personal_not_commercial();
  PERFORM public.assert_own_company_is_a_party();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true,
    'bank_accounts_belong_to_the_legal_entity', true,
    'language_is_personal_not_commercial', true,
    'our_own_company_is_a_party', true);
END $outer$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
