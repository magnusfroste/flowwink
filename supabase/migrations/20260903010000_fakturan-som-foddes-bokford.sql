-- Fakturan som föddes bokförd.
--
-- Bokföringstriggern på invoices fyrade bara på en status-ÖVERGÅNG:
--
--     IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
--
-- En faktura som FÖDS med status 'sent' passerade alltså aldrig förbi den. Noll
-- verifikat, inget felmeddelande, ingenting i reskontran. Kunden är skyldig
-- pengar och huvudboken vet inte om det.
--
-- Det är inte teoretiskt. `generate_subscription_invoice` sätter 'sent' direkt
-- när prenumerationen har auto_finalize — så varje autofakturerad prenumeration
-- producerar en obokförd fordran varje månad. Den emitterar `invoice.finalized`,
-- men ingenting lyssnar och bokför. Upptäcks först vid bokslut, av en människa
-- som inte förstår varför omsättningen inte stämmer.
--
-- Samma buggklass som prenumerationens provider-default: en rad som FÖDS i fel
-- läge. Övergångar bevakas, födslar inte.
--
-- TVÅ SAKER SOM INTE ÄR HÅL, kontrollerade innan något ändrades:
--   * book_invoice_paid anropar book_invoice_issued först, så draft→paid är
--     täckt
--   * journal_entries_resolve_partner knyter verifikatet till parten, så en
--     bokförd faktura hamnar rätt i reskontran
--
-- VARFÖR INSERT INTE FÅR SMÄLLA. Bokföringen kräver en aktiverad kontoplan och
-- modulåtkomst. På UPDATE är ett högljutt fel rätt — någon markerade medvetet en
-- faktura som skickad. Men en INSERT är ofta en KUND som just handlat i
-- webbshoppen. En nyfödd instans utan aktiverat locale-paket skulle då inte
-- kunna sälja alls. Så: INSERT bokför så gott den kan, varnar när den inte kan,
-- och blockerar aldrig köpet. Frånvaron av verifikat är i sig protokollet —
-- book_unbooked_invoices() hittar varenda en, och påståendet nedan ser till att
-- det aldrig går tyst igen. Fail forward, inte grind.

-- ── Triggern täcker även födseln ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_invoice_status_book()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Bokför en faktura som föds färdig. Får aldrig fälla själva skrivningen:
    -- en kund som handlar ska inte nekas för att kontoplanen inte är vald.
    IF NEW.status IN ('sent'::invoice_status, 'paid'::invoice_status) THEN
      -- Fordran först, ALLTID. Den är verklig oavsett om betalningen går att
      -- bokföra: book_invoice_paid kollar beloppet innan den bokar utställandet,
      -- så en faktura född 'paid' utan registrerat belopp fick annars ingenting
      -- alls — varken fordran eller betalning.
      BEGIN
        v_res := public.book_invoice_issued(NEW.id);
        IF NOT coalesce((v_res ->> 'success')::boolean, false)
           AND (v_res ->> 'skipped') IS NULL THEN
          RAISE WARNING 'invoice % was created as % but the receivable was not booked: % — run book_unbooked_invoices()',
            NEW.invoice_number, NEW.status, coalesce(v_res ->> 'error', 'declined without a reason');
        END IF;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was created as % but could not be booked: % — run book_unbooked_invoices() once accounting is configured',
          NEW.invoice_number, NEW.status, SQLERRM;
      END;

      IF NEW.status = 'paid'::invoice_status THEN
        BEGIN
          v_res := public.book_invoice_paid(NEW.id);
          -- Ett NEJ som RETURVÄRDE är lika tyst som inget alls om ingen läser
          -- det. Det var precis den här buggklassen filen finns för.
          IF NOT coalesce((v_res ->> 'success')::boolean, false)
             AND (v_res ->> 'skipped') IS NULL THEN
            RAISE WARNING 'invoice % was created as paid but the payment was not booked: % — the receivable stands open',
              NEW.invoice_number, coalesce(v_res ->> 'error', 'declined without a reason');
          END IF;
        EXCEPTION WHEN others THEN
          RAISE WARNING 'invoice % was created as paid but the payment could not be booked: %',
            NEW.invoice_number, SQLERRM;
        END;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent'::invoice_status THEN
      PERFORM public.book_invoice_issued(NEW.id);
    ELSIF NEW.status = 'paid'::invoice_status THEN
      PERFORM public.book_invoice_paid(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_status_book ON public.invoices;
CREATE TRIGGER trg_invoice_status_book
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.on_invoice_status_book();

COMMENT ON FUNCTION public.on_invoice_status_book() IS
  'Bokför en faktura när den når ett bokningsbart läge — vid övergång OCH vid '
  'födsel. INSERT bokför bäst den kan och varnar i stället för att blockera '
  'köpet; UPDATE smäller, för då är det någon i systemet som agerat.';

-- ── Reparationen: allt som redan fallit mellan stolarna ────────────────────
-- Varje live-instans bär redan obokförda fakturor. Utan det här steget vore
-- fixen bara framåtriktad och historiken förblev fel.
CREATE OR REPLACE FUNCTION public.book_unbooked_invoices(
  p_dry_run boolean DEFAULT true,
  p_limit   integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_found int := 0; v_booked int := 0; v_cents bigint := 0;
  v_failed jsonb := '[]'::jsonb; r record; v_res jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR r IN
    SELECT i.id, i.invoice_number, i.status, i.total_cents
      FROM invoices i
     WHERE i.status IN ('sent'::invoice_status, 'paid'::invoice_status)
       AND coalesce(i.total_cents, 0) > 0
       AND NOT EXISTS (SELECT 1 FROM journal_entries j
                        WHERE j.invoice_id = i.id AND j.source = 'invoice_issued')
     ORDER BY i.issue_date NULLS LAST, i.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 500), 5000))
  LOOP
    v_found := v_found + 1;
    v_cents := v_cents + coalesce(r.total_cents, 0);
    IF NOT p_dry_run THEN
      BEGIN
        IF r.status = 'paid'::invoice_status THEN
          v_res := public.book_invoice_paid(r.id);
        ELSE
          v_res := public.book_invoice_issued(r.id);
        END IF;
        IF coalesce((v_res ->> 'success')::boolean, false) THEN
          v_booked := v_booked + 1;
        ELSE
          v_failed := v_failed || jsonb_build_object('invoice', r.invoice_number, 'why', v_res ->> 'error');
        END IF;
      EXCEPTION WHEN others THEN
        v_failed := v_failed || jsonb_build_object('invoice', r.invoice_number, 'why', SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'unbooked_found', v_found,
    'booked', v_booked,
    'receivable_cents_off_the_books', v_cents,
    'failed', v_failed,
    'note', CASE WHEN v_found = 0
      THEN 'Every issued and paid invoice has a journal entry.'
      ELSE format('%s invoice(s) in a bookable status carry no journal entry — %s in receivables the ledger never saw.',
                  v_found, to_char(v_cents / 100.0, 'FM999G999G990D00')) END);
END $$;

REVOKE ALL ON FUNCTION public.book_unbooked_invoices(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_unbooked_invoices(boolean, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.book_unbooked_invoices(boolean, integer) IS
  'Bokför fakturor som nått ett bokningsbart läge utan att få ett verifikat. '
  'Idempotent — book_invoice_issued hoppar över redan bokförda. Kör med '
  'dry_run först: den rapporterar hur stor fordran som stått utanför böckerna.';

-- ── Invarianten ────────────────────────────────────────────────────────────
-- Mäter det som FAKTISKT gick fel: en faktura född färdig. Och den mäter båda
-- världarna — med kontoplan ska verifikatet finnas, utan kontoplan ska
-- fakturan ändå bli till.
CREATE OR REPLACE FUNCTION public.assert_a_born_invoice_reaches_the_ledger()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid; v_inv uuid; v_locale text; v_entries int; v_ledger int;
BEGIN
  -- Samma läsning som account_for gör, plus 'pack' som steg 14 använder. Två
  -- läsare med olika dialekt är en egen liten skavank; här får den inte göra
  -- att påståendet fäller fel dom.
  SELECT coalesce(value #>> '{}', value ->> 'id', value ->> 'pack') INTO v_locale
    FROM site_settings WHERE key = 'accounting_locale';

  INSERT INTO partners (name, is_company, company_registry, customer_rank)
  VALUES ('Bokföringsprovet AB', true, '556000-1818', 1) RETURNING id INTO v_partner;

  -- Född 'sent'. Precis så generate_subscription_invoice gör vid auto_finalize.
  INSERT INTO invoices (invoice_number, customer_email, status, subtotal_cents, tax_cents, total_cents, partner_id)
  VALUES ('LEDGER-CHECK', 'bok@sandbox.local', 'sent', 80000, 20000, 100000, v_partner)
  RETURNING id INTO v_inv;

  IF v_inv IS NULL THEN
    RAISE EXCEPTION 'ledger check: an invoice could not even be created';
  END IF;

  SELECT count(*) INTO v_entries FROM journal_entries
   WHERE invoice_id = v_inv AND source = 'invoice_issued';

  IF v_locale IS NOT NULL AND v_entries = 0 THEN
    RAISE EXCEPTION 'ledger check: an invoice born as sent produced no journal entry — a receivable is off the books and nothing complained';
  END IF;

  IF v_locale IS NOT NULL THEN
    SELECT count(*) INTO v_ledger FROM journal_entries
     WHERE invoice_id = v_inv AND partner_id = v_partner;
    IF v_ledger = 0 THEN
      RAISE EXCEPTION 'ledger check: the entry was booked but never attached to the party — it will not appear on the customer card';
    END IF;
  END IF;

  DELETE FROM journal_entry_lines WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE invoice_id = v_inv);
  DELETE FROM journal_entries WHERE invoice_id = v_inv;
  DELETE FROM invoices WHERE id = v_inv;
  DELETE FROM partners WHERE id = v_partner;
END $$;

REVOKE ALL ON FUNCTION public.assert_a_born_invoice_reaches_the_ledger() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_a_born_invoice_reaches_the_ledger() TO authenticated, service_role;

-- ── Tionde påståendet i nattkedjan ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sandbox_seed_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.assert_company_and_party_share_an_id();
  PERFORM public.assert_a_party_can_be_retired();
  PERFORM public.assert_a_born_invoice_reaches_the_ledger();
  RETURN v || jsonb_build_object(
    'ledger_rolls_up_to_the_company', true,
    'invoiced_customers_visible_in_the_lens', true,
    'no_silently_unbillable_subscriptions', true,
    'commercial_fields_inherit', true,
    'bank_accounts_belong_to_the_legal_entity', true,
    'language_is_personal_not_commercial', true,
    'our_own_company_is_a_party', true,
    'company_and_party_share_an_id', true,
    'a_party_can_be_retired', true,
    'a_born_invoice_reaches_the_ledger', true);
END $function$;

REVOKE ALL ON FUNCTION public.sandbox_seed_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sandbox_seed_subscriptions() TO authenticated, service_role;
