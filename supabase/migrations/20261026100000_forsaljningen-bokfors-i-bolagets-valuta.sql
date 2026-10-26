-- Försäljningen bokförs i bolagets valuta (2026-10-26).
--
-- Led → offert → faktura → betalning → huvudbok måste fungera i vilken valuta
-- kunden än faktureras i. Det gjorde den inte:
--
--   * book_invoice_issued bokade fakturans total_cents RAKT AV. En faktura på
--     1 000 EUR hamnade som 1 000 kr i kundfordran, intäkt och utgående moms
--     hos ett svenskt bolag. invoices.exchange_rate fanns som kolumn (default
--     1) men ingen skrivare stämplade den.
--   * book_invoice_paid gjorde detsamma med betalningen. Den version som
--     bokade realiserad kursdifferens (20260612150000) försvann i en senare
--     omskrivning för delbetalningar — en regression.
--   * book_order_paid: samma sak för en webshop-order i främmande valuta.
--   * record_invoice_payment var trasig sedan 20261026020000 (se steg 0):
--     delbetalningar bokades inte alls, slutbetalningen som en klump.
--   * get_exchange_rate svarade tyst med kurs 1 när kursen saknades — exakt
--     det fel som gjorde att Milano Uno föddes i lagret till 1 696 kr
--     (20260827300000). revalue_open_balances läste basvalutan ur
--     currencies.is_base, som ingen sätter; platform_default_currency() hade
--     en egen fallbackkedja bredvid business_currency().
--
-- Regeln (Odoo: amount_currency på raden, balance i bolagets valuta; kursen
-- på fakturadagen, kursdifferensen vid betalningen; Skatteverket: momsen på
-- en faktura i annan valuta räknas om med kursen på fakturadagen):
--
--   1. ETT svar på "vilken är bolagets valuta": business_currency() (och
--      platform_default_currency(), som läser samma inställning först).
--      currencies.is_base följer med som spegel.
--   2. En saknad kurs är ett FEL med ett namn, aldrig kurs 1.
--   3. Fakturan bär sin kurs (bolagets valuta per enhet av fakturans), stämplad
--      på fakturadagen när den ställs ut; fx_rate_source säger varifrån
--      (same_currency | rate_table | manual | missing), som på utläggen.
--   4. Huvudboken är i bolagets valuta. Utställandet bokas till fakturadagens
--      kurs; betalningen till betaldagens kurs, och skillnaden mot den bokade
--      fordran blir realiserad kursvinst/-förlust (BAS 3960/7960).
--   5. Omvärderingen räknar på den ÖPPNA delen av fordran, hoppar över det
--      som saknar kurs och säger vilka.
--
-- Allt idempotent (CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS, patch-i-
-- databasen med kontroll). Beviset i slutet kör hela kedjan på en faktura i
-- främmande valuta och rullar tillbaka sig självt.

-- ── 0. En skada från kalenderomskrivningen (20261026020000) lagas ─────────
-- Dess regex för paid_at::date saknade ordgräns och träffade parametern
-- p_paid_at i record_invoice_payment: "p_(paid_at AT TIME ZONE …)::date" —
-- varje registrerad betalning blev "recorded but not booked" och bokades
-- först när fakturan blev helt betald (status → paid), som EN post till
-- dagens kurs. Lagas här på varje funktion och vy som bär mönstret; den
-- gamla filen har fått sin ordgräns så en nyinstallation aldrig får skadan.
DO $$
DECLARE r record; v_def text; v_new text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prosrc ~ '[A-Za-z0-9_]_\((created_at|updated_at|closed_at|paid_at) AT TIME ZONE public\.business_timezone\(\)\)::date'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def,
      '([A-Za-z0-9_]+)_\((created_at|updated_at|closed_at|paid_at) AT TIME ZONE public\.business_timezone\(\)\)::date',
      '(\1_\2 AT TIME ZONE public.business_timezone())::date', 'g');
    IF v_new <> v_def THEN EXECUTE v_new; END IF;
  END LOOP;
  FOR r IN
    SELECT c.oid::regclass AS v, pg_get_viewdef(c.oid, true) AS def FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
      AND pg_get_viewdef(c.oid, true) ~ '[A-Za-z0-9_]_\((created_at|updated_at|closed_at|paid_at) AT TIME ZONE'
  LOOP
    EXECUTE format('CREATE OR REPLACE VIEW %s AS %s', r.v,
      regexp_replace(r.def, '([A-Za-z0-9_]+)_\((created_at|updated_at|closed_at|paid_at) AT TIME ZONE public\.business_timezone\(\)\)::date',
                     '(\1_\2 AT TIME ZONE public.business_timezone())::date', 'g'));
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosrc ~ '[A-Za-z0-9_]_\((created_at|updated_at|closed_at|paid_at) AT TIME ZONE') THEN
    RAISE EXCEPTION 'calendar rewrite repair: a function still carries the broken pattern';
  END IF;
END $$;

-- ── 1. En valuta, en läsare ────────────────────────────────────────────────
-- business_currency() is what new code reads; platform_default_currency()
-- reads the same platform_locale setting first (its own guard pins that body)
-- and stays for the callers it has. currencies.is_base is a mirror of the one.
DO $$
BEGIN
  -- is_base is a mirror now; one row at a time (the partial unique index).
  IF to_regclass('public.currencies') IS NOT NULL THEN
    UPDATE public.currencies SET is_base = false WHERE is_base AND code <> public.business_currency();
    UPDATE public.currencies SET is_base = true  WHERE code = public.business_currency() AND NOT is_base;
  END IF;
END $$;

-- ── 2. A missing rate is an error with a name ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_exchange_rate(p_base text, p_quote text, p_date date DEFAULT platform_today())
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_rate numeric;
BEGIN
  IF upper(p_base) = upper(p_quote) THEN RETURN 1; END IF;
  v_rate := public.exchange_rate_or_null(p_base, p_quote, p_date);
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'No exchange rate % → % on or before % — run fetch_ecb_rates, or set_exchange_rate(''%'', ''%'', <rate>, ''%'')',
      upper(p_base), upper(p_quote), p_date, upper(p_base), upper(p_quote), p_date
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_rate;
END $fn$;
GRANT EXECUTE ON FUNCTION public.get_exchange_rate(text, text, date) TO anon, authenticated, service_role;

-- ── 3. The invoice carries its rate ────────────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fx_rate_source text;
COMMENT ON COLUMN public.invoices.exchange_rate IS
  'Business-currency units per unit of `currency`, stamped on the issue date. 1 when the currencies are the same; 1 with fx_rate_source = missing on a foreign-currency invoice = no rate known yet (booking refuses with the message).';
COMMENT ON COLUMN public.invoices.fx_rate_source IS 'same_currency | rate_table | manual | missing — where exchange_rate came from.';

CREATE OR REPLACE FUNCTION public.invoices_stamp_fx()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_base text := public.business_currency();
  v_rate numeric;
  v_leaving_draft boolean := TG_OP = 'UPDATE' AND OLD.status::text = 'draft' AND NEW.status::text <> 'draft';
BEGIN
  NEW.currency := upper(COALESCE(NULLIF(trim(NEW.currency), ''), v_base));
  IF NEW.currency = v_base THEN
    NEW.exchange_rate := 1;
    NEW.fx_rate_source := 'same_currency';
    RETURN NEW;
  END IF;

  -- book_invoice_issued stamps a table rate itself and says so in the same
  -- UPDATE: that is not a caller's manual rate.
  IF TG_OP = 'UPDATE' AND NEW.fx_rate_source = 'rate_table' AND NEW.fx_rate_source IS DISTINCT FROM OLD.fx_rate_source
     AND NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate THEN
    RETURN NEW;
  END IF;
  -- A rate the caller set (≠ 1 — 1 is the column default, "nobody stamped it")
  -- is agreed and stays, through the issue as well.
  IF COALESCE(NEW.exchange_rate, 1) <> 1
     AND (TG_OP = 'INSERT' OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate) THEN
    NEW.fx_rate_source := 'manual';
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.fx_rate_source = 'manual' AND NEW.currency = OLD.currency
     AND NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate THEN
    RETURN NEW;
  END IF;

  -- The rate of the issue date: read on insert, when the currency changes, and
  -- again the moment the invoice leaves draft (a draft from last week is
  -- issued at today's rate, as Odoo does).
  IF TG_OP = 'INSERT' OR COALESCE(NEW.exchange_rate, 1) = 1 OR v_leaving_draft
     OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.issue_date IS DISTINCT FROM OLD.issue_date THEN
    v_rate := public.exchange_rate_or_null(NEW.currency, v_base, COALESCE(NEW.issue_date, public.platform_today()));
    IF v_rate IS NULL OR v_rate <= 0 THEN
      NEW.exchange_rate := 1;            -- the column is NOT NULL; the source says what 1 means
      NEW.fx_rate_source := 'missing';
    ELSE
      NEW.exchange_rate := v_rate;
      NEW.fx_rate_source := 'rate_table';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS a_invoices_stamp_fx ON public.invoices;
CREATE TRIGGER a_invoices_stamp_fx BEFORE INSERT OR UPDATE OF currency, exchange_rate, issue_date, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_stamp_fx();

-- Existing rows: same-currency invoices get 1/same_currency; a foreign one
-- keeps a rate someone set, else is marked missing (and stamped the day a
-- rate exists, by book_invoice_issued or the next status change).
UPDATE public.invoices
   SET exchange_rate = 1, fx_rate_source = 'same_currency'
 WHERE fx_rate_source IS NULL AND upper(COALESCE(currency, public.business_currency())) = public.business_currency();
UPDATE public.invoices
   SET fx_rate_source = CASE WHEN COALESCE(exchange_rate, 1) <> 1 THEN 'manual' ELSE 'missing' END
 WHERE fx_rate_source IS NULL;

-- ── 4. Issue: the ledger in the business's currency ────────────────────────
CREATE OR REPLACE FUNCTION public.book_invoice_issued(p_invoice_id uuid, p_ar_account text DEFAULT NULL::text, p_revenue_account text DEFAULT NULL::text, p_vat_account text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_base text := public.business_currency();
  v_rate numeric;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
  v_is_credit boolean;
  v_source text;
  v_fx text := '';
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  p_revenue_account := COALESCE(p_revenue_account, public.account_for('sales_revenue'));
  p_vat_account := COALESCE(p_vat_account, public.account_for('vat_output'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_inv.origin = 'pos_receipt' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'POS receipt — the session close books the sale');
  END IF;
  -- The order was booked when it was paid: this invoice is its receipt, not a second sale.
  IF v_inv.order_id IS NOT NULL AND v_inv.invoice_type = 'invoice'
     AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'order_paid' AND j.reference_number = v_inv.order_id::text) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'order already booked at payment (order_paid) — the invoice is a receipt');
  END IF;

  v_is_credit := (v_inv.invoice_type = 'credit_note');
  v_source := CASE WHEN v_is_credit THEN 'credit_note_issued' ELSE 'invoice_issued' END;
  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = v_source) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  -- The rate of the issue date. A foreign invoice without one is not booked at
  -- rate 1 — it is refused with the message, and booked the day the rate exists
  -- (book_unbooked_invoices, or the next status change).
  IF upper(COALESCE(v_inv.currency, v_base)) = v_base THEN
    v_rate := 1;
  ELSE
    v_rate := CASE WHEN COALESCE(v_inv.exchange_rate, 1) <> 1 AND COALESCE(v_inv.fx_rate_source, '') <> 'missing' THEN v_inv.exchange_rate ELSE NULL END;
    IF v_rate IS NULL THEN
      v_rate := public.exchange_rate_or_null(v_inv.currency, v_base, COALESCE(v_inv.issue_date, public.platform_today()));
      IF v_rate IS NULL OR v_rate <= 0 THEN
        RETURN jsonb_build_object('success', false,
          'error', format('No exchange rate %s → %s on or before %s — run fetch_ecb_rates, or set_exchange_rate(''%s'', ''%s'', <rate>, ''%s''), then book_unbooked_invoices(false)',
                          upper(v_inv.currency), v_base, COALESCE(v_inv.issue_date, public.platform_today()),
                          upper(v_inv.currency), v_base, COALESCE(v_inv.issue_date, public.platform_today())));
      END IF;
      UPDATE invoices SET exchange_rate = v_rate, fx_rate_source = 'rate_table' WHERE id = p_invoice_id;
    END IF;
    v_fx := format(' — %s %s @ %s', public.format_business_amount(abs(COALESCE(v_inv.total_cents, 0))), upper(v_inv.currency), trim(to_char(v_rate, 'FM999999990.000000')));
  END IF;

  -- A credit note carries its amounts negative; the entry mirrors the invoice.
  v_total := abs(COALESCE(v_inv.total_cents, 0));
  v_vat   := abs(COALESCE(v_inv.tax_cents, 0));
  v_net   := abs(COALESCE(v_inv.subtotal_cents, v_inv.total_cents - v_inv.tax_cents));
  -- Converted to the business's currency; VAT is total − net so the entry
  -- balances to the öre (two independent roundings would not).
  v_total := round(v_total * v_rate)::bigint;
  v_net   := round(v_net * v_rate)::bigint;
  v_vat   := CASE WHEN v_vat = 0 THEN 0 ELSE v_total - v_net END;
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice total is zero');
  END IF;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.issue_date, public.platform_today()),
          CASE WHEN v_is_credit THEN 'Credit note ' ELSE 'Invoice ' END || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' issued' || v_fx,
          v_source, p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  IF v_is_credit THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_entry_id, p_revenue_account, v_net, 0, 'Revenue reversed'),
      (v_entry_id, p_ar_account, 0, v_total, 'Accounts receivable');
    IF v_vat > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, p_vat_account, v_vat, 0, 'Output VAT reversed');
    END IF;
  ELSE
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_entry_id, p_ar_account, v_total, 0, 'Accounts receivable'),
      (v_entry_id, p_revenue_account, 0, v_net, 'Revenue');
    IF v_vat > 0 THEN
      INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, p_vat_account, 0, v_vat, 'Output VAT');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id,
    'total_cents', v_inv.total_cents, 'currency', upper(COALESCE(v_inv.currency, v_base)),
    'exchange_rate', v_rate, 'booked_total_cents', v_total, 'book_currency', v_base, 'source', v_source);
END $fn$;

-- ── 5. Payment: bank at the day's rate, AR at the booked rate, the difference realised ──
CREATE OR REPLACE FUNCTION public.book_invoice_paid(p_invoice_id uuid, p_bank_account text DEFAULT NULL::text, p_ar_account text DEFAULT NULL::text, p_entry_date date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_base text := public.business_currency();
  v_booked_base bigint;
  v_booked bigint;        -- the same, back in the invoice's currency
  v_amount bigint;
  v_rate_issue numeric;
  v_rate_pay numeric;
  v_entry_date date;
  v_bank bigint;
  v_ar bigint;
  v_fx bigint;
  v_issue jsonb;
  v_note text := '';
BEGIN
  -- Att boka en fakturabetalning är en FÖLJD av att registrera den: den som får
  -- fakturera får också den bokningen (annars föll statusbytet för en säljare).
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting') OR can_access_module(auth.uid(), 'invoicing')) THEN
    RAISE EXCEPTION 'Requires the accounting or invoicing module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF v_inv.origin = 'pos_receipt' THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'pos receipt — booked by the session close');
  END IF;
  IF v_inv.order_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM journal_entries j WHERE j.source = 'order_paid' AND j.reference_number = v_inv.order_id::text) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'order already booked at payment (order_paid) — nothing to settle');
  END IF;

  -- If issuance was never booked (e.g. legacy invoice), book it first so AR
  -- exists — and so the invoice carries its rate. A foreign invoice with no
  -- rate is refused here with the same message.
  v_issue := public.book_invoice_issued(p_invoice_id);
  IF NOT COALESCE((v_issue ->> 'success')::boolean, false) AND (v_issue ->> 'skipped') IS NULL THEN
    RETURN v_issue;
  END IF;
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  v_rate_issue := CASE WHEN upper(COALESCE(v_inv.currency, v_base)) = v_base THEN 1
                       WHEN COALESCE(v_inv.fx_rate_source, '') = 'missing' OR COALESCE(v_inv.exchange_rate, 1) = 1 THEN NULL
                       ELSE v_inv.exchange_rate END;
  IF v_rate_issue IS NULL OR v_rate_issue <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', format('Invoice %s in %s has no exchange rate — set one and run book_unbooked_invoices(false)', COALESCE(v_inv.invoice_number, p_invoice_id::text), upper(v_inv.currency)));
  END IF;

  -- Redan bokfört som betalning på den här fakturan (kredit på kundfordran, i
  -- bolagets valuta) — tillbaka till fakturans valuta via den bokade kursen.
  SELECT COALESCE(sum(l.credit_cents - l.debit_cents), 0) INTO v_booked_base
    FROM journal_entries e JOIN journal_entry_lines l ON l.journal_entry_id = e.id
   WHERE e.invoice_id = p_invoice_id AND e.source = 'invoice_payment' AND e.status = 'posted'
     AND l.account_code = p_ar_account;
  v_booked := round(v_booked_base / v_rate_issue)::bigint;

  v_amount := COALESCE(v_inv.paid_amount_cents, 0) - v_booked;
  -- En faktura född 'paid' utan registrerat belopp: hela totalen är betalningen.
  IF v_amount <= 0 AND v_inv.status::text = 'paid' AND COALESCE(v_inv.paid_amount_cents, 0) = 0 AND v_booked_base = 0 THEN
    v_amount := COALESCE(v_inv.total_cents, 0);
  END IF;
  -- One öre of difference is the rounding of the conversion back, not a payment.
  IF v_amount <= 1 THEN
    IF v_booked_base > 0 THEN RETURN jsonb_build_object('success', true, 'skipped', 'already booked'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount is zero');
  END IF;

  v_entry_date := COALESCE(p_entry_date, (v_inv.paid_at AT TIME ZONE public.business_timezone())::date, public.platform_today());
  -- The bank receives the payment-day value; without a rate for that day the
  -- booked rate stands (no difference) and the entry says so.
  IF v_rate_issue = 1 AND upper(COALESCE(v_inv.currency, v_base)) = v_base THEN
    v_rate_pay := 1;
  ELSE
    v_rate_pay := public.exchange_rate_or_null(v_inv.currency, v_base, v_entry_date);
    IF v_rate_pay IS NULL OR v_rate_pay <= 0 THEN
      v_rate_pay := v_rate_issue;
      v_note := ' (no rate for the payment date — booked at the issue rate)';
    END IF;
  END IF;
  v_bank := round(v_amount * v_rate_pay)::bigint;
  v_ar   := round(v_amount * v_rate_issue)::bigint;
  v_fx   := v_bank - v_ar;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (v_entry_date,
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text)
            || CASE WHEN COALESCE(v_inv.paid_amount_cents, 0) < COALESCE(v_inv.total_cents, 0) THEN ' part payment' ELSE ' paid' END
            || CASE WHEN v_rate_issue <> 1 THEN format(' — %s %s @ %s', public.format_business_amount(v_amount), upper(v_inv.currency), trim(to_char(v_rate_pay, 'FM999999990.000000'))) ELSE '' END
            || v_note,
          'invoice_payment', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_bank_account, v_bank, 0, 'Bank');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, 0, v_ar, 'Settle accounts receivable');
  IF v_fx > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, public.account_for_or('fx_gain', 'rounding_variance'), 0, v_fx, 'Realised exchange gain');
  ELSIF v_fx < 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, public.account_for_or('fx_loss', 'rounding_variance'), -v_fx, 0, 'Realised exchange loss');
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id,
    'amount_cents', v_amount, 'currency', upper(COALESCE(v_inv.currency, v_base)),
    'booked_cents', v_bank, 'book_currency', v_base, 'exchange_rate', v_rate_pay, 'fx_difference_cents', v_fx);
END $fn$;

-- ── 6. The status trigger: a NO is heard ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_invoice_status_book()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_res jsonb;
BEGIN
  -- A POS receipt is booked by the session close — neither the receivable nor the payment is the invoice's to book.
  IF NEW.origin = 'pos_receipt' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    -- Bokför en faktura som föds färdig. Får aldrig fälla själva skrivningen:
    -- en kund som handlar ska inte nekas för att kontoplanen inte är vald.
    IF NEW.status IN ('sent'::invoice_status, 'paid'::invoice_status) THEN
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
      v_res := public.book_invoice_issued(NEW.id);
      -- An admin issuing a foreign-currency invoice without a rate hears it
      -- now, not from a warning in a log: the send is refused with the fix.
      IF NOT coalesce((v_res ->> 'success')::boolean, false) AND (v_res ->> 'skipped') IS NULL
         AND (v_res ->> 'error') LIKE 'No exchange rate%' THEN
        RAISE EXCEPTION '%', v_res ->> 'error' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.status = 'paid'::invoice_status THEN
      PERFORM public.book_invoice_paid(NEW.id);
    ELSIF NEW.status::text IN ('cancelled', 'void') THEN
      -- Makuleringen får aldrig hindras av bokföringen, men heller aldrig
      -- passera tyst utan den.
      BEGIN
        v_res := public.book_invoice_cancelled(NEW.id);
      EXCEPTION WHEN others THEN
        RAISE WARNING 'invoice % was % but its issue entry was not reversed: % — run book_invoice_cancelled(%)',
          NEW.invoice_number, NEW.status, SQLERRM, NEW.id;
      END;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

-- ── 7. A paid order in a foreign currency ──────────────────────────────────
-- Patched in place: the rate folds into the scale factor, so every line comes
-- out in the business's currency and the existing rounding guard still holds.
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.book_order_paid(uuid)'::regprocedure);
  IF v_def LIKE '%v_fx_rate%' THEN RETURN; END IF;  -- already patched
  v_new := replace(v_def, 'v_scale numeric := 1;', 'v_scale numeric := 1;' || E'\n' || '  v_fx_rate numeric;' || E'\n' || '  v_base text := public.business_currency();');
  v_new := replace(v_new,
    'v_scale := v_o.total_cents::numeric / v_gross;',
    E'-- The order''s currency into the business''s: the payment-day rate (stamped\n'
    || E'  -- on the order), refused with the message when none exists.\n'
    || E'  IF upper(COALESCE(v_o.currency, v_base)) = v_base THEN\n'
    || E'    v_fx_rate := 1;\n'
    || E'  ELSE\n'
    || E'    v_fx_rate := CASE WHEN COALESCE(v_o.exchange_rate, 1) <> 1 THEN v_o.exchange_rate\n'
    || E'                      ELSE public.exchange_rate_or_null(v_o.currency, v_base, COALESCE((v_o.updated_at AT TIME ZONE public.business_timezone())::date, public.platform_today())) END;\n'
    || E'    IF v_fx_rate IS NULL OR v_fx_rate <= 0 THEN\n'
    || E'      RETURN jsonb_build_object(''success'', false, ''error'', format(''No exchange rate %s → %s on or before %s — run fetch_ecb_rates or set_exchange_rate, then book_order_paid'', upper(v_o.currency), v_base, COALESCE((v_o.updated_at AT TIME ZONE public.business_timezone())::date, public.platform_today())));\n'
    || E'    END IF;\n'
    || E'    UPDATE public.orders SET exchange_rate = v_fx_rate WHERE id = p_order_id AND exchange_rate IS DISTINCT FROM v_fx_rate;\n'
    || E'  END IF;\n'
    || E'  v_scale := v_o.total_cents::numeric * v_fx_rate / v_gross;');
  v_new := replace(v_new,
    'VALUES (v_je, public.account_for_or(''payment_clearing'', ''bank''), v_o.total_cents, 0, ''Payment provider clearing'');',
    'VALUES (v_je, public.account_for_or(''payment_clearing'', ''bank''), round(v_o.total_cents * v_fx_rate)::bigint, 0, ''Payment provider clearing'' || CASE WHEN v_fx_rate <> 1 THEN format('' — %s %s @ %s'', public.format_business_amount(v_o.total_cents), upper(v_o.currency), trim(to_char(v_fx_rate, ''FM999999990.000000''))) ELSE '''' END);');
  IF v_new NOT LIKE '%v_fx_rate / v_gross%' OR v_new NOT LIKE '%round(v_o.total_cents * v_fx_rate)%' THEN
    RAISE EXCEPTION 'book_order_paid: the body did not match — patch by hand';
  END IF;
  EXECUTE v_new;
END $$;

-- ── 8. Revaluation of the OPEN balance, from one reader ────────────────────
CREATE OR REPLACE FUNCTION public.revalue_open_balances(p_revaluation_date date DEFAULT platform_today(), p_fx_gain_account text DEFAULT NULL::text, p_fx_loss_account text DEFAULT NULL::text, p_ar_account text DEFAULT NULL::text, p_ap_account text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_base text := public.business_currency();
  v_ar_delta bigint := 0;
  v_ap_delta bigint := 0;
  v_ar_lines int := 0;
  v_ap_lines int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_je uuid;
  rec record;
  v_now numeric;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'multiCurrency')) THEN
    RAISE EXCEPTION 'Requires the multiCurrency module — an admin can grant it under Users → Role Permissions';
  END IF;
  p_fx_gain_account := COALESCE(p_fx_gain_account, public.account_for('fx_gain'));
  p_fx_loss_account := COALESCE(p_fx_loss_account, public.account_for('fx_loss'));
  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  p_ap_account := COALESCE(p_ap_account, public.account_for('accounts_payable'));

  -- AR: the open part of every foreign-currency invoice, booked rate vs today's.
  FOR rec IN
    SELECT id, invoice_number, currency, exchange_rate,
           GREATEST(0, COALESCE(total_cents, 0) - COALESCE(paid_amount_cents, 0)) AS open_cents
      FROM public.invoices
     WHERE upper(currency) <> v_base
       AND COALESCE(invoice_type, 'invoice') = 'invoice'
       AND status::text IN ('sent', 'partially_paid', 'overdue')
  LOOP
    IF rec.open_cents <= 0 THEN CONTINUE; END IF;
    IF rec.exchange_rate IS NULL OR rec.exchange_rate <= 0 OR rec.exchange_rate = 1 THEN
      v_skipped := v_skipped || jsonb_build_object('invoice', rec.invoice_number, 'why', 'not booked at a rate yet');
      CONTINUE;
    END IF;
    v_now := public.exchange_rate_or_null(rec.currency, v_base, p_revaluation_date);
    IF v_now IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('invoice', rec.invoice_number, 'why', format('no %s → %s rate on %s', upper(rec.currency), v_base, p_revaluation_date));
      CONTINUE;
    END IF;
    v_ar_delta := v_ar_delta + round(rec.open_cents * (v_now - rec.exchange_rate))::bigint;
    v_ar_lines := v_ar_lines + 1;
  END LOOP;

  -- AP: open purchase orders in a foreign currency (the liability moves the other way).
  IF to_regclass('public.purchase_orders') IS NOT NULL THEN
    FOR rec IN
      SELECT id, po_number AS invoice_number, currency, exchange_rate, COALESCE(total_cents, 0) AS open_cents
        FROM public.purchase_orders
       WHERE upper(currency) <> v_base
         AND COALESCE(status::text, 'draft') NOT IN ('draft', 'paid', 'cancelled', 'closed')
    LOOP
      IF rec.open_cents <= 0 THEN CONTINUE; END IF;
      IF rec.exchange_rate IS NULL OR rec.exchange_rate <= 0 OR rec.exchange_rate = 1 THEN
        v_skipped := v_skipped || jsonb_build_object('purchase_order', rec.invoice_number, 'why', 'not booked at a rate yet');
        CONTINUE;
      END IF;
      v_now := public.exchange_rate_or_null(rec.currency, v_base, p_revaluation_date);
      IF v_now IS NULL THEN
        v_skipped := v_skipped || jsonb_build_object('purchase_order', rec.invoice_number, 'why', format('no %s → %s rate on %s', upper(rec.currency), v_base, p_revaluation_date));
        CONTINUE;
      END IF;
      v_ap_delta := v_ap_delta + round(rec.open_cents * (v_now - rec.exchange_rate))::bigint;
      v_ap_lines := v_ap_lines + 1;
    END LOOP;
  END IF;

  IF v_ar_delta = 0 AND v_ap_delta = 0 THEN
    RETURN jsonb_build_object('success', true, 'posted', false, 'base_currency', v_base,
      'ar_lines', v_ar_lines, 'ap_lines', v_ap_lines, 'skipped', v_skipped, 'revaluation_date', p_revaluation_date);
  END IF;

  INSERT INTO public.journal_entries (entry_date, description, source, status)
  VALUES (p_revaluation_date, format('FX revaluation %s — AR %s lines, AP %s lines', p_revaluation_date, v_ar_lines, v_ap_lines), 'fx_revaluation', 'posted')
  RETURNING id INTO v_je;
  -- A receivable worth more today is a gain; a payable worth more is a loss.
  IF v_ar_delta > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, p_ar_account, v_ar_delta, 0, 'AR revalued'), (v_je, p_fx_gain_account, 0, v_ar_delta, 'Unrealised exchange gain');
  ELSIF v_ar_delta < 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, p_fx_loss_account, -v_ar_delta, 0, 'Unrealised exchange loss'), (v_je, p_ar_account, 0, -v_ar_delta, 'AR revalued');
  END IF;
  IF v_ap_delta > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, p_fx_loss_account, v_ap_delta, 0, 'Unrealised exchange loss'), (v_je, p_ap_account, 0, v_ap_delta, 'AP revalued');
  ELSIF v_ap_delta < 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je, p_ap_account, -v_ap_delta, 0, 'AP revalued'), (v_je, p_fx_gain_account, 0, -v_ap_delta, 'Unrealised exchange gain');
  END IF;

  RETURN jsonb_build_object('success', true, 'posted', true, 'journal_entry_id', v_je, 'base_currency', v_base,
    'ar_delta_cents', v_ar_delta, 'ap_delta_cents', v_ap_delta, 'ar_lines', v_ar_lines, 'ap_lines', v_ap_lines,
    'skipped', v_skipped, 'revaluation_date', p_revaluation_date);
END $fn$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- The whole chain on a foreign-currency invoice, rolled back by its own
-- exception. Only where a chart of accounts is active: a fresh install without
-- one has nothing to book into (account_for says so) and skips.
DO $$
DECLARE
  v_base text := public.business_currency();
  v_cur text;
  v_inv uuid;
  v_ar bigint; v_rev bigint; v_vat bigint; v_bank bigint; v_gain bigint;
  v_paid jsonb;
  v_locale text;
BEGIN
  SELECT COALESCE(NULLIF(value #>> '{}', ''), value ->> 'id') INTO v_locale FROM public.site_settings WHERE key = 'accounting_locale';
  IF v_locale IS NULL OR NOT EXISTS (SELECT 1 FROM public.account_roles WHERE locale = v_locale AND role = 'accounts_receivable') THEN
    RAISE NOTICE 'fx booking proof skipped: no accounting locale active';
    RETURN;
  END IF;
  v_cur := CASE WHEN v_base = 'EUR' THEN 'USD' ELSE 'EUR' END;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    -- 11.0 on the issue date, 12.0 on the payment date.
    INSERT INTO public.exchange_rates (base_currency, quote_currency, rate, rate_date, source)
    VALUES (v_cur, v_base, 11.0, public.platform_today() - 1, 'proof'), (v_cur, v_base, 12.0, public.platform_today(), 'proof')
    ON CONFLICT DO NOTHING;
    UPDATE public.exchange_rates SET rate = 11.0 WHERE base_currency = v_cur AND quote_currency = v_base AND rate_date = public.platform_today() - 1;
    UPDATE public.exchange_rates SET rate = 12.0 WHERE base_currency = v_cur AND quote_currency = v_base AND rate_date = public.platform_today();

    INSERT INTO public.invoices (invoice_number, customer_email, customer_name, status, line_items, subtotal_cents, tax_rate, tax_cents, total_cents, currency, issue_date, due_date)
    VALUES ('__FX_PROOF__', 'fx-proof@example.invalid', 'FX proof', 'sent',
            '[{"description":"Consulting","qty":1,"unit_price_cents":80000}]'::jsonb,
            80000, 0.25, 20000, 100000, v_cur, public.platform_today() - 1, public.platform_today() + 29)
    RETURNING id INTO v_inv;

    SELECT COALESCE(sum(l.debit_cents - l.credit_cents) FILTER (WHERE l.account_code = public.account_for('accounts_receivable')), 0),
           COALESCE(sum(l.credit_cents - l.debit_cents) FILTER (WHERE l.account_code = public.account_for('sales_revenue')), 0),
           COALESCE(sum(l.credit_cents - l.debit_cents) FILTER (WHERE l.account_code = public.account_for('vat_output')), 0)
      INTO v_ar, v_rev, v_vat
      FROM public.journal_entries e JOIN public.journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.invoice_id = v_inv AND e.source = 'invoice_issued';
    IF v_ar <> 1100000 OR v_rev <> 880000 OR v_vat <> 220000 THEN
      RAISE EXCEPTION 'fx proof: issue booked AR % revenue % VAT % (expected 1100000 / 880000 / 220000 in %)', v_ar, v_rev, v_vat, v_base;
    END IF;
    IF (SELECT exchange_rate FROM public.invoices WHERE id = v_inv) <> 11.0 THEN
      RAISE EXCEPTION 'fx proof: the invoice was not stamped with the issue-date rate';
    END IF;

    v_paid := public.record_invoice_payment(v_inv, 100000, 'manual', now(), '__FX_PROOF__');
    SELECT COALESCE(sum(l.debit_cents) FILTER (WHERE l.account_code = public.account_for('bank')), 0),
           COALESCE(sum(l.credit_cents) FILTER (WHERE l.account_code = public.account_for('accounts_receivable')), 0),
           COALESCE(sum(l.credit_cents) FILTER (WHERE l.account_code = public.account_for_or('fx_gain', 'rounding_variance')), 0)
      INTO v_bank, v_ar, v_gain
      FROM public.journal_entries e JOIN public.journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.invoice_id = v_inv AND e.source = 'invoice_payment';
    IF v_bank <> 1200000 OR v_ar <> 1100000 OR v_gain <> 100000 THEN
      RAISE EXCEPTION 'fx proof: payment booked bank % AR % gain % (expected 1200000 / 1100000 / 100000): %', v_bank, v_ar, v_gain, v_paid;
    END IF;
    -- A missing rate is refused, never answered with 1.
    BEGIN
      PERFORM public.get_exchange_rate('XXX', v_base, public.platform_today());
      RAISE EXCEPTION 'fx proof: a missing rate answered with a number';
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
    -- Everything passed: unwind the proof's writes.
    RAISE EXCEPTION '__fx_proof_ok__';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> '__fx_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
