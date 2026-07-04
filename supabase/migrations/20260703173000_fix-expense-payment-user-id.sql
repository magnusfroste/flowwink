-- Fix mark_expense_report_paid: expense_payments.user_id is NOT NULL, but the
-- 20260610094500 fix migration's INSERT never supplied it, so "mark as paid"
-- failed with a not-null violation even after that migration's other fixes
-- (source_id -> source, entry_id -> journal_entry_id, dropped paid_at).
-- Found while resyncing a live instance whose migration ledger had skipped
-- both prior fixes and a user reported "can't mark as paid" errors.
--
-- user_id = the expense report's owner (the employee being reimbursed);
-- recorded_by = the caller who executed the payment (nullable, auth.uid()).
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.mark_expense_report_paid(p_report_id uuid, p_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text, p_paid_at date DEFAULT NULL::date, p_bank_account text DEFAULT '1930'::text, p_liability_account text DEFAULT '2890'::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_total_cents bigint;
  v_entry_id uuid;
  v_payment_id uuid;
  v_date date;
BEGIN
  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;
  IF v_report.status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only booked reports can be marked paid');
  END IF;

  SELECT COALESCE(SUM(amount_cents),0) INTO v_total_cents
  FROM expenses WHERE report_id = p_report_id;

  v_date := COALESCE(p_paid_at, CURRENT_DATE);

  INSERT INTO journal_entries (entry_date, description, source, status)
  VALUES (v_date, 'Payment of expense report ' || p_report_id::text, 'expense_payment', 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES
    (v_entry_id, p_liability_account, v_total_cents, 0, 'Settle liability'),
    (v_entry_id, p_bank_account, 0, v_total_cents, 'Bank payment');

  INSERT INTO expense_payments (report_id, user_id, amount_cents, method, reference, paid_at, journal_entry_id, notes, recorded_by)
  VALUES (p_report_id, v_report.user_id, v_total_cents, p_method::text, p_reference, v_date, v_entry_id, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  UPDATE expense_reports
  SET status = 'paid'
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'payment_id', v_payment_id, 'journal_entry_id', v_entry_id);
END;
$function$;
