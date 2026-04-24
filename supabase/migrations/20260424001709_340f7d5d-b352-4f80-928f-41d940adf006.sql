
CREATE OR REPLACE FUNCTION public.reconcile_invoice_payments(
  p_invoice_id UUID,
  p_bank_transaction_ids UUID[],
  p_notes TEXT DEFAULT NULL,
  p_skip_auth BOOLEAN DEFAULT false
)
RETURNS public.payment_reconciliations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_total BIGINT; v_already_paid BIGINT; v_remaining BIGINT;
  v_sum BIGINT := 0; v_apply BIGINT := 0;
  v_tx public.bank_transactions; v_tx_id UUID;
  v_tx_remaining BIGINT; v_tx_total_matched BIGINT;
  v_rec public.payment_reconciliations;
  v_journal_id UUID; v_je_id UUID; v_match_amount BIGINT;
  v_matched_tx_ids UUID[] := ARRAY[]::UUID[];
  v_match_details JSONB := '[]'::jsonb;
BEGIN
  IF NOT p_skip_auth AND NOT (public.has_role(auth.uid(),'admin'::public.app_role)
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

  INSERT INTO public.payment_reconciliations (invoice_id, status, reconciled_amount_cents, invoice_total_cents, currency, reconciled_by, notes)
  VALUES (p_invoice_id, 'partial', 0, v_total, v_invoice.currency, auth.uid(), p_notes)
  RETURNING * INTO v_rec;

  -- Audit: reconciliation.created
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('reconciliation.created','payment_reconciliation', v_rec.id, auth.uid(),
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'invoice_total_cents', v_total,
      'remaining_cents', v_remaining,
      'currency', v_invoice.currency,
      'bank_transaction_ids', to_jsonb(p_bank_transaction_ids),
      'notes', p_notes
    ));

  FOREACH v_tx_id IN ARRAY p_bank_transaction_ids LOOP
    SELECT * INTO v_tx FROM public.bank_transactions WHERE id = v_tx_id FOR UPDATE;
    IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Bank transaction % not found', v_tx_id; END IF;
    IF v_tx.currency <> v_invoice.currency THEN
      RAISE EXCEPTION 'Currency mismatch: invoice % vs transaction %', v_invoice.currency, v_tx.currency
        USING ERRCODE='check_violation';
    END IF;
    IF v_tx.amount_cents <= 0 THEN
      RAISE EXCEPTION 'Bank transaction % has non-positive amount (%); refunds must be reconciled separately',
        v_tx_id, v_tx.amount_cents USING ERRCODE='check_violation';
    END IF;

    SELECT COALESCE(SUM(ABS(amount_cents)),0) INTO v_tx_total_matched
    FROM public.reconciliation_matches WHERE bank_transaction_id = v_tx_id;
    v_tx_remaining := GREATEST(0, ABS(v_tx.amount_cents) - v_tx_total_matched);

    IF v_tx_remaining = 0 THEN
      RAISE EXCEPTION 'Bank transaction % is already fully matched', v_tx_id USING ERRCODE='check_violation';
    END IF;

    v_apply := LEAST(v_tx_remaining, v_remaining - v_sum);
    EXIT WHEN v_apply <= 0;

    INSERT INTO public.reconciliation_matches (bank_transaction_id, entity_type, entity_id, amount_cents, match_type, confidence, reconciliation_id, created_by)
    VALUES (v_tx_id, 'invoice', p_invoice_id, v_apply, 'manual', 1.0, v_rec.id, auth.uid());

    -- Audit: reconciliation.match_added (per transaktion)
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES ('reconciliation.match_added','payment_reconciliation', v_rec.id, auth.uid(),
      jsonb_build_object(
        'invoice_id', p_invoice_id,
        'bank_transaction_id', v_tx_id,
        'amount_cents', v_apply,
        'tx_remaining_before_cents', v_tx_remaining,
        'currency', v_invoice.currency
      ));

    v_matched_tx_ids := v_matched_tx_ids || v_tx_id;
    v_match_details := v_match_details || jsonb_build_object('bank_transaction_id', v_tx_id, 'amount_cents', v_apply);

    v_sum := v_sum + v_apply;
    EXIT WHEN v_sum >= v_remaining;
  END LOOP;

  IF v_sum = 0 THEN
    DELETE FROM public.payment_reconciliations WHERE id = v_rec.id;
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES ('reconciliation.aborted','payment_reconciliation', v_rec.id, auth.uid(),
      jsonb_build_object('invoice_id', p_invoice_id, 'reason','no_amount_allocated','bank_transaction_ids', to_jsonb(p_bank_transaction_ids)));
    RAISE EXCEPTION 'No amount could be allocated';
  END IF;

  SELECT id INTO v_journal_id FROM public.journals WHERE code='BANK' AND is_active=true LIMIT 1;
  INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source, invoice_id, journal_id, created_by)
  VALUES (CURRENT_DATE, 'Reconciliation — '||COALESCE(v_invoice.invoice_number,v_invoice.id::text), v_invoice.invoice_number, 'posted', 'reconciliation', p_invoice_id, v_journal_id, auth.uid())
  RETURNING id INTO v_je_id;

  v_match_amount := v_sum;
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents, description) VALUES
    (v_je_id,'1930','Företagskonto / Bank',v_match_amount,0,'Payment received'),
    (v_je_id,'1510','Kundfordringar',0,v_match_amount,'Settle receivable');

  UPDATE public.invoices SET
    paid_amount_cents = v_already_paid + v_match_amount,
    reconciliation_id = v_rec.id,
    status = CASE WHEN v_already_paid + v_match_amount >= v_total THEN 'paid'::invoice_status ELSE COALESCE(NULLIF(status::text,'draft'),'sent')::invoice_status END,
    paid_at = CASE WHEN v_already_paid + v_match_amount >= v_total THEN now() ELSE paid_at END,
    updated_at = now()
  WHERE id = p_invoice_id;

  UPDATE public.payment_reconciliations SET
    reconciled_amount_cents = v_match_amount,
    status = CASE WHEN v_already_paid + v_match_amount >= v_total THEN 'full' ELSE 'partial' END,
    journal_entry_id = v_je_id, updated_at = now()
  WHERE id = v_rec.id RETURNING * INTO v_rec;

  -- Audit: reconciliation.completed (full eller partial)
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES (
    CASE WHEN v_rec.status='full' THEN 'reconciliation.completed_full' ELSE 'reconciliation.completed_partial' END,
    'payment_reconciliation', v_rec.id, auth.uid(),
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'invoice_number', v_invoice.invoice_number,
      'reconciled_amount_cents', v_match_amount,
      'invoice_total_cents', v_total,
      'paid_amount_cents_after', v_already_paid + v_match_amount,
      'outstanding_cents_after', GREATEST(0, v_total - (v_already_paid + v_match_amount)),
      'matched_bank_transaction_ids', to_jsonb(v_matched_tx_ids),
      'matches', v_match_details,
      'journal_entry_id', v_je_id,
      'currency', v_invoice.currency,
      'notes', p_notes
    ));

  RETURN v_rec;
END;
$$;

CREATE OR REPLACE FUNCTION public.unreconcile_payment(
  p_reconciliation_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_skip_auth BOOLEAN DEFAULT false
)
RETURNS public.payment_reconciliations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec public.payment_reconciliations;
  v_invoice public.invoices;
  v_journal_id UUID; v_rev_je UUID; v_amount BIGINT;
  v_freed_tx_ids UUID[];
BEGIN
  IF NOT p_skip_auth AND NOT (public.has_role(auth.uid(),'admin'::public.app_role)
       OR public.has_role(auth.uid(),'approver'::public.app_role)) THEN
    RAISE EXCEPTION 'Only admins/approvers can unreconcile payments';
  END IF;

  SELECT * INTO v_rec FROM public.payment_reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF v_rec.id IS NULL THEN RAISE EXCEPTION 'Reconciliation not found'; END IF;
  IF v_rec.status='reversed' THEN RAISE EXCEPTION 'Already reversed'; END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_rec.invoice_id FOR UPDATE;
  v_amount := v_rec.reconciled_amount_cents;

  SELECT COALESCE(array_agg(DISTINCT bank_transaction_id), ARRAY[]::UUID[])
    INTO v_freed_tx_ids
  FROM public.reconciliation_matches WHERE reconciliation_id = p_reconciliation_id;

  DELETE FROM public.reconciliation_matches WHERE reconciliation_id = p_reconciliation_id;

  IF v_rec.journal_entry_id IS NOT NULL THEN
    SELECT id INTO v_journal_id FROM public.journals WHERE code='BANK' AND is_active=true LIMIT 1;
    INSERT INTO public.journal_entries (entry_date, description, reference_number, status, source, invoice_id, journal_id, created_by)
    VALUES (CURRENT_DATE, 'Reversal of reconciliation '||p_reconciliation_id::text||COALESCE(' — '||p_reason,''), v_invoice.invoice_number, 'posted','reconciliation_reversal', v_invoice.id, v_journal_id, auth.uid())
    RETURNING id INTO v_rev_je;

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents, description) VALUES
      (v_rev_je,'1510','Kundfordringar',v_amount,0,'Reverse settle'),
      (v_rev_je,'1930','Företagskonto / Bank',0,v_amount,'Reverse payment');
  END IF;

  UPDATE public.invoices SET
    paid_amount_cents = GREATEST(0, COALESCE(paid_amount_cents,0) - v_amount),
    reconciliation_id = NULL,
    status = CASE WHEN status::text='paid' THEN 'sent'::invoice_status ELSE status END,
    paid_at = NULL,
    updated_at = now()
  WHERE id = v_invoice.id;

  UPDATE public.payment_reconciliations SET
    status='reversed', reversed_by=auth.uid(), reversed_at=now(), reversal_reason=p_reason,
    reversal_journal_entry_id=v_rev_je, updated_at=now()
  WHERE id = p_reconciliation_id RETURNING * INTO v_rec;

  -- Audit: reconciliation.unreconciled
  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('reconciliation.unreconciled','payment_reconciliation', v_rec.id, auth.uid(),
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'reversed_amount_cents', v_amount,
      'freed_bank_transaction_ids', to_jsonb(v_freed_tx_ids),
      'reversal_journal_entry_id', v_rev_je,
      'original_journal_entry_id', v_rec.journal_entry_id,
      'currency', v_rec.currency,
      'reason', p_reason,
      'notes', v_rec.notes
    ));

  RETURN v_rec;
END;
$$;
