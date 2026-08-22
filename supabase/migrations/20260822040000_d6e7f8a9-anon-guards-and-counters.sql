-- Anon/authenticated-svepet, del 2: interna vakter + räknare.
--
-- Fortsättning på 20260822030000 (agent_objective_activities, documents-shared,
-- ren infra → service-only). Detta spår tar de fyra klasser som REVOKE inte
-- räcker för — själva vakten eller policyn måste rättas — och som verifierats
-- live på optic (SET LOCAL ROLE anon / authenticated, has_function_privilege).
--
-- Idempotent: CREATE OR REPLACE på funktioner, DROP POLICY IF EXISTS före CREATE.
-- Funktionskropparna är dumpade live med pg_get_functiondef och återlagda
-- ORÖRDA så när som på den tillagda vakten som första sats efter BEGIN.

-- ═══════════════════════════════════════════════════════════════════════════
-- KLASS 1 — cron-schemaläggare utan intern vakt
-- ───────────────────────────────────────────────────────────────────────────
-- schedule_cron_job / unschedule_cron_job / register_flowpilot_cron /
-- register_retrieval_cron är SECURITY DEFINER och authenticated-körbara. En
-- inloggad portalkund kan schemalägga godtyckligt net.http_post = SSRF/exfil.
-- REVOKE authenticated går inte: admin-bootstrap (src/lib/module-bootstrap.ts)
-- anropar register_flowpilot_cron/register_retrieval_cron som den inloggade
-- admin-loginet. Rätt fix = intern vakt först i kroppen. Admin och service_role
-- släpps, portalkund (authenticated utan admin-roll) nekas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.schedule_cron_job(p_jobname text, p_schedule text, p_url text, p_headers text, p_body text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'unauthorized: cron scheduling requires admin or service role';
  END IF;

  -- Remove existing job if present
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_jobname) THEN
    PERFORM cron.unschedule(p_jobname);
  END IF;

  PERFORM cron.schedule(
    p_jobname,
    p_schedule,
    format(
      'SELECT net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb) AS request_id;',
      p_url,
      p_headers,
      p_body
    )
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.unschedule_cron_job(p_jobname text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'unauthorized: cron scheduling requires admin or service role';
  END IF;

  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = p_jobname) THEN
    PERFORM cron.unschedule(p_jobname);
    RETURN true;
  END IF;
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_flowpilot_cron(p_supabase_url text, p_anon_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  job_exists boolean;
  auth_header text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'unauthorized: cron scheduling requires admin or service role';
  END IF;

  auth_header := json_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_anon_key
  )::text;

  -- 1. Heartbeat (every 12h)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-heartbeat',
      '0 0,12 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-heartbeat',
        auth_header
      )
    );
    result := result || '{"heartbeat": "registered"}'::jsonb;
  ELSE
    result := result || '{"heartbeat": "already_exists"}'::jsonb;
  END IF;

  -- 2. Automation dispatcher (every minute)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'automation-dispatcher-every-minute') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'automation-dispatcher-every-minute',
      '* * * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "pg_cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/automation-dispatcher',
        auth_header
      )
    );
    result := result || '{"automation_dispatcher": "registered"}'::jsonb;
  ELSE
    result := result || '{"automation_dispatcher": "already_exists"}'::jsonb;
  END IF;

  -- 3. Publish scheduled pages (every 5 minutes). The logic is the DB function
  --    public.publish_scheduled_pages() — call it directly. There is NO edge
  --    function by this name; the old HTTP wiring 404ed every 5 minutes.
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'publish-scheduled-pages') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'publish-scheduled-pages',
      '*/5 * * * *',
      'SELECT public.publish_scheduled_pages();'
    );
    result := result || '{"publish_scheduled_pages": "registered"}'::jsonb;
  ELSE
    result := result || '{"publish_scheduled_pages": "already_exists"}'::jsonb;
  END IF;

  -- 4. FlowPilot learn (daily at 03:00)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-learn') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-learn',
      '0 3 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := concat(''{"time":"'', now(), ''"}'')::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-learn',
        auth_header
      )
    );
    result := result || '{"flowpilot_learn": "registered"}'::jsonb;
  ELSE
    result := result || '{"flowpilot_learn": "already_exists"}'::jsonb;
  END IF;

  -- 5. Daily briefing (daily at 07:00)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-daily-briefing') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'flowpilot-daily-briefing',
      '0 7 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/flowpilot-briefing',
        auth_header
      )
    );
    result := result || '{"daily_briefing": "registered"}'::jsonb;
  ELSE
    result := result || '{"daily_briefing": "already_exists"}'::jsonb;
  END IF;

  -- 6. Instance health check (every 6 hours)
  SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'instance-health-check') INTO job_exists;
  IF NOT job_exists THEN
    PERFORM cron.schedule(
      'instance-health-check',
      '0 */6 * * *',
      format(
        'SELECT net.http_post(url := %L, headers := %L::jsonb, body := ''{"source": "cron"}''::jsonb) AS request_id;',
        p_supabase_url || '/functions/v1/instance-health',
        auth_header
      )
    );
    result := result || '{"instance_health_check": "registered"}'::jsonb;
  ELSE
    result := result || '{"instance_health_check": "already_exists"}'::jsonb;
  END IF;

  -- Cleanup: remove duplicate heartbeat-12h if it exists
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'flowpilot-heartbeat-12h') THEN
    PERFORM cron.unschedule('flowpilot-heartbeat-12h');
    result := result || '{"heartbeat_12h_duplicate": "removed"}'::jsonb;
  END IF;

  RETURN result;
END;
$function$;

-- register_retrieval_cron var LANGUAGE sql (tunn wrapper). Konverteras till
-- plpgsql enbart för att kunna bära vakten; delegeringen är oförändrad.
CREATE OR REPLACE FUNCTION public.register_retrieval_cron(p_supabase_url text, p_anon_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'unauthorized: cron scheduling requires admin or service role';
  END IF;
  RETURN public.register_knowledge_indexer_cron(p_supabase_url, p_anon_key);
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- KLASS 2 — vaktlösa payroll/accounting-skrivare och känsliga läsare
-- ───────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER + authenticated-körbara, ingen intern grind. Modulvalet per
-- funktion styrs av hur admin-ytan redan gaterar (frontend-anroparen + skillens
-- registrerade modul) så vi inte bryter UI:t. can_access_module släpper alltid
-- admin (has_role admin), så vakten träffar bara icke-admin-staff utan modulen.
-- register_fixed_asset / dispose_fixed_asset (fixedAssets) och
-- revalue_open_balances (multiCurrency) hade REDAN vakt — rörs inte.
-- ═══════════════════════════════════════════════════════════════════════════

-- preview_payroll_period → payroll (personnummer + lön). usePayroll.ts +
-- payroll-module. Var LANGUAGE sql; konverteras till plpgsql för vakten,
-- frågan oförändrad via RETURN QUERY.
CREATE OR REPLACE FUNCTION public.preview_payroll_period(p_year integer, p_month integer)
 RETURNS TABLE(employee_id uuid, employee_name text, employee_email text, personal_number text, vacation_days numeric, sick_days numeric, parental_days numeric, other_leave_days numeric, expense_reimbursement_cents bigint, representation_cents bigint, expense_count integer, leave_request_ids uuid[], expense_ids uuid[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'payroll')) THEN
    RAISE EXCEPTION 'Requires the payroll module — an admin can grant it under Users → Role Permissions';
  END IF;

  RETURN QUERY
  WITH period AS (
    SELECT
      make_date(p_year, p_month, 1) AS start_date,
      (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date AS end_date
  ),
  leave_agg AS (
    SELECT
      lr.employee_id,
      COALESCE(SUM(CASE WHEN lr.leave_type = 'vacation' THEN lr.days ELSE 0 END), 0)::numeric AS vacation_days,
      COALESCE(SUM(CASE WHEN lr.leave_type = 'sick' THEN lr.days ELSE 0 END), 0)::numeric AS sick_days,
      COALESCE(SUM(CASE WHEN lr.leave_type = 'parental' THEN lr.days ELSE 0 END), 0)::numeric AS parental_days,
      COALESCE(SUM(CASE WHEN lr.leave_type NOT IN ('vacation','sick','parental') THEN lr.days ELSE 0 END), 0)::numeric AS other_leave_days,
      array_agg(lr.id) AS leave_request_ids
    FROM public.leave_requests lr, period
    WHERE lr.status = 'approved'
      AND lr.payroll_export_id IS NULL
      AND lr.start_date <= period.end_date
      AND lr.end_date >= period.start_date
    GROUP BY lr.employee_id
  ),
  expense_agg AS (
    SELECT
      e.user_id,
      COALESCE(SUM(CASE WHEN NOT e.is_representation THEN e.amount_cents ELSE 0 END), 0)::bigint AS expense_reimbursement_cents,
      COALESCE(SUM(CASE WHEN e.is_representation THEN e.amount_cents ELSE 0 END), 0)::bigint AS representation_cents,
      COUNT(*)::int AS expense_count,
      array_agg(e.id) AS expense_ids
    FROM public.expenses e, period
    WHERE e.status = 'approved'
      AND e.payroll_export_id IS NULL
      AND e.expense_date BETWEEN period.start_date AND period.end_date
    GROUP BY e.user_id
  )
  SELECT
    emp.id,
    emp.name,
    emp.email,
    emp.personal_number,
    COALESCE(la.vacation_days, 0),
    COALESCE(la.sick_days, 0),
    COALESCE(la.parental_days, 0),
    COALESCE(la.other_leave_days, 0),
    COALESCE(ea.expense_reimbursement_cents, 0),
    COALESCE(ea.representation_cents, 0),
    COALESCE(ea.expense_count, 0),
    COALESCE(la.leave_request_ids, '{}'::uuid[]),
    COALESCE(ea.expense_ids, '{}'::uuid[])
  FROM public.employees emp
  LEFT JOIN leave_agg la ON la.employee_id = emp.id
  LEFT JOIN expense_agg ea ON ea.user_id = emp.user_id
  WHERE emp.status = 'active'
    AND (la.employee_id IS NOT NULL OR ea.user_id IS NOT NULL)
  ORDER BY emp.name;
END;
$function$;

-- pay_vendor_invoice → purchasing (skillens registrerade modul, purchasing-module).
CREATE OR REPLACE FUNCTION public.pay_vendor_invoice(p_vendor_invoice_id uuid, p_pay_date date DEFAULT CURRENT_DATE, p_bank_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.vendor_invoices;
  v_je_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'purchasing')) THEN
    RAISE EXCEPTION 'Requires the purchasing module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  SELECT * INTO v_inv FROM public.vendor_invoices WHERE id = p_vendor_invoice_id;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice not found');
  END IF;
  IF v_inv.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice already paid', 'paid_at', v_inv.paid_at);
  END IF;
  IF COALESCE(v_inv.total_cents, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Vendor invoice has no positive total');
  END IF;

  INSERT INTO public.journal_entries (entry_date, description, status, source, vendor_id)
  VALUES (p_pay_date, 'Betalning leverantörsfaktura ' || COALESCE(v_inv.invoice_number, ''), 'posted', 'vendor_payment', v_inv.vendor_id)
  RETURNING id INTO v_je_id;

  -- account_name is auto-filled by the fill_journal_line_account_name trigger.
  INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description) VALUES
    (v_je_id, '2440', v_inv.total_cents, 0, 'Leverantörsskuld'),
    (v_je_id, p_bank_account, 0, v_inv.total_cents, 'Utbetalning');

  UPDATE public.vendor_invoices SET status = 'paid', paid_at = p_pay_date WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'success', true, 'vendor_invoice_id', v_inv.id, 'journal_entry_id', v_je_id,
    'total_cents', v_inv.total_cents, 'paid_at', p_pay_date, 'bank_account', p_bank_account
  );
END;
$function$;

-- book_invoice_issued → accounting (intern huvudbokshjälpare, ingen UI-anropare).
CREATE OR REPLACE FUNCTION public.book_invoice_issued(p_invoice_id uuid, p_ar_account text DEFAULT NULL::text, p_revenue_account text DEFAULT NULL::text, p_vat_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_net bigint;
  v_vat bigint;
  v_total bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  p_revenue_account := COALESCE(p_revenue_account, public.account_for('sales_revenue'));
  p_vat_account := COALESCE(p_vat_account, public.account_for('vat_output'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  -- Idempotency: already booked?
  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_issued') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  v_total := COALESCE(v_inv.total_cents, 0);
  v_vat   := COALESCE(v_inv.tax_cents, 0);
  v_net   := COALESCE(v_inv.subtotal_cents, v_total - v_vat);
  IF v_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice total is zero');
  END IF;

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.issue_date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' issued',
          'invoice_issued', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, v_total, 0, 'Accounts receivable');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_revenue_account, 0, v_net, 'Revenue');
  IF v_vat > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry_id, p_vat_account, 0, v_vat, 'Output VAT');
  END IF;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id, 'total_cents', v_total);
END;
$function$;

-- book_invoice_paid → accounting (intern huvudbokshjälpare, ingen UI-anropare).
CREATE OR REPLACE FUNCTION public.book_invoice_paid(p_invoice_id uuid, p_bank_account text DEFAULT NULL::text, p_ar_account text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_entry_id uuid;
  v_amount bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  p_ar_account := COALESCE(p_ar_account, public.account_for('accounts_receivable'));
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF EXISTS (SELECT 1 FROM journal_entries WHERE invoice_id = p_invoice_id AND source = 'invoice_payment') THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already booked');
  END IF;

  v_amount := COALESCE(v_inv.paid_amount_cents, v_inv.total_cents, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paid amount is zero');
  END IF;

  -- If issuance was never booked (e.g. legacy invoice), book it first so AR exists.
  PERFORM public.book_invoice_issued(p_invoice_id);

  INSERT INTO journal_entries (entry_date, description, source, invoice_id, status)
  VALUES (COALESCE(v_inv.paid_at::date, CURRENT_DATE),
          'Invoice ' || COALESCE(v_inv.invoice_number, p_invoice_id::text) || ' paid',
          'invoice_payment', p_invoice_id, 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_bank_account, v_amount, 0, 'Bank');
  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES (v_entry_id, p_ar_account, 0, v_amount, 'Settle accounts receivable');

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'journal_entry_id', v_entry_id, 'amount_cents', v_amount);
END;
$function$;

-- book_expense_report → expenses (useExpenses.ts + expenses-module; det är
-- utläggsytan admin når den från, även om posten landar i huvudboken).
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
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'expenses')) THEN
    RAISE EXCEPTION 'Requires the expenses module — an admin can grant it under Users → Role Permissions';
  END IF;

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
$function$;

-- prepare_vat_return → accounting (accounting-module, MomsdeklarationTab/VatCard).
CREATE OR REPLACE FUNCTION public.prepare_vat_return(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out_25 bigint; v_out_12 bigint; v_out_6 bigint; v_out_rc bigint;
  v_input bigint; v_output bigint; v_net bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT
    -- Box 10 — output VAT 25% (2614/2615 deliberately excluded: they are box 30)
    COALESCE(SUM(CASE WHEN l.account_code IN ('2610','2611','2612','2613','2616','2617','2618','2619')
                      THEN l.credit_cents - l.debit_cents ELSE 0 END), 0),
    -- Box 11 — output VAT 12%
    COALESCE(SUM(CASE WHEN l.account_code IN ('2620','2621','2622','2623','2626','2627','2628','2629')
                      THEN l.credit_cents - l.debit_cents ELSE 0 END), 0),
    -- Box 12 — output VAT 6%
    COALESCE(SUM(CASE WHEN l.account_code IN ('2630','2631','2632','2633','2636','2637','2638','2639')
                      THEN l.credit_cents - l.debit_cents ELSE 0 END), 0),
    -- Boxes 30/31/32 — reverse charge & EU acquisitions, all rates
    COALESCE(SUM(CASE WHEN l.account_code IN ('2614','2615','2624','2625','2634','2635')
                      THEN l.credit_cents - l.debit_cents ELSE 0 END), 0),
    -- Box 48 — deductible input VAT
    COALESCE(SUM(CASE WHEN l.account_code IN ('2640','2641','2642','2643','2644','2645','2646','2647','2648','2649')
                      THEN l.debit_cents - l.credit_cents ELSE 0 END), 0)
  INTO v_out_25, v_out_12, v_out_6, v_out_rc, v_input
  FROM public.journal_entry_lines l
  JOIN public.journal_entries e ON e.id = l.journal_entry_id
  WHERE e.entry_date BETWEEN p_from AND p_to
    AND e.status = 'posted';

  v_output := v_out_25 + v_out_12 + v_out_6 + v_out_rc;
  v_net := v_output - v_input;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'output_vat_cents', jsonb_build_object(
      'standard_25', v_out_25, 'reduced_12', v_out_12, 'reduced_6', v_out_6,
      'reverse_charge', v_out_rc, 'total', v_output
    ),
    'input_vat_cents', v_input,
    'net_to_pay_cents', v_net,
    'net_to_pay_sek', round(v_net / 100.0, 2),
    'direction', CASE WHEN v_net >= 0 THEN 'pay_to_skatteverket' ELSE 'refund_from_skatteverket' END,
    'note', 'Box 10/11/12 = output VAT 25/12/6% (2610-2613, 2616-2619 etc). Box 30/31/32 = reverse charge and EU acquisitions (2614/2615, 2624/2625, 2634/2635). Box 48 = input VAT (2640-2649). Net = (10+11+12+30+31+32) - 48. Verify against the VAT control account before filing.'
  );
END;
$function$;

-- budget_vs_actual → accounting (accounting-module, useBudgets.ts).
CREATE OR REPLACE FUNCTION public.budget_vs_actual(p_fiscal_year integer, p_period_month integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  WITH bud AS (
    SELECT account_code, SUM(amount_cents) AS budget_cents FROM budgets
    WHERE fiscal_year = p_fiscal_year
      AND ((p_period_month IS NULL AND period_month IS NULL)
        OR (p_period_month IS NOT NULL AND period_month = p_period_month))
    GROUP BY account_code),
  act AS (
    SELECT l.account_code, SUM(l.debit_cents - l.credit_cents) AS actual_cents
    FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
    WHERE EXTRACT(YEAR FROM je.entry_date)::int = p_fiscal_year
      AND (p_period_month IS NULL OR EXTRACT(MONTH FROM je.entry_date)::int = p_period_month)
      AND je.status <> 'draft'
    GROUP BY l.account_code)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'account_code', account_code, 'budget_cents', COALESCE(budget_cents, 0),
    'actual_cents', COALESCE(actual_cents, 0),
    'variance_cents', COALESCE(budget_cents,0) - COALESCE(actual_cents,0)
  ) ORDER BY account_code), '[]'::jsonb) INTO v_rows
  FROM (SELECT account_code FROM bud UNION SELECT account_code FROM act) k
  LEFT JOIN bud USING (account_code) LEFT JOIN act USING (account_code);
  RETURN jsonb_build_object('success', true, 'fiscal_year', p_fiscal_year,
    'period_month', p_period_month, 'lines', v_rows);
END; $function$;

-- reconciliation_report → reconciliation (reconciliation-module + useReconciliationRules.ts).
-- Var LANGUAGE sql; konverteras till plpgsql för vakten, frågan oförändrad.
CREATE OR REPLACE FUNCTION public.reconciliation_report(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'reconciliation')) THEN
    RAISE EXCEPTION 'Requires the reconciliation module — an admin can grant it under Users → Role Permissions';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'success', true, 'from', p_from, 'to', p_to,
      'total_count', count(*),
      'total_cents', COALESCE(sum(amount_cents),0),
      'matched_count', count(*) FILTER (WHERE status = 'matched'),
      'matched_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'matched'),0),
      'unmatched_count', count(*) FILTER (WHERE status = 'unmatched'),
      'unmatched_cents', COALESCE(sum(amount_cents) FILTER (WHERE status = 'unmatched'),0),
      'rule_suggested_count', count(*) FILTER (WHERE status = 'unmatched' AND matched_rule_id IS NOT NULL))
    FROM bank_transactions
    WHERE (p_from IS NULL OR transaction_date >= p_from)
      AND (p_to IS NULL OR transaction_date <= p_to)
  );
END;
$function$;

-- inventory_valuation_report → inventory (inventory-module, useInventoryValuation.ts).
CREATE OR REPLACE FUNCTION public.inventory_valuation_report(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb; v_total bigint;
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'inventory')) THEN
    RAISE EXCEPTION 'Requires the inventory module — an admin can grant it under Users → Role Permissions';
  END IF;

  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'value_cents')::bigint DESC), '[]'::jsonb),
         COALESCE(sum((r->>'value_cents')::bigint), 0)
  INTO v_rows, v_total
  FROM (
    SELECT to_jsonb(x) AS r FROM (
      SELECT p.id AS product_id, p.name,
             sum(l.remaining_qty) AS on_hand_qty,
             round(sum(l.remaining_qty * l.unit_cost_cents)) AS value_cents,
             CASE WHEN sum(l.remaining_qty) > 0
                  THEN round(sum(l.remaining_qty * l.unit_cost_cents) / sum(l.remaining_qty)) END AS avg_unit_cost_cents
      FROM stock_valuation_layers l JOIN products p ON p.id = l.product_id
      WHERE l.remaining_qty > 0
      GROUP BY p.id, p.name
      ORDER BY 4 DESC
      LIMIT GREATEST(COALESCE(p_limit,50),1)
    ) x
  ) y;
  RETURN jsonb_build_object('success', true, 'total_value_cents', v_total, 'products', v_rows);
END $function$;

-- run_year_end → accounting (accounting-module). Read-only orchestration, men
-- exponerar readiness/accruals/depreciation — bör inte vara öppet för portalkund.
CREATE OR REPLACE FUNCTION public.run_year_end(p_year integer, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'accounting')) THEN
    RAISE EXCEPTION 'Requires the accounting module — an admin can grant it under Users → Role Permissions';
  END IF;

  RETURN jsonb_build_object(
    'year', p_year, 'confirm', p_confirm,
    'readiness', public.year_end_readiness(p_year),
    'accruals', public.propose_accruals(p_year),
    'depreciation', public.propose_annual_depreciation(p_year),
    'next_steps', jsonb_build_array(
      'Resolve any failing readiness checks',
      'Call manage_journal_entry per accrual proposal (staged for approval)',
      'Call manage_journal_entry per depreciation proposal (staged for approval)',
      'Call close_accounting_period for final period (staged)',
      'Optionally invoke locale-pack year_end_proposals callback'
    ),
    'note', 'Read-only orchestration. All writes go through staged skills.'
  );
END; $function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- KLASS 3 — webinar_registrations SELECT läcker persondata (GDPR)
-- ───────────────────────────────────────────────────────────────────────────
-- Policyn "Registrants can read own registrations" hade qual = true TO public
-- → anon läste alla anmälares namn/email/telefon. WebinarBlock (publik) behöver
-- bara en RÄKNARE per webinar. (a) SECURITY DEFINER-räknare för anon; (b) UI:t
-- läser räknaren i stället för tabellen (WebinarBlock.tsx); (c) SELECT-policyn
-- byts mot staff (webinars-modulen) + ägare (matchande profil-email).
-- "Anyone can register for webinars" (INSERT) behålls — publik anmälan.
-- ═══════════════════════════════════════════════════════════════════════════

-- plpgsql, INTE sql: en STABLE sql-funktion med enkel SELECT inlinas av
-- planeraren, och inlining kör kroppen i ANROPARENS kontext — vilket kringgår
-- SECURITY DEFINER. Då utvärderar anon RLS på webinar_registrations, träffar
-- "Admins can manage"-policyns has_role→user_roles, och får "permission denied
-- for table user_roles" (anon-granten på user_roles drogs in i 20260822010000).
-- plpgsql-kroppar inlinas aldrig, så definer-kontexten (postgres, bypassrls)
-- håller och räknaren ser alla rader.
CREATE OR REPLACE FUNCTION public.webinar_registration_count(p_webinar_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*)::int INTO v_count
  FROM public.webinar_registrations
  WHERE webinar_id = p_webinar_id;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.webinar_registration_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.webinar_registration_count(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Registrants can read own registrations" ON public.webinar_registrations;
CREATE POLICY "Registrants and staff can read registrations"
  ON public.webinar_registrations
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_module(auth.uid(), 'webinars')
    OR (
      auth.uid() IS NOT NULL
      AND email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- KLASS 4 — newsletter tracking: publika INSERT/UPDATE = förfalskad statistik
-- ───────────────────────────────────────────────────────────────────────────
-- "System can insert/update opens|clicks" hade WITH CHECK true / USING true TO
-- public → anon kunde skriva om öppnings/klickstatistik. De riktiga skrivarna
-- är service-role edge-fn (newsletter/track.ts, link.ts — båda getServiceClient(),
-- verifierat), som passerar RLS helt. De publika policyerna droppas; läspolicyer
-- (staff via newsletter-modulen, admin) behålls.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "System can insert opens" ON public.newsletter_email_opens;
DROP POLICY IF EXISTS "System can update opens" ON public.newsletter_email_opens;
DROP POLICY IF EXISTS "System can insert clicks" ON public.newsletter_link_clicks;
DROP POLICY IF EXISTS "System can update clicks" ON public.newsletter_link_clicks;

-- ═══════════════════════════════════════════════════════════════════════════
-- LACKMUS (kör i BEGIN; SET LOCAL ROLE …; … ROLLBACK)
-- ───────────────────────────────────────────────────────────────────────────
-- KLASS 1  SET LOCAL ROLE authenticated;  SELECT schedule_cron_job('x','* * * * *','http://x','{}','{}');  → unauthorized
--          (admin-JWT via request.jwt.claims): samma → true;  service_role → true
-- KLASS 2  SET LOCAL ROLE authenticated;  SELECT preview_payroll_period(2026,8);   → Requires the payroll module
--          SET LOCAL ROLE authenticated;  SELECT prepare_vat_return('2026-01-01','2026-01-31'); → Requires the accounting module
--          service_role: samma anrop → kör
-- KLASS 3  SET LOCAL ROLE anon;  SELECT count(*) FROM webinar_registrations;       → 0 rader
--          SET LOCAL ROLE anon;  SELECT webinar_registration_count('<uuid>');      → tal
-- KLASS 4  SET LOCAL ROLE anon;  INSERT INTO newsletter_email_opens(...) …;        → RLS-neka
--          service-role edge-fn (track.ts/link.ts) skriver oförändrat (kringgår RLS)
