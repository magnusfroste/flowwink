-- AR posting for invoices: the missing half of record-to-report.
--
-- mark_paid emitted `invoice.paid` with a note that "the accounting listener
-- will post Dt 1930 / Cr 1510" — but no listener exists (no automation
-- subscribes to invoice.paid), so neither invoice issuance nor payment ever
-- reached the ledger. Events sat unprocessed; the books showed expenses but no
-- revenue or receivables.
--
-- Odoo's model: validating an invoice posts the journal entry immediately and
-- registering a payment posts the counter-entry — synchronous and transactional,
-- not "hopefully a listener". We do the same, simpler: a DB trigger on the
-- invoices status transitions. The event bus still emits for other consumers;
-- bookkeeping just no longer depends on it.
--
--   issued (status -> sent):  Dt 1510 AR (total) / Cr 3001 revenue (net)
--                                                / Cr 2611 output VAT (tax)
--   paid   (status -> paid):  Dt 1930 bank (paid amount) / Cr 1510 AR
--
-- Idempotent via journal_entries.invoice_id + source guards (re-running a
-- transition never double-posts). account_name is auto-filled by
-- trg_fill_journal_line_account_name. BAS account codes are defaults; pass
-- different ones when calling the functions directly.

CREATE OR REPLACE FUNCTION public.book_invoice_issued(
  p_invoice_id uuid,
  p_ar_account text DEFAULT '1510',
  p_revenue_account text DEFAULT '3001',
  p_vat_account text DEFAULT '2611'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  -- Idempotency: already booked?
  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_issued') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  v_total := COALESCE(v_inv.total_cents, 0);
  v_vat   := COALESCE(v_inv.tax_cents, 0);
  v_net   := COALESCE(v_inv.subtotal_cents, v_total - v_vat);
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice total is zero');
  END IF;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.issue_date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' issued',
          'invoice_issued', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, v_total, 0, 'Accounts receivable');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_revenue_account, 0, v_net, 'Revenue');
  IF v_vat > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, p_vat_account, 0, v_vat, 'Output VAT');
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id, 'total_cents', v_total);
END;
$function$;

CREATE OR REPLACE FUNCTION public.book_invoice_paid(
  p_invoice_id uuid,
  p_bank_account text DEFAULT '1930',
  p_ar_account text DEFAULT '1510'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_amount bigint;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_payment') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  v_amount := COALESCE(v_inv.paid_amount_cents, v_inv.total_cents, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount is zero');
  END IF;

  -- If issuance was never booked (e.g. legacy invoice), book it first so AR exists.
  PERFORM public.book_invoice_issued(p_invoice_id);

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.paid_at::date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' paid',
          'invoice_payment', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_bank_account, v_amount, 0, 'Bank');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, 0, v_amount, 'Settle accounts receivable');

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id, 'amount_cents', v_amount);
END;
$function$;

-- Synchronous posting on invoice status transitions (Odoo-style validate/pay).
CREATE OR REPLACE FUNCTION public.on_invoice_status_book()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' THEN
      PERFORM public.book_invoice_issued(NEW.id);
    ELSIF NEW.status = 'paid' THEN
      PERFORM public.book_invoice_paid(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_invoice_status_book ON public.invoices;
CREATE TRIGGER trg_invoice_status_book
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.on_invoice_status_book();
