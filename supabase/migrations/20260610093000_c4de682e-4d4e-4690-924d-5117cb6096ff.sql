-- Fix book_expense_report: it was written against an OLD journal schema and
-- never updated, so booking an approved expense report failed entirely (the
-- record-to-report expense path was dead). FOUR mismatches vs the current schema:
--   1. INSERT journal_entry_lines (entry_id, …)  → column is journal_entry_id
--   2. INSERT journal_entries (…, source_id, …)  → no source_id column exists
--   3. journal_entry_lines.account_name is NOT NULL but was never supplied
--   4. UPDATE expense_reports SET booked_at … → no booked_at column exists
--
-- Fix: use journal_entry_id; drop the non-existent source_id (the link is the
-- reverse expense_reports.journal_entry_id + source='expense_report'); look up
-- account_name from chart_of_accounts; track booking via status + journal_entry_id
-- (no booked_at). Net debit + input-VAT debit = total debit,
-- liability credit = total → the entry balances. Idempotent CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.book_expense_report(
  p_report_id uuid,
  p_expense_account text DEFAULT '5410',
  p_vat_account text DEFAULT '2641',
  p_liability_account text DEFAULT '2890',
  p_entry_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_total_cents bigint;
  v_vat_cents bigint;
  v_net_cents bigint;
  v_entry_id uuid;
  v_date date;
BEGIN
  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;
  IF v_report.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved reports can be booked');
  END IF;

  SELECT COALESCE(SUM(amount_cents),0), COALESCE(SUM(vat_cents),0)
  INTO v_total_cents, v_vat_cents
  FROM expenses WHERE report_id = p_report_id;

  v_net_cents := v_total_cents - v_vat_cents;
  v_date := COALESCE(p_entry_date, CURRENT_DATE);

  INSERT INTO journal_entries (entry_date, description, source, status)
  VALUES (v_date, 'Expense report ' || p_report_id::text, 'expense_report', 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents, description)
  SELECT v_entry_id, x.code, COALESCE(coa.account_name, x.code), x.deb, x.cred, x.descr
  FROM (VALUES
    (p_expense_account,   v_net_cents,   0::bigint,      'Expense (net)'),
    (p_vat_account,       v_vat_cents,   0::bigint,      'Input VAT'),
    (p_liability_account, 0::bigint,     v_total_cents,  'Liability to employee')
  ) AS x(code, deb, cred, descr)
  LEFT JOIN chart_of_accounts coa ON coa.account_code = x.code;

  UPDATE expense_reports
  SET status = 'booked', journal_entry_id = v_entry_id
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'journal_entry_id', v_entry_id, 'total_cents', v_total_cents);
END;
$function$;
