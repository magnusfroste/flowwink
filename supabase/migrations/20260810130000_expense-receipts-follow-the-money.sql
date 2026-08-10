-- ============================================================================
-- book_expense_report: the receipts follow the money.
--
-- The function linked the expense REPORT to the journal entry and stopped
-- there. Each expense's receipt_url — uploaded, AI-extracted, sitting right
-- there — was one join further away than anything in the ledger could see, so a
-- verification born from an expense report carried no evidence of its own.
--
-- Now the receipt links are copied onto the verification at booking time, and
-- the response says how many came across. See migration 20260810120000 for the
-- register itself.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.book_expense_report(p_report_id uuid, p_expense_account text DEFAULT NULL::text, p_vat_account text DEFAULT NULL::text, p_liability_account text DEFAULT NULL::text, p_entry_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receipts int := 0;
  v_report record;
  v_total_cents bigint;
  v_vat_cents bigint;
  v_entry_id uuid;
  v_date date;
  v_acct record;
  v_rc record;
  v_rc_input text;
  v_rc_output text;
  v_rc_vat bigint;
  v_rc_total bigint := 0;
  v_rc_skipped jsonb := '[]'::jsonb;
  v_locale text;
BEGIN
  p_expense_account := COALESCE(p_expense_account, public.account_for('expense_default'));
  p_vat_account := COALESCE(p_vat_account, public.account_for('vat_input'));
  p_liability_account := COALESCE(p_liability_account, public.account_for('employee_liability'));
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

  v_date := COALESCE(p_entry_date, CURRENT_DATE);

  INSERT INTO public.journal_entries (entry_date, description, source, status)
  VALUES (v_date, 'Expense report ' || p_report_id::text, 'expense_report', 'posted')
  RETURNING id INTO v_entry_id;

  -- One expense line per account, so a report may mix e.g. 4531 (foreign
  -- services) and 5420 (domestic software) and each lands where it belongs.
  FOR v_acct IN
    SELECT COALESCE(NULLIF(account_code, ''), p_expense_account) AS code,
           SUM(amount_cents - COALESCE(vat_cents, 0)) AS net_cents
    FROM public.expenses
    WHERE report_id = p_report_id
    GROUP BY COALESCE(NULLIF(account_code, ''), p_expense_account)
  LOOP
    IF v_acct.net_cents <> 0 THEN
      INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
      VALUES (v_entry_id, v_acct.code, v_acct.net_cents, 0, 'Expense (net)');
    END IF;
  END LOOP;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_liability_account, 0, v_total_cents, 'Liability to employee');

  IF v_vat_cents <> 0 THEN
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, p_vat_account, v_vat_cents, 0, 'Input VAT');
  END IF;

  -- Reverse charge: the buyer books both legs. Cash-neutral, but each must be
  -- reported — output in box 30/31/32, input in box 48.
  SELECT COALESCE(NULLIF(value #>> '{}', ''), value ->> 'id')
    INTO v_locale
    FROM public.site_settings WHERE key = 'accounting_locale' LIMIT 1;

  SELECT account_code INTO v_rc_input
    FROM public.account_roles
   WHERE locale = v_locale AND role = 'vat_input_reverse';

  FOR v_rc IN
    SELECT reverse_charge_rate AS rate,
           SUM(amount_cents - COALESCE(vat_cents, 0)) AS net_cents
    FROM public.expenses
    WHERE report_id = p_report_id
      AND reverse_charge_rate IS NOT NULL
    GROUP BY reverse_charge_rate
  LOOP
    v_rc_output := NULL;
    SELECT account_code INTO v_rc_output
      FROM public.account_roles
     WHERE locale = v_locale
       AND role = 'vat_output_reverse_' || ROUND(v_rc.rate * 100)::int::text;

    IF v_rc_output IS NULL OR v_rc_input IS NULL THEN
      v_rc_skipped := v_rc_skipped || jsonb_build_object(
        'rate', v_rc.rate,
        'net_cents', v_rc.net_cents,
        'reason', 'no account role vat_output_reverse_' || ROUND(v_rc.rate * 100)::int::text
                  || ' / vat_input_reverse for locale ' || COALESCE(v_locale, '(none)')
      );
      CONTINUE;
    END IF;

    v_rc_vat := ROUND(v_rc.net_cents * v_rc.rate);

    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES
      (v_entry_id, v_rc_input,  v_rc_vat, 0, 'Reverse charge input VAT'),
      (v_entry_id, v_rc_output, 0, v_rc_vat, 'Reverse charge output VAT');

    v_rc_total := v_rc_total + v_rc_vat;
  END LOOP;

  UPDATE public.expense_reports
  SET status = 'booked', journal_entry_id = v_entry_id
  WHERE id = p_report_id;

  -- The receipts follow the money. Until 2026-08-10 the ledger link stopped at
  -- the REPORT, so every verification born from an expense report was booked
  -- with its evidence one join away and invisible from the ledger.
  v_receipts := public.attach_expense_receipts_to_entry(p_report_id, v_entry_id);

  RETURN jsonb_build_object(
    'success', true,
    'report_id', p_report_id,
    'journal_entry_id', v_entry_id,
    'total_cents', v_total_cents,
    'reverse_charge_vat_cents', v_rc_total,
    'reverse_charge_skipped', v_rc_skipped,
    'receipts_attached', v_receipts
  );
END;
$function$

;
