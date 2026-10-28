-- Inköpen bokförs i bolagets valuta (2026-10-26).
--
-- Försäljningssidan fick sin regel i 20261026100000; leverantörsfakturorna
-- hade samma fel kvar: book_vendor_invoice, pay_vendor_invoice och
-- apply_vendor_credit_memo bokade beloppet rakt av — en leverantörsfaktura
-- på 1 000 EUR blev 1 000 kr i leverantörsskuld, kostnad och ingående moms,
-- medan inköpsordern och godsmottagningen (20260827300000) redan räknade om
-- till bolagets valuta. Skulden och upplupningen (GRNI) talade alltså olika
-- valutor i samma huvudbok.
--
-- Samma regel som på försäljningen (Odoo: amount_currency på raden, balance
-- i bolagets valuta; kursen på fakturadagen, differensen vid betalningen):
--
--   1. Fakturan bär sin kurs (vendor_invoices.exchange_rate, fx_rate_source:
--      same_currency | rate_table | manual | missing), stämplad på fakturadagen.
--      Tystnad om valuta betyder INKÖPSORDERNS valuta, annars leverantörens,
--      annars bolagets — som för inköpsordrar (stamp_purchase_order_fx), inte
--      bolagets som kolumndefaulten sa: en EUR-leverantörs faktura utan angiven
--      valuta blev en SEK-faktura.
--   2. book_vendor_invoice räknar om till bolagets valuta innan den jämför med
--      orderns upplupning (som redan är i bolagets valuta); momsen är total −
--      netto så verifikatet balanserar på öret. En faktura i främmande valuta
--      utan kurs vägras med åtgärden — registreringstriggern är avsiktligt
--      oskyddad, så registreringen stoppas hellre än bokas till kurs 1.
--   3. pay_vendor_invoice: skulden lyfts till den bokade kursen, banken till
--      betaldagens, skillnaden som realiserad kursvinst/-förlust (3960/7960).
--   4. apply_vendor_credit_memo: en kreditnota mot en faktura räknas om till
--      fakturans kurs (så skulden nettas exakt); en fristående till kursen på
--      kreditdagen.
--   5. revalue_open_balances omvärderar de ÖPPNA leverantörsskulderna
--      (obetalda fakturor minus tillämpade kreditnotor) — inte inköpsordrarna,
--      som inte är skulder förrän de fakturerats.
--
-- Allt idempotent. Beviset i slutet kör registrering → betalning på en faktura
-- i främmande valuta och rullar tillbaka sig självt.

-- ── 1. The vendor invoice carries its rate ─────────────────────────────────
ALTER TABLE public.vendor_invoices ADD COLUMN IF NOT EXISTS exchange_rate numeric NOT NULL DEFAULT 1;
ALTER TABLE public.vendor_invoices ADD COLUMN IF NOT EXISTS fx_rate_source text;
-- Silence means the order's currency, then the vendor's: no column default.
ALTER TABLE public.vendor_invoices ALTER COLUMN currency DROP DEFAULT;
COMMENT ON COLUMN public.vendor_invoices.exchange_rate IS
  'Business-currency units per unit of `currency`, stamped on the invoice date. 1 when the currencies are the same; 1 with fx_rate_source = missing on a foreign-currency invoice = no rate known (booking refuses with the message).';
COMMENT ON COLUMN public.vendor_invoices.fx_rate_source IS 'same_currency | rate_table | manual | missing — where exchange_rate came from.';

CREATE OR REPLACE FUNCTION public.vendor_invoices_stamp_fx()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_base text := public.business_currency();
  v_rate numeric;
  v_from text;
BEGIN
  -- Silence means the order's currency, else the vendor's, else the business's.
  IF NEW.currency IS NULL OR trim(NEW.currency) = '' THEN
    IF NEW.purchase_order_id IS NOT NULL THEN
      SELECT currency INTO v_from FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
    END IF;
    IF v_from IS NULL AND NEW.vendor_id IS NOT NULL THEN
      SELECT currency INTO v_from FROM public.vendors WHERE id = NEW.vendor_id;
    END IF;
    NEW.currency := upper(COALESCE(NULLIF(trim(v_from), ''), v_base));
  ELSE
    NEW.currency := upper(trim(NEW.currency));
  END IF;

  IF NEW.currency = v_base THEN
    NEW.exchange_rate := 1;
    NEW.fx_rate_source := 'same_currency';
    RETURN NEW;
  END IF;
  -- book_vendor_invoice stamps a table rate itself and says so in the same UPDATE.
  IF TG_OP = 'UPDATE' AND NEW.fx_rate_source = 'rate_table' AND NEW.fx_rate_source IS DISTINCT FROM OLD.fx_rate_source
     AND NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate THEN
    RETURN NEW;
  END IF;
  -- A rate the caller set (≠ 1 — 1 is the column default, "nobody stamped it") is agreed and stays.
  IF COALESCE(NEW.exchange_rate, 1) <> 1
     AND (TG_OP = 'INSERT' OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate) THEN
    NEW.fx_rate_source := 'manual';
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.fx_rate_source = 'manual' AND NEW.currency = OLD.currency
     AND NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate THEN
    RETURN NEW;
  END IF;
  v_rate := public.exchange_rate_or_null(NEW.currency, v_base, COALESCE(NEW.invoice_date, public.platform_today()));
  IF v_rate IS NULL OR v_rate <= 0 THEN
    NEW.exchange_rate := 1;
    NEW.fx_rate_source := 'missing';
  ELSE
    NEW.exchange_rate := v_rate;
    NEW.fx_rate_source := 'rate_table';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS a_vendor_invoices_stamp_fx ON public.vendor_invoices;
CREATE TRIGGER a_vendor_invoices_stamp_fx BEFORE INSERT OR UPDATE OF currency, exchange_rate, invoice_date, purchase_order_id, vendor_id ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.vendor_invoices_stamp_fx();

-- Existing rows: the same-currency ones are 1/same_currency; a foreign one is
-- 'missing' until a rate is set (it was booked at 1 — that entry stands as the
-- history it is; the rate matters for the payment and the revaluation).
UPDATE public.vendor_invoices
   SET exchange_rate = 1, fx_rate_source = 'same_currency'
 WHERE fx_rate_source IS NULL AND upper(COALESCE(currency, public.business_currency())) = public.business_currency();
UPDATE public.vendor_invoices
   SET fx_rate_source = CASE WHEN COALESCE(exchange_rate, 1) <> 1 THEN 'manual' ELSE 'missing' END
 WHERE fx_rate_source IS NULL;

-- A credit memo on an invoice is in the invoice's currency.
CREATE OR REPLACE FUNCTION public.vendor_credit_memos_inherit_currency()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.vendor_invoice_id IS NOT NULL THEN
    SELECT upper(currency) INTO NEW.currency FROM public.vendor_invoices WHERE id = NEW.vendor_invoice_id;
  END IF;
  NEW.currency := upper(COALESCE(NULLIF(trim(NEW.currency), ''), public.business_currency()));
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS a_vendor_credit_memos_inherit_currency ON public.vendor_credit_memos;
CREATE TRIGGER a_vendor_credit_memos_inherit_currency BEFORE INSERT ON public.vendor_credit_memos
  FOR EACH ROW EXECUTE FUNCTION public.vendor_credit_memos_inherit_currency();

-- The rate a vendor invoice is booked at: 1 for the business's currency, the
-- stamped rate, else the invoice date's — refused with the fix when none.
CREATE OR REPLACE FUNCTION public.vendor_invoice_book_rate(p_invoice public.vendor_invoices)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_base text := public.business_currency();
  v_rate numeric;
BEGIN
  IF upper(COALESCE(p_invoice.currency, v_base)) = v_base THEN RETURN 1; END IF;
  IF COALESCE(p_invoice.exchange_rate, 1) <> 1 AND COALESCE(p_invoice.fx_rate_source, '') <> 'missing' THEN
    RETURN p_invoice.exchange_rate;
  END IF;
  v_rate := public.exchange_rate_or_null(p_invoice.currency, v_base, COALESCE(p_invoice.invoice_date, public.platform_today()));
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'No exchange rate % → % on or before % — vendor invoice % cannot be booked at rate 1. Run fetch_ecb_rates, or set_exchange_rate(''%'', ''%'', <rate>, ''%''), then register it again (or pass exchange_rate).',
      upper(p_invoice.currency), v_base, COALESCE(p_invoice.invoice_date, public.platform_today()),
      COALESCE(p_invoice.invoice_number, p_invoice.id::text),
      upper(p_invoice.currency), v_base, COALESCE(p_invoice.invoice_date, public.platform_today())
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_rate;
END $fn$;
REVOKE ALL ON FUNCTION public.vendor_invoice_book_rate(public.vendor_invoices) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_invoice_book_rate(public.vendor_invoices) TO authenticated, service_role;

-- ── 2. Registration: the ledger in the business's currency ─────────────────
CREATE OR REPLACE FUNCTION public.book_vendor_invoice(p_vendor_invoice_id uuid, p_entry_date date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv public.vendor_invoices;
  v_grni text;
  v_ap text;
  v_vat text;
  v_other text;
  v_other_label text;
  v_total bigint;
  v_tax bigint;
  v_net bigint;
  v_rate numeric;
  v_base text := public.business_currency();
  v_vat_known boolean := true;
  v_open bigint := 0;
  v_to_grni bigint := 0;
  v_to_other bigint := 0;
  v_date date;
  v_je uuid;
  v_note text := '';
  v_fx text := '';
BEGIN
  -- Direktanrop kräver inköpsmodulen. Anrop från triggern (pg_trigger_depth>0)
  -- har redan passerat vendor_invoices egen RLS — att grinda samma skrivning
  -- två gånger skulle bara ge ett nytt sätt för verifikationen att utebli.
  IF pg_trigger_depth() = 0
     AND NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;
  -- Idempotent: en faktura bokförs en gång. Verifikationen bär fakturans id.
  SELECT id INTO v_je FROM public.journal_entries
   WHERE source = 'vendor_invoice' AND reference_number = v_inv.id::text
   LIMIT 1;
  IF v_je IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_booked', true,
                              'vendor_invoice_id', v_inv.id, 'journal_entry_id', v_je);
  END IF;
  v_total := COALESCE(v_inv.total_cents, 0);
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice has no positive total',
                              'vendor_invoice_id', v_inv.id);
  END IF;
  v_grni  := public.account_for('goods_received_not_invoiced');
  v_ap    := public.account_for('accounts_payable');
  v_vat   := public.account_for('vat_input');
  -- Momsläget (se resonemanget i 20260919220000).
  v_tax := COALESCE(v_inv.tax_cents, 0);
  IF v_tax = 0 THEN
    IF COALESCE(v_inv.subtotal_cents, 0) = 0 THEN
      v_vat_known := false;
      v_note := 'Moms ej angiven vid registreringen — bruttot bokat utan avdrag. Rätta fakturans subtotal/tax och bokför om.';
    ELSIF v_inv.subtotal_cents <> v_total THEN
      v_tax := v_total - v_inv.subtotal_cents;
      v_note := 'Momsen härledd som total − subtotal.';
    ELSE
      v_note := 'Nollmoms enligt fakturan (t.ex. EU-förvärv eller omvänd skattskyldighet) — ingen momsrad skrivs.';
    END IF;
  END IF;
  IF v_tax < 0 OR v_tax > v_total THEN
    RAISE EXCEPTION
      'Vendor invoice % has an impossible VAT amount (subtotal %, tax %, total %) — a journal entry from these numbers would be wrong, not merely unbalanced.',
      COALESCE(v_inv.invoice_number, v_inv.id::text),
      v_inv.subtotal_cents, v_inv.tax_cents, v_total
      USING ERRCODE = 'check_violation';
  END IF;
  v_net := v_total - v_tax;

  -- Into the business's currency, at the invoice date's rate (stamped on the
  -- invoice). The order's accrual below is already in that currency.
  v_rate := public.vendor_invoice_book_rate(v_inv);
  IF v_rate <> 1 THEN
    IF COALESCE(v_inv.fx_rate_source, '') IN ('missing', '') OR COALESCE(v_inv.exchange_rate, 1) = 1 THEN
      UPDATE public.vendor_invoices SET exchange_rate = v_rate, fx_rate_source = 'rate_table' WHERE id = v_inv.id;
    END IF;
    v_fx := format(' — %s %s @ %s', public.format_business_amount(v_total), upper(v_inv.currency), trim(to_char(v_rate, 'FM999999990.000000')));
    v_total := round(v_total * v_rate)::bigint;
    v_net   := round(v_net * v_rate)::bigint;
    v_tax   := CASE WHEN v_tax = 0 THEN 0 ELSE v_total - v_net END;
  END IF;

  v_date := COALESCE(p_entry_date, v_inv.invoice_date, public.platform_today());
  IF v_inv.purchase_order_id IS NOT NULL THEN
    -- Rummet är ORDERNS nettovärde (i bolagets valuta, orderns kurs) minus vad
    -- tidigare fakturor på ordern redan debiterat GRNI.
    SELECT GREATEST(COALESCE((SELECT round(po.subtotal_cents * COALESCE(NULLIF(po.exchange_rate, 0), 1))::bigint
                               FROM public.purchase_orders po WHERE po.id = v_inv.purchase_order_id), 0)
             - COALESCE((SELECT SUM(l2.debit_cents - l2.credit_cents) FROM public.journal_entry_lines l2
                          JOIN public.journal_entries e2 ON e2.id = l2.journal_entry_id
                         WHERE e2.status = 'posted' AND e2.source = 'vendor_invoice' AND l2.account_code = v_grni
                           AND e2.reference_number IN (SELECT vi2.id::text FROM public.vendor_invoices vi2
                                                        WHERE vi2.purchase_order_id = v_inv.purchase_order_id)), 0), 0)
      INTO v_open;
    v_to_grni := LEAST(v_net, v_open);
    v_to_other := v_net - v_to_grni;
    v_other := public.account_for('purchase_price_variance');
    v_other_label := 'Prisdifferens — fakturerat utöver orderns värde';
  ELSE
    v_to_grni := 0;
    v_to_other := v_net;
    v_other := public.account_for('expense_default');
    v_other_label := 'Leverantörsfaktura utan inköpsorder';
  END IF;
  INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source, vendor_id)
  VALUES (v_date,
          'Leverantörsfaktura ' || COALESCE(v_inv.invoice_number, '')
            || CASE WHEN v_vat_known THEN '' ELSE ' (moms ej angiven)' END || v_fx,
          v_inv.id::text, 'posted', 'vendor_invoice', v_inv.vendor_id)
  RETURNING id INTO v_je;
  -- Inga nollrader. Ett belopp på noll är inte en post — det är frånvaron av
  -- en post, och en tom rad gör bara att kontot ser rört ut i rapporterna.
  IF v_to_grni > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_grni, v_to_grni, 0, 'Stänger ej fakturerad varuleverans');
  END IF;
  IF v_to_other <> 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_other, GREATEST(v_to_other, 0), GREATEST(-v_to_other, 0), v_other_label);
  END IF;
  IF v_tax > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_vat, v_tax, 0, 'Debiterad ingående moms');
  END IF;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je, v_ap, 0, v_total, 'Leverantörsskuld');

  RETURN jsonb_build_object(
    'success', true,
    'vendor_invoice_id', v_inv.id,
    'journal_entry_id', v_je,
    'entry_date', v_date,
    'currency', upper(v_inv.currency),
    'exchange_rate', v_rate,
    'book_currency', v_base,
    'total_cents', v_inv.total_cents,
    'booked_total_cents', v_total,
    'net_cents', v_net,
    'vat_cents', v_tax,
    'vat_specified', v_vat_known,
    'grni_account', v_grni,
    'grni_closed_cents', v_to_grni,
    'grni_open_before_cents', v_open,
    'variance_account', CASE WHEN v_to_other <> 0 THEN v_other END,
    'variance_cents', v_to_other,
    'vat_account', CASE WHEN v_tax > 0 THEN v_vat END,
    'payable_account', v_ap,
    'note', NULLIF(v_note, '')
  );
END $fn$;

-- ── 3. Payment: the debt at the booked rate, the bank at the day's ─────────
CREATE OR REPLACE FUNCTION public.pay_vendor_invoice(p_vendor_invoice_id uuid, p_pay_date date DEFAULT platform_today(), p_bank_account text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_inv public.vendor_invoices;
  v_je_id uuid;
  v_ap text;
  v_dispute uuid;
  v_credited bigint := 0;
  v_pay bigint;
  v_base text := public.business_currency();
  v_rate_issue numeric;
  v_rate_pay numeric;
  v_ap_b bigint;
  v_bank_b bigint;
  v_fx bigint := 0;
  v_note text := '';
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  v_ap := public.account_for('accounts_payable');
  -- Fakturans lås: två samtidiga betalningar blir en betalning och ett
  -- "already paid", aldrig två utbetalningar.
  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;
  IF v_inv.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice already paid', 'paid_at', v_inv.paid_at);
  END IF;
  IF COALESCE(v_inv.total_cents, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice has no positive total');
  END IF;
  SELECT id INTO v_dispute FROM public.vendor_invoice_disputes
   WHERE vendor_invoice_id = v_inv.id AND status = 'open' LIMIT 1;
  IF v_dispute IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'dispute_id', v_dispute,
      'error', format('Invoice %s is under dispute — paying it now is the mistake the dispute exists to prevent. Close it with resolve_vendor_dispute (with p_credit_amount_cents when the vendor credits part of it), then pay.', v_inv.invoice_number));
  END IF;
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_credited FROM public.vendor_credit_memos
   WHERE vendor_invoice_id = v_inv.id AND status = 'applied';
  v_pay := v_inv.total_cents - v_credited;
  IF v_pay > 0 THEN
    -- The debt was booked at the invoice's rate; the bank pays the day's.
    v_rate_issue := public.vendor_invoice_book_rate(v_inv);
    IF v_rate_issue = 1 AND upper(COALESCE(v_inv.currency, v_base)) = v_base THEN
      v_rate_pay := 1;
    ELSE
      v_rate_pay := public.exchange_rate_or_null(v_inv.currency, v_base, p_pay_date);
      IF v_rate_pay IS NULL OR v_rate_pay <= 0 THEN
        v_rate_pay := v_rate_issue;
        v_note := ' (no rate for the payment date — settled at the invoice rate)';
      END IF;
    END IF;
    v_ap_b   := round(v_pay * v_rate_issue)::bigint;
    v_bank_b := round(v_pay * v_rate_pay)::bigint;
    v_fx     := v_ap_b - v_bank_b;   -- paying fewer kronor than owed is a gain
    INSERT INTO public.journal_entries (entry_date, description, status, source, vendor_id)
    VALUES (p_pay_date,
            'Betalning leverantörsfaktura ' || COALESCE(v_inv.invoice_number, '')
              || CASE WHEN v_rate_issue <> 1 THEN format(' — %s %s @ %s', public.format_business_amount(v_pay), upper(v_inv.currency), trim(to_char(v_rate_pay, 'FM999999990.000000'))) ELSE '' END
              || v_note,
            'posted', 'vendor_payment', v_inv.vendor_id)
    RETURNING id INTO v_je_id;
    -- account_name is auto-filled by the fill_journal_line_account_name trigger.
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
      (v_je_id, v_ap, v_ap_b, 0, 'Leverantörsskuld'),
      (v_je_id, p_bank_account, 0, v_bank_b, 'Utbetalning');
    IF v_fx > 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, public.account_for_or('fx_gain', 'rounding_variance'), 0, v_fx, 'Realiserad kursvinst');
    ELSIF v_fx < 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_je_id, public.account_for_or('fx_loss', 'rounding_variance'), -v_fx, 0, 'Realiserad kursförlust');
    END IF;
  END IF;
  UPDATE public.vendor_invoices SET status = 'paid', paid_at = p_pay_date WHERE id = v_inv.id;
  RETURN jsonb_build_object(
    'success', true, 'vendor_invoice_id', v_inv.id, 'journal_entry_id', v_je_id,
    'total_cents', v_inv.total_cents, 'credited_cents', v_credited, 'paid_cents', GREATEST(v_pay, 0),
    'currency', upper(COALESCE(v_inv.currency, v_base)), 'book_currency', v_base,
    'exchange_rate', v_rate_pay, 'booked_cents', v_bank_b, 'fx_difference_cents', v_fx,
    'paid_at', p_pay_date, 'bank_account', p_bank_account, 'payable_account', v_ap,
    'note', CASE WHEN v_credited > 0 AND v_pay > 0 THEN 'Paid the total minus applied credit memos.'
                 WHEN v_pay <= 0 THEN 'Fully settled by credit memos — nothing left the bank.' END
  );
END $fn$;

-- ── 4. A credit memo at the invoice's rate ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_vendor_credit_memo(p_credit_memo_id uuid, p_entry_date date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_memo public.vendor_credit_memos;
  v_inv public.vendor_invoices;
  v_applied bigint := 0;
  v_tax bigint := 0;
  v_net bigint;
  v_ap text;
  v_vat text;
  v_other text;
  v_label text;
  v_je uuid;
  v_date date;
  v_base text := public.business_currency();
  v_rate numeric := 1;
  v_amount_b bigint;
  v_tax_b bigint;
  v_net_b bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;
  SELECT * INTO v_memo FROM public.vendor_credit_memos WHERE id = p_credit_memo_id FOR UPDATE;
  IF v_memo.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Credit memo not found');
  END IF;
  IF v_memo.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_applied', true, 'credit_memo_id', v_memo.id,
                              'journal_entry_id', v_memo.journal_entry_id);
  END IF;
  IF v_memo.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Credit memo %s is %s — only an issued memo can be applied.', v_memo.credit_number, v_memo.status));
  END IF;
  v_date := COALESCE(p_entry_date, v_memo.credit_date, public.platform_today());
  IF v_memo.vendor_invoice_id IS NOT NULL THEN
    -- Fakturans lås: krediternas summa räknas under det.
    SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = v_memo.vendor_invoice_id FOR UPDATE;
    IF v_inv.paid_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('Invoice %s is already paid — there is no debt left on it to reduce. Issue the credit against the vendor (omit p_vendor_invoice_id): it then stands as a claim on the vendor in accounts payable.', v_inv.invoice_number));
    END IF;
    SELECT COALESCE(SUM(amount_cents), 0) INTO v_applied FROM public.vendor_credit_memos
     WHERE vendor_invoice_id = v_inv.id AND status = 'applied';
    IF v_applied + v_memo.amount_cents > COALESCE(v_inv.total_cents, 0) THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('Credit %s would exceed invoice %s: total %s, already credited %s, room left %s.',
               v_memo.amount_cents, v_inv.invoice_number, v_inv.total_cents, v_applied,
               GREATEST(COALESCE(v_inv.total_cents, 0) - v_applied, 0)));
    END IF;
    -- Momsen följer fakturans proportion: en kredit på en faktura med 25 %
    -- moms är en kredit på både nettot och momsen.
    IF COALESCE(v_inv.total_cents, 0) > 0 AND COALESCE(v_inv.tax_cents, 0) > 0 THEN
      v_tax := round(v_memo.amount_cents::numeric * v_inv.tax_cents / v_inv.total_cents);
    END IF;
    -- The memo nets the debt exactly: the invoice's booked rate.
    v_rate := public.vendor_invoice_book_rate(v_inv);
  ELSIF upper(COALESCE(v_memo.currency, v_base)) <> v_base THEN
    v_rate := public.exchange_rate_or_null(v_memo.currency, v_base, v_date);
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('No exchange rate %s → %s on or before %s — run fetch_ecb_rates or set_exchange_rate, then apply the memo', upper(v_memo.currency), v_base, v_date));
    END IF;
  END IF;
  v_net := v_memo.amount_cents - v_tax;
  v_amount_b := round(v_memo.amount_cents * v_rate)::bigint;
  v_tax_b    := CASE WHEN v_tax = 0 THEN 0 ELSE round(v_tax * v_rate)::bigint END;
  v_net_b    := v_amount_b - v_tax_b;
  v_ap := public.account_for('accounts_payable');
  v_vat := public.account_for('vat_input');
  IF v_inv.purchase_order_id IS NOT NULL THEN
    v_other := public.account_for('purchase_price_variance');
    v_label := 'Kreditnota — prisdifferens mot order';
  ELSE
    v_other := public.account_for('expense_default');
    v_label := 'Kreditnota från leverantör';
  END IF;
  INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source, vendor_id)
  VALUES (v_date, 'Kreditnota ' || v_memo.credit_number
            || COALESCE(' mot faktura ' || v_inv.invoice_number, '')
            || CASE WHEN v_rate <> 1 THEN format(' — %s %s @ %s', public.format_business_amount(v_memo.amount_cents), upper(COALESCE(v_inv.currency, v_memo.currency)), trim(to_char(v_rate, 'FM999999990.000000'))) ELSE '' END,
          v_memo.id::text, 'posted', 'vendor_credit_memo', v_memo.vendor_id)
  RETURNING id INTO v_je;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_je, v_ap, v_amount_b, 0, 'Minskad leverantörsskuld');
  IF v_tax_b > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_vat, 0, v_tax_b, 'Återförd ingående moms');
  END IF;
  IF v_net_b > 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_je, v_other, 0, v_net_b, v_label);
  END IF;
  PERFORM set_config('flowwink.credit_memo_apply', v_memo.id::text, true);
  UPDATE public.vendor_credit_memos
     SET status = 'applied', applied_at = now(), journal_entry_id = v_je
   WHERE id = v_memo.id;
  PERFORM set_config('flowwink.credit_memo_apply', '', true);
  RETURN jsonb_build_object('success', true, 'credit_memo_id', v_memo.id, 'credit_number', v_memo.credit_number,
    'journal_entry_id', v_je, 'entry_date', v_date, 'amount_cents', v_memo.amount_cents,
    'net_cents', v_net, 'vat_cents', v_tax, 'exchange_rate', v_rate, 'booked_cents', v_amount_b, 'book_currency', v_base,
    'payable_account', v_ap,
    'offset_account', CASE WHEN v_net_b > 0 THEN v_other END,
    'vendor_invoice_id', v_inv.id,
    'invoice_left_to_pay_cents', CASE WHEN v_inv.id IS NOT NULL
                                      THEN v_inv.total_cents - v_applied - v_memo.amount_cents END);
END $fn$;

-- ── 5. Revaluation: the open DEBTS, not the orders ─────────────────────────
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
    SELECT id, invoice_number, currency, exchange_rate, fx_rate_source,
           GREATEST(0, COALESCE(total_cents, 0) - COALESCE(paid_amount_cents, 0)) AS open_cents
      FROM public.invoices
     WHERE upper(currency) <> v_base
       AND COALESCE(invoice_type, 'invoice') = 'invoice'
       AND status::text IN ('sent', 'partially_paid', 'overdue')
  LOOP
    IF rec.open_cents <= 0 THEN CONTINUE; END IF;
    IF rec.exchange_rate IS NULL OR rec.exchange_rate <= 0 OR rec.exchange_rate = 1 OR COALESCE(rec.fx_rate_source, '') = 'missing' THEN
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

  -- AP: the open part of every unpaid foreign-currency vendor invoice (total
  -- minus applied credit memos). An order is not a debt until it is invoiced.
  FOR rec IN
    SELECT vi.id, vi.invoice_number, vi.currency, vi.exchange_rate, vi.fx_rate_source,
           GREATEST(0, COALESCE(vi.total_cents, 0)
             - COALESCE((SELECT SUM(m.amount_cents) FROM public.vendor_credit_memos m
                          WHERE m.vendor_invoice_id = vi.id AND m.status = 'applied'), 0)) AS open_cents
      FROM public.vendor_invoices vi
     WHERE upper(vi.currency) <> v_base
       AND vi.paid_at IS NULL
       AND COALESCE(vi.status, '') NOT IN ('paid', 'rejected')
  LOOP
    IF rec.open_cents <= 0 THEN CONTINUE; END IF;
    IF rec.exchange_rate IS NULL OR rec.exchange_rate <= 0 OR rec.exchange_rate = 1 OR COALESCE(rec.fx_rate_source, '') = 'missing' THEN
      v_skipped := v_skipped || jsonb_build_object('vendor_invoice', rec.invoice_number, 'why', 'not booked at a rate yet');
      CONTINUE;
    END IF;
    v_now := public.exchange_rate_or_null(rec.currency, v_base, p_revaluation_date);
    IF v_now IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('vendor_invoice', rec.invoice_number, 'why', format('no %s → %s rate on %s', upper(rec.currency), v_base, p_revaluation_date));
      CONTINUE;
    END IF;
    v_ap_delta := v_ap_delta + round(rec.open_cents * (v_now - rec.exchange_rate))::bigint;
    v_ap_lines := v_ap_lines + 1;
  END LOOP;

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
-- Registration → payment on a foreign-currency vendor invoice without an
-- order, rolled back by its own exception. Only where a chart of accounts is
-- active; a fresh install without one skips.
DO $$
DECLARE
  v_base text := public.business_currency();
  v_cur text;
  v_vendor uuid;
  v_inv uuid;
  v_locale text;
  v_exp bigint; v_vat bigint; v_ap bigint; v_bank bigint; v_gain bigint;
  v_res jsonb;
BEGIN
  SELECT COALESCE(NULLIF(value #>> '{}', ''), value ->> 'id') INTO v_locale FROM public.site_settings WHERE key = 'accounting_locale';
  IF v_locale IS NULL OR NOT EXISTS (SELECT 1 FROM public.account_roles WHERE locale = v_locale AND role = 'accounts_payable') THEN
    RAISE NOTICE 'vendor fx proof skipped: no accounting locale active';
    RETURN;
  END IF;
  v_cur := CASE WHEN v_base = 'EUR' THEN 'USD' ELSE 'EUR' END;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.exchange_rates (base_currency, quote_currency, rate, rate_date, source)
    VALUES (v_cur, v_base, 11.0, public.platform_today() - 1, 'proof'), (v_cur, v_base, 10.5, public.platform_today(), 'proof')
    ON CONFLICT DO NOTHING;
    UPDATE public.exchange_rates SET rate = 11.0 WHERE base_currency = v_cur AND quote_currency = v_base AND rate_date = public.platform_today() - 1;
    UPDATE public.exchange_rates SET rate = 10.5 WHERE base_currency = v_cur AND quote_currency = v_base AND rate_date = public.platform_today();

    INSERT INTO public.vendors (name, currency) VALUES ('__FX_PROOF_VENDOR__', v_cur) RETURNING id INTO v_vendor;
    -- No currency given: the vendor's (EUR), not the business's.
    INSERT INTO public.vendor_invoices (vendor_id, invoice_number, invoice_date, due_date, subtotal_cents, tax_cents, total_cents, status, approved_at)
    VALUES (v_vendor, '__FX_PROOF__', public.platform_today() - 1, public.platform_today() + 29, 80000, 20000, 100000, 'approved', now())
    RETURNING id INTO v_inv;
    IF (SELECT currency || '/' || exchange_rate::text || '/' || fx_rate_source FROM public.vendor_invoices WHERE id = v_inv) <> v_cur || '/11.00000000/rate_table' THEN
      RAISE EXCEPTION 'vendor fx proof: the invoice was not stamped with the vendor currency and the invoice-date rate: %',
        (SELECT currency || '/' || exchange_rate::text || '/' || COALESCE(fx_rate_source, '') FROM public.vendor_invoices WHERE id = v_inv);
    END IF;
    SELECT COALESCE(sum(l.debit_cents) FILTER (WHERE l.account_code = public.account_for('expense_default')), 0),
           COALESCE(sum(l.debit_cents) FILTER (WHERE l.account_code = public.account_for('vat_input')), 0),
           COALESCE(sum(l.credit_cents) FILTER (WHERE l.account_code = public.account_for('accounts_payable')), 0)
      INTO v_exp, v_vat, v_ap
      FROM public.journal_entries e JOIN public.journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.source = 'vendor_invoice' AND e.reference_number = v_inv::text;
    IF v_exp <> 880000 OR v_vat <> 220000 OR v_ap <> 1100000 THEN
      RAISE EXCEPTION 'vendor fx proof: registration booked expense % VAT % AP % (expected 880000 / 220000 / 1100000 in %)', v_exp, v_vat, v_ap, v_base;
    END IF;

    -- The payment gate recomputes the three-way match; a bill without an order
    -- is paid only on a human's overruling — the approved chain request IS
    -- that overruling, and the fixture states it the way the gate reads it.
    INSERT INTO public.approval_requests (entity_type, entity_id, amount_cents, currency, status, resolved_at, reason)
    VALUES ('vendor_invoice', v_inv::text, 100000, v_cur, 'approved', now(), 'fx proof');
    v_res := public.pay_vendor_invoice(v_inv, public.platform_today());
    SELECT COALESCE(sum(l.debit_cents) FILTER (WHERE l.account_code = public.account_for('accounts_payable')), 0),
           COALESCE(sum(l.credit_cents) FILTER (WHERE l.account_code = public.account_for('bank')), 0),
           COALESCE(sum(l.credit_cents) FILTER (WHERE l.account_code = public.account_for_or('fx_gain', 'rounding_variance')), 0)
      INTO v_ap, v_bank, v_gain
      FROM public.journal_entries e JOIN public.journal_entry_lines l ON l.journal_entry_id = e.id
     WHERE e.id = (v_res ->> 'journal_entry_id')::uuid;
    IF v_ap <> 1100000 OR v_bank <> 1050000 OR v_gain <> 50000 THEN
      RAISE EXCEPTION 'vendor fx proof: payment booked AP % bank % gain % (expected 1100000 / 1050000 / 50000): %', v_ap, v_bank, v_gain, v_res;
    END IF;
    -- Everything passed: unwind the proof's writes.
    RAISE EXCEPTION '__vendor_fx_proof_ok__';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> '__vendor_fx_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
