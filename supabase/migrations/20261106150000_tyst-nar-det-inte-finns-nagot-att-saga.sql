-- ─────────────────────────────────────────────────────────────────────────────
-- Tyst när det inte finns något att säga (2026-11-06).
--
-- A fresh instance with pages and blog was alarmed every morning: the
-- operations check counted quotes, invoices, contracts, tickets and visits
-- for modules that were off; the books check accused the business of VAT
-- returns for periods before its books began; and the heartbeat carried an
-- always-active "weekly digest" objective that no idle check could get past.
-- Three rules, in the functions that answer:
--
--   1. check_operations asks site_settings.modules per area and says nothing
--      about a module that is off. Automations are always judged.
--   2. check_books accuses nothing before the books began: the earliest of
--      the first declared fiscal year and the first journal entry. No books,
--      no overdue filings — and a note that says so.
--   3. The "Set up weekly digest" objective is completed where it exists:
--      the digest is an automation now.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3. The digest objective was never a goal.
UPDATE public.agent_objectives
   SET status = 'completed'
 WHERE goal = 'Set up weekly digest — monitor site performance and report key metrics every Friday'
   AND status IN ('active', 'paused');

-- 1. The operations check per enabled module.
CREATE OR REPLACE FUNCTION public.check_operations(p_as_of date DEFAULT public.platform_today())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_findings jsonb := '[]'::jsonb;
  v_cur text := public.business_currency();
  v_modules jsonb;
  v_multi boolean := false;
  v_chat jsonb;
  v_n int; v_oldest date; v_assignable jsonb := '[]'::jsonb;
  v_staff int := 0;
  v_areas text[] := '{}';
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin')
          OR public.can_access_module(auth.uid(), 'tickets')
          OR public.can_access_module(auth.uid(), 'deals')) THEN
    RAISE EXCEPTION 'Only admin, support or sales staff can run the operations check' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_modules FROM public.site_settings WHERE key = 'modules';
  v_multi := COALESCE((v_modules -> 'multi-currency' ->> 'enabled')::boolean, false)
          OR COALESCE((v_modules -> 'multiCurrency' ->> 'enabled')::boolean, false);

  -- ── Sales (quotes, deals) ────────────────────────────────────────────────
  IF COALESCE((v_modules -> 'quotes' ->> 'enabled')::boolean, false) THEN
    v_areas := array_append(v_areas, 'sales');
    -- A sent quote without a validity never expires and is never chased.
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.quotes
       WHERE status IN ('sent', 'viewed') AND valid_until IS NULL;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'quotes_without_expiry', 'area', 'sales', 'severity', 'high', 'count', v_n,
          'label', v_n || ' sent quote' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' without a validity date',
          'detail', 'A quote with no valid_until never expires and the expiry reminder never chases it. Give it a date (30 days from sending is the default a new quote gets).',
          'fix', jsonb_build_object('skill', 'manage_quote', 'args', jsonb_build_object('action', 'update', 'quote_id', '<quote_id>', 'valid_until', '<YYYY-MM-DD>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

    -- A draft with neither a lead nor a line, older than a week, is residue.
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.quotes
       WHERE status = 'draft' AND lead_id IS NULL AND company_id IS NULL
         AND jsonb_array_length(COALESCE(line_items, '[]'::jsonb)) = 0
         AND created_at::date <= p_as_of - 7;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'empty_draft_quotes', 'area', 'sales', 'severity', 'low', 'count', v_n,
          'label', v_n || ' empty draft quote' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' with no lead and no lines',
          'detail', 'Nothing can be sent or converted from these. Attach a lead and lines, or cancel them.',
          'fix', jsonb_build_object('skill', 'manage_quote', 'args', jsonb_build_object('action', 'update', 'quote_id', '<quote_id>', 'status', 'cancelled')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  IF COALESCE((v_modules -> 'deals' ->> 'enabled')::boolean, false) THEN
    IF NOT ('sales' = ANY (v_areas)) THEN v_areas := array_append(v_areas, 'sales'); END IF;
    -- Open deals past the date they were expected to close.
    BEGIN
      SELECT COUNT(*), MIN(expected_close) INTO v_n, v_oldest FROM public.deals
       WHERE stage NOT IN ('closed_won', 'closed_lost') AND expected_close IS NOT NULL AND expected_close < p_as_of;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'deals_past_expected_close', 'area', 'sales', 'severity', CASE WHEN v_oldest < p_as_of - 30 THEN 'high' ELSE 'medium' END, 'count', v_n,
          'label', v_n || ' open deal' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' past the expected close date',
          'detail', 'Oldest expected ' || v_oldest || '. Move the stage (won/lost) or set a new expected_close — the pipeline forecast counts these as current.',
          'fix', jsonb_build_object('skill', 'manage_deal', 'args', jsonb_build_object('action', 'update', 'deal_id', '<deal_id>', 'expected_close', '<YYYY-MM-DD>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Receivables (invoicing; subscriptions) ───────────────────────────────
  IF COALESCE((v_modules -> 'invoicing' ->> 'enabled')::boolean, false) THEN
    v_areas := array_append(v_areas, 'receivables');
    -- A sent invoice without a due date can never be overdue, so dunning never starts.
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.invoices
       WHERE status IN ('sent'::invoice_status, 'overdue'::invoice_status) AND due_date IS NULL;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'invoices_without_due_date', 'area', 'receivables', 'severity', 'high', 'count', v_n,
          'label', v_n || ' sent invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' without a due date',
          'detail', 'Without due_date an invoice is never overdue and dunning never starts. A new invoice gets one from its payment terms; set it on these.',
          'fix', jsonb_build_object('skill', 'manage_invoice', 'args', jsonb_build_object('action', 'update', 'invoice_id', '<invoice_id>', 'due_date', '<YYYY-MM-DD>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

    -- Documents in a currency the business does not trade in (one-currency sites only).
    IF NOT v_multi THEN
      BEGIN
        SELECT COUNT(*) INTO v_n FROM public.invoices
         WHERE status NOT IN ('cancelled'::invoice_status) AND upper(currency) IS DISTINCT FROM v_cur;
        IF v_n > 0 THEN
          v_findings := v_findings || jsonb_build_object(
            'id', 'invoices_in_foreign_currency', 'area', 'receivables', 'severity', 'medium', 'count', v_n,
            'label', v_n || ' invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not in ' || v_cur,
            'detail', 'The business trades in one currency (' || v_cur || '); multi-currency is off. Either these are mistakes to correct, or switch on multi-currency and set the rates.',
            'fix', jsonb_build_object('skill', 'manage_invoice', 'args', jsonb_build_object('action', 'update', 'invoice_id', '<invoice_id>', 'currency', v_cur)));
        END IF;
      EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    END IF;
  END IF;

  IF COALESCE((v_modules -> 'subscriptions' ->> 'enabled')::boolean, false) AND NOT v_multi THEN
    IF NOT ('receivables' = ANY (v_areas)) THEN v_areas := array_append(v_areas, 'receivables'); END IF;
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.subscriptions
       WHERE status IN ('active', 'trialing', 'past_due') AND upper(currency) IS DISTINCT FROM v_cur;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'subscriptions_in_foreign_currency', 'area', 'receivables', 'severity', 'medium', 'count', v_n,
          'label', v_n || ' subscription' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not in ' || v_cur,
          'detail', 'Recurring revenue in a currency the business does not trade in. subscriptions used to default to USD; set the currency.',
          'fix', jsonb_build_object('skill', 'manage_subscription', 'args', jsonb_build_object('action', 'update', 'subscription_id', '<subscription_id>', 'currency', v_cur)));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Contracts ────────────────────────────────────────────────────────────
  IF COALESCE((v_modules -> 'contracts' ->> 'enabled')::boolean, false) THEN
    v_areas := array_append(v_areas, 'contracts');
    -- Inside (or past) the notice window with no decision recorded.
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.contracts
       WHERE status = 'active' AND end_date IS NOT NULL AND renewal_decision IS NULL
         AND end_date - COALESCE(renewal_notice_days, 30) <= p_as_of + 14;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'contracts_awaiting_renewal_decision', 'area', 'contracts', 'severity', 'high', 'count', v_n,
          'label', v_n || ' contract' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' in the notice window without a decision',
          'detail', 'Renew, terminate or renegotiate — ask the owner, then record it; a recorded decision leaves this list. An auto-renewing contract past its notice date has in effect renewed.',
          'fix', jsonb_build_object('skill', 'manage_contract', 'args', jsonb_build_object('action', 'decide_renewal', 'contract_id', '<contract_id>', 'decision', 'renew|terminate|renegotiate', 'decision_note', '<why>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Support (tickets) ────────────────────────────────────────────────────
  IF COALESCE((v_modules -> 'tickets' ->> 'enabled')::boolean, false) THEN
    v_areas := array_append(v_areas, 'support');
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.tickets
       WHERE status IN ('new', 'open', 'in_progress', 'waiting') AND priority IN ('urgent', 'high') AND assigned_to IS NULL;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'urgent_tickets_unassigned', 'area', 'support', 'severity', 'high', 'count', v_n,
          'label', v_n || ' urgent or high ticket' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' with no owner',
          'detail', 'Nobody is on these. Assign each to a person from `assignable` (an auth user id) and set status open.',
          'fix', jsonb_build_object('skill', 'manage_ticket', 'args', jsonb_build_object('action', 'update', 'id', '<ticket_id>', 'assigned_to', '<user_id from assignable>', 'status', 'open')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.tickets
       WHERE status = 'new' AND created_at::date <= p_as_of - 1;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'tickets_untouched', 'area', 'support', 'severity', 'medium', 'count', v_n,
          'label', v_n || ' ticket' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' still "new" after a day',
          'detail', 'No reply, no owner, no status. A first public reply stops the first-response clock.',
          'fix', jsonb_build_object('skill', 'reply_to_ticket', 'args', jsonb_build_object('p_ticket_id', '<ticket_id>', 'p_body', '<first answer>', 'p_is_internal', false)));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.tickets
       WHERE status IN ('new', 'open', 'in_progress', 'waiting') AND sla_deadline IS NOT NULL AND sla_deadline < (p_as_of + 1)::timestamptz;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'tickets_past_sla', 'area', 'support', 'severity', 'high', 'count', v_n,
          'label', v_n || ' ticket' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' past the SLA deadline',
          'detail', 'The clock has run out. Resolve, or tell the customer when — and escalate what you cannot.',
          'fix', jsonb_build_object('skill', 'manage_ticket', 'args', jsonb_build_object('action', 'update', 'id', '<ticket_id>', 'status', 'in_progress', 'assigned_to', '<user_id from assignable>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Field service ────────────────────────────────────────────────────────
  IF COALESCE((v_modules -> 'fieldService' ->> 'enabled')::boolean, false) THEN
    v_areas := array_append(v_areas, 'field_service');
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.service_orders
       WHERE status = 'draft' AND created_at::date <= p_as_of - 1;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'service_orders_unscheduled', 'area', 'field_service', 'severity', 'medium', 'count', v_n,
          'label', v_n || ' service order' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not yet scheduled',
          'detail', 'A draft has no visit and no technician. Schedule it (action schedule creates the visit); technician_id is an auth user id from `assignable` — check_technician_availability first.',
          'fix', jsonb_build_object('skill', 'manage_service_order', 'args', jsonb_build_object('action', 'schedule', 'id', '<service_order_id>', 'scheduled_start', '<ISO datetime>', 'scheduled_end', '<ISO datetime>', 'technician_id', '<user_id from assignable>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.service_orders
       WHERE status = 'scheduled' AND scheduled_end IS NOT NULL AND scheduled_end < (p_as_of)::timestamptz;
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'service_visits_not_completed', 'area', 'field_service', 'severity', 'medium', 'count', v_n,
          'label', v_n || ' scheduled visit' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' in the past, not completed',
          'detail', 'The visit window has passed and the order is still "scheduled". Complete it (then invoicing follows) or reschedule.',
          'fix', jsonb_build_object('skill', 'manage_service_order', 'args', jsonb_build_object('action', 'complete', 'id', '<service_order_id>')));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Automations: judged by their schedule, never by the calendar — always ─
  v_areas := array_append(v_areas, 'automations');
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.agent_automations
     WHERE enabled = true AND trigger_type = 'cron' AND next_run_at IS NOT NULL AND next_run_at < now() - interval '15 minutes';
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'automations_overdue', 'area', 'automations', 'severity', 'high', 'count', v_n,
        'label', v_n || ' scheduled automation' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' overdue',
        'detail', 'The promised next_run_at is in the past — the dispatcher is not firing it. A weekday job looked at on a Sunday is NOT this; see state in manage_automations list.',
        'fix', jsonb_build_object('skill', 'cron_health_report', 'args', '{}'::jsonb));
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- ── The chat's ability to act ────────────────────────────────────────────
  IF COALESCE((v_modules -> 'chat' ->> 'enabled')::boolean, false) THEN
    v_areas := array_append(v_areas, 'chat');
    BEGIN
      SELECT value INTO v_chat FROM public.site_settings WHERE key = 'chat';
      IF v_chat IS NOT NULL AND COALESCE((v_chat ->> 'widgetEnabled')::boolean, true)
         AND NOT COALESCE((v_chat ->> 'toolCallingEnabled')::boolean, false) THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'chat_cannot_act', 'area', 'chat', 'severity', 'medium', 'count', 1,
          'label', 'The visitor chat cannot act — tool calling is off',
          'detail', 'Without tools the chat can only talk: it cannot save a visitor''s contact, hand off to a person or run a skill, so it sends visitors to a form or a phone number. Turn on toolCallingEnabled (and humanHandoffEnabled); the update merges into the existing chat settings.',
          'fix', jsonb_build_object('skill', 'manage_site_settings', 'args', jsonb_build_object('action', 'update', 'key', 'chat', 'value', jsonb_build_object('toolCallingEnabled', true, 'humanHandoffEnabled', true))));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Who can be assigned — only where work is assigned (tickets, visits) ──
  IF 'support' = ANY (v_areas) OR 'field_service' = ANY (v_areas) THEN
    BEGIN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'roles', r.roles) ORDER BY p.full_name), '[]'::jsonb), COUNT(*)
        INTO v_assignable, v_staff
        FROM public.profiles p
        JOIN (SELECT user_id, array_agg(role::text ORDER BY role) AS roles FROM public.user_roles
               WHERE role IN ('admin', 'support', 'sales', 'employee', 'projects') GROUP BY user_id) r ON r.user_id = p.id;
      IF v_staff = 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'no_assignable_staff', 'area', 'support', 'severity', 'medium', 'count', 0,
          'label', 'Nobody to assign work to',
          'detail', 'No user holds a staff role (admin, support, sales, employee, projects). Tickets and visits need an auth user. An agent cannot create users — ask the owner to invite colleagues under Users.',
          'fix', NULL);
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'as_of', p_as_of, 'currency', v_cur,
    'areas', to_jsonb(v_areas),
    'findings', (SELECT COALESCE(jsonb_agg(f ORDER BY CASE f ->> 'severity' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END), '[]'::jsonb)
                   FROM jsonb_array_elements(v_findings) f),
    'assignable', v_assignable,
    'how_to_fix', 'Read findings in order; each fix carries the skill and the exact argument names — a <placeholder> is the record you choose from the area''s list skill. assignable are the people (auth user ids) a ticket or a visit can go to. areas names the areas judged — a module that is off is not.');
END $fn$;
COMMENT ON FUNCTION public.check_operations(date) IS
  'Read-only: what needs attention across sales, receivables, contracts, support, field service, automations and the chat — per ENABLED module (areas says which were judged) — findings with fix.skill + args, plus assignable people. The operations twin of check_books.';

-- 2. The books check accuses nothing before the books began.
CREATE OR REPLACE FUNCTION public.books_started_on()
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_fy date; v_je date;
BEGIN
  BEGIN
    SELECT MIN(date_from) INTO v_fy FROM public.fiscal_years;
  EXCEPTION WHEN undefined_table THEN v_fy := NULL; END;
  BEGIN
    SELECT MIN(entry_date) INTO v_je FROM public.journal_entries WHERE status = 'posted';
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_je := NULL; END;
  RETURN LEAST(v_fy, v_je);
END $fn$;
REVOKE ALL ON FUNCTION public.books_started_on() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.books_started_on() TO authenticated, service_role;
COMMENT ON FUNCTION public.books_started_on() IS
  'The day the books began on this instance: the earliest of the first declared fiscal year and the first posted journal entry. NULL until either exists. The statutory calendar accuses nothing before it.';

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

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- With tickets off, an unassigned urgent ticket is not a finding and the
-- area is not judged; with tickets on it is. books_started_on reads the
-- earliest fiscal year; an instance with no books has no overdue filing and
-- says why; with the books begun, no overdue finding predates them. Rolled
-- back.
DO $$
DECLARE v_mods jsonb; v_out jsonb; v_ids text[]; v_t uuid; v_started date; v_bad int;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    SELECT value INTO v_mods FROM public.site_settings WHERE key = 'modules';
    INSERT INTO public.tickets (subject, status, priority) VALUES ('proof: urgent, unowned', 'open', 'urgent') RETURNING id INTO v_t;

    UPDATE public.site_settings SET value = COALESCE(v_mods, '{}'::jsonb) || jsonb_build_object('tickets', jsonb_build_object('enabled', false)) WHERE key = 'modules';
    INSERT INTO public.site_settings (key, value) SELECT 'modules', jsonb_build_object('tickets', jsonb_build_object('enabled', false))
      WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'modules');
    v_out := public.check_operations(public.platform_today());
    SELECT array_agg(f ->> 'id') INTO v_ids FROM jsonb_array_elements(v_out -> 'findings') f;
    IF 'urgent_tickets_unassigned' = ANY (COALESCE(v_ids, '{}')) THEN RAISE EXCEPTION 'proof: tickets off, yet a ticket finding (%)', v_ids; END IF;
    IF (v_out -> 'areas') ? 'support' THEN RAISE EXCEPTION 'proof: tickets off, yet support judged'; END IF;

    UPDATE public.site_settings SET value = value || jsonb_build_object('tickets', jsonb_build_object('enabled', true)) WHERE key = 'modules';
    v_out := public.check_operations(public.platform_today());
    SELECT array_agg(f ->> 'id') INTO v_ids FROM jsonb_array_elements(v_out -> 'findings') f;
    IF NOT ('urgent_tickets_unassigned' = ANY (COALESCE(v_ids, '{}'))) THEN RAISE EXCEPTION 'proof: tickets on, ticket finding missing (%)', v_ids; END IF;
    IF NOT ((v_out -> 'areas') ? 'support') THEN RAISE EXCEPTION 'proof: tickets on, yet support not judged'; END IF;

    -- The books.
    v_started := public.books_started_on();
    v_out := public.check_books(public.platform_today());
    IF v_started IS NULL THEN
      IF (v_out ->> 'overdue_filings')::int <> 0 THEN RAISE EXCEPTION 'proof: no books, yet % overdue filings', v_out ->> 'overdue_filings'; END IF;
      IF (v_out ->> 'calendar_note') NOT LIKE 'No books yet%' THEN RAISE EXCEPTION 'proof: no-books note missing (%)', v_out ->> 'calendar_note'; END IF;
    ELSE
      -- Every overdue finding names a period that ended after the books began.
      -- (The ids carry the period end: deadline_overdue:vat_return:<period_to>.)
      SELECT COUNT(*) INTO v_bad FROM jsonb_array_elements(v_out -> 'findings') f
       WHERE f ->> 'id' LIKE 'deadline_overdue:%'
         AND (f -> 'fix' -> 'args' ->> 'p_period_to')::date < v_started;
      IF v_bad > 0 THEN RAISE EXCEPTION 'proof: % overdue filings predate the books (%)', v_bad, v_started; END IF;
    END IF;
    -- The earliest fiscal year wins: a year declared in 1900 moves the start.
    INSERT INTO public.fiscal_years (key, date_from, date_to) VALUES (1900, DATE '1900-01-01', DATE '1900-12-31');
    IF public.books_started_on() <> DATE '1900-01-01' THEN RAISE EXCEPTION 'proof: start should read the earliest fiscal year, got %', public.books_started_on(); END IF;

    RAISE NOTICE 'quiet proof ok';
    RAISE EXCEPTION '__quiet_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__quiet_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
