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
  v_results JSONB := '[]'::jsonb;
  v_item JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can run reconciliation tests';
  END IF;

  -- Seed
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

  DELETE FROM public.reconciliation_matches WHERE bank_transaction_id IN (v_tx1, v_tx2, v_tx3, v_tx_neg, v_tx_eur);
  DELETE FROM public.payment_reconciliations WHERE invoice_id IN (v_inv_a, v_inv_b, v_inv_c, v_inv_eur);

  -- 01
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_a, ARRAY[v_tx1], 'partial test');
    v_outstanding := public.invoice_outstanding(v_inv_a);
    v_item := jsonb_build_object('test_name','01_partial_payment',
      'passed', v_rec.status='partial' AND v_rec.reconciled_amount_cents=4000 AND v_outstanding=6000,
      'detail','status='||v_rec.status||' rec='||v_rec.reconciled_amount_cents||' out='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','01_partial_payment','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 02
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_a, ARRAY[v_tx2], 'finish');
    v_outstanding := public.invoice_outstanding(v_inv_a);
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_a;
    v_item := jsonb_build_object('test_name','02_complete_with_second',
      'passed', v_rec.status='full' AND v_outstanding=0 AND v_inv.status::text='paid' AND v_inv.paid_at IS NOT NULL,
      'detail','inv='||v_inv.status::text||' out='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','02_complete_with_second','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 03
  BEGIN
    PERFORM public.reconcile_invoice_payments(v_inv_a, ARRAY[v_tx3]);
    v_item := jsonb_build_object('test_name','03_block_already_paid','passed',false,'detail','expected exception');
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','03_block_already_paid','passed',true,'detail','blocked'); END;
  v_results := v_results || v_item;

  -- 04
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_b, ARRAY[v_tx3], 'overpay');
    v_outstanding := public.invoice_outstanding(v_inv_b);
    v_item := jsonb_build_object('test_name','04_over_payment_caps',
      'passed', v_rec.reconciled_amount_cents=10000 AND v_rec.status='full' AND v_outstanding=0,
      'detail','allocated='||v_rec.reconciled_amount_cents);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','04_over_payment_caps','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 05
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_c, ARRAY[v_tx3], 'use residual');
    v_item := jsonb_build_object('test_name','05_tx_residual_reused',
      'passed', v_rec.reconciled_amount_cents=5000 AND v_rec.status='partial',
      'detail','allocated='||v_rec.reconciled_amount_cents||' status='||v_rec.status);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','05_tx_residual_reused','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 06
  BEGIN
    PERFORM public.reconcile_invoice_payments(v_inv_c, ARRAY[v_tx_eur]);
    v_item := jsonb_build_object('test_name','06_currency_mismatch_blocked','passed',false,'detail','expected exception');
  EXCEPTION WHEN check_violation THEN v_item := jsonb_build_object('test_name','06_currency_mismatch_blocked','passed',true,'detail','blocked');
  WHEN OTHERS THEN v_item := jsonb_build_object('test_name','06_currency_mismatch_blocked','passed',false,'detail','wrong: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 07
  BEGIN
    PERFORM public.reconcile_invoice_payments(v_inv_c, ARRAY[v_tx_neg]);
    v_item := jsonb_build_object('test_name','07_negative_amount_blocked','passed',false,'detail','expected exception');
  EXCEPTION WHEN check_violation THEN v_item := jsonb_build_object('test_name','07_negative_amount_blocked','passed',true,'detail','blocked');
  WHEN OTHERS THEN v_item := jsonb_build_object('test_name','07_negative_amount_blocked','passed',false,'detail','wrong: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 08
  BEGIN
    SELECT pr.* INTO v_rec FROM public.payment_reconciliations pr WHERE invoice_id = v_inv_b ORDER BY created_at DESC LIMIT 1;
    v_rec := public.unreconcile_payment(v_rec.id, 'test reversal');
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_b;
    v_outstanding := public.invoice_outstanding(v_inv_b);
    v_item := jsonb_build_object('test_name','08_unreconcile_full',
      'passed', v_rec.status='reversed' AND v_inv.status::text='sent' AND v_inv.paid_at IS NULL AND v_outstanding=10000,
      'detail','inv='||v_inv.status::text||' out='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','08_unreconcile_full','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 09
  BEGIN
    SELECT pr.* INTO v_rec FROM public.payment_reconciliations pr WHERE invoice_id = v_inv_b AND status='reversed' ORDER BY created_at DESC LIMIT 1;
    v_item := jsonb_build_object('test_name','09_reversal_posts_journal',
      'passed', v_rec.reversal_journal_entry_id IS NOT NULL,
      'detail','rev_je='||COALESCE(v_rec.reversal_journal_entry_id::text,'NULL'));
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','09_reversal_posts_journal','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 10
  BEGIN
    SELECT pr.* INTO v_rec FROM public.payment_reconciliations pr WHERE invoice_id = v_inv_b AND status='reversed' LIMIT 1;
    PERFORM public.unreconcile_payment(v_rec.id);
    v_item := jsonb_build_object('test_name','10_double_reversal_blocked','passed',false,'detail','expected exception');
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','10_double_reversal_blocked','passed',true,'detail','blocked'); END;
  v_results := v_results || v_item;

  -- 11
  BEGIN
    SELECT COALESCE(SUM(amount_cents),0) INTO v_outstanding FROM public.reconciliation_matches WHERE bank_transaction_id = v_tx3;
    v_item := jsonb_build_object('test_name','11_tx_residual_after_reversal',
      'passed', v_outstanding = 5000,
      'detail','tx_matched_total='||v_outstanding);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','11_tx_residual_after_reversal','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- 12
  BEGIN
    v_rec := public.reconcile_invoice_payments(v_inv_b, ARRAY[v_tx3], 'second pass');
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_inv_b;
    v_item := jsonb_build_object('test_name','12_reconcile_after_reversal',
      'passed', v_rec.status='full' AND v_inv.status::text='paid',
      'detail','rec='||v_rec.status||' inv='||v_inv.status::text);
  EXCEPTION WHEN OTHERS THEN v_item := jsonb_build_object('test_name','12_reconcile_after_reversal','passed',false,'detail','err: '||SQLERRM); END;
  v_results := v_results || v_item;

  -- Cleanup so the function is idempotent
  DELETE FROM public.payment_reconciliations WHERE invoice_id IN (v_inv_a, v_inv_b, v_inv_c, v_inv_eur);
  DELETE FROM public.reconciliation_matches WHERE bank_transaction_id IN (v_tx1, v_tx2, v_tx3, v_tx_neg, v_tx_eur);
  DELETE FROM public.journal_entry_lines WHERE journal_entry_id IN (
    SELECT id FROM public.journal_entries WHERE invoice_id IN (v_inv_a, v_inv_b, v_inv_c, v_inv_eur)
  );
  DELETE FROM public.journal_entries WHERE invoice_id IN (v_inv_a, v_inv_b, v_inv_c, v_inv_eur);
  DELETE FROM public.bank_transactions WHERE id IN (v_tx1, v_tx2, v_tx3, v_tx_neg, v_tx_eur);
  DELETE FROM public.invoices WHERE id IN (v_inv_a, v_inv_b, v_inv_c, v_inv_eur);

  RETURN QUERY
  SELECT
    (r->>'test_name')::TEXT,
    (r->>'passed')::BOOLEAN,
    (r->>'detail')::TEXT
  FROM jsonb_array_elements(v_results) AS r
  ORDER BY 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_reconciliation_tests() TO authenticated;