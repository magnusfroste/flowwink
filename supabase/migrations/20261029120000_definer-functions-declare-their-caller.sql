-- The definer functions a signed-in customer could still run (security sweep
-- 2026-10-22, item 5: "more definer functions are executable by authenticated
-- without a body guard — next PR"). This is that PR, built from the database,
-- not from a list: every SECURITY DEFINER function in public that
-- `authenticated` may EXECUTE and whose body carries no caller check (187 on
-- 2026-10-29), sorted by who actually calls it.
--
-- • 112 are never called by the browser: edge functions and agent-execute
--   call them with the service role, other definer functions call them as
--   their owner, cron runs them as postgres. None is referenced by an RLS
--   policy, an invoker-side function, a trigger, a view, a default or a
--   constraint (checked in pg_catalog before this was written; is_manager_of,
--   can_access_flowtable_base, chain_approval_satisfied, request_entity_approval
--   and the business_* defaults are, and stay). EXECUTE is revoked from anon
--   and authenticated: a self-registered customer can no longer move stock,
--   close migration runs, read payroll totals or search agent memory by name.
-- • 26 are called by the browser through supabase.rpc() and get a guard in
--   the body: the owning module through can_access_module() (the matrix, not
--   a role list), any staff for the document-number counter, the employee's
--   own row for leave balances, the host for ending a meeting room, admin for
--   the platform readers (src/lib/admin-only-rpcs.ts carries their reasons).
--   Service role always passes, so agents and crons are untouched. Six were
--   LANGUAGE sql and are now plpgsql with the same statement under the guard.
-- • The rest keep their grants: pure helpers (fiscal_*, business_*,
--   format_business_amount, fx), the token and public-page readers, and the
--   anonymous doors (request_booking, submit_support_request, register_for_webinar,
--   ingest_form_lead, …) that ARE the public surface — rate limiting is theirs,
--   a separate change.
--
-- Nothing a legitimate caller does changes. Proof at the end: a staff session
-- without the module is refused, the service role is not, a revoked function
-- is denied to authenticated.

-- ── 1. Revoke what the browser never calls (every overload) ────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY (ARRAY['_demo_register_row','_ensure_manual_journal','_resolve_flowtable_base','_resolve_flowtable_table','_upsert_quant','accounting_period_status','apply_return_line_stock','apply_stock_movement_event','assert_a_born_invoice_reaches_the_ledger','assert_a_party_can_be_retired','assert_bank_account_rules','assert_commercial_fields_inherit','assert_company_and_party_share_an_id','assert_invoiced_customer_is_visible','assert_language_is_personal_not_commercial','assert_ledger_rolls_up_to_company','assert_no_silently_unbillable_subscriptions','assert_own_company_is_a_party','attach_expense_receipts_to_entry','booked_counterparty_counts','calculate_vacation_days','check_approval_escalations','checkout_objective','compensation_revision_totals','complete_migration_run','consume_order_stock','consume_stock_fefo','conversion_completions','create_subscription_from_contract','demo_seedable_modules','document_bank_partner','document_retention_years','ensure_site_languages','exchange_rate_or_null','expense_po_match_eval','fefo_suggest_lot','flowpilot_approved_pending','generate_pos_receipt_number','get_conversation_token_estimate','get_expense_rate','get_leave_balance','get_user_role','increment_template_usage','inventory_gl_reconciliation','invoice_outstanding','is_testbed','journal_entry_approval_applies','journal_entry_approval_covered','journal_entry_debit_total','lint_get_not_null_columns','lint_get_rpc_signatures','list_flowtable_tables','list_quote_revisions','list_reorder_candidates','list_webmeet_rooms','log_ai_usage','manage_docs_page','match_consultants','mcp_approve_payroll_run','mcp_create_payroll_run','mcp_dispose_fixed_asset','mcp_global_search','mcp_list_payroll_lines','mcp_list_payroll_runs','mcp_mark_payroll_paid','mcp_register_fixed_asset','mcp_revalue_open_balances','mcp_run_monthly_depreciation','mcp_set_exchange_rate','mo_scrapped_quantity','newsletter_list_summary','next_mo_number','partner_address','partner_fiscal_position','partner_language','partner_payout_account','period_status_for_date','pick_vendor_price','po_invoiced_value_cents','project_person_name','propose_accruals','purchase_agreement_snapshot','release_agent_conversations','release_agent_lock','reorder_preferred_vendor','request_skill_approval','resolve_agent_trust','resolve_email_template','route_conversation_to_agent','run_reconciliation_tests','sandbox_seed_subscriptions','sandbox_seed_subscriptions_core','search_memories_hybrid','search_memories_semantic','seed_chain_mode','seed_default_pipeline_stages','seed_demo_operations','sla_ticket_deadline','summarize_candidate_pipeline','sweep_stale_voice_calls','sync_equipment_status','terms_page_url','try_acquire_agent_lock','upsert_stock_quant','vendor_invoice_book_rate','vendor_invoice_credited_net_cents','vendor_invoice_match_eval','voucher_retention_until','webinar_reminder_tick','webinar_tick','weekly_business_digest','work_center_availability'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── 2. Guard what the browser calls ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.abc_analysis_report(p_days integer DEFAULT 90)
 RETURNS TABLE(product_id uuid, product_name text, units_out numeric, value_out_cents bigint, abc_class text, is_slow_mover boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'inventory')) THEN
    RAISE EXCEPTION 'abc_analysis_report: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH moves AS (
    SELECT m.product_id,
           SUM(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE m.quantity END)::numeric AS units_out,
           SUM(COALESCE(m.value_cents,0))::bigint AS value_out_cents
      FROM public.stock_moves m
     WHERE m.move_type = 'out'
       AND m.created_at >= now() - (p_days || ' days')::interval
     GROUP BY m.product_id
  ), ranked AS (
    SELECT m.product_id, m.units_out, m.value_out_cents,
           SUM(m.value_out_cents) OVER () AS total_val,
           SUM(m.value_out_cents) OVER (ORDER BY m.value_out_cents DESC ROWS UNBOUNDED PRECEDING) AS cum_val
      FROM moves m
  )
  SELECT p.id, p.name,
         COALESCE(r.units_out,0),
         COALESCE(r.value_out_cents,0),
         CASE
           WHEN r.total_val IS NULL OR r.total_val = 0 THEN 'C'
           WHEN r.cum_val::numeric / r.total_val <= 0.80 THEN 'A'
           WHEN r.cum_val::numeric / r.total_val <= 0.95 THEN 'B'
           ELSE 'C'
         END,
         (r.units_out IS NULL OR r.units_out = 0)
    FROM public.products p
    LEFT JOIN ranked r ON r.product_id = p.id
   WHERE p.is_active
   ORDER BY r.value_out_cents DESC NULLS LAST, p.name;
END $function$;
CREATE OR REPLACE FUNCTION public.audit_logs_retention_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'audit_logs_retention_status: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN (
SELECT jsonb_build_object(
    'retention_days', 730,
    'total_rows', (SELECT COUNT(*) FROM public.audit_logs),
    'pos_stock_rows', (SELECT COUNT(*) FROM public.audit_logs WHERE action IN ('pos.stock.decrement', 'pos.stock.increment')),
    'oldest_row_at', (SELECT MIN(created_at) FROM public.audit_logs),
    'newest_row_at', (SELECT MAX(created_at) FROM public.audit_logs),
    'rows_past_retention', (SELECT COUNT(*) FROM public.audit_logs WHERE created_at < now() - interval '730 days'),
    'cutoff_at', (now() - interval '730 days')
  )
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.bulk_advance_approvals(p_request_ids uuid[], p_decision approval_decision_kind, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_ok int := 0; v_failed jsonb := '[]'::jsonb; v_res jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'approvals')) THEN
    RAISE EXCEPTION 'bulk_advance_approvals: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_request_ids IS NULL OR array_length(p_request_ids,1) IS NULL THEN
    RAISE EXCEPTION 'request_ids must be a non-empty array';
  END IF;
  FOREACH v_id IN ARRAY p_request_ids LOOP
    BEGIN
      v_res := advance_approval_step(v_id, p_decision, NULL, NULL, p_comment);
      v_ok := v_ok + 1;
    EXCEPTION WHEN others THEN
      v_failed := v_failed || jsonb_build_object('request_id', v_id, 'error', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'processed', v_ok,
    'failed', jsonb_array_length(v_failed), 'failures', v_failed);
END $function$;
CREATE OR REPLACE FUNCTION public.calculate_vat_report(p_year integer, p_start_month integer, p_end_month integer DEFAULT NULL::integer)
 RETURNS TABLE(grid_code text, grid_name text, category text, amount_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'calculate_vat_report: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
WITH period AS (
    SELECT make_date(p_year, p_start_month, 1) AS start_date,
           (make_date(p_year, COALESCE(p_end_month, p_start_month), 1)
              + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_date
  )
  SELECT
    g.code,
    g.name,
    g.category,
    COALESCE(SUM(jelt.amount_cents), 0)::BIGINT
  FROM public.tax_grids g
  LEFT JOIN public.journal_entry_line_taxes jelt ON jelt.tax_grid_id = g.id
  LEFT JOIN public.journal_entry_lines jel ON jel.id = jelt.journal_entry_line_id
  LEFT JOIN public.journal_entries je ON je.id = jel.journal_entry_id
  CROSS JOIN period
  WHERE g.locale = 'SE'
    AND g.is_active = true
    AND (je.id IS NULL OR (
      je.status = 'posted'
      AND je.entry_date BETWEEN period.start_date AND period.end_date
    ))
  GROUP BY g.code, g.name, g.category, g.sequence
  ORDER BY g.sequence;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_contract_from_template(p_template_id uuid, p_counterparty_name text, p_counterparty_email text DEFAULT NULL::text, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(contract_id uuid, title text, status contract_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tpl public.contract_templates%ROWTYPE;
  v_body text;
  v_new_id uuid;
  v_start date;
  v_end date;
  v_value bigint;
  v_currency text;
  v_title text;
  v_company_id uuid;
  v_quote_id uuid;
  v_number text;
  v_org text;
  v_site_url text;
  v_terms_slug text;
  v_profile jsonb;
  v_sup_name text;
  v_sup_org text;
  v_sup_addr text;
  v_sup_phone text;
  v_sup_email text;
  v_sup_signer text;
  v_cp_addr text;
  v_q record;
  v_rows text;
  v_lines text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'contracts')) THEN
    RAISE EXCEPTION 'create_contract_from_template: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_tpl FROM public.contract_templates WHERE id = p_template_id;
  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  v_start := COALESCE((p_overrides->>'start_date')::date, public.platform_today());
  v_end := NULLIF(p_overrides->>'end_date', '')::date;
  v_value := COALESCE((p_overrides->>'value_cents')::bigint, v_tpl.default_value_cents);
  v_currency := COALESCE(p_overrides->>'currency', v_tpl.default_currency);
  v_title := COALESCE(p_overrides->>'title', v_tpl.name || ' — ' || p_counterparty_name);

  v_quote_id := CASE WHEN (p_overrides->>'quote_id') ~* '^[0-9a-f-]{36}$'
                     THEN (p_overrides->>'quote_id')::uuid END;

  v_company_id := CASE WHEN (p_overrides->>'company_id') ~* '^[0-9a-f-]{36}$'
                       THEN (p_overrides->>'company_id')::uuid END;
  -- Through the quote — the rung that was missing. AGR-2026-00005 rendered
  -- "[KUNDENS ORGNR]" with the org number sitting in companies, because the
  -- only path to it was matching 'liteit' against 'Liteit AB' by name.
  -- The quote's own company_id first, then its deal's lead, so a quote from
  -- before the inherit-trigger still resolves.
  IF v_company_id IS NULL AND v_quote_id IS NOT NULL THEN
    SELECT COALESCE(q.company_id, l.company_id) INTO v_company_id
    FROM public.quotes q
    LEFT JOIN public.deals d ON d.id = q.deal_id
    LEFT JOIN public.leads l ON l.id = d.lead_id
    WHERE q.id = v_quote_id;
  END IF;
  -- Name match stays LAST RESORT and stays exact: fuzzy-matching a company
  -- into a legal document risks the wrong company's registered data, which is
  -- far worse than a visible bracket.
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM public.companies
    WHERE lower(name) = lower(trim(p_counterparty_name)) LIMIT 1;
  END IF;

  v_org := COALESCE(
    NULLIF(trim(p_overrides->>'org_number'), ''),
    (SELECT org_number FROM public.companies WHERE id = v_company_id)
  );
  SELECT NULLIF(trim(address), '') INTO v_cp_addr
  FROM public.companies WHERE id = v_company_id;

  -- Allocated here rather than left to the trigger: the number has to appear
  -- inside the body, and the body is built before the row exists. The trigger
  -- only fills a NULL, so this wins and nothing is double-counted.
  v_number := public.next_document_number('contract', 'AGR');

  -- One renderer for every body of the agreement: this one and each appendix
  -- (_render_contract_tokens). The values are exactly the ones computed above.
  v_body := public._render_contract_tokens(v_tpl.body_markdown, jsonb_build_object(
    'language', v_tpl.language,
    'counterparty_name', p_counterparty_name, 'counterparty_email', p_counterparty_email,
    'start_date', v_start, 'end_date', v_end, 'value_cents', v_value, 'currency', v_currency,
    'title', v_title, 'contract_number', v_number, 'org_number', v_org,
    'counterparty_address', v_cp_addr, 'quote_id', v_quote_id));

  INSERT INTO public.contracts
    (title, counterparty_name, counterparty_email, contract_type, status,
     company_id, quote_id, contract_number, start_date, end_date, value_cents, currency,
     renewal_type, renewal_notice_days,
     body_markdown, body_updated_at, template_id, version)
  VALUES
    (v_title, p_counterparty_name, p_counterparty_email, v_tpl.contract_type, 'draft',
     v_company_id, v_quote_id, v_number, v_start, v_end, v_value, v_currency,
     v_tpl.default_renewal_type, v_tpl.default_renewal_notice_days,
     v_body, now(), p_template_id, 1)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT c.id, c.title, c.status FROM public.contracts c WHERE c.id = v_new_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_webmeet_room(p_name text DEFAULT NULL::text, p_password text DEFAULT NULL::text, p_max_participants integer DEFAULT 8, p_expires_in_minutes integer DEFAULT NULL::integer, p_host_user_id uuid DEFAULT NULL::uuid, p_waiting_room boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slug text;
  v_row public.webmeet_rooms%ROWTYPE;
  v_host uuid := COALESCE(p_host_user_id, auth.uid());
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'webmeet')) THEN
    RAISE EXCEPTION 'create_webmeet_room: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_slug := public.gen_webmeet_slug();

  INSERT INTO public.webmeet_rooms (slug, name, host_user_id, password, max_participants, expires_at, waiting_room)
  VALUES (
    v_slug,
    p_name,
    v_host,
    CASE WHEN NULLIF(trim(COALESCE(p_password, '')), '') IS NULL THEN NULL
         ELSE encode(digest(trim(p_password), 'sha256'), 'hex') END,
    GREATEST(2, LEAST(COALESCE(p_max_participants, 8), 16)),
    CASE WHEN p_expires_in_minutes IS NOT NULL
         THEN now() + (p_expires_in_minutes || ' minutes')::interval
         ELSE NULL END,
    COALESCE(p_waiting_room, false)
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'name', v_row.name,
    'url', '/meet/' || v_row.slug,
    'max_participants', v_row.max_participants,
    'has_password', v_row.password IS NOT NULL,
    'waiting_room', v_row.waiting_room,
    'expires_at', v_row.expires_at,
    'created_at', v_row.created_at
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.demo_cycle_cron_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_row record;
  v_last record;
begin
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'demo_cycle_cron_status: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  select jobid, jobname, schedule, active into v_row
  from cron.job
  where jobname in ('demo-cycle-daily', 'demo-cycle-hourly')
  order by case jobname when 'demo-cycle-daily' then 0 else 1 end
  limit 1;

  if not found then
    return jsonb_build_object('scheduled', false);
  end if;

  begin
    select start_time, status, return_message into v_last
    from cron.job_run_details
    where jobid = v_row.jobid
    order by start_time desc
    limit 1;
  exception when others then
    v_last := null;
  end;

  return jsonb_build_object(
    'scheduled', true,
    'jobname', v_row.jobname,
    'schedule', v_row.schedule,
    'active', v_row.active,
    'last_run_at', v_last.start_time,
    'last_status', v_last.status,
    'last_message', v_last.return_message
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.end_webmeet_room(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.webmeet_rooms%ROWTYPE;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'webmeet') OR EXISTS (SELECT 1 FROM public.webmeet_rooms r WHERE r.id = p_room_id AND r.host_user_id = auth.uid())) THEN
    RAISE EXCEPTION 'end_webmeet_room: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.webmeet_rooms
     SET ended_at = now()
   WHERE id = p_room_id
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Room % not found', p_room_id;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'slug', v_row.slug, 'ended_at', v_row.ended_at);
END;
$function$;
CREATE OR REPLACE FUNCTION public.explain_voucher_gap(p_series text, p_year integer, p_voucher_number bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_clues jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'explain_voucher_gap: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('action', action, 'entity_type', entity_type, 'user_id', user_id, 'metadata', metadata, 'created_at', created_at) ORDER BY created_at DESC)
  INTO v_clues FROM public.audit_logs
  WHERE entity_type IN ('journal_entry','journal_entries','voucher')
    AND (metadata->>'voucher_number' = p_voucher_number::text OR metadata->>'voucher_series' = p_series);
  RETURN jsonb_build_object(
    'series', p_series, 'fiscal_year', p_year, 'voucher_number', p_voucher_number,
    'audit_clues', COALESCE(v_clues, '[]'::jsonb),
    'explanation', CASE WHEN v_clues IS NULL THEN 'No audit trail found — gap likely caused by failed transaction. Investigate before period close.' ELSE 'Audit trail shows related events.' END
  );
END; $function$;
CREATE OR REPLACE FUNCTION public.find_duplicate_companies(p_threshold numeric DEFAULT 0.45, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'companies')) THEN
    RAISE EXCEPTION 'find_duplicate_companies: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY (x.score) DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.id AS company_a, a.name AS name_a,
           b.id AS company_b, b.name AS name_b,
           round(GREATEST(
             similarity(lower(a.name), lower(b.name)),
             CASE WHEN a.domain IS NOT NULL AND a.domain = b.domain THEN 1.0 ELSE 0 END
           )::numeric, 2) AS score,
           (a.domain IS NOT NULL AND a.domain = b.domain) AS same_domain
    FROM companies a
    JOIN companies b ON a.id < b.id
    WHERE similarity(lower(a.name), lower(b.name)) >= p_threshold
       OR (a.domain IS NOT NULL AND a.domain = b.domain)
    ORDER BY 5 DESC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
  ) x;
  RETURN jsonb_build_object('success', true, 'pairs', v_rows);
END $function$;
CREATE OR REPLACE FUNCTION public.flag_at_risk_subscriptions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flagged integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'flag_at_risk_subscriptions: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  WITH updated AS (
    UPDATE public.subscriptions s
    SET at_risk = true,
        at_risk_reason = CASE
          WHEN s.status = 'past_due' THEN 'payment_failed'
          WHEN s.cancel_at_period_end THEN 'cancellation_scheduled'
          WHEN s.health_score IS NOT NULL AND s.health_score < 30 THEN 'low_health_score'
          ELSE 'unknown'
        END,
        updated_at = now()
    WHERE s.status IN ('active', 'trialing', 'past_due')
      AND (
        s.status = 'past_due'
        OR s.cancel_at_period_end = true
        OR (s.health_score IS NOT NULL AND s.health_score < 30)
      )
      AND s.at_risk = false
    RETURNING s.id
  )
  SELECT count(*) INTO v_flagged FROM updated;

  RETURN jsonb_build_object('flagged', v_flagged, 'run_at', now());
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_bootstrap_health(_module_id text)
 RETURNS TABLE(last_status text, last_run_at timestamp with time zone, last_hash text, failure_streak integer, is_degraded boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _streak INTEGER := 0;
  _last_status TEXT;
  _last_run_at TIMESTAMPTZ;
  _last_hash TEXT;
  _rec RECORD;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'get_bootstrap_health: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT status, created_at, config_hash
    INTO _last_status, _last_run_at, _last_hash
  FROM public.bootstrap_runs
  WHERE module_id = _module_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF _last_status IS NULL THEN
    RETURN QUERY SELECT NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT, 0, FALSE;
    RETURN;
  END IF;

  -- CONSECUTIVE failures from the most recent run backwards; the first success
  -- breaks the streak (so a fix-and-retry success un-degrades the module).
  FOR _rec IN
    SELECT status
    FROM public.bootstrap_runs
    WHERE module_id = _module_id
    ORDER BY created_at DESC
    LIMIT 50
  LOOP
    IF _rec.status = 'failed' THEN
      _streak := _streak + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    _last_status,
    _last_run_at,
    _last_hash,
    _streak,
    (_streak >= 3);
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_employee_leave_balances(p_employee_id uuid, p_year integer DEFAULT (EXTRACT(year FROM platform_today()))::integer)
 RETURNS TABLE(leave_type text, year integer, allocated_days numeric, carried_over_days numeric, used_days numeric, pending_days numeric, remaining_days numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'hr') OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = p_employee_id AND e.user_id = auth.uid())) THEN
    RAISE EXCEPTION 'get_employee_leave_balances: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
WITH types AS (
    SELECT DISTINCT leave_type FROM public.leave_allocations
      WHERE employee_id = p_employee_id AND year = p_year
    UNION
    SELECT DISTINCT leave_type FROM public.leave_requests
      WHERE employee_id = p_employee_id
        AND EXTRACT(YEAR FROM start_date)::INTEGER = p_year
  )
  SELECT
    t.leave_type,
    p_year,
    b.allocated_days,
    b.carried_over_days,
    b.used_days,
    b.pending_days,
    b.remaining_days
  FROM types t
  CROSS JOIN LATERAL public.get_leave_balance(p_employee_id, t.leave_type, p_year) b;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_recent_migrations(p_limit integer DEFAULT 20)
 RETURNS TABLE(version text, name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'supabase_migrations'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'get_recent_migrations: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY EXECUTE
    'SELECT version::text, COALESCE(name, '''')::text
     FROM supabase_migrations.schema_migrations
     ORDER BY version DESC
     LIMIT $1'
    USING GREATEST(1, LEAST(p_limit, 100));
END;
$function$;
CREATE OR REPLACE FUNCTION public.list_expiring_lots(p_within_days integer DEFAULT 60)
 RETURNS SETOF v_expiring_lots
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'inventory')) THEN
    RAISE EXCEPTION 'list_expiring_lots: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
SELECT * FROM public.v_expiring_lots
   WHERE days_until_expiry <= p_within_days AND on_hand_qty > 0
   ORDER BY expiry_date NULLS LAST;
END;
$function$;
CREATE OR REPLACE FUNCTION public.list_voucher_gaps(p_year integer DEFAULT fiscal_year_of(platform_today()), p_series text DEFAULT NULL::text)
 RETURNS TABLE(series text, fiscal_year integer, expected_number bigint, next_existing_number bigint, gap_size bigint, last_seen_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'list_voucher_gaps: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
WITH seq AS (
    SELECT voucher_series, voucher_year, voucher_number, entry_date,
           LEAD(voucher_number) OVER (PARTITION BY voucher_series, voucher_year ORDER BY voucher_number) AS next_num
    FROM public.journal_entries
    WHERE voucher_year = p_year AND voucher_number IS NOT NULL
      AND (p_series IS NULL OR voucher_series = p_series)
  )
  SELECT voucher_series, voucher_year, voucher_number + 1, next_num,
         (next_num - voucher_number - 1), entry_date
  FROM seq
  WHERE next_num IS NOT NULL AND next_num > voucher_number + 1
  ORDER BY voucher_series, voucher_number;
END;
$function$;
CREATE OR REPLACE FUNCTION public.log_cache_invalidation(p_slug text DEFAULT NULL::text, p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'pages')) THEN
    RAISE EXCEPTION 'log_cache_invalidation: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES (
    'cache_invalidate',
    'cache',
    coalesce(p_slug, 'all'),
    v_user_id,
    jsonb_build_object('slug', p_slug, 'all', p_all, 'timestamp', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN p_all THEN 'All page caches marked for invalidation'
                    ELSE 'Cache for "' || coalesce(p_slug, '') || '" marked for invalidation' END,
    'invalidated_at', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.match_invoice_to_receipt(p_invoice_id uuid, p_tolerance_pct numeric DEFAULT 2.0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eval jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'match_invoice_to_receipt: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_eval := public.vendor_invoice_match_eval(p_invoice_id, p_tolerance_pct);

  UPDATE vendor_invoices
     SET match_status  = v_eval->>'match_status',
         variance_cents = COALESCE((v_eval->>'variance_cents')::bigint, 0),
         variance_notes = v_eval->>'notes',
         updated_at = now()
   WHERE id = p_invoice_id;

  PERFORM public.emit_platform_event(
    'invoice.matched',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_eval->'purchase_order_id',
      'match_status', v_eval->>'match_status',
      'variance_cents', v_eval->'variance_cents',
      'variance_pct', v_eval->'variance_pct',
      'already_invoiced_cents', v_eval->'already_invoiced_cents',
      'billable_value_cents', v_eval->'billable_value_cents',
      'control_policy', v_eval->>'control_policy'
    ),
    'match_invoice_to_receipt'
  );

  RETURN jsonb_build_object('success', true) || v_eval;
END;
$function$;
CREATE OR REPLACE FUNCTION public.find_media_usage(p_needle text)
 RETURNS TABLE(source_type text, source_id uuid, title text, slug text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'mediaLibrary')) THEN
    RAISE EXCEPTION 'find_media_usage: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
SELECT 'page'::text, p.id, p.title, p.slug
  FROM public.pages p
  WHERE p.content_json::text ILIKE '%' || p_needle || '%'

  UNION ALL

  SELECT 'blog_post'::text, b.id, b.title, b.slug
  FROM public.blog_posts b
  WHERE COALESCE(b.content_json::text, '') ILIKE '%' || p_needle || '%'
     OR COALESCE(b.featured_image, '') ILIKE '%' || p_needle || '%'

  UNION ALL

  SELECT 'kb_article'::text, k.id, k.title, k.slug
  FROM public.kb_articles k
  WHERE COALESCE(k.answer_text, '') ILIKE '%' || p_needle || '%'
     OR COALESCE(k.answer_json::text, '') ILIKE '%' || p_needle || '%'

  UNION ALL

  SELECT 'product'::text, pr.id, pr.name, NULL::text
  FROM public.products pr
  WHERE COALESCE(pr.image_url, '') ILIKE '%' || p_needle || '%';
END;
$function$;
CREATE OR REPLACE FUNCTION public.next_document_number(p_kind text, p_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq integer;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_staff(auth.uid())) THEN
    RAISE EXCEPTION 'next_document_number: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.document_counters (kind, last_value)
  VALUES (p_kind, 1)
  ON CONFLICT (kind)
  DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
  RETURNING last_value INTO v_seq;
  RETURN p_prefix || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;
CREATE OR REPLACE FUNCTION public.return_reason_report(p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'returns')) THEN
    RAISE EXCEPTION 'return_reason_report: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.cnt DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT COALESCE(reason_code, 'unspecified') AS reason_code,
           count(*) AS cnt,
           COALESCE(SUM(refund_amount_cents),0) AS refunded_cents
    FROM returns
    WHERE created_at > now() - make_interval(days => GREATEST(COALESCE(p_days,90),1))
    GROUP BY 1
  ) x;
  RETURN jsonb_build_object('success', true, 'days', COALESCE(p_days,90), 'reasons', v_rows);
END $function$;
CREATE OR REPLACE FUNCTION public.run_preventive_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_s RECORD; v_created int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'maintenance')) THEN
    RAISE EXCEPTION 'run_preventive_maintenance: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_s IN
    SELECT * FROM maintenance_schedules
    WHERE is_active AND next_due <= public.platform_today()
    FOR UPDATE SKIP LOCKED
  LOOP
    IF NOT EXISTS (SELECT 1 FROM maintenance_requests
                   WHERE equipment_id = v_s.equipment_id AND kind='preventive'
                     AND title = v_s.title AND status IN ('new','in_progress')) THEN
      INSERT INTO maintenance_requests (equipment_id, title, description, kind, priority, due_date)
      VALUES (v_s.equipment_id, v_s.title, v_s.instructions, 'preventive', 'medium', v_s.next_due);
      v_created := v_created + 1;
    END IF;
    UPDATE maintenance_schedules SET next_due = v_s.next_due + (v_s.interval_days || ' days')::interval
    WHERE id = v_s.id;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'created', v_created);
END $function$;
CREATE OR REPLACE FUNCTION public.upcoming_renewals(p_days_ahead integer DEFAULT 7)
 RETURNS TABLE(id uuid, customer_email text, customer_name text, product_name text, current_period_end timestamp with time zone, unit_amount_cents integer, currency text, status text, cancel_at_period_end boolean, days_until_renewal integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'subscriptions')) THEN
    RAISE EXCEPTION 'upcoming_renewals: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
SELECT
    s.id,
    s.customer_email,
    s.customer_name,
    s.product_name,
    s.current_period_end,
    s.unit_amount_cents,
    s.currency,
    s.status::text,
    s.cancel_at_period_end,
    EXTRACT(DAY FROM (s.current_period_end - now()))::integer AS days_until_renewal
  FROM public.subscriptions s
  WHERE s.status IN ('active', 'trialing')
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end BETWEEN now() AND now() + (p_days_ahead || ' days')::interval
  ORDER BY s.current_period_end ASC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.utm_attribution_report(_since timestamp with time zone DEFAULT (now() - '30 days'::interval))
 RETURNS TABLE(utm_source text, utm_medium text, utm_campaign text, visits bigint, unique_visitors bigint, leads bigint, orders bigint, revenue_cents bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'analytics')) THEN
    RAISE EXCEPTION 'utm_attribution_report: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
WITH v AS (
    SELECT
      COALESCE(pv.utm_source,'(none)')  AS utm_source,
      COALESCE(pv.utm_medium,'(none)')  AS utm_medium,
      COALESCE(pv.utm_campaign,'(none)') AS utm_campaign,
      COUNT(*)::BIGINT                   AS visits,
      COUNT(DISTINCT pv.visitor_id)::BIGINT AS unique_visitors
    FROM public.page_views pv
    WHERE pv.created_at >= _since
    GROUP BY 1,2,3
  ),
  l AS (
    SELECT
      COALESCE(last_utm_source,'(none)')  AS utm_source,
      COALESCE(last_utm_medium,'(none)')  AS utm_medium,
      COALESCE(last_utm_campaign,'(none)') AS utm_campaign,
      COUNT(*)::BIGINT                    AS leads
    FROM public.leads
    WHERE created_at >= _since
    GROUP BY 1,2,3
  ),
  o AS (
    SELECT
      COALESCE(last_utm_source,'(none)')  AS utm_source,
      COALESCE(last_utm_medium,'(none)')  AS utm_medium,
      COALESCE(last_utm_campaign,'(none)') AS utm_campaign,
      COUNT(*)::BIGINT                    AS orders,
      COALESCE(SUM(total_cents),0)::BIGINT AS revenue_cents
    FROM public.orders
    WHERE created_at >= _since AND status <> 'cancelled'
    GROUP BY 1,2,3
  )
  SELECT
    COALESCE(v.utm_source, l.utm_source, o.utm_source) AS utm_source,
    COALESCE(v.utm_medium, l.utm_medium, o.utm_medium) AS utm_medium,
    COALESCE(v.utm_campaign, l.utm_campaign, o.utm_campaign) AS utm_campaign,
    COALESCE(v.visits,0)          AS visits,
    COALESCE(v.unique_visitors,0) AS unique_visitors,
    COALESCE(l.leads,0)           AS leads,
    COALESCE(o.orders,0)          AS orders,
    COALESCE(o.revenue_cents,0)   AS revenue_cents
  FROM v
  FULL OUTER JOIN l USING (utm_source, utm_medium, utm_campaign)
  FULL OUTER JOIN o USING (utm_source, utm_medium, utm_campaign)
  ORDER BY 7 DESC, 6 DESC, 4 DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.work_order_inspection_state(p_work_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wo record;
  v_required boolean := false;
  v_name text;
  v_last record;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'manufacturing')) THEN
    RAISE EXCEPTION 'work_order_inspection_state: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT wo.id, wo.mo_id, wo.name, wo.routing_operation_id INTO v_wo
    FROM public.mo_work_orders wo WHERE wo.id = p_work_order_id;
  IF v_wo.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Work order not found');
  END IF;
  SELECT COALESCE(ro.requires_inspection, false), COALESCE(NULLIF(btrim(ro.inspection_name), ''), 'Quality check')
    INTO v_required, v_name
    FROM public.routing_operations ro WHERE ro.id = v_wo.routing_operation_id;
  SELECT c.result, c.checked_at, c.measured_value, c.note INTO v_last
    FROM public.mo_quality_checks c WHERE c.work_order_id = p_work_order_id
   ORDER BY c.checked_at DESC, c.id DESC LIMIT 1;
  RETURN jsonb_build_object('success', true, 'work_order_id', p_work_order_id, 'work_order', v_wo.name,
    'requires_inspection', COALESCE(v_required, false), 'inspection_name', v_name,
    'last_result', v_last.result, 'last_checked_at', v_last.checked_at,
    'last_measured_value', v_last.measured_value, 'last_note', v_last.note,
    'passed', COALESCE(v_last.result = 'pass', false),
    'checks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'result', c.result,
                                 'measured_value', c.measured_value, 'note', c.note, 'checked_at', c.checked_at)
                               ORDER BY c.checked_at DESC)
                          FROM public.mo_quality_checks c WHERE c.work_order_id = p_work_order_id), '[]'::jsonb));
END;
$function$;
CREATE OR REPLACE FUNCTION public.year_end_readiness(p_year integer DEFAULT (fiscal_year_of(platform_today()) - 1))
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_periods_open int; v_draft_entries int; v_voucher_gaps int; v_unreconciled int; v_unpaid_invoices int; v_open_expenses int; v_checks jsonb;
        v_from date; v_to date; v_months int;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'year_end_readiness: not allowed for this caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.date_from, r.date_to INTO v_from, v_to FROM public.fiscal_year_range(p_year) r;
  v_months := public.fiscal_year_months(p_year);
  -- Months of the year not closed: the year's months minus the closed rows.
  SELECT v_months - COUNT(*) INTO v_periods_open FROM public.accounting_periods WHERE fiscal_year = p_year AND status IN ('closed', 'locked');
  SELECT COUNT(*) INTO v_draft_entries FROM public.journal_entries WHERE entry_date BETWEEN v_from AND v_to AND status = 'draft';
  SELECT COUNT(*) INTO v_voucher_gaps FROM public.list_voucher_gaps(p_year, NULL);
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.payment_reconciliations WHERE status = ''pending'' AND (created_at AT TIME ZONE public.business_timezone())::date <= $1' INTO v_unreconciled USING v_to;
  EXCEPTION WHEN OTHERS THEN v_unreconciled := NULL; END;
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.invoices WHERE status IN (''sent'',''overdue'') AND issue_date <= $1' INTO v_unpaid_invoices USING v_to;
  EXCEPTION WHEN OTHERS THEN v_unpaid_invoices := NULL; END;
  BEGIN EXECUTE 'SELECT COUNT(*) FROM public.expense_reports WHERE status NOT IN (''paid'',''rejected'') AND report_date <= $1' INTO v_open_expenses USING v_to;
  EXCEPTION WHEN OTHERS THEN v_open_expenses := NULL; END;
  v_checks := jsonb_build_array(
    jsonb_build_object('id','periods_closed','label','All ' || v_months || ' periods closed','pass', v_periods_open <= 0, 'detail', GREATEST(v_periods_open, 0) || ' periods still open'),
    jsonb_build_object('id','no_drafts','label','No draft journal entries','pass', v_draft_entries = 0, 'detail', v_draft_entries || ' draft entries remain'),
    jsonb_build_object('id','voucher_integrity','label','No voucher-number gaps','pass', v_voucher_gaps = 0, 'detail', v_voucher_gaps || ' gaps found'),
    jsonb_build_object('id','reconciliations','label','No pending reconciliations','pass', COALESCE(v_unreconciled,0) = 0, 'detail', COALESCE(v_unreconciled::text,'n/a')),
    jsonb_build_object('id','invoices_settled','label','No unpaid customer invoices','pass', COALESCE(v_unpaid_invoices,0) = 0, 'detail', COALESCE(v_unpaid_invoices::text,'n/a')),
    jsonb_build_object('id','expenses_settled','label','No open expense reports','pass', COALESCE(v_open_expenses,0) = 0, 'detail', COALESCE(v_open_expenses::text,'n/a'))
  );
  RETURN jsonb_build_object('fiscal_year', p_year, 'label', public.fiscal_year_label(p_year), 'date_from', v_from, 'date_to', v_to,
    'ready', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) c WHERE (c->>'pass')::boolean = false),
    'checks', v_checks, 'generated_at', now());
END; $function$;

-- The guarded functions stay callable by the people the guard admits; never by anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY (ARRAY['abc_analysis_report','audit_logs_retention_status','bulk_advance_approvals','calculate_vat_report','create_contract_from_template','create_webmeet_room','demo_cycle_cron_status','end_webmeet_room','explain_voucher_gap','find_duplicate_companies','flag_at_risk_subscriptions','get_bootstrap_health','get_employee_leave_balances','get_recent_migrations','list_expiring_lots','list_voucher_gaps','log_cache_invalidation','match_invoice_to_receipt','find_media_usage','next_document_number','return_reason_report','run_preventive_maintenance','upcoming_renewals','utm_attribution_report','work_order_inspection_state','year_end_readiness'])
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- ── 3. Proof ───────────────────────────────────────────────────────────────
DO $$
DECLARE v_n integer; v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM count(*) FROM public.list_voucher_gaps(2026, NULL);
      RAISE EXCEPTION 'proof: list_voucher_gaps must refuse a session without the accounting module';
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true; END;
    IF NOT v_ok THEN RAISE EXCEPTION 'proof: no refusal'; END IF;
    BEGIN
      PERFORM public.get_user_role(gen_random_uuid());
      RAISE EXCEPTION 'proof: get_user_role must be denied to authenticated';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM public.upsert_stock_quant(gen_random_uuid(), gen_random_uuid(), 1);
      RAISE EXCEPTION 'proof: upsert_stock_quant must be denied to authenticated';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
    EXECUTE 'SET LOCAL ROLE service_role';
    SELECT count(*) INTO v_n FROM public.list_voucher_gaps(2026, NULL);
    PERFORM public.get_user_role(gen_random_uuid());
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'definer audience proof ok';
    RAISE EXCEPTION '__definer_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      BEGIN EXECUTE 'RESET ROLE'; EXCEPTION WHEN OTHERS THEN NULL; END;
      IF SQLERRM <> '__definer_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
