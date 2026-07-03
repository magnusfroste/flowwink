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
  SELECT * INTO v_report FROM public.expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;
  IF v_report.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved reports can be booked');
  END IF;

  SELECT COALESCE(SUM(amount_cents),0), COALESCE(SUM(vat_cents),0)
  INTO v_total_cents, v_vat_cents
  FROM public.expenses WHERE report_id = p_report_id;

  v_net_cents := v_total_cents - v_vat_cents;
  v_date := COALESCE(p_entry_date, CURRENT_DATE);

  INSERT INTO public.journal_entries (entry_date, description, source, status)
  VALUES (v_date, 'Expense report ' || p_report_id::text, 'expense_report', 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES
    (v_entry_id, p_expense_account, v_net_cents, 0, 'Expense (net)'),
    (v_entry_id, p_vat_account, v_vat_cents, 0, 'Input VAT'),
    (v_entry_id, p_liability_account, 0, v_total_cents, 'Liability to employee');

  UPDATE public.expense_reports
  SET status = 'booked', journal_entry_id = v_entry_id
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'journal_entry_id', v_entry_id, 'total_cents', v_total_cents);
END;
$function$;