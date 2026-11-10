-- Kvittot är redan bokat (2026-11-10).
--
-- A paid order is booked the moment it is paid (source order_paid,
-- reference_number = the order id), and since #949 its receipt is an invoice
-- born paid with that order_id. book_invoice_issued and book_invoice_paid
-- already know the receipt is not a second sale and skip it. Three readers did
-- not: check_books reported "1 customer invoice without a voucher" (high) on
-- LiteIT for a 12,50 kr receipt whose sale was on 1580/3001/2611 since
-- 2026-11-02, month_close_checklist would have failed November on it, and
-- book_unbooked_invoices kept listing it as work, booking nothing each time.
--
-- One rule, one reader: invoice_booked_with_its_order(invoice). The three
-- functions are redefined from their latest bodies with that rule added and
-- nothing else changed.

CREATE OR REPLACE FUNCTION public.invoice_booked_with_its_order(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i
      JOIN public.journal_entries j
        ON j.source = 'order_paid' AND j.reference_number = i.order_id::text
     WHERE i.id = p_invoice_id
       AND i.order_id IS NOT NULL
       AND COALESCE(i.invoice_type, 'invoice') = 'invoice');
$fn$;
REVOKE ALL ON FUNCTION public.invoice_booked_with_its_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_booked_with_its_order(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.invoice_booked_with_its_order(uuid) IS
  'True when the invoice is the receipt of an order already booked at payment (order_paid). Such an invoice is booked: its sale is the order''s voucher.';

CREATE OR REPLACE FUNCTION public.check_books(p_as_of date DEFAULT public.platform_today())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_findings jsonb := '[]'::jsonb;
  v_key int := public.fiscal_year_of(p_as_of);
  v_fy_from date; v_fy_to date;
  v_n int; v_n2 int; v_oldest date; v_amount bigint;
  v_cur text := public.business_currency();
  v_deadlines jsonb;
  v_cron jsonb;
  v_months_behind int;
  v_month_end date;
  v_period jsonb;
  v_started date := public.books_started_on();
  v_note text;
  d jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Only accounting staff can run the books health check' USING ERRCODE = '42501';
  END IF;
  SELECT r.date_from, r.date_to INTO v_fy_from, v_fy_to FROM public.fiscal_year_range(v_key) r;

  -- Bank lines nobody has matched or booked.
  BEGIN
    SELECT COUNT(*), MIN(transaction_date) INTO v_n, v_oldest
      FROM public.bank_transactions WHERE status IN ('unmatched', 'partial') AND transaction_date <= p_as_of;
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'unmatched_bank_transactions',
        'severity', CASE WHEN v_oldest < p_as_of - 30 THEN 'high' ELSE 'medium' END,
        'count', v_n,
        'label', v_n || ' bank transaction' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not booked',
        'detail', 'Oldest ' || v_oldest || '. The sweep books the ones a template or rule answers and stages the rest for review.',
        'fix', jsonb_build_object('skill', 'run_bookkeeping_sweep', 'args', '{}'::jsonb),
        'tab', 'events_to_book');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Customer invoices that reached a bookable status without a voucher.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.invoices i
     WHERE i.status IN ('sent'::invoice_status, 'paid'::invoice_status, 'overdue'::invoice_status)
       AND COALESCE(i.issue_date, i.created_at::date) <= p_as_of
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.invoice_id = i.id)
       AND NOT public.invoice_booked_with_its_order(i.id);
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'unbooked_invoices', 'severity', 'high', 'count', v_n,
        'label', v_n || ' customer invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' without a voucher',
        'detail', 'Revenue and receivables are lower in the ledger than in the invoice list until these are booked.',
        'fix', jsonb_build_object('skill', 'book_unbooked_invoices', 'args', '{}'::jsonb),
        'tab', 'journal');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Drafts older than a week.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.journal_entries WHERE status = 'draft' AND created_at::date <= p_as_of - 7;
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'stale_draft_entries', 'severity', 'medium', 'count', v_n,
        'label', v_n || ' draft journal entr' || CASE WHEN v_n = 1 THEN 'y' ELSE 'ies' END || ' older than a week',
        'detail', 'A draft is not in any report. Post it, or delete it if it was a mistake.',
        'fix', jsonb_build_object('skill', 'post_journal_entry', 'args', jsonb_build_object('entry_id', '<id>')),
        'tab', 'journal');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Gaps in the voucher series of the current fiscal year.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.list_voucher_gaps(v_key, NULL);
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'voucher_gaps', 'severity', 'medium', 'count', v_n,
        'label', v_n || ' gap' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' in the voucher series ' || public.fiscal_year_label(v_key),
        'detail', 'A gap must be explained (BFNAR 2013:2). explain_voucher_gap reads the audit log for the cause.',
        'fix', jsonb_build_object('skill', 'explain_voucher_gap', 'args', jsonb_build_object('year', v_key)),
        'tab', 'voucher');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Overdue customer invoices.
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(total_cents - COALESCE(paid_amount_cents, 0)), 0) INTO v_n, v_amount
      FROM public.invoices
     WHERE status IN ('sent'::invoice_status, 'overdue'::invoice_status) AND due_date < p_as_of;
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'overdue_customer_invoices', 'severity', 'medium', 'count', v_n,
        'label', v_n || ' customer invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' past due',
        'detail', public.format_business_amount(v_amount, v_cur, 0) || ' outstanding in document currency terms. Dunning reminders go out per the invoicing module''s schedule.',
        'fix', jsonb_build_object('skill', 'send_dunning_reminders', 'args', '{}'::jsonb),
        'tab', 'invoices');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column OR undefined_function THEN NULL; END;

  -- Supplier invoices due within a week or past due.
  BEGIN
    SELECT COUNT(*) FILTER (WHERE due_date < p_as_of), COUNT(*) INTO v_n, v_n2
      FROM public.vendor_invoices
     WHERE status IN ('received', 'matched', 'variance', 'approved') AND due_date <= p_as_of + 7;
    IF v_n2 > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'vendor_invoices_due', 'severity', CASE WHEN v_n > 0 THEN 'high' ELSE 'medium' END, 'count', v_n2,
        'label', v_n2 || ' supplier invoice' || CASE WHEN v_n2 = 1 THEN '' ELSE 's' END || ' due within a week' || CASE WHEN v_n > 0 THEN ' (' || v_n || ' past due)' ELSE '' END,
        'detail', 'Approval and three-way match gate the payment; pay_vendor_invoice books it at the payment-day rate.',
        'fix', jsonb_build_object('skill', 'pay_vendor_invoice', 'args', jsonb_build_object('vendor_invoice_id', '<id>')),
        'tab', 'purchasing');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Staged operations and approval requests waiting on a person.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.pending_operations WHERE status = 'pending';
    SELECT COUNT(*) INTO v_n2 FROM public.approval_requests WHERE status = 'pending';
    IF v_n + v_n2 > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'pending_approvals', 'severity', 'medium', 'count', v_n + v_n2,
        'label', (v_n + v_n2) || ' item' || CASE WHEN v_n + v_n2 = 1 THEN '' ELSE 's' END || ' waiting for approval',
        'detail', v_n || ' staged operation' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ', ' || v_n2 || ' approval request' || CASE WHEN v_n2 = 1 THEN '' ELSE 's' END || '. Nothing is booked until a person decides.',
        'fix', jsonb_build_object('skill', 'approve_pending_operation', 'args', jsonb_build_object('p_id', '<operation_id>')),
        'tab', 'approvals');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Months of the fiscal year that ended more than 45 days ago and are still open.
  BEGIN
    v_months_behind := 0;
    v_month_end := (date_trunc('month', v_fy_from) + INTERVAL '1 month')::date - 1;
    WHILE v_month_end <= LEAST(v_fy_to, p_as_of - 45) LOOP
      IF public.period_status_for_date(v_month_end) = 'open' THEN v_months_behind := v_months_behind + 1; END IF;
      v_month_end := (date_trunc('month', v_month_end) + INTERVAL '2 months')::date - 1;
    END LOOP;
    IF v_months_behind > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'periods_left_open', 'severity', 'low', 'count', v_months_behind,
        'label', v_months_behind || ' month' || CASE WHEN v_months_behind = 1 THEN '' ELSE 's' END || ' of ' || public.fiscal_year_label(v_key) || ' still open after 45 days',
        'detail', 'Closing a month locks its vouchers; a correction after that is a mirror entry in the current month.',
        'fix', jsonb_build_object('skill', 'close_accounting_period', 'args', jsonb_build_object('fiscal_year', v_key, 'period_month', '<month>')),
        'tab', 'journal');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Foreign-currency documents booked without a known rate.
  BEGIN
    SELECT (SELECT COUNT(*) FROM public.invoices WHERE fx_rate_source = 'missing' AND status NOT IN ('cancelled'::invoice_status, 'draft'::invoice_status))
         + (SELECT COUNT(*) FROM public.vendor_invoices WHERE fx_rate_source = 'missing' AND status NOT IN ('rejected', 'paid'))
      INTO v_n;
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'missing_exchange_rates', 'severity', 'high', 'count', v_n,
        'label', v_n || ' document' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' in another currency without an exchange rate',
        'detail', 'Booking refuses a rate of 1. Fetch the ECB table or set the rate for the document date, then book.',
        'fix', jsonb_build_object('skill', 'fetch_ecb_rates', 'args', '{}'::jsonb),
        'tab', 'journal');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Expense reports approved but not booked.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.expense_reports WHERE status = 'approved';
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'unbooked_expense_reports', 'severity', 'medium', 'count', v_n,
        'label', v_n || ' approved expense report' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not booked',
        'detail', 'Approved is a decision, booked is the ledger. book_expense_report posts the voucher.',
        'fix', jsonb_build_object('skill', 'book_expense_report', 'args', jsonb_build_object('report_id', '<id>')),
        'tab', 'expenses');
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Scheduled jobs that feed the books (reconciliation sync, sweeps) in the red.
  BEGIN
    v_cron := public.cron_health_report();
    SELECT COUNT(*) INTO v_n FROM jsonb_array_elements(COALESCE(v_cron -> 'jobs', '[]'::jsonb)) j
     WHERE (j ->> 'health') IN ('red', 'failed') OR (j ->> 'status') IN ('red', 'failed')
        OR jsonb_array_length(COALESCE(j -> 'reasons', '[]'::jsonb)) > 0;
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'stalled_scheduled_jobs', 'severity', 'low', 'count', v_n,
        'label', v_n || ' scheduled job' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' unhealthy',
        'detail', 'A sync that silently stopped shows up at month-end as missing lines. cron_health_report names the jobs.',
        'fix', jsonb_build_object('skill', 'cron_health_report', 'args', '{}'::jsonb),
        'tab', 'system');
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Filing deadlines: a year back for what was due and never recorded as
  -- filed (overdue — the register, not the calendar, says "filed"), and the
  -- ones inside two weeks. Filed returns are quiet. Nothing is overdue for a
  -- period that ended before the books began here (books_started_on): a
  -- business that moved in mid-year filed those elsewhere, and a business
  -- with no books yet has nothing to declare (2026-11-06).
  BEGIN
    v_deadlines := public.statutory_deadlines(p_as_of - 400, 445, p_as_of);
    IF v_started IS NULL THEN
      v_note := 'No books yet — the filing calendar starts with the first fiscal year (Accounting → Settings) or the first posted journal entry.';
    END IF;
    FOR d IN SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x
              WHERE x ->> 'status' = 'overdue' AND v_started IS NOT NULL AND (x ->> 'period_to')::date >= v_started LOOP
      v_findings := v_findings || jsonb_build_object(
        'id', 'deadline_overdue:' || (d ->> 'id'),
        'severity', 'high',
        'count', 1,
        'label', (d ->> 'label') || ' was due ' || (d ->> 'due_date') || ' (' || abs((d ->> 'days_left')::int) || ' days ago) and is not recorded as filed',
        'detail', 'Either it was filed and nobody recorded it — record it with the agency reference — or it is late: prepare and file it now. ' || (d ->> 'basis'),
        'fix', jsonb_build_object('skill', 'manage_statutory_filing', 'args', jsonb_build_object('p_action', 'record', 'p_kind', d ->> 'kind', 'p_period_from', d ->> 'period_from', 'p_period_to', d ->> 'period_to', 'p_reference', '<agency reference>')),
        'tab', 'filings');
    END LOOP;
    FOR d IN SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x
              WHERE x ->> 'status' IN ('due_soon', 'upcoming') AND (x ->> 'days_left')::int <= 14
                AND (v_started IS NULL OR (x ->> 'period_to')::date >= v_started) LOOP
      v_findings := v_findings || jsonb_build_object(
        'id', 'deadline:' || (d ->> 'id'),
        'severity', CASE WHEN (d ->> 'days_left')::int <= 3 THEN 'high' ELSE 'medium' END,
        'count', 1,
        'label', (d ->> 'label') || ' due ' || (d ->> 'due_date') || ' (' || (d ->> 'days_left') || ' days)',
        'detail', (d ->> 'basis') || ' When filed, record it (manage_statutory_filing) so the calendar stops asking.',
        'fix', CASE WHEN d ->> 'kind' = 'vat_return'
                    THEN jsonb_build_object('skill', 'prepare_vat_return', 'args', jsonb_build_object('from', d ->> 'period_from', 'to', d ->> 'period_to'))
                    WHEN d ->> 'kind' IN ('income_tax_return', 'annual_report')
                    THEN jsonb_build_object('skill', 'year_end_readiness', 'args', '{}'::jsonb)
                    ELSE NULL END,
        'tab', CASE WHEN d ->> 'kind' = 'vat_return' THEN 'momsdekl' ELSE 'yearend' END);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN v_deadlines := NULL; END;

  -- Highest severity first, then the biggest count.
  SELECT COALESCE(jsonb_agg(f ORDER BY CASE f ->> 'severity' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, (f ->> 'count')::int DESC, f ->> 'id'), '[]'::jsonb)
    INTO v_findings FROM jsonb_array_elements(v_findings) f;

  RETURN jsonb_build_object(
    'as_of', p_as_of,
    'currency', v_cur,
    'fiscal_year', jsonb_build_object('key', v_key, 'label', public.fiscal_year_label(v_key), 'date_from', v_fy_from, 'date_to', v_fy_to),
    'books_started_on', v_started,
    'summary', jsonb_build_object(
      'high', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'high'),
      'medium', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'medium'),
      'low', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'low'),
      'total', jsonb_array_length(v_findings)),
    'ok', jsonb_array_length(v_findings) = 0,
    'findings', v_findings,
    'next_deadlines', COALESCE((SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x WHERE x ->> 'status' IN ('due_soon', 'upcoming') LIMIT 3) s), '[]'::jsonb),
    'overdue_filings', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'id' LIKE 'deadline_overdue:%'),
    'calendar_note', COALESCE(v_note, v_deadlines ->> 'note'),
    'generated_at', now());
END; $fn$;
GRANT EXECUTE ON FUNCTION public.check_books(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.month_close_checklist(p_year integer, p_month integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_start date;
  v_end date;
  v_status text;
  v_prev_start date;
  v_prev_status text;
  v_fy_from date;
  v_checks jsonb := '[]'::jsonb;
  v_n int; v_n2 int;
  v_debit bigint; v_credit bigint;
  v_prefs jsonb;
  v_vat text;
  v_vat_period_end boolean := false;
  v_due date;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Only accounting staff can read the month-close checklist' USING ERRCODE = '42501';
  END IF;
  IF p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'period_month must be 1-12 (got %)', p_month;
  END IF;
  v_start := public.fiscal_period_start(p_year, p_month);
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Month % is not in fiscal year % (%)', p_month, p_year, public.fiscal_year_label(p_year);
  END IF;
  v_end := (v_start + INTERVAL '1 month' - INTERVAL '1 day')::date;
  v_status := public.period_status_for_date(v_start);
  SELECT r.date_from INTO v_fy_from FROM public.fiscal_year_range(p_year) r;

  -- 1. Months close in order: the previous month of the year must be closed first.
  v_prev_start := (v_start - INTERVAL '1 month')::date;
  IF v_prev_start >= v_fy_from THEN
    v_prev_status := public.period_status_for_date(v_prev_start);
    v_checks := v_checks || jsonb_build_object(
      'id', 'previous_month_closed', 'label', 'Previous month closed',
      'pass', v_prev_status <> 'open', 'count', CASE WHEN v_prev_status = 'open' THEN 1 ELSE 0 END,
      'detail', to_char(v_prev_start, 'Mon YYYY') || ' is ' || v_prev_status || '. Months close in order so a late entry cannot land in a gap.',
      'fix', jsonb_build_object('skill', 'month_close_checklist', 'args', jsonb_build_object('p_year', public.fiscal_year_of(v_prev_start), 'p_month', EXTRACT(MONTH FROM v_prev_start)::int)),
      'tab', 'close');
  END IF;

  -- 2. Bank events of the month booked or matched.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.bank_transactions
     WHERE transaction_date BETWEEN v_start AND v_end AND status IN ('unmatched', 'partial');
    v_checks := v_checks || jsonb_build_object(
      'id', 'bank_events_booked', 'label', 'Every bank event of the month booked', 'pass', v_n = 0, 'count', v_n,
      'detail', v_n || ' bank transaction' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' still unmatched',
      'fix', jsonb_build_object('skill', 'run_bookkeeping_sweep', 'args', '{}'::jsonb), 'tab', 'events_to_book');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 3. Customer invoices issued in the month carry a voucher.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.invoices i
     WHERE i.status IN ('sent'::invoice_status, 'paid'::invoice_status, 'overdue'::invoice_status)
       AND COALESCE(i.issue_date, i.created_at::date) BETWEEN v_start AND v_end
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.invoice_id = i.id)
       AND NOT public.invoice_booked_with_its_order(i.id);
    v_checks := v_checks || jsonb_build_object(
      'id', 'invoices_booked', 'label', 'Customer invoices of the month booked', 'pass', v_n = 0, 'count', v_n,
      'detail', v_n || ' invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' without a journal entry',
      'fix', jsonb_build_object('skill', 'book_unbooked_invoices', 'args', '{}'::jsonb), 'tab', 'journal');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 4. No drafts dated in the month (close_accounting_period refuses on these).
  SELECT COUNT(*) INTO v_n FROM public.journal_entries WHERE entry_date BETWEEN v_start AND v_end AND status <> 'posted';
  v_checks := v_checks || jsonb_build_object(
    'id', 'no_drafts', 'label', 'No draft journal entries in the month', 'pass', v_n = 0, 'count', v_n,
    'detail', v_n || ' draft' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' — the close refuses while any remain',
    'fix', jsonb_build_object('skill', 'post_journal_entry', 'args', jsonb_build_object('entry_id', '<id>')), 'tab', 'journal');

  -- 5. Approvals for entries of the month settled.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.approval_requests r
      JOIN public.journal_entries je ON je.id::text = r.entity_id
     WHERE r.entity_type = 'journal_entry' AND r.status = 'pending' AND je.entry_date BETWEEN v_start AND v_end;
    SELECT COUNT(*) INTO v_n2 FROM public.pending_operations
     WHERE status = 'pending' AND COALESCE(args ->> 'entry_date', args ->> 'date', '') BETWEEN v_start::text AND v_end::text;
    v_checks := v_checks || jsonb_build_object(
      'id', 'approvals_settled', 'label', 'Nothing of the month waits for approval', 'pass', v_n + v_n2 = 0, 'count', v_n + v_n2,
      'detail', v_n || ' approval request' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ', ' || v_n2 || ' staged operation' || CASE WHEN v_n2 = 1 THEN '' ELSE 's' END,
      'fix', jsonb_build_object('skill', 'approve_pending_operation', 'args', jsonb_build_object('p_id', '<operation_id>')), 'tab', 'pending');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 6. Expense reports approved in the month are booked.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.expense_reports
     WHERE status = 'approved' AND approved_at IS NOT NULL AND approved_at::date BETWEEN v_start AND v_end;
    v_checks := v_checks || jsonb_build_object(
      'id', 'expense_reports_booked', 'label', 'Approved expense reports booked', 'pass', v_n = 0, 'count', v_n,
      'detail', v_n || ' approved report' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not yet in the ledger',
      'fix', jsonb_build_object('skill', 'book_expense_report', 'args', jsonb_build_object('report_id', '<id>')), 'tab', 'expenses');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 7. Supplier invoices dated in the month are past "received".
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.vendor_invoices
     WHERE invoice_date BETWEEN v_start AND v_end AND status = 'received';
    v_checks := v_checks || jsonb_build_object(
      'id', 'vendor_invoices_processed', 'label', 'Supplier invoices of the month matched or approved', 'pass', v_n = 0, 'count', v_n,
      'detail', v_n || ' supplier invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' still only received',
      'fix', jsonb_build_object('skill', 'match_po_to_invoice', 'args', jsonb_build_object('vendor_invoice_id', '<id>')), 'tab', 'purchasing');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 8. Foreign-currency documents of the month have a rate.
  BEGIN
    SELECT (SELECT COUNT(*) FROM public.invoices WHERE fx_rate_source = 'missing' AND issue_date BETWEEN v_start AND v_end AND status NOT IN ('cancelled'::invoice_status, 'draft'::invoice_status))
         + (SELECT COUNT(*) FROM public.vendor_invoices WHERE fx_rate_source = 'missing' AND invoice_date BETWEEN v_start AND v_end AND status NOT IN ('rejected', 'paid'))
      INTO v_n;
    v_checks := v_checks || jsonb_build_object(
      'id', 'exchange_rates_known', 'label', 'Every foreign-currency document has a rate', 'pass', v_n = 0, 'count', v_n,
      'detail', v_n || ' document' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' stamped rate 1 for lack of a rate',
      'fix', jsonb_build_object('skill', 'fetch_ecb_rates', 'args', '{}'::jsonb), 'tab', 'journal');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- 9. The voucher series has no gap inside the month.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.list_voucher_gaps(p_year, NULL) g WHERE g.gap_after_date BETWEEN v_start AND v_end;
    v_checks := v_checks || jsonb_build_object(
      'id', 'voucher_series_unbroken', 'label', 'Voucher series unbroken in the month', 'pass', v_n = 0, 'count', v_n,
      'detail', v_n || ' gap' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' — each must be explained (BFNAR 2013:2)',
      'fix', jsonb_build_object('skill', 'explain_voucher_gap', 'args', jsonb_build_object('year', p_year)), 'tab', 'voucher');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 10. The month balances (debits = credits over posted entries) — a sanity line, never silently assumed.
  SELECT COALESCE(SUM(jel.debit_cents), 0), COALESCE(SUM(jel.credit_cents), 0) INTO v_debit, v_credit
    FROM public.journal_entries je JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
   WHERE je.entry_date BETWEEN v_start AND v_end AND je.status = 'posted';
  v_checks := v_checks || jsonb_build_object(
    'id', 'balanced', 'label', 'Debits equal credits', 'pass', v_debit = v_credit, 'count', CASE WHEN v_debit = v_credit THEN 0 ELSE 1 END,
    'detail', public.format_business_amount(v_debit, public.business_currency(), 0) || ' debit / ' || public.format_business_amount(v_credit, public.business_currency(), 0) || ' credit',
    'fix', NULL, 'tab', 'ledger');

  -- 11. A VAT period ends with this month: say when the return is due (informational).
  SELECT value INTO v_prefs FROM public.site_settings WHERE key = 'accounting_preferences' LIMIT 1;
  v_vat := lower(COALESCE(v_prefs ->> 'vatReturnPeriod', 'quarterly'));
  v_vat_period_end := CASE v_vat WHEN 'monthly' THEN true
                                 WHEN 'yearly' THEN (v_end = (SELECT r.date_to FROM public.fiscal_year_range(p_year) r))
                                 ELSE EXTRACT(MONTH FROM v_end)::int IN (3, 6, 9, 12) END;
  IF v_vat_period_end AND public.business_country() = 'SE' THEN
    v_due := CASE WHEN v_vat = 'yearly'
                  THEN public._next_weekday((date_trunc('month', v_end) + INTERVAL '2 months')::date + 25)
                  ELSE public._se_agency_day((date_trunc('month', v_end) + INTERVAL '2 months')::date, 12) END;
    v_checks := v_checks || jsonb_build_object(
      'id', 'vat_return_due', 'label', 'A VAT period ends with this month', 'pass', true, 'count', 0, 'informational', true,
      'detail', 'The return is due ' || v_due || '. Prepare it once the month is closed, so the figures cannot move after filing.',
      'fix', jsonb_build_object('skill', 'prepare_vat_return', 'args', jsonb_build_object('from', CASE WHEN v_vat = 'monthly' THEN v_start ELSE (date_trunc('quarter', v_end))::date END, 'to', v_end)), 'tab', 'momsdekl');
  END IF;

  RETURN jsonb_build_object(
    'fiscal_year', p_year, 'label', public.fiscal_year_label(p_year), 'month', p_month,
    'period_label', to_char(v_start, 'Mon YYYY'), 'date_from', v_start, 'date_to', v_end,
    'status', v_status,
    'ready', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) c WHERE (c ->> 'pass')::boolean = false),
    'blocking', COALESCE((SELECT jsonb_agg(c ->> 'id') FROM jsonb_array_elements(v_checks) c WHERE (c ->> 'pass')::boolean = false), '[]'::jsonb),
    'checks', v_checks,
    'next', CASE WHEN v_status = 'open'
                 THEN jsonb_build_object('skill', 'close_accounting_period', 'args', jsonb_build_object('fiscal_year', p_year, 'period_month', p_month))
                 ELSE jsonb_build_object('skill', 'reopen_accounting_period', 'args', jsonb_build_object('fiscal_year', p_year, 'period_month', p_month, 'reason', '<why>')) END,
    'generated_at', now());
END; $fn$;
GRANT EXECUTE ON FUNCTION public.month_close_checklist(integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.book_unbooked_invoices(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_res jsonb;
  v_found int := 0;
  v_booked int := 0;
  v_cents bigint := 0;
  v_failed jsonb := '[]'::jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  FOR r IN
    SELECT i.id, i.invoice_number, i.status, i.total_cents, i.invoice_type
      FROM invoices i
     WHERE i.status IN ('sent'::invoice_status, 'paid'::invoice_status)
       AND coalesce(i.total_cents, 0) <> 0
       AND COALESCE(i.origin, '') <> 'pos_receipt'
       AND NOT EXISTS (SELECT 1 FROM journal_entries j
                        WHERE j.invoice_id = i.id
                          AND j.source = CASE WHEN i.invoice_type = 'credit_note' THEN 'credit_note_issued' ELSE 'invoice_issued' END)
       AND NOT public.invoice_booked_with_its_order(i.id)
     ORDER BY i.issue_date NULLS LAST, i.created_at
     LIMIT greatest(1, least(coalesce(p_limit, 500), 5000))
  LOOP
    v_found := v_found + 1;
    v_cents := v_cents + abs(coalesce(r.total_cents, 0));
    IF NOT p_dry_run THEN
      BEGIN
        IF r.status = 'paid'::invoice_status AND r.invoice_type <> 'credit_note' THEN
          v_res := public.book_invoice_paid(r.id);
        ELSE
          v_res := public.book_invoice_issued(r.id);
        END IF;
        IF coalesce((v_res ->> 'success')::boolean, false) THEN
          v_booked := v_booked + 1;
        ELSE
          v_failed := v_failed || jsonb_build_object('invoice', r.invoice_number, 'why', v_res ->> 'error');
        END IF;
      EXCEPTION WHEN others THEN
        v_failed := v_failed || jsonb_build_object('invoice', r.invoice_number, 'why', SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'dry_run', p_dry_run, 'found', v_found,
    'booked', v_booked, 'total_cents', v_cents, 'failed', v_failed,
    'note', CASE WHEN p_dry_run THEN 'Dry run — call again with p_dry_run=false to book' ELSE 'Booked' END);
END;
$function$;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A receipt whose order carries its order_paid voucher is booked for all three
-- readers; pointed away from that voucher it is unbooked work for all three.
-- Counted as differences, so whatever the instance already holds does not
-- matter. The order stays pending so its own booking trigger stays out.
-- Rolled back.
DO $$
DECLARE v_o uuid; v_i uuid; v_j uuid; v_today date := public.platform_today();
        v_y int := EXTRACT(YEAR FROM public.platform_today())::int;
        v_m int := EXTRACT(MONTH FROM public.platform_today())::int;
        b1 int; b2 int; m1 int; m2 int; u1 int; u2 int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.orders (customer_email, total_cents, status)
    VALUES ('proof@example.com', 1250, 'pending') RETURNING id INTO v_o;
    -- The order's voucher first: an invoice born paid is booked by trigger
    -- unless its order already is, which is the case being proved.
    INSERT INTO public.journal_entries (description, entry_date, source, reference_number)
    VALUES ('proof: order paid', v_today, 'order_paid', v_o::text) RETURNING id INTO v_j;
    INSERT INTO public.invoices (invoice_number, status, total_cents, order_id, issue_date, invoice_type)
    VALUES ('PROOF-RECEIPT-1', 'paid', 1250, v_o, v_today, 'invoice') RETURNING id INTO v_i;
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE invoice_id = v_i) THEN
      RAISE EXCEPTION 'proof: the receipt of a booked order was booked again';
    END IF;
    IF NOT public.invoice_booked_with_its_order(v_i) THEN RAISE EXCEPTION 'proof: the order''s voucher does not book its receipt'; END IF;

    -- Booked: none of the three readers counts it.
    SELECT COALESCE(SUM((f ->> 'count')::int), 0) INTO b2
      FROM jsonb_array_elements(public.check_books(v_today) -> 'findings') f WHERE f ->> 'id' = 'unbooked_invoices';
    SELECT COALESCE(SUM((c ->> 'count')::int), 0) INTO m2
      FROM jsonb_array_elements(public.month_close_checklist(v_y, v_m) -> 'checks') c WHERE c ->> 'id' = 'invoices_booked';
    u2 := (public.book_unbooked_invoices(true, 5000) ->> 'found')::int;

    -- The voucher names another order: the receipt is unbooked work again.
    UPDATE public.journal_entries SET reference_number = gen_random_uuid()::text WHERE id = v_j;
    IF public.invoice_booked_with_its_order(v_i) THEN RAISE EXCEPTION 'proof: booked without its order''s voucher'; END IF;
    SELECT COALESCE(SUM((f ->> 'count')::int), 0) INTO b1
      FROM jsonb_array_elements(public.check_books(v_today) -> 'findings') f WHERE f ->> 'id' = 'unbooked_invoices';
    SELECT COALESCE(SUM((c ->> 'count')::int), 0) INTO m1
      FROM jsonb_array_elements(public.month_close_checklist(v_y, v_m) -> 'checks') c WHERE c ->> 'id' = 'invoices_booked';
    u1 := (public.book_unbooked_invoices(true, 5000) ->> 'found')::int;

    IF b1 - b2 <> 1 THEN RAISE EXCEPTION 'proof: check_books should drop the booked receipt (% → %)', b1, b2; END IF;
    IF m1 - m2 <> 1 THEN RAISE EXCEPTION 'proof: month_close_checklist should drop the booked receipt (% → %)', m1, m2; END IF;
    IF u1 - u2 <> 1 THEN RAISE EXCEPTION 'proof: book_unbooked_invoices should drop the booked receipt (% → %)', u1, u2; END IF;

    RAISE EXCEPTION '__receipt_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__receipt_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
