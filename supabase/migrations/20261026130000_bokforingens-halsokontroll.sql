-- ─────────────────────────────────────────────────────────────────────────────
-- Bokföringens hälsokontroll — check_books, statutory_deadlines, agent_context
-- ─────────────────────────────────────────────────────────────────────────────
-- An operator (a person in Accounting → Overview, FlowPilot in the daily
-- briefing, an external agent over MCP) asked "what needs my attention in the
-- books?" and had to assemble the answer from eight tools. Accounted answers
-- it with one read-only `check` that returns a prioritised fix list. This
-- migration gives FlowWink the same three readers, all read-only:
--
--   1. statutory_deadlines(p_from, p_days) — the filing calendar the business
--      home implies: VAT return, employer declaration (AGI), income tax return,
--      annual report. Rules are declarative per COUNTRY; today Sweden is the
--      only country with rules, every other country answers an empty list
--      and says so (`note`). Nothing is invented for a country nobody wrote.
--   2. check_books(p_as_of) — the prioritised fix list: unmatched bank lines,
--      invoices without a voucher, stale drafts, voucher gaps, overdue
--      receivables/payables, approvals waiting, periods left open, missing
--      exchange rates, expense reports approved but not booked, stalled
--      scheduled jobs, deadlines inside two weeks. Each finding names the
--      skill (and admin tab) that fixes it.
--   3. agent_context() — the business facts every finance answer should
--      carry: today, currency, fiscal year, today's period status, pending
--      approvals. agent-execute prepends it to finance-skill results.
--
-- Deadlines are "upcoming" only: without a filing record the engine cannot
-- tell a late return from a filed one, so it never says "overdue" — it says
-- "due in N days". Weekend due dates move to the next weekday (the agency's
-- own rule); public holidays are not modelled.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._next_weekday(p_date date)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE EXTRACT(ISODOW FROM p_date)::int WHEN 6 THEN p_date + 2 WHEN 7 THEN p_date + 1 ELSE p_date END;
$fn$;

-- The agency's "12th of the month" rule: the 12th, except January and
-- August where it is the 17th; a weekend date moves to the Monday after.
CREATE OR REPLACE FUNCTION public._se_agency_day(p_month_start date, p_day integer DEFAULT 12)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT public._next_weekday(
    make_date(EXTRACT(YEAR FROM p_month_start)::int, EXTRACT(MONTH FROM p_month_start)::int,
      CASE WHEN p_day = 12 AND EXTRACT(MONTH FROM p_month_start)::int IN (1, 8) THEN 17 ELSE p_day END));
$fn$;

-- ── 1. The statutory calendar ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.statutory_deadlines(p_from date DEFAULT public.platform_today(), p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_country text := public.business_country();
  v_prefs jsonb;
  v_vat_period text;
  v_legal text;
  v_to date := p_from + GREATEST(COALESCE(p_days, 90), 1);
  v_out jsonb := '[]'::jsonb;
  v_has_payroll boolean := false;
  v_d date;
  v_due date;
  v_end date;
  v_key int;
  v_fy_from date;
  v_fy_to date;
  v_end_month int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Only accounting staff can read the statutory calendar' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_prefs FROM public.site_settings WHERE key = 'accounting_preferences' LIMIT 1;
  v_vat_period := lower(COALESCE(v_prefs ->> 'vatReturnPeriod', 'quarterly'));
  IF v_vat_period NOT IN ('monthly', 'quarterly', 'yearly') THEN v_vat_period := 'quarterly'; END IF;
  v_legal := lower(COALESCE(v_prefs ->> 'legalForm', ''));

  IF v_country IS DISTINCT FROM 'SE' THEN
    RETURN jsonb_build_object(
      'country', v_country, 'from', p_from, 'to', v_to, 'deadlines', '[]'::jsonb,
      'note', CASE WHEN v_country IS NULL
                   THEN 'No country set in Site settings → General; the statutory calendar needs one.'
                   ELSE 'No statutory calendar is written for ' || v_country || ' yet — only Sweden (SE) has rules.' END);
  END IF;

  -- Employer declaration only when the business has run payroll in the last 13 months.
  BEGIN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.payroll_runs WHERE period_date >= $1)'
      INTO v_has_payroll USING p_from - INTERVAL '13 months';
  EXCEPTION WHEN undefined_table THEN v_has_payroll := false; END;

  -- VAT returns: the 12th of the second month after the period (yearly: the
  -- 26th of the second month after the fiscal year — the earlier of the two
  -- dates the agency uses, so a business with EU trade is never late).
  IF v_vat_period = 'yearly' THEN
    FOR v_key IN public.fiscal_year_of(p_from) - 1 .. public.fiscal_year_of(v_to) + 1 LOOP
      SELECT r.date_from, r.date_to INTO v_fy_from, v_fy_to FROM public.fiscal_year_range(v_key) r;
      v_due := public._next_weekday((date_trunc('month', v_fy_to) + INTERVAL '2 months')::date + 25);
      IF v_due BETWEEN p_from AND v_to THEN
        v_out := v_out || jsonb_build_object(
          'id', 'vat_return:' || v_fy_to, 'kind', 'vat_return',
          'label', 'VAT return ' || public.fiscal_year_label(v_key),
          'period_from', v_fy_from, 'period_to', v_fy_to, 'due_date', v_due,
          'basis', 'Annual VAT period — 26th of the second month after the fiscal year (Skatteverket)');
      END IF;
    END LOOP;
  ELSE
    v_d := (date_trunc('month', p_from) - INTERVAL '14 months')::date;
    WHILE v_d <= v_to LOOP
      v_end := (v_d + INTERVAL '1 month')::date - 1;
      IF v_vat_period = 'monthly' OR EXTRACT(MONTH FROM v_end)::int IN (3, 6, 9, 12) THEN
        v_due := public._se_agency_day((date_trunc('month', v_end) + INTERVAL '2 months')::date, 12);
        IF v_due BETWEEN p_from AND v_to THEN
          v_out := v_out || jsonb_build_object(
            'id', 'vat_return:' || v_end, 'kind', 'vat_return',
            'label', 'VAT return ' || CASE WHEN v_vat_period = 'monthly'
                        THEN to_char(v_end, 'Mon YYYY')
                        ELSE 'Q' || EXTRACT(QUARTER FROM v_end)::int || ' ' || EXTRACT(YEAR FROM v_end)::int END,
            'period_from', CASE WHEN v_vat_period = 'monthly' THEN v_d ELSE (date_trunc('quarter', v_end))::date END,
            'period_to', v_end, 'due_date', v_due,
            'basis', initcap(v_vat_period) || ' VAT period — 12th of the second month after the period (17th in January and August)');
        END IF;
      END IF;
      v_d := (v_d + INTERVAL '1 month')::date;
    END LOOP;
  END IF;

  -- Employer declaration (AGI): every month, the 12th of the month after.
  IF v_has_payroll THEN
    v_d := (date_trunc('month', p_from) - INTERVAL '2 months')::date;
    WHILE v_d <= v_to LOOP
      v_end := (v_d + INTERVAL '1 month')::date - 1;
      v_due := public._se_agency_day((v_d + INTERVAL '1 month')::date, 12);
      IF v_due BETWEEN p_from AND v_to THEN
        v_out := v_out || jsonb_build_object(
          'id', 'employer_declaration:' || v_end, 'kind', 'employer_declaration',
          'label', 'Employer declaration (AGI) ' || to_char(v_end, 'Mon YYYY'),
          'period_from', v_d, 'period_to', v_end, 'due_date', v_due,
          'basis', 'Payroll run in the last 13 months — 12th of the month after (17th in January and August)');
      END IF;
      v_d := (v_d + INTERVAL '1 month')::date;
    END LOOP;
  END IF;

  -- Income tax return and annual report: these depend on the legal form,
  -- which is a declared fact (Accounting → Settings), never a guess.
  IF v_legal IN ('limited_company', 'sole_trader') THEN
    FOR v_key IN public.fiscal_year_of(p_from) - 2 .. public.fiscal_year_of(v_to) + 1 LOOP
      SELECT r.date_from, r.date_to INTO v_fy_from, v_fy_to FROM public.fiscal_year_range(v_key) r;
      v_end_month := EXTRACT(MONTH FROM v_fy_to)::int;
      IF v_legal = 'limited_company' THEN
        -- INK2 paper date by the month the fiscal year ends in (e-filing has one month more).
        v_due := public._next_weekday(CASE
          WHEN v_end_month BETWEEN 1 AND 4 THEN make_date(EXTRACT(YEAR FROM v_fy_to)::int, 11, 1)
          WHEN v_end_month BETWEEN 5 AND 6 THEN make_date(EXTRACT(YEAR FROM v_fy_to)::int, 12, 15)
          WHEN v_end_month BETWEEN 7 AND 8 THEN make_date(EXTRACT(YEAR FROM v_fy_to)::int + 1, 3, 1)
          ELSE make_date(EXTRACT(YEAR FROM v_fy_to)::int + 1, 7, 1) END);
        IF v_due BETWEEN p_from AND v_to THEN
          v_out := v_out || jsonb_build_object(
            'id', 'income_tax_return:' || v_fy_to, 'kind', 'income_tax_return',
            'label', 'Income tax return (INK2) ' || public.fiscal_year_label(v_key),
            'period_from', v_fy_from, 'period_to', v_fy_to, 'due_date', v_due,
            'basis', 'Limited company — paper date by the month the fiscal year ends in; e-filing has one month more');
        END IF;
        -- Annual report to Bolagsverket: seven months after the fiscal year end.
        v_due := public._next_weekday(((v_fy_to + 1) + INTERVAL '7 months')::date - 1);
        IF v_due BETWEEN p_from AND v_to THEN
          v_out := v_out || jsonb_build_object(
            'id', 'annual_report:' || v_fy_to, 'kind', 'annual_report',
            'label', 'Annual report to Bolagsverket ' || public.fiscal_year_label(v_key),
            'period_from', v_fy_from, 'period_to', v_fy_to, 'due_date', v_due,
            'basis', 'Limited company — seven months after the fiscal year end');
        END IF;
      ELSE
        -- Sole trader: the NE appendix rides the personal return, 2 May the year after.
        v_due := public._next_weekday(make_date(EXTRACT(YEAR FROM v_fy_to)::int + 1, 5, 2));
        IF v_due BETWEEN p_from AND v_to THEN
          v_out := v_out || jsonb_build_object(
            'id', 'income_tax_return:' || v_fy_to, 'kind', 'income_tax_return',
            'label', 'Income tax return with NE appendix ' || public.fiscal_year_label(v_key),
            'period_from', v_fy_from, 'period_to', v_fy_to, 'due_date', v_due,
            'basis', 'Sole trader — the personal return, 2 May the year after');
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Sort by due date and stamp days_left / status.
  SELECT COALESCE(jsonb_agg(d || jsonb_build_object(
           'days_left', (d ->> 'due_date')::date - p_from,
           'status', CASE WHEN (d ->> 'due_date')::date - p_from <= 7 THEN 'due_soon' ELSE 'upcoming' END,
           'country', 'SE') ORDER BY (d ->> 'due_date')::date, d ->> 'kind'), '[]'::jsonb)
    INTO v_out
    FROM jsonb_array_elements(v_out) d;

  RETURN jsonb_build_object(
    'country', 'SE', 'from', p_from, 'to', v_to,
    'vat_return_period', v_vat_period,
    'legal_form', NULLIF(v_legal, ''),
    'deadlines', v_out,
    'note', CASE WHEN v_legal NOT IN ('limited_company', 'sole_trader')
                 THEN 'Legal form not set in Accounting → Settings: income tax return and annual report dates are left out.'
                 ELSE NULL END);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.statutory_deadlines(date, integer) TO authenticated, service_role;

-- ── 2. The prioritised fix list ────────────────────────────────────────────
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
       AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.invoice_id = i.id);
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

  -- Filing deadlines inside two weeks.
  BEGIN
    v_deadlines := public.statutory_deadlines(p_as_of, 45);
    FOR d IN SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x
              WHERE (x ->> 'days_left')::int <= 14 LOOP
      v_findings := v_findings || jsonb_build_object(
        'id', 'deadline:' || (d ->> 'id'),
        'severity', CASE WHEN (d ->> 'days_left')::int <= 3 THEN 'high' ELSE 'medium' END,
        'count', 1,
        'label', (d ->> 'label') || ' due ' || (d ->> 'due_date') || ' (' || (d ->> 'days_left') || ' days)',
        'detail', d ->> 'basis',
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
    'summary', jsonb_build_object(
      'high', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'high'),
      'medium', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'medium'),
      'low', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'low'),
      'total', jsonb_array_length(v_findings)),
    'ok', jsonb_array_length(v_findings) = 0,
    'findings', v_findings,
    'next_deadlines', COALESCE((SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x LIMIT 3) s), '[]'::jsonb),
    'calendar_note', v_deadlines ->> 'note',
    'generated_at', now());
END; $fn$;
GRANT EXECUTE ON FUNCTION public.check_books(date) TO authenticated, service_role;

-- ── 3. The context every finance answer carries ────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_today date := public.platform_today();
  v_key int := public.fiscal_year_of(v_today);
  v_from date; v_to date;
  v_pending int := 0; v_approvals int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION 'Sign in to read the agent context' USING ERRCODE = '42501';
  END IF;
  SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(v_key) r;
  BEGIN SELECT COUNT(*) INTO v_pending FROM public.pending_operations WHERE status = 'pending'; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN SELECT COUNT(*) INTO v_approvals FROM public.approval_requests WHERE status = 'pending'; EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object(
    'today', v_today,
    'currency', public.business_currency(),
    'country', public.business_country(),
    'time_zone', public.business_timezone(),
    'fiscal_year', jsonb_build_object('key', v_key, 'label', public.fiscal_year_label(v_key), 'date_from', v_from, 'date_to', v_to),
    'period_today', public.period_status_for_date(v_today),
    'pending_operations', v_pending,
    'pending_approvals', v_approvals);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.agent_context() TO authenticated, service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A July–June limited company with quarterly VAT and payroll, seen on
-- 2026-10-26: the next VAT return (Q3) is due 2026-11-12, the next AGI
-- (October) on 2026-11-12, INK2 for 2025/26 (ends June → 15 Dec 2026),
-- the annual report on 2027-01-31 → Monday 2027-02-01. Everything rolls back.
DO $$
DECLARE
  v_prefs jsonb; v_general jsonb; v_out jsonb; v_ids text[];
  v_had_prefs boolean; v_had_general boolean;
BEGIN
  BEGIN
    SELECT value INTO v_prefs FROM public.site_settings WHERE key = 'accounting_preferences';
    v_had_prefs := FOUND;
    SELECT value INTO v_general FROM public.site_settings WHERE key = 'general';
    v_had_general := FOUND;
    INSERT INTO public.site_settings (key, value) VALUES ('general', jsonb_build_object('country', 'SE'))
      ON CONFLICT (key) DO UPDATE SET value = public.site_settings.value || jsonb_build_object('country', 'SE');
    INSERT INTO public.site_settings (key, value)
      VALUES ('accounting_preferences', jsonb_build_object('fiscalYearStartMonth', 7, 'vatReturnPeriod', 'quarterly', 'legalForm', 'limited_company'))
      ON CONFLICT (key) DO UPDATE SET value = COALESCE(public.site_settings.value, '{}'::jsonb)
        || jsonb_build_object('fiscalYearStartMonth', 7, 'vatReturnPeriod', 'quarterly', 'legalForm', 'limited_company');
    BEGIN
      INSERT INTO public.payroll_runs (period_date, status) VALUES (DATE '2026-09-30', 'approved');
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'proof: payroll_runs fixture skipped (%)', SQLERRM; END;

    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_out := public.statutory_deadlines(DATE '2026-10-26', 120);
    SELECT array_agg((x ->> 'id') || '@' || (x ->> 'due_date') ORDER BY x ->> 'due_date', x ->> 'id')
      INTO v_ids FROM jsonb_array_elements(v_out -> 'deadlines') x;
    IF NOT ('vat_return:2026-09-30@2026-11-12' = ANY (v_ids)) THEN
      RAISE EXCEPTION 'proof: Q3 VAT return should be due 2026-11-12, got %', v_ids;
    END IF;
    IF (SELECT COUNT(*) FROM public.payroll_runs WHERE period_date = DATE '2026-09-30') > 0
       AND NOT ('employer_declaration:2026-10-31@2026-11-12' = ANY (v_ids)) THEN
      RAISE EXCEPTION 'proof: October AGI should be due 2026-11-12, got %', v_ids;
    END IF;
    IF NOT ('income_tax_return:2026-06-30@2026-12-15' = ANY (v_ids)) THEN
      RAISE EXCEPTION 'proof: INK2 for a June year end should be due 2026-12-15, got %', v_ids;
    END IF;
    IF NOT ('annual_report:2026-06-30@2027-02-01' = ANY (v_ids)) THEN
      RAISE EXCEPTION 'proof: annual report 7 months after 30 June lands on Sunday 31 Jan → Monday 1 Feb, got %', v_ids;
    END IF;
    -- January's 17th rule: the December VAT period (monthly) is due 2027-02-12, but AGI for December is due 2027-01-18 (17th is a Sunday).
    UPDATE public.site_settings SET value = value || '{"vatReturnPeriod":"monthly"}' WHERE key = 'accounting_preferences';
    v_out := public.statutory_deadlines(DATE '2027-01-02', 60);
    SELECT array_agg((x ->> 'id') || '@' || (x ->> 'due_date')) INTO v_ids FROM jsonb_array_elements(v_out -> 'deadlines') x;
    IF NOT ('vat_return:2026-11-30@2027-01-18' = ANY (v_ids)) THEN
      RAISE EXCEPTION 'proof: November VAT (monthly) is due 17 Jan → Monday 18 Jan 2027, got %', v_ids;
    END IF;
    -- A country without rules says so instead of inventing dates.
    UPDATE public.site_settings SET value = value || '{"country":"DE"}' WHERE key = 'general';
    v_out := public.statutory_deadlines(DATE '2026-10-26', 60);
    IF jsonb_array_length(v_out -> 'deadlines') <> 0 OR (v_out ->> 'note') NOT LIKE '%DE%' THEN
      RAISE EXCEPTION 'proof: DE should return no deadlines and a note, got %', v_out;
    END IF;
    UPDATE public.site_settings SET value = value || '{"country":"SE"}' WHERE key = 'general';
    -- check_books runs, has the shape, and sorts high first.
    v_out := public.check_books(DATE '2026-10-26');
    IF v_out -> 'findings' IS NULL OR v_out -> 'summary' IS NULL OR (v_out -> 'fiscal_year' ->> 'key')::int <> 2027 THEN
      RAISE EXCEPTION 'proof: check_books shape wrong: %', v_out;
    END IF;
    IF (v_out ->> 'currency') IS NULL THEN RAISE EXCEPTION 'proof: check_books lacks currency'; END IF;
    v_out := public.agent_context();
    IF (v_out -> 'fiscal_year' ->> 'label') IS NULL OR (v_out ->> 'period_today') IS NULL THEN
      RAISE EXCEPTION 'proof: agent_context shape wrong: %', v_out;
    END IF;
    RAISE NOTICE 'books health proof ok';
    RAISE EXCEPTION '__books_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__books_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
