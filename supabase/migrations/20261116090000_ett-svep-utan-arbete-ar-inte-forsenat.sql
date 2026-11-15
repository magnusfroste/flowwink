-- ─────────────────────────────────────────────────────────────────────────────
-- Ett svep utan arbete är inte försenat (2026-11-16).
--
-- check_operations answered "N scheduled automations overdue" (high) on www,
-- optic and liteit every hour of 2026-11-15. Every one was a sweep with a
-- work_probe (qualify_new_leads, Score visitor intent, Social Post Scheduler,
-- Webinar Reminders, SLA Sweep): since 20261109220000 an idle probed row is
-- not woken and keeps its due next_run_at — on purpose, so the minute work
-- appears it runs — and note_idle_automations() stamps last_triggered_at on
-- every tick. The judge read only next_run_at and called the quietest jobs on
-- the instance late.
--
-- One rule, in three readers (this function, manage_automations list and the
-- admin's automation health — _shared/automations/schedule-state.ts):
-- a probed row whose last_triggered_at is at or after its next_run_at and
-- within the grace was noted idle on the last tick. It is idle, not overdue.
-- When the dispatcher stops, the note stops too, and it is overdue again.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.automation_is_overdue(
  p_enabled boolean, p_trigger_type text, p_trigger_config jsonb,
  p_last_triggered_at timestamptz, p_next_run_at timestamptz)
RETURNS boolean
LANGUAGE sql STABLE SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(p_enabled, false) AND p_trigger_type = 'cron'
     AND p_next_run_at IS NOT NULL AND p_next_run_at < now() - interval '15 minutes'
     AND NOT (
       jsonb_typeof(p_trigger_config -> 'work_probe') = 'string'
       AND p_last_triggered_at IS NOT NULL
       AND p_last_triggered_at >= p_next_run_at
       AND p_last_triggered_at > now() - interval '15 minutes'
     );
$fn$;
REVOKE ALL ON FUNCTION public.automation_is_overdue(boolean, text, jsonb, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.automation_is_overdue(boolean, text, jsonb, timestamptz, timestamptz) TO authenticated, service_role;
COMMENT ON FUNCTION public.automation_is_overdue(boolean, text, jsonb, timestamptz, timestamptz) IS
  'Is a cron automation late against its own schedule? next_run_at more than 15 min past — unless it has a work_probe and was noted idle on the last tick (last_triggered_at at/after next_run_at, within 15 min). Same rule as _shared/automations/schedule-state.ts.';

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
     WHERE public.automation_is_overdue(enabled, trigger_type, trigger_config, last_triggered_at, next_run_at);
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
