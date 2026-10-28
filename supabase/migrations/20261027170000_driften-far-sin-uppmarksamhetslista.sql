-- ─────────────────────────────────────────────────────────────────────────────
-- Driften får sin uppmärksamhetslista — check_operations, and a renewal decision
-- ─────────────────────────────────────────────────────────────────────────────
-- Hermes' first morning on Nordbrygg (2026-10-25) composed its own list from
-- seven reads: a sent quote that can never expire, an empty draft quote, an
-- invoice without a due date, two drafts in the wrong currency, a renewal
-- window that had passed, urgent tickets nobody owned, and three "stalled"
-- sweeps that were on schedule. The books have had ONE read for this since
-- 2026-10-26 (check_books: findings with fix.skill + args). Operations gets
-- the same: check_operations — sales, receivables, contracts, support, field
-- service, automations and the chat's ability to act — each finding with the
-- skill and the exact argument names that fix it, and `assignable`: the people
-- a ticket or a visit can go to (dispatch needs auth user ids).
--
-- A renewal window has an answer: renew, terminate or renegotiate. Recorded
-- on the contract (renewal_decision), it silences the radar — the same rule a
-- recorded statutory filing follows.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS renewal_decision text;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS renewal_decided_at timestamptz;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS renewal_decision_note text;
DO $$
BEGIN
  ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_renewal_decision_check;
  ALTER TABLE public.contracts ADD CONSTRAINT contracts_renewal_decision_check
    CHECK (renewal_decision IS NULL OR renewal_decision IN ('renew', 'terminate', 'renegotiate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON COLUMN public.contracts.renewal_decision IS
  'What was decided for the coming renewal: renew | terminate | renegotiate (manage_contract decide_renewal). A decided contract leaves the renewal radar (contract_renewal_check, check_operations).';

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
BEGIN
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin')
          OR public.can_access_module(auth.uid(), 'tickets')
          OR public.can_access_module(auth.uid(), 'deals')) THEN
    RAISE EXCEPTION 'Only admin, support or sales staff can run the operations check' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_modules FROM public.site_settings WHERE key = 'modules';
  v_multi := COALESCE((v_modules -> 'multi-currency' ->> 'enabled')::boolean, false);

  -- ── Sales ────────────────────────────────────────────────────────────────
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

  -- ── Receivables ──────────────────────────────────────────────────────────
  -- A sent invoice without a due date can never be overdue, so dunning never starts.
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.invoices
     WHERE status IN ('sent', 'partially_paid') AND due_date IS NULL;
    IF v_n > 0 THEN
      v_findings := v_findings || jsonb_build_object(
        'id', 'invoices_without_due_date', 'area', 'receivables', 'severity', 'high', 'count', v_n,
        'label', v_n || ' sent invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' without a due date',
        'detail', 'Without due_date the invoice is never overdue and the dunning processor never reminds. Set it from the payment terms (issue date + 30 is the usual).',
        'fix', jsonb_build_object('skill', 'manage_invoice', 'args', jsonb_build_object('action', 'update', 'invoice_id', '<invoice_id>', 'due_date', '<YYYY-MM-DD>')));
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Documents in a currency the business does not trade in (one-currency sites only).
  IF NOT v_multi THEN
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.invoices
       WHERE status IN ('draft', 'sent', 'partially_paid') AND upper(COALESCE(currency, v_cur)) <> upper(v_cur);
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'invoices_in_foreign_currency', 'area', 'receivables', 'severity', 'medium', 'count', v_n,
          'label', v_n || ' open invoice' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not in ' || v_cur,
          'detail', 'The business trades in ' || v_cur || ' and the multi-currency module is off, so these amounts cannot be booked. Set the currency (and check the amount) or enable multi-currency.',
          'fix', jsonb_build_object('skill', 'manage_invoice', 'args', jsonb_build_object('action', 'update', 'invoice_id', '<invoice_id>', 'currency', v_cur)));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
    BEGIN
      SELECT COUNT(*) INTO v_n FROM public.subscriptions
       WHERE status IN ('active', 'trialing', 'past_due') AND upper(COALESCE(currency, v_cur)) <> upper(v_cur);
      IF v_n > 0 THEN
        v_findings := v_findings || jsonb_build_object(
          'id', 'subscriptions_in_foreign_currency', 'area', 'receivables', 'severity', 'medium', 'count', v_n,
          'label', v_n || ' active subscription' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' not in ' || v_cur,
          'detail', 'Every invoice the subscription raises inherits its currency. Set it to ' || v_cur || ' before the next billing date.',
          'fix', jsonb_build_object('skill', 'manage_subscription', 'args', jsonb_build_object('action', 'update', 'subscription_id', '<subscription_id>', 'currency', v_cur)));
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  END IF;

  -- ── Contracts ────────────────────────────────────────────────────────────
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

  -- ── Support ──────────────────────────────────────────────────────────────
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

  -- ── Field service ────────────────────────────────────────────────────────
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

  -- ── Automations: judged by their schedule, never by the calendar ─────────
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

  -- ── Who can be assigned ──────────────────────────────────────────────────
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

  RETURN jsonb_build_object(
    'ok', true, 'as_of', p_as_of, 'currency', v_cur,
    'findings', (SELECT COALESCE(jsonb_agg(f ORDER BY CASE f ->> 'severity' WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END), '[]'::jsonb)
                   FROM jsonb_array_elements(v_findings) f),
    'assignable', v_assignable,
    'how_to_fix', 'Read findings in order; each fix carries the skill and the exact argument names — a <placeholder> is the record you choose from the area''s list skill. assignable are the people (auth user ids) a ticket or a visit can go to.');
END $fn$;
GRANT EXECUTE ON FUNCTION public.check_operations(date) TO authenticated, service_role;
COMMENT ON FUNCTION public.check_operations(date) IS
  'Read-only: what needs attention across sales, receivables, contracts, support, field service, automations and the chat — findings with fix.skill + args, plus assignable people. The operations twin of check_books.';

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A sent quote without a validity date is a high finding with manage_quote as
-- its fix; a contract in its notice window is a finding until a decision is
-- recorded, and not after. Rolled back.
DO $$
DECLARE v_q uuid; v_c uuid; v_out jsonb; v_ids text[];
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.quotes (quote_number, status, line_items, subtotal_cents, tax_cents, total_cents, customer_name)
      VALUES ('PROOF-OPS-1', 'sent', '[]'::jsonb, 0, 0, 0, 'proof') RETURNING id INTO v_q;
    INSERT INTO public.contracts (title, counterparty_name, status, start_date, end_date, renewal_type, renewal_notice_days, body_markdown)
      VALUES ('proof: msa', 'Proof AB', 'active', public.platform_today() - 335, public.platform_today() + 20, 'auto', 30, repeat('Proof agreement text. ', 20)) RETURNING id INTO v_c;
    v_out := public.check_operations(public.platform_today());
    SELECT array_agg(f ->> 'id') INTO v_ids FROM jsonb_array_elements(v_out -> 'findings') f;
    IF NOT ('quotes_without_expiry' = ANY (v_ids)) THEN RAISE EXCEPTION 'proof: quotes_without_expiry missing (%)', v_ids; END IF;
    IF NOT ('contracts_awaiting_renewal_decision' = ANY (v_ids)) THEN RAISE EXCEPTION 'proof: contract finding missing (%)', v_ids; END IF;
    IF (SELECT f -> 'fix' ->> 'skill' FROM jsonb_array_elements(v_out -> 'findings') f WHERE f ->> 'id' = 'quotes_without_expiry') <> 'manage_quote' THEN
      RAISE EXCEPTION 'proof: quote fix should point at manage_quote';
    END IF;
    UPDATE public.contracts SET renewal_decision = 'renew', renewal_decided_at = now() WHERE id = v_c;
    UPDATE public.quotes SET valid_until = public.platform_today() + 30 WHERE id = v_q;
    v_out := public.check_operations(public.platform_today());
    SELECT array_agg(f ->> 'id') INTO v_ids FROM jsonb_array_elements(v_out -> 'findings') f;
    IF 'contracts_awaiting_renewal_decision' = ANY (COALESCE(v_ids, '{}')) THEN
      -- another undecided contract may exist on this instance; only our own must be gone
      IF (SELECT COUNT(*) FROM public.contracts WHERE status = 'active' AND renewal_decision IS NULL AND end_date - COALESCE(renewal_notice_days, 30) <= public.platform_today() + 14 AND id = v_c) > 0 THEN
        RAISE EXCEPTION 'proof: a decided contract should leave the list';
      END IF;
    END IF;
    RAISE NOTICE 'operations check proof ok';
    RAISE EXCEPTION '__operations_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__operations_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
