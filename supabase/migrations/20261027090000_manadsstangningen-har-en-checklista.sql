-- ─────────────────────────────────────────────────────────────────────────────
-- Månadsstängningen har en checklista — month_close_checklist
-- ─────────────────────────────────────────────────────────────────────────────
-- Closing a month was one call (close_accounting_period) that refused on
-- drafts and knew nothing else: a person or an agent had to assemble "is this
-- month done?" from the bank queue, the invoice list, the approval queue and
-- the voucher scan, and nothing told them the previous month was still open.
-- Accounted's /month-close works a server-side checklist; this is ours, one
-- read-only function that both the Month close tab and the skill read.
--
-- Every check names what blocks and the skill (and admin tab) that fixes it.
-- `ready` means close_accounting_period will not refuse and nothing of the
-- month is left outside the books. `next` is the exact call to close.
-- ─────────────────────────────────────────────────────────────────────────────

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
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.invoice_id = i.id);
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

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A draft dated in the month blocks; posting it unblocks; the list carries the
-- exact close call. Rolled back.
DO $$
DECLARE v_year int; v_month int; v_out jsonb; v_je uuid; v_blocking jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_year := public.fiscal_year_of(DATE '2026-03-15');
    v_month := 3;
    INSERT INTO public.journal_entries (entry_date, description, status) VALUES (DATE '2026-03-15', 'proof: draft', 'draft') RETURNING id INTO v_je;
    v_out := public.month_close_checklist(v_year, v_month);
    v_blocking := v_out -> 'blocking';
    IF (v_out ->> 'ready')::boolean OR NOT (v_blocking ? 'no_drafts') THEN
      RAISE EXCEPTION 'proof: a draft in the month should block the close, got %', v_out;
    END IF;
    IF (v_out -> 'next' ->> 'skill') <> 'close_accounting_period' OR (v_out -> 'next' -> 'args' ->> 'period_month')::int <> 3 THEN
      RAISE EXCEPTION 'proof: next should be the close call, got %', v_out -> 'next';
    END IF;
    UPDATE public.journal_entries SET status = 'posted' WHERE id = v_je;
    v_out := public.month_close_checklist(v_year, v_month);
    IF (v_out -> 'blocking') ? 'no_drafts' THEN
      RAISE EXCEPTION 'proof: a posted entry should not block, got %', v_out -> 'blocking';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'checks') c WHERE c ->> 'id' = 'balanced') THEN
      RAISE EXCEPTION 'proof: the balance check is missing';
    END IF;
    -- A month outside the fiscal year is refused with the year's label.
    BEGIN
      PERFORM public.month_close_checklist(v_year, 13);
      RAISE EXCEPTION 'proof: month 13 was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'period_month must be 1-12%' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'month close proof ok';
    RAISE EXCEPTION '__month_close_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__month_close_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
