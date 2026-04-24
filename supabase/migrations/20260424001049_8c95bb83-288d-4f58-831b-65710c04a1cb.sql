-- ============================================================
-- Phase 1.3: Reconciliation (payment ↔ invoice)
-- Odoo-style full_reconcile group
-- ============================================================

-- 1. Group table — one row per "full reconcile attempt"
CREATE TABLE IF NOT EXISTS public.payment_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'partial' CHECK (status IN ('partial','full','reversed')),
  reconciled_amount_cents BIGINT NOT NULL DEFAULT 0,
  invoice_total_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SEK',
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reversal_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reconciled_by UUID,
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_by UUID,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payrec_invoice ON public.payment_reconciliations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payrec_status ON public.payment_reconciliations(status);

-- 2. Link matches to a reconciliation group + back-reference on invoice
ALTER TABLE public.reconciliation_matches
  ADD COLUMN IF NOT EXISTS reconciliation_id UUID REFERENCES public.payment_reconciliations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recmatch_reconciliation ON public.reconciliation_matches(reconciliation_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS reconciliation_id UUID REFERENCES public.payment_reconciliations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_amount_cents BIGINT NOT NULL DEFAULT 0;

-- 3. RLS
ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payrec_read_auth" ON public.payment_reconciliations;
CREATE POLICY "payrec_read_auth" ON public.payment_reconciliations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "payrec_admin_write" ON public.payment_reconciliations;
CREATE POLICY "payrec_admin_write" ON public.payment_reconciliations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'approver'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'approver'::public.app_role));

DROP TRIGGER IF EXISTS trg_payrec_updated_at ON public.payment_reconciliations;
CREATE TRIGGER trg_payrec_updated_at
  BEFORE UPDATE ON public.payment_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- Helper: invoice outstanding (residual)
-- ============================================================
CREATE OR REPLACE FUNCTION public.invoice_outstanding(p_invoice_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(0, COALESCE(total_cents,0)::bigint - COALESCE(paid_amount_cents,0))
  FROM public.invoices WHERE id = p_invoice_id;
$$;

GRANT EXECUTE ON FUNCTION public.invoice_outstanding(UUID) TO authenticated;

-- ============================================================
-- reconcile_invoice_payments
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_invoice_payments(
  p_invoice_id UUID,
  p_bank_transaction_ids UUID[],
  p_notes TEXT DEFAULT NULL
)
RETURNS public.payment_reconciliations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_total BIGINT;
  v_already_paid BIGINT;
  v_remaining BIGINT;
  v_sum BIGINT := 0;
  v_apply BIGINT := 0;
  v_tx public.bank_transactions;
  v_tx_id UUID;
  v_tx_remaining BIGINT;
  v_tx_total_matched BIGINT;
  v_rec public.payment_reconciliations;
  v_journal_id UUID;
  v_je_id UUID;
  v_match_amount BIGINT;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role)
       OR public.has_role(auth.uid(),'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can reconcile payments';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.status::text = 'cancelled' THEN RAISE EXCEPTION 'Cannot reconcile cancelled invoice'; END IF;

  v_total := COALESCE(v_invoice.total_cents,0)::bigint;
  v_already_paid := COALESCE(v_invoice.paid_amount_cents,0);
  v_remaining := GREATEST(0, v_total - v_already_paid);

  IF v_remaining = 0 THEN RAISE EXCEPTION 'Invoice already fully reconciled'; END IF;
  IF p_bank_transaction_ids IS NULL OR array_length(p_bank_transaction_ids,1) IS NULL THEN
    RAISE EXCEPTION 'No bank transactions provided';
  END IF;

  -- Create the reconciliation group (status filled in later)
  INSERT INTO public.payment_reconciliations (
    invoice_id, status, reconciled_amount_cents, invoice_total_cents,
    currency, reconciled_by, notes
  )
  VALUES (
    p_invoice_id, 'partial', 0, v_total, v_invoice.currency, auth.uid(), p_notes
  )
  RETURNING * INTO v_rec;

  -- Walk through bank transactions, allocate up to remaining amount each
  FOREACH v_tx_id IN ARRAY p_bank_transaction_ids LOOP
    SELECT * INTO v_tx FROM public.bank_transactions WHERE id = v_tx_id FOR UPDATE;
    IF v_tx.id IS NULL THEN
      RAISE EXCEPTION 'Bank transaction % not found', v_tx_id;
    END IF;

    IF v_tx.currency <> v_invoice.currency THEN
      RAISE EXCEPTION 'Currency mismatch: invoice % vs transaction %', v_invoice.currency, v_tx.currency
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_tx.amount_cents <= 0 THEN
      RAISE EXCEPTION 'Bank transaction % has non-positive amount (%); refunds must be reconciled separately',
        v_tx_id, v_tx.amount_cents
        USING ERRCODE = 'check_violation';
    END IF;

    -- residual on this tx
    SELECT COALESCE(SUM(ABS(amount_cents)),0) INTO v_tx_total_matched
    FROM public.reconciliation_matches WHERE bank_transaction_id = v_tx_id;
    v_tx_remaining := GREATEST(0, ABS(v_tx.amount_cents) - v_tx_total_matched);

    IF v_tx_remaining = 0 THEN
      RAISE EXCEPTION 'Bank transaction % is already fully matched', v_tx_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_apply := LEAST(v_tx_remaining, v_remaining - v_sum);
    EXIT WHEN v_apply <= 0;

    INSERT INTO public.reconciliation_matches (
      bank_transaction_id, entity_type, entity_id, amount_cents,
      match_type, confidence, reconciliation_id, created_by
    ) VALUES (
      v_tx_id, 'invoice', p_invoice_id, v_apply,
      'manual', 1.0, v_rec.id, auth.uid()
    );

    v_sum := v_sum + v_apply;
    EXIT WHEN v_sum >= v_remaining;
  END LOOP;

  IF v_sum = 0 THEN
    DELETE FROM public.payment_reconciliations WHERE id = v_rec.id;
    RAISE EXCEPTION 'No amount could be allocated (all transactions exhausted)';
  END IF;

  -- Post bookkeeping in BANK journal
  SELECT id INTO v_journal_id FROM public.journals WHERE code = 'BANK' AND is_active = true LIMIT 1;

  INSERT INTO public.journal_entries (
    entry_date, description, reference_number, status, source,
    invoice_id, journal_id, created_by
  ) VALUES (
    CURRENT_DATE,
    'Reconciliation — ' || COALESCE(v_invoice.invoice_number, v_invoice.id::text),
    v_invoice.invoice_number,
    'posted', 'reconciliation',
    p_invoice_id, v_journal_id, auth.uid()
  ) RETURNING id INTO v_je_id;

  v_match_amount := v_sum;
  -- Debit 1930 Bank, Credit 1510 Kundfordringar
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents, description) VALUES
    (v_je_id, '1930', 'Företagskonto / Bank', v_match_amount, 0, 'Payment received'),
    (v_je_id, '1510', 'Kundfordringar', 0, v_match_amount, 'Settle receivable');

  -- Update invoice
  UPDATE public.invoices
  SET paid_amount_cents = v_already_paid + v_match_amount,
      reconciliation_id = v_rec.id,
      status = CASE
        WHEN v_already_paid + v_match_amount >= v_total THEN 'paid'::invoice_status
        ELSE COALESCE(NULLIF(status::text,'draft'), 'sent')::invoice_status
      END,
      paid_at = CASE
        WHEN v_already_paid + v_match_amount >= v_total THEN now()
        ELSE paid_at
      END,
      updated_at = now()
  WHERE id = p_invoice_id;

  -- Finalize the group
  UPDATE public.payment_reconciliations
  SET reconciled_amount_cents = v_match_amount,
      status = CASE WHEN v_already_paid + v_match_amount >= v_total THEN 'full' ELSE 'partial' END,
      journal_entry_id = v_je_id,
      updated_at = now()
  WHERE id = v_rec.id
  RETURNING * INTO v_rec;

  RETURN v_rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_invoice_payments(UUID, UUID[], TEXT) TO authenticated;

-- ============================================================
-- unreconcile_payment — reverse a reconciliation group
-- ============================================================
CREATE OR REPLACE FUNCTION public.unreconcile_payment(
  p_reconciliation_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.payment_reconciliations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec public.payment_reconciliations;
  v_invoice public.invoices;
  v_journal_id UUID;
  v_rev_je UUID;
  v_amount BIGINT;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin'::public.app_role)
       OR public.has_role(auth.uid(),'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can unreconcile payments';
  END IF;

  SELECT * INTO v_rec FROM public.payment_reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;
  IF v_rec.status = 'reversed' THEN RAISE EXCEPTION 'Already reversed'; END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_rec.invoice_id FOR UPDATE;

  v_amount := v_rec.reconciled_amount_cents;

  -- Detach matches (preserve audit by keeping rows but clearing reconciliation_id and zeroing amount)
  DELETE FROM public.reconciliation_matches WHERE reconciliation_id = p_reconciliation_id;

  -- Reverse the journal entry (book opposite side)
  IF v_rec.journal_entry_id IS NOT NULL THEN
    SELECT id INTO v_journal_id FROM public.journals WHERE code = 'BANK' AND is_active = true LIMIT 1;
    INSERT INTO public.journal_entries (
      entry_date, description, reference_number, status, source,
      invoice_id, journal_id, created_by
    ) VALUES (
      CURRENT_DATE,
      'Reversal of reconciliation ' || p_reconciliation_id::text || COALESCE(' — ' || p_reason, ''),
      v_invoice.invoice_number,
      'posted', 'reconciliation_reversal',
      v_invoice.id, v_journal_id, auth.uid()
    ) RETURNING id INTO v_rev_je;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents, description) VALUES
      (v_rev_je, '1510', 'Kundfordringar', v_amount, 0, 'Reverse settle'),
      (v_rev_je, '1930', 'Företagskonto / Bank', 0, v_amount, 'Reverse payment');
  END IF;

  -- Restore invoice paid amount
  UPDATE public.invoices
  SET paid_amount_cents = GREATEST(0, COALESCE(paid_amount_cents,0) - v_amount),
      reconciliation_id = NULL,
      status = CASE
        WHEN GREATEST(0, COALESCE(paid_amount_cents,0) - v_amount) >= COALESCE(total_cents,0) THEN status
        WHEN status::text = 'paid' THEN 'sent'::invoice_status
        ELSE status
      END,
      paid_at = CASE
        WHEN GREATEST(0, COALESCE(paid_amount_cents,0) - v_amount) < COALESCE(total_cents,0) THEN NULL
        ELSE paid_at
      END,
      updated_at = now()
  WHERE id = v_invoice.id;

  -- Mark group as reversed
  UPDATE public.payment_reconciliations
  SET status = 'reversed',
      reversed_by = auth.uid(),
      reversed_at = now(),
      reversal_reason = p_reason,
      reversal_journal_entry_id = v_rev_je,
      updated_at = now()
  WHERE id = p_reconciliation_id
  RETURNING * INTO v_rec;

  RETURN v_rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unreconcile_payment(UUID, TEXT) TO authenticated;

-- ============================================================
-- Test runner — runs in implicit tx, rolled back at end
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_reconciliation_tests()
RETURNS TABLE (test_name TEXT, passed BOOLEAN, detail TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_inv_a UUID := 'aaaaaaa1-0000-0000-0000-000000000001';
  v_inv_b UUID := 'aaaaaaa1-0000-0000-0000-000000000002';
  v_inv_c UUID := 'aaaaaaa1-0000-0000-0000-000000000003';
  v_inv_eur UUID := 'aaaaaaa1-0000-0000-0000-000000000004';
  v_tx1 UUID := 'bbbbbbb1-0000-0000-0000-000000000001';
  v_tx2 UUID := 'bbbbbbb1-0000-0000-0000-000000000002';
  v_tx3 UUID := 'bbbbbbb1-0000-0000-0000-000000000003';
  v_tx_neg UUID := 'bbbbbbb1-0000-0000-0000-000000000004';
  v_tx_eur UUID := 'bbbbbbb1-0000-0000-0000-000000000005';
  v_rec public.payment_reconciliations;
  v_inv public.invoices;
  v_outstanding BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can run reconciliation tests';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rr (test_name TEXT, passed BOOLEAN, detail TEXT) ON COMMIT DROP;
  TRUNCATE _rr;

  -- Seed invoices (10000, 10000, 10000 SEK; 5000 EUR)
  INSERT INTO public.invoices (id, invoice_number, customer_name, total_cents, subtotal_cents, currency, issue_date, due_date, status)
  VALUES
    (v_inv_a, '__T-A', 'Test A', 10000, 10000, 'SEK', CURRENT_DATE, CURRENT_DATE+30, 'sent'),
    (v_inv_b, '__T-B', 'Test B', 10000, 10000, 'SEK', CURRENT_DATE, CURRENT_DATE+30, 'sent'),
    (v_inv_c, '__T-C', 'Test C', 10000, 10000, 'SEK', CURRENT_DATE, CURRENT_DATE+30, 'sent'),
    (v_inv_eur, '__T-EUR', 'Test EUR', 5000, 5000, 'EUR', CURRENT_DATE, CURRENT_DATE+30, 'sent')
  ON CONFLICT (id) DO UPDATE SET total_cents = EXCLUDED.total_cents, paid_amount_cents = 0, reconciliation_id = NULL, status = 'sent', paid_at = NULL;

  INSERT INTO public.bank_transactions (id, source, transaction_date, amount_cents, currency, status)
  VALUES
    (v_tx1, 'manual', CURRENT_DATE,  4000, 'SEK', 'unmatched'),
    (v_tx2, 'manual', CURRENT_DATE,  6000, 'SEK', 'unmatched'),
    (v_tx3, 'manual', CURRENT_DATE, 15000, 'SEK', 'unmatched'),
    (v_tx_neg, 'manual', CURRENT_DATE, -3000, 'SEK', 'unmatched'),
    (v_tx_eur, 'manual', CURRENT_DATE,  5000, 'EUR', 'unmatched')
  ON CONFLICT (id) DO UPDATE SET amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency, status = 'unmatched', matched_amount_cents = 0;

  -- Clean prior matches
  DELETE FROM public.reconciliation_matches WHERE bank_transaction_id IN (v_tx1, v_tx2, v_tx3, v_tx_neg, v_tx_eur);
  DELETE FROM public.payment_reconciliations WHERE invoice_id IN (v_inv_a, v_inv_b, v_inv_c, v_inv_eur);

  -- 01: Partial payment 4000 / 10000 → status partial, outstanding 6000
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_a, ARRAY[v_tx1], 'partial test');
    v_outstanding := public.invoice_outstanding(v_inv_a);
    INSERT INTO _rr VALUES ('01_partial_payment',
      v_rec.status='partial' AND v_rec.reconciled_amount_cents=4000 AND v_outstanding=6000,
      'status='||v_rec.status||' rec='||v_rec.reconciled_amount_cents||' outstanding='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('01_partial_payment', false, 'err: '||SQLERRM); END;

  -- 02: Second partial 6000 → status full, outstanding 0
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_a, ARRAY[v_tx2], 'finish');
    v_outstanding := public.invoice_outstanding(v_inv_a);
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_a;
    INSERT INTO _rr VALUES ('02_complete_with_second',
      v_rec.status='full' AND v_outstanding=0 AND v_inv.status::text='paid' AND v_inv.paid_at IS NOT NULL,
      'inv_status='||v_inv.status::text||' outstanding='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('02_complete_with_second', false, 'err: '||SQLERRM); END;

  -- 03: Cannot reconcile fully-paid invoice
  BEGIN
    PERFORM public.reconcile_invoice_payments(v_inv_a, ARRAY[v_tx3]);
    INSERT INTO _rr VALUES ('03_block_already_paid', false, 'expected exception');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('03_block_already_paid', true, 'blocked: '||SQLERRM); END;

  -- 04: Over-payment — tx 15000 against 10000 invoice → only 10000 allocated, full
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_b, ARRAY[v_tx3], 'overpay');
    v_outstanding := public.invoice_outstanding(v_inv_b);
    INSERT INTO _rr VALUES ('04_over_payment_caps',
      v_rec.reconciled_amount_cents=10000 AND v_rec.status='full' AND v_outstanding=0,
      'allocated='||v_rec.reconciled_amount_cents);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('04_over_payment_caps', false, 'err: '||SQLERRM); END;

  -- 05: Tx residual after over-pay = 5000, can be applied to inv_c
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_c, ARRAY[v_tx3], 'use residual');
    INSERT INTO _rr VALUES ('05_tx_residual_reused',
      v_rec.reconciled_amount_cents=5000 AND v_rec.status='partial',
      'allocated='||v_rec.reconciled_amount_cents||' status='||v_rec.status);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('05_tx_residual_reused', false, 'err: '||SQLERRM); END;

  -- 06: Currency mismatch
  BEGIN
    PERFORM public.reconcile_invoice_payments(v_inv_c, ARRAY[v_tx_eur]);
    INSERT INTO _rr VALUES ('06_currency_mismatch_blocked', false, 'expected exception');
  EXCEPTION WHEN check_violation THEN INSERT INTO _rr VALUES ('06_currency_mismatch_blocked', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _rr VALUES ('06_currency_mismatch_blocked', false, 'wrong: '||SQLERRM); END;

  -- 07: Negative amount (refund) blocked
  BEGIN
    PERFORM public.reconcile_invoice_payments(v_inv_c, ARRAY[v_tx_neg]);
    INSERT INTO _rr VALUES ('07_negative_amount_blocked', false, 'expected exception');
  EXCEPTION WHEN check_violation THEN INSERT INTO _rr VALUES ('07_negative_amount_blocked', true, 'blocked');
  WHEN OTHERS THEN INSERT INTO _rr VALUES ('07_negative_amount_blocked', false, 'wrong: '||SQLERRM); END;

  -- 08: Unreconcile inv_b (full reverse) → status reversed, invoice back to sent, outstanding 10000
  BEGIN
    SELECT pr.* INTO v_rec FROM public.payment_reconciliations pr WHERE invoice_id = v_inv_b ORDER BY created_at DESC LIMIT 1;
    v_rec := public.unreconcile_payment(v_rec.id, 'test reversal');
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_b;
    v_outstanding := public.invoice_outstanding(v_inv_b);
    INSERT INTO _rr VALUES ('08_unreconcile_full',
      v_rec.status='reversed' AND v_inv.status::text='sent' AND v_inv.paid_at IS NULL AND v_outstanding=10000,
      'inv_status='||v_inv.status::text||' outstanding='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('08_unreconcile_full', false, 'err: '||SQLERRM); END;

  -- 09: Reversal posted reversal_journal_entry
  BEGIN
    SELECT pr.* INTO v_rec FROM public.payment_reconciliations pr WHERE invoice_id = v_inv_b AND status='reversed' ORDER BY created_at DESC LIMIT 1;
    INSERT INTO _rr VALUES ('09_reversal_posts_journal',
      v_rec.reversal_journal_entry_id IS NOT NULL,
      'rev_je='||COALESCE(v_rec.reversal_journal_entry_id::text,'NULL'));
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('09_reversal_posts_journal', false, 'err: '||SQLERRM); END;

  -- 10: Cannot unreconcile twice
  BEGIN
    SELECT pr.* INTO v_rec FROM public.payment_reconciliations pr WHERE invoice_id = v_inv_b AND status='reversed' LIMIT 1;
    PERFORM public.unreconcile_payment(v_rec.id);
    INSERT INTO _rr VALUES ('10_double_reversal_blocked', false, 'expected exception');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('10_double_reversal_blocked', true, 'blocked: '||SQLERRM); END;

  -- 11: After reversal, tx_b (15000) residual is back to 15000 (5000 still allocated to inv_c, so residual = 10000)
  BEGIN
    SELECT COALESCE(SUM(amount_cents),0) INTO v_outstanding FROM public.reconciliation_matches WHERE bank_transaction_id = v_tx3;
    INSERT INTO _rr VALUES ('11_tx_residual_after_reversal',
      v_outstanding = 5000,
      'tx_matched_total='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('11_tx_residual_after_reversal', false, 'err: '||SQLERRM); END;

  -- 12: Multi-tx single call — inv_b (now 10000 outstanding) paid by tx3-residual (10000) in one call → full
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_b, ARRAY[v_tx3], 'second pass');
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_b;
    INSERT INTO _rr VALUES ('12_reconcile_after_reversal',
      v_rec.status='full' AND v_inv.status::text='paid',
      'rec_status='||v_rec.status||' inv_status='||v_inv.status::text);
  EXCEPTION WHEN OTHERS THEN INSERT INTO _rr VALUES ('12_reconcile_after_reversal', false, 'err: '||SQLERRM); END;

  RETURN QUERY SELECT * FROM _rr ORDER BY test_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_reconciliation_tests() TO authenticated;