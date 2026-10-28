-- ─────────────────────────────────────────────────────────────────────────────
-- Registret över inlämnade deklarationer — statutory_filings
-- ─────────────────────────────────────────────────────────────────────────────
-- The statutory calendar (20261026130000) could only say "upcoming": without a
-- record of what was filed it could not tell a late return from a filed one,
-- so it never said "overdue" and kept asking about returns long filed. This
-- is that record. A filing is recorded by a person (the VAT tab's "Mark as
-- filed", the Filings tab) or by an agent a person told (manage_statutory_filing)
-- with the agency's reference; the calendar then answers filed / overdue /
-- due_soon / upcoming, check_books flags what was due and never recorded, and
-- a filed return goes quiet.
--
-- The register records the FACT of filing, not the return itself: the figures
-- stay in the ledger (prepare_vat_return reads them), the reference points at
-- the agency's copy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.statutory_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('vat_return', 'employer_declaration', 'income_tax_return', 'annual_report', 'periodic_summary', 'other')),
  period_from date,
  period_to date NOT NULL,
  due_date date,
  filed_at date NOT NULL DEFAULT public.platform_today(),
  filed_by uuid,
  reference text,
  amount_cents bigint,
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, period_to)
);
COMMENT ON TABLE public.statutory_filings IS 'What was filed with the agency and when (VAT return, AGI, INK2/NE, annual report) — the fact and the reference, not the return. The calendar (statutory_deadlines) reads it to say filed / overdue.';

ALTER TABLE public.statutory_filings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS statutory_filings_read ON public.statutory_filings;
CREATE POLICY statutory_filings_read ON public.statutory_filings FOR SELECT TO authenticated
  USING (public.can_access_module(auth.uid(), 'accounting'));
-- Writes go through manage_statutory_filing (SECURITY DEFINER, same door).

CREATE OR REPLACE FUNCTION public.manage_statutory_filing(
  p_action text DEFAULT 'list',
  p_kind text DEFAULT NULL,
  p_period_to date DEFAULT NULL,
  p_period_from date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_filed_at date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_amount_cents bigint DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_filing_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_row public.statutory_filings; v_source text; v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Only accounting staff can manage the filing register' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.period_to DESC, f.kind), '[]'::jsonb) INTO v_rows
      FROM public.statutory_filings f
     WHERE f.period_to >= COALESCE(p_from, public.platform_today() - 450)
       AND f.period_to <= COALESCE(p_to, public.platform_today() + 400)
       AND (p_kind IS NULL OR f.kind = p_kind);
    RETURN jsonb_build_object('success', true, 'filings', v_rows);
  ELSIF p_action = 'record' THEN
    IF p_kind IS NULL OR p_period_to IS NULL THEN
      RAISE EXCEPTION 'kind and period_to are required: which return, for which period (its last day)';
    END IF;
    IF p_kind NOT IN ('vat_return', 'employer_declaration', 'income_tax_return', 'annual_report', 'periodic_summary', 'other') THEN
      RAISE EXCEPTION 'kind must be vat_return, employer_declaration, income_tax_return, annual_report, periodic_summary or other (got %)', p_kind;
    END IF;
    IF p_filed_at IS NOT NULL AND p_filed_at > public.platform_today() THEN
      RAISE EXCEPTION 'filed_at % is in the future — a filing is recorded after it happened', p_filed_at;
    END IF;
    v_source := CASE WHEN auth.role() = 'service_role' THEN 'agent' ELSE 'manual' END;
    INSERT INTO public.statutory_filings (kind, period_from, period_to, due_date, filed_at, filed_by, reference, amount_cents, notes, source)
    VALUES (p_kind, p_period_from, p_period_to, p_due_date, COALESCE(p_filed_at, public.platform_today()), auth.uid(), NULLIF(btrim(p_reference), ''), p_amount_cents, p_notes, v_source)
    ON CONFLICT (kind, period_to) DO UPDATE SET
      period_from = COALESCE(EXCLUDED.period_from, public.statutory_filings.period_from),
      due_date = COALESCE(EXCLUDED.due_date, public.statutory_filings.due_date),
      filed_at = EXCLUDED.filed_at,
      filed_by = COALESCE(EXCLUDED.filed_by, public.statutory_filings.filed_by),
      reference = COALESCE(EXCLUDED.reference, public.statutory_filings.reference),
      amount_cents = COALESCE(EXCLUDED.amount_cents, public.statutory_filings.amount_cents),
      notes = COALESCE(EXCLUDED.notes, public.statutory_filings.notes),
      source = EXCLUDED.source,
      updated_at = now()
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('success', true, 'filing', to_jsonb(v_row),
      'note', CASE WHEN v_row.reference IS NULL THEN 'Recorded without the agency reference — add it when you have it (record again with p_reference).' ELSE NULL END);
  ELSIF p_action = 'delete' THEN
    IF p_filing_id IS NULL THEN RAISE EXCEPTION 'filing_id is required for delete'; END IF;
    DELETE FROM public.statutory_filings WHERE id = p_filing_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Filing % not found', p_filing_id; END IF;
    RETURN jsonb_build_object('success', true, 'deleted', p_filing_id, 'note', 'The calendar treats the period as not filed again.');
  ELSE
    RAISE EXCEPTION 'Unknown action: % (list | record | delete)', p_action;
  END IF;
END; $fn$;
GRANT EXECUTE ON FUNCTION public.manage_statutory_filing(text, text, date, date, date, date, text, bigint, text, uuid, date, date) TO authenticated, service_role;

-- ── The calendar reads the register. New signature (p_today): the old
-- overload goes first, or PostgREST cannot choose between the two. ─────────
DROP FUNCTION IF EXISTS public.statutory_deadlines(date, integer);
CREATE OR REPLACE FUNCTION public.statutory_deadlines(p_from date DEFAULT public.platform_today(), p_days integer DEFAULT 90, p_today date DEFAULT public.platform_today())
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
      'country', v_country, 'from', p_from, 'to', v_to, 'today', p_today, 'deadlines', '[]'::jsonb, 'overdue', 0, 'filed', 0,
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

  -- Sort by due date and stamp days_left / status. The register decides
  -- "filed"; the calendar decides "overdue" (due before today, not filed),
  -- "due_soon" (within a week) and "upcoming" — all relative to p_today.
  SELECT COALESCE(jsonb_agg(d || jsonb_build_object(
           'days_left', (d ->> 'due_date')::date - p_today,
           'status', CASE WHEN f.id IS NOT NULL THEN 'filed'
                          WHEN (d ->> 'due_date')::date < p_today THEN 'overdue'
                          WHEN (d ->> 'due_date')::date - p_today <= 7 THEN 'due_soon'
                          ELSE 'upcoming' END,
           'filed', f.id IS NOT NULL,
           'filing_id', f.id, 'filed_at', f.filed_at, 'reference', f.reference, 'amount_cents', f.amount_cents,
           'country', 'SE') ORDER BY (d ->> 'due_date')::date, d ->> 'kind'), '[]'::jsonb)
    INTO v_out
    FROM jsonb_array_elements(v_out) d
    LEFT JOIN public.statutory_filings f ON f.kind = d ->> 'kind' AND f.period_to = (d ->> 'period_to')::date;

  RETURN jsonb_build_object(
    'country', 'SE', 'from', p_from, 'to', v_to, 'today', p_today,
    'vat_return_period', v_vat_period,
    'overdue', (SELECT COUNT(*) FROM jsonb_array_elements(v_out) x WHERE x ->> 'status' = 'overdue'),
    'filed', (SELECT COUNT(*) FROM jsonb_array_elements(v_out) x WHERE x ->> 'status' = 'filed'),
    'legal_form', NULLIF(v_legal, ''),
    'deadlines', v_out,
    'note', CASE WHEN v_legal NOT IN ('limited_company', 'sole_trader')
                 THEN 'Legal form not set in Accounting → Settings: income tax return and annual report dates are left out.'
                 ELSE NULL END);
END; $fn$;
GRANT EXECUTE ON FUNCTION public.statutory_deadlines(date, integer, date) TO authenticated, service_role;

-- ── check_books looks a year back for what was due and never recorded ─────
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

  -- Filing deadlines: a year back for what was due and never recorded as
  -- filed (overdue — the register, not the calendar, says "filed"), and the
  -- ones inside two weeks. Filed returns are quiet.
  BEGIN
    v_deadlines := public.statutory_deadlines(p_as_of - 400, 445, p_as_of);
    FOR d IN SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x
              WHERE x ->> 'status' = 'overdue' LOOP
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
              WHERE x ->> 'status' IN ('due_soon', 'upcoming') AND (x ->> 'days_left')::int <= 14 LOOP
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
    'summary', jsonb_build_object(
      'high', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'high'),
      'medium', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'medium'),
      'low', (SELECT COUNT(*) FROM jsonb_array_elements(v_findings) f WHERE f ->> 'severity' = 'low'),
      'total', jsonb_array_length(v_findings)),
    'ok', jsonb_array_length(v_findings) = 0,
    'findings', v_findings,
    'next_deadlines', COALESCE((SELECT jsonb_agg(x) FROM (SELECT x FROM jsonb_array_elements(COALESCE(v_deadlines -> 'deadlines', '[]'::jsonb)) x WHERE x ->> 'status' IN ('due_soon', 'upcoming') LIMIT 3) s), '[]'::jsonb),
    'overdue_filings', COALESCE((v_deadlines ->> 'overdue')::int, 0),
    'calendar_note', v_deadlines ->> 'note',
    'generated_at', now());
END; $fn$;
GRANT EXECUTE ON FUNCTION public.check_books(date) TO authenticated, service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- Quarterly VAT, seen 2026-10-26: Q2 (due 2026-08-12) unrecorded is overdue
-- and a high finding; recording it turns it filed and the finding goes; Q3
-- (due 2026-11-12) stays upcoming; a filing dated in the future is refused;
-- deleting the record makes Q2 overdue again. Rolled back.
DO $$
DECLARE v_out jsonb; v_q2 jsonb; v_id uuid; v_failed boolean; v_prefs jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.site_settings (key, value) VALUES ('general', jsonb_build_object('country', 'SE'))
      ON CONFLICT (key) DO UPDATE SET value = public.site_settings.value || jsonb_build_object('country', 'SE');
    INSERT INTO public.site_settings (key, value) VALUES ('accounting_preferences', jsonb_build_object('fiscalYearStartMonth', 1, 'vatReturnPeriod', 'quarterly'))
      ON CONFLICT (key) DO UPDATE SET value = COALESCE(public.site_settings.value, '{}'::jsonb) || jsonb_build_object('fiscalYearStartMonth', 1, 'vatReturnPeriod', 'quarterly');

    v_out := public.statutory_deadlines(DATE '2026-06-01', 200, DATE '2026-10-26');
    SELECT x INTO v_q2 FROM jsonb_array_elements(v_out -> 'deadlines') x WHERE x ->> 'id' = 'vat_return:2026-06-30';
    IF v_q2 IS NULL OR v_q2 ->> 'status' <> 'overdue' OR (v_q2 ->> 'days_left')::int >= 0 THEN
      RAISE EXCEPTION 'proof: Q2 should be overdue with negative days_left, got %', v_q2;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.check_books(DATE '2026-10-26') -> 'findings') f
                    WHERE f ->> 'id' = 'deadline_overdue:vat_return:2026-06-30' AND f ->> 'severity' = 'high') THEN
      RAISE EXCEPTION 'proof: check_books should flag the unrecorded Q2 return';
    END IF;
    -- Record it.
    v_out := public.manage_statutory_filing('record', 'vat_return', DATE '2026-06-30', DATE '2026-04-01', DATE '2026-08-12', DATE '2026-08-10', 'SKV-TEST-123', 125000, NULL, NULL, NULL, NULL);
    v_id := (v_out -> 'filing' ->> 'id')::uuid;
    IF v_id IS NULL OR (v_out -> 'filing' ->> 'source') <> 'agent' THEN RAISE EXCEPTION 'proof: record failed: %', v_out; END IF;
    v_out := public.statutory_deadlines(DATE '2026-06-01', 200, DATE '2026-10-26');
    SELECT x INTO v_q2 FROM jsonb_array_elements(v_out -> 'deadlines') x WHERE x ->> 'id' = 'vat_return:2026-06-30';
    IF v_q2 ->> 'status' <> 'filed' OR v_q2 ->> 'reference' <> 'SKV-TEST-123' OR (v_out ->> 'filed')::int < 1 THEN
      RAISE EXCEPTION 'proof: Q2 should read filed with its reference, got %', v_q2;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(public.check_books(DATE '2026-10-26') -> 'findings') f WHERE f ->> 'id' = 'deadline_overdue:vat_return:2026-06-30') THEN
      RAISE EXCEPTION 'proof: a recorded filing should not be flagged';
    END IF;
    -- Q3 stays upcoming (due 2026-11-12 seen from 2026-10-26).
    SELECT x INTO v_q2 FROM jsonb_array_elements(v_out -> 'deadlines') x WHERE x ->> 'id' = 'vat_return:2026-09-30';
    IF v_q2 ->> 'status' <> 'upcoming' OR (v_q2 ->> 'days_left')::int <> 17 THEN
      RAISE EXCEPTION 'proof: Q3 should be upcoming in 17 days, got %', v_q2;
    END IF;
    -- A future filing date is refused.
    v_failed := false;
    BEGIN
      PERFORM public.manage_statutory_filing('record', 'vat_return', DATE '2026-09-30', NULL, NULL, public.platform_today() + 1, NULL, NULL, NULL, NULL, NULL, NULL);
    EXCEPTION WHEN raise_exception THEN v_failed := SQLERRM LIKE '%in the future%'; END;
    IF NOT v_failed THEN RAISE EXCEPTION 'proof: a future filing date was accepted'; END IF;
    -- Undo makes it overdue again.
    PERFORM public.manage_statutory_filing('delete', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, v_id, NULL, NULL);
    v_out := public.statutory_deadlines(DATE '2026-06-01', 200, DATE '2026-10-26');
    SELECT x INTO v_q2 FROM jsonb_array_elements(v_out -> 'deadlines') x WHERE x ->> 'id' = 'vat_return:2026-06-30';
    IF v_q2 ->> 'status' <> 'overdue' THEN RAISE EXCEPTION 'proof: after delete Q2 should be overdue again, got %', v_q2; END IF;
    RAISE NOTICE 'filing register proof ok';
    RAISE EXCEPTION '__filings_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__filings_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
