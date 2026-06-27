-- Reconciliation part 2: RPC functions from column-only / function-only
-- migrations that were skipped by dev's divergent ledger (backdated).
-- These weren't in part 1 (20260627210000) because they don't create one
-- of the 23 module tables. CREATE OR REPLACE only (idempotent, no data).
-- Forward-dated so Lovable's runner applies it.

-- ===== apply_pension (from 20260613060000_6d456022-3f97-4d5a-958d-029e00725889.sql) =====
CREATE OR REPLACE FUNCTION "public"."apply_pension"(
  "p_run_id" "uuid", "p_employer_pct" numeric, "p_employee_pct" numeric DEFAULT 0
) RETURNS "jsonb" LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_status text; v_emp_total bigint := 0; v_ee_total bigint := 0;
BEGIN
  IF NOT (auth.role()='service_role' OR has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only admins can apply pension';
  END IF;
  IF p_employer_pct IS NULL OR p_employer_pct < 0 OR COALESCE(p_employee_pct,0) < 0 THEN
    RAISE EXCEPTION 'pension percentages must be non-negative';
  END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'Run % is % — pension can only be applied to a draft', p_run_id, v_status; END IF;

  -- Recompute per line. net is restored from the prior employee-pension value so
  -- re-running with a new pct is idempotent (no compounding).
  UPDATE payroll_lines SET
    net_cents = net_cents + pension_employee_cents - ROUND(gross_cents * COALESCE(p_employee_pct,0) / 100.0)::bigint,
    pension_employer_cents = ROUND(gross_cents * p_employer_pct / 100.0)::bigint,
    pension_employee_cents = ROUND(gross_cents * COALESCE(p_employee_pct,0) / 100.0)::bigint
  WHERE run_id = p_run_id;

  SELECT COALESCE(SUM(pension_employer_cents),0), COALESCE(SUM(pension_employee_cents),0)
    INTO v_emp_total, v_ee_total FROM payroll_lines WHERE run_id = p_run_id;

  UPDATE payroll_runs SET
    total_pension_employer_cents = v_emp_total,
    total_pension_employee_cents = v_ee_total,
    total_net_cents = (SELECT COALESCE(SUM(net_cents),0) FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id,
    'employer_pct', p_employer_pct, 'employee_pct', COALESCE(p_employee_pct,0),
    'total_pension_employer_cents', v_emp_total, 'total_pension_employee_cents', v_ee_total);
END; $$;

-- ===== book_appointment_slot (from 20260614050000_c54c914c-dda1-4479-a1c6-3b44734d5880.sql) =====
CREATE OR REPLACE FUNCTION "public"."book_appointment_slot"(
  "p_service_id" "uuid",
  "p_customer_name" "text",
  "p_customer_email" "text",
  "p_start_time" timestamptz,
  "p_customer_phone" "text" DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_duration int;
  v_end timestamptz;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'Not authorized to create bookings';
  END IF;

  SELECT duration_minutes INTO v_duration
  FROM booking_services WHERE id = p_service_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service % not found or inactive', p_service_id; END IF;

  v_end := p_start_time + make_interval(mins => v_duration);

  -- reject overlap on the same service (excluding cancelled bookings)
  IF EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.service_id = p_service_id
      AND b.status <> 'cancelled'
      AND tstzrange(b.start_time, b.end_time, '[)') && tstzrange(p_start_time, v_end, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_unavailable: % overlaps an existing booking', p_start_time
      USING ERRCODE = 'exclusion_violation';
  END IF;

  INSERT INTO bookings (service_id, customer_name, customer_email, customer_phone, start_time, end_time, notes, status)
  VALUES (p_service_id, p_customer_name, p_customer_email, p_customer_phone, p_start_time, v_end, p_notes, 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_id,
    'start_time', p_start_time,
    'end_time', v_end,
    'duration_minutes', v_duration
  );
END;
$$;

-- ===== book_invoice_issued (from 20260610100000_ff885761-428c-452a-96d0-f81103465f39.sql) =====
CREATE OR REPLACE FUNCTION public.book_invoice_issued(
  p_invoice_id uuid,
  p_ar_account text DEFAULT '1510',
  p_revenue_account text DEFAULT '3001',
  p_vat_account text DEFAULT '2611'
)
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

-- ===== book_invoice_paid (from 20260610100000_ff885761-428c-452a-96d0-f81103465f39.sql) =====
CREATE OR REPLACE FUNCTION public.book_invoice_paid(
  p_invoice_id uuid,
  p_bank_account text DEFAULT '1930',
  p_ar_account text DEFAULT '1510'
)
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

-- ===== calc_sick_pay (from 20260613060000_6d456022-3f97-4d5a-958d-029e00725889.sql) =====
CREATE OR REPLACE FUNCTION "public"."calc_sick_pay"(
  "p_monthly_salary_cents" bigint, "p_sick_days" integer, "p_work_days_per_month" integer DEFAULT 21
) RETURNS "jsonb" LANGUAGE "plpgsql" IMMUTABLE SET "search_path" TO 'public' AS $$
DECLARE
  v_daily numeric; v_paid_days int; v_gross bigint; v_karens bigint; v_net bigint;
BEGIN
  IF p_monthly_salary_cents IS NULL OR p_monthly_salary_cents < 0 THEN RAISE EXCEPTION 'monthly salary must be >= 0'; END IF;
  IF p_sick_days IS NULL OR p_sick_days < 0 THEN RAISE EXCEPTION 'sick_days must be >= 0'; END IF;
  IF COALESCE(p_work_days_per_month,0) <= 0 THEN RAISE EXCEPTION 'work_days_per_month must be > 0'; END IF;
  IF p_sick_days = 0 THEN
    RETURN jsonb_build_object('success', true, 'sick_pay_cents', 0, 'paid_sick_days', 0, 'karensavdrag_cents', 0);
  END IF;
  v_daily := p_monthly_salary_cents::numeric / p_work_days_per_month;
  v_paid_days := LEAST(p_sick_days, 14);                       -- employer period
  v_gross := ROUND(0.80 * v_daily * v_paid_days)::bigint;      -- 80% sick pay
  v_karens := ROUND(0.80 * v_daily)::bigint;                    -- one karensavdrag (20% of a 5-day 80% week)
  v_net := GREATEST(0, v_gross - v_karens);
  RETURN jsonb_build_object('success', true,
    'sick_pay_cents', v_net, 'gross_sick_pay_cents', v_gross, 'karensavdrag_cents', v_karens,
    'paid_sick_days', v_paid_days, 'daily_salary_cents', ROUND(v_daily)::bigint,
    'capped', p_sick_days > 14);
END; $$;

-- ===== change_subscription (from 20260612140000_83580b08-8a1d-4444-8f50-aa963dd13132.sql) =====
CREATE OR REPLACE FUNCTION "public"."change_subscription"(
  "p_subscription_id" "uuid",
  "p_new_quantity" integer DEFAULT NULL,
  "p_new_unit_amount_cents" integer DEFAULT NULL,
  "p_generate_adjustment" boolean DEFAULT true,
  "p_tax_rate" numeric DEFAULT 0.25
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  _sub public.subscriptions%ROWTYPE;
  _old_per_period bigint;
  _new_per_period bigint;
  _delta bigint;
  _fraction numeric;
  _prorated bigint;
  _invoice_id uuid;
  _invoice_number text;
  _tax integer;
  _total integer;
  _line jsonb;
  _total_days numeric;
  _remaining_days numeric;
BEGIN
  IF NOT ((auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role)) OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'Only admins or system can change subscriptions';
  END IF;
  IF p_new_quantity IS NULL AND p_new_unit_amount_cents IS NULL THEN
    RAISE EXCEPTION 'Provide p_new_quantity and/or p_new_unit_amount_cents';
  END IF;
  IF p_new_quantity IS NOT NULL AND p_new_quantity < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1 (cancel instead of zeroing)';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription % not found', p_subscription_id; END IF;
  IF _sub.provider <> 'manual' THEN
    RAISE EXCEPTION 'change_subscription only applies to manual subscriptions (got %); card subscriptions change at the provider', _sub.provider;
  END IF;
  IF _sub.status <> 'active'::subscription_status THEN
    RAISE EXCEPTION 'Cannot change subscription in status %', _sub.status;
  END IF;

  _old_per_period := _sub.unit_amount_cents::bigint * COALESCE(_sub.quantity, 1);
  _new_per_period := COALESCE(p_new_unit_amount_cents, _sub.unit_amount_cents)::bigint
                   * COALESCE(p_new_quantity, _sub.quantity, 1);
  _delta := _new_per_period - _old_per_period;

  -- Remaining-period fraction (days-based); 0 when period boundaries are unknown
  IF _sub.current_period_start IS NOT NULL AND _sub.current_period_end IS NOT NULL
     AND _sub.current_period_end > _sub.current_period_start THEN
    _total_days := EXTRACT(EPOCH FROM (_sub.current_period_end - _sub.current_period_start)) / 86400.0;
    _remaining_days := GREATEST(EXTRACT(EPOCH FROM (_sub.current_period_end - now())) / 86400.0, 0);
    _fraction := LEAST(_remaining_days / _total_days, 1);
  ELSE
    _fraction := 0;
  END IF;

  _prorated := round(_delta * _fraction);

  UPDATE public.subscriptions
     SET quantity = COALESCE(p_new_quantity, quantity),
         unit_amount_cents = COALESCE(p_new_unit_amount_cents, unit_amount_cents),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'last_change', jsonb_build_object(
             'at', now(), 'old_per_period_cents', _old_per_period,
             'new_per_period_cents', _new_per_period,
             'prorated_cents', _prorated, 'fraction', round(_fraction::numeric, 4)))
   WHERE id = p_subscription_id;

  -- Upgrade mid-period: prorated adjustment invoice
  IF _prorated > 0 AND p_generate_adjustment THEN
    _tax := round(_prorated * COALESCE(p_tax_rate, 0.25))::integer;
    _total := _prorated + _tax;
    _invoice_number := 'SUB-ADJ-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text, 5, '0');
    _line := jsonb_build_array(jsonb_build_object(
      'description', 'Prorated adjustment: ' || _sub.product_name || ' (' ||
        round(_fraction * 100) || '% of period remaining)',
      'quantity', 1,
      'unit_price_cents', _prorated,
      'total_cents', _prorated
    ));
    INSERT INTO public.invoices (
      invoice_number, customer_email, customer_name, status, line_items,
      subtotal_cents, tax_rate, tax_cents, total_cents, currency,
      due_date, issue_date, payment_terms, notes
    ) VALUES (
      _invoice_number, _sub.customer_email, _sub.customer_name, 'draft'::invoice_status, _line,
      _prorated::integer, COALESCE(p_tax_rate, 0.25), _tax, _total, upper(_sub.currency),
      CURRENT_DATE + 30, CURRENT_DATE, 'Net 30 days',
      'Prorated adjustment for subscription ' || _sub.id::text
    ) RETURNING id INTO _invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'old_per_period_cents', _old_per_period,
    'new_per_period_cents', _new_per_period,
    'remaining_fraction', round(_fraction::numeric, 4),
    'prorated_cents', _prorated,
    'adjustment_invoice_id', _invoice_id,
    'credit_cents', CASE WHEN _prorated < 0 THEN -_prorated ELSE 0 END,
    'note', CASE WHEN _prorated < 0 THEN 'Downgrade credit recorded on subscription metadata — apply on next invoice' ELSE NULL END
  );
END $$;

-- ===== create_credit_note (from 20260614090000_ff84b0a6-5d99-4dc0-8e82-5ed695e8a508.sql) =====
CREATE OR REPLACE FUNCTION "public"."create_credit_note"(
  "p_invoice_id" "uuid",
  "p_reason" "text" DEFAULT NULL,
  "p_amount_cents" integer DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_inv RECORD;
  v_seq int;
  v_number text;
  v_sub int; v_tax int; v_tot int;
  v_id uuid;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can issue credit notes';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.invoice_type <> 'invoice' THEN RAISE EXCEPTION 'Cannot credit a credit note'; END IF;

  IF p_amount_cents IS NULL THEN
    -- full credit: negate the original
    v_sub := -v_inv.subtotal_cents; v_tax := -v_inv.tax_cents; v_tot := -v_inv.total_cents;
  ELSE
    IF p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;
    IF p_amount_cents > v_inv.total_cents THEN
      RAISE EXCEPTION 'Credit % exceeds invoice total %', p_amount_cents, v_inv.total_cents;
    END IF;
    v_sub := -p_amount_cents; v_tax := 0; v_tot := -p_amount_cents;
  END IF;

  SELECT count(*) + 1 INTO v_seq FROM invoices WHERE credited_invoice_id = p_invoice_id;
  v_number := 'CN-' || v_inv.invoice_number || '-' || v_seq;

  INSERT INTO invoices (
    invoice_number, invoice_type, credited_invoice_id,
    customer_email, customer_name, status, line_items,
    subtotal_cents, tax_rate, tax_cents, total_cents, currency,
    notes, created_by, issue_date
  ) VALUES (
    v_number, 'credit_note', p_invoice_id,
    v_inv.customer_email, v_inv.customer_name, 'sent', v_inv.line_items,
    v_sub, v_inv.tax_rate, v_tax, v_tot, v_inv.currency,
    COALESCE(p_reason, 'Credit note for ' || v_inv.invoice_number), auth.uid(), CURRENT_DATE
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true, 'credit_note_id', v_id, 'credit_note_number', v_number,
    'credited_invoice_id', p_invoice_id, 'total_cents', v_tot,
    'kind', CASE WHEN p_amount_cents IS NULL THEN 'full' ELSE 'partial' END
  );
END;
$$;

-- ===== fill_journal_line_account_name (from 20260610094500_f79c7f14-d360-4f3c-84d8-745ce15426b5.sql) =====
CREATE OR REPLACE FUNCTION public.fill_journal_line_account_name()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.account_name IS NULL OR NEW.account_name = '' THEN
    SELECT account_name INTO NEW.account_name
      FROM public.chart_of_accounts WHERE account_code = NEW.account_code;
    IF NEW.account_name IS NULL THEN NEW.account_name := NEW.account_code; END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- ===== find_duplicate_companies (from 20260612100000_309e53ee-9c45-4651-9492-d686227b57f4.sql) =====
CREATE OR REPLACE FUNCTION "public"."find_duplicate_companies"(
  "p_threshold" numeric DEFAULT 0.45,
  "p_limit" integer DEFAULT 25
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
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
END $$;

-- ===== find_duplicate_leads (from 20260616120000_7d5dab95-d0ec-4d18-b10d-3761f17f9bf4.sql) =====
CREATE OR REPLACE FUNCTION "public"."find_duplicate_leads"(
  "p_threshold" numeric DEFAULT 0.45,
  "p_limit" integer DEFAULT 25
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY (x.score) DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT a.id AS lead_a, a.name AS name_a, a.email AS email_a, a.status::text AS status_a,
           b.id AS lead_b, b.name AS name_b, b.email AS email_b, b.status::text AS status_b,
           round(GREATEST(
             similarity(lower(coalesce(a.name, '')), lower(coalesce(b.name, ''))),
             CASE WHEN normalize_email(a.email) IS NOT NULL
                   AND normalize_email(a.email) = normalize_email(b.email) THEN 1.0 ELSE 0 END
           )::numeric, 2) AS score,
           (normalize_email(a.email) IS NOT NULL
             AND normalize_email(a.email) = normalize_email(b.email)) AS same_email
    FROM leads a
    JOIN leads b ON a.id < b.id
    WHERE (a.name IS NOT NULL AND b.name IS NOT NULL
            AND similarity(lower(a.name), lower(b.name)) >= p_threshold)
       OR (normalize_email(a.email) IS NOT NULL
            AND normalize_email(a.email) = normalize_email(b.email))
    ORDER BY 9 DESC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
  ) x;
  RETURN jsonb_build_object('success', true, 'pairs', v_rows);
END $$;

-- ===== inspect_return (from 20260612110000_476c5daf-b2df-422e-8050-e6d9132a455a.sql) =====
CREATE OR REPLACE FUNCTION "public"."inspect_return"(
  "p_return_id" "uuid",
  "p_notes" "text" DEFAULT NULL,
  "p_restocking_fee_cents" bigint DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can inspect returns';
  END IF;
  UPDATE returns
     SET inspected_at = now(),
         inspection_notes = COALESCE(p_notes, inspection_notes),
         restocking_fee_cents = COALESCE(p_restocking_fee_cents, restocking_fee_cents)
   WHERE id = p_return_id AND status = 'received';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % not found or not in received state', p_return_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'return_id', p_return_id, 'inspected', true);
END $$;

-- ===== inventory_gl_reconciliation (from 20260612170000_e7de3cbd-d178-4ed9-a25c-e43d665c6914.sql) =====
CREATE OR REPLACE FUNCTION "public"."inventory_gl_reconciliation"() RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_gl bigint;
  v_layers bigint;
  v_unbooked bigint;
  v_diff bigint;
BEGIN
  -- GL 1460 balance from posted journal lines
  SELECT COALESCE(SUM(debit_cents) - SUM(credit_cents), 0) INTO v_gl
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_code = '1460' AND je.status = 'posted';

  -- Inventory value per the valuation layers
  SELECT COALESCE(round(SUM(remaining_qty * unit_cost_cents)), 0) INTO v_layers
  FROM stock_valuation_layers WHERE remaining_qty > 0;

  -- Layers whose receipt never posted to GL (non-PO receipts: manual/adjustment/
  -- mo_production) — the expected, explainable part of any difference.
  SELECT COALESCE(round(SUM(l.remaining_qty * l.unit_cost_cents)), 0) INTO v_unbooked
  FROM stock_valuation_layers l
  LEFT JOIN stock_moves m ON m.id = l.move_id
  WHERE l.remaining_qty > 0
    AND (m.id IS NULL OR m.reference_type IS NULL
         OR m.reference_type NOT IN ('purchase_order','po','goods_receipt'));

  v_diff := v_gl - v_layers;
  RETURN jsonb_build_object(
    'success', true,
    'gl_1460_cents', v_gl,
    'layers_value_cents', v_layers,
    'difference_cents', v_diff,
    'unbooked_receipt_value_cents', v_unbooked,
    'reconciled', (v_diff + v_unbooked) = 0 OR v_diff = 0,
    'explanation', CASE
      WHEN v_diff = 0 THEN 'GL 1460 ties out to the valuation layers exactly.'
      WHEN (v_diff + v_unbooked) = 0 THEN 'Difference fully explained by receipts that post no GL (manual/MO receipts create layers but only purchase receipts post Dt 1460).'
      ELSE 'Unexplained difference — investigate journal entries on 1460 vs stock_valuation_layers (e.g. manual journals, deleted layers, period locks that skipped COGS).'
    END);
END $$;

-- ===== merge_leads (from 20260616120000_7d5dab95-d0ec-4d18-b10d-3761f17f9bf4.sql) =====
CREATE OR REPLACE FUNCTION "public"."merge_leads"(
  "p_primary_id" "uuid",
  "p_duplicate_id" "uuid"
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_primary leads%ROWTYPE;
  v_dupe    leads%ROWTYPE;
  v_moved   jsonb := '{}'::jsonb;
  v_tbl     text;
  v_cnt     integer;
  v_child_tables text[] := ARRAY[
    'crm_tasks', 'deals', 'lead_activities', 'pricelists',
    'invoices', 'quotes', 'tickets', 'webinar_registrations'
  ];
BEGIN
  IF p_primary_id = p_duplicate_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'primary and duplicate are the same lead');
  END IF;

  SELECT * INTO v_primary FROM leads WHERE id = p_primary_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'primary lead not found');
  END IF;

  SELECT * INTO v_dupe FROM leads WHERE id = p_duplicate_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate lead not found');
  END IF;

  -- Reassign child rows duplicate -> primary (only tables/columns present on this instance).
  FOREACH v_tbl IN ARRAY v_child_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'lead_id') THEN
      EXECUTE format('UPDATE public.%I SET lead_id = $1 WHERE lead_id = $2', v_tbl)
        USING p_primary_id, p_duplicate_id;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      IF v_cnt > 0 THEN
        v_moved := v_moved || jsonb_build_object(v_tbl, v_cnt);
      END IF;
    END IF;
  END LOOP;

  -- Fill-null on the primary from the duplicate; scores are additive (matches CRM publish() semantics).
  UPDATE leads SET
    name        = COALESCE(v_primary.name, v_dupe.name),
    phone       = COALESCE(v_primary.phone, v_dupe.phone),
    company_id  = COALESCE(v_primary.company_id, v_dupe.company_id),
    assigned_to = COALESCE(v_primary.assigned_to, v_dupe.assigned_to),
    ai_summary  = COALESCE(v_primary.ai_summary, v_dupe.ai_summary),
    score       = COALESCE(v_primary.score, 0) + COALESCE(v_dupe.score, 0),
    updated_at  = now()
  WHERE id = p_primary_id;

  DELETE FROM leads WHERE id = p_duplicate_id;

  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('lead.merged', 'lead', p_primary_id, auth.uid(),
    jsonb_build_object('merged_lead_id', p_duplicate_id, 'merged_email', v_dupe.email, 'moved', v_moved));

  RETURN jsonb_build_object('success', true, 'primary_id', p_primary_id,
                            'merged_id', p_duplicate_id, 'moved', v_moved);
END $$;

-- ===== mrp_reorder_run (from 20260614070000_04194ba4-1207-4016-879c-09b77fc1e3af.sql) =====
CREATE OR REPLACE FUNCTION "public"."mrp_reorder_run"(
  "p_dry_run" boolean DEFAULT true
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_row RECORD;
  v_candidates jsonb := '[]'::jsonb;
  v_created int := 0;
  v_mo uuid;
BEGIN
  IF NOT p_dry_run AND NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can create reorder MOs';
  END IF;

  FOR v_row IN
    SELECT ps.product_id, p.name AS product_name,
           ps.quantity_on_hand, ps.reorder_point,
           GREATEST(ps.reorder_point - ps.quantity_on_hand, 1) AS suggested_qty,
           b.id AS bom_id
    FROM product_stock ps
    JOIN products p ON p.id = ps.product_id
    JOIN bom_headers b ON b.product_id = ps.product_id AND b.is_active
    WHERE ps.quantity_on_hand <= ps.reorder_point
      AND ps.reorder_point > 0
      AND NOT EXISTS (
        SELECT 1 FROM manufacturing_orders mo
        WHERE mo.product_id = ps.product_id AND mo.status NOT IN ('done','cancelled')
      )
  LOOP
    v_candidates := v_candidates || jsonb_build_object(
      'product_id', v_row.product_id, 'product_name', v_row.product_name,
      'quantity_on_hand', v_row.quantity_on_hand, 'reorder_point', v_row.reorder_point,
      'suggested_qty', v_row.suggested_qty, 'bom_id', v_row.bom_id);

    IF NOT p_dry_run THEN
      INSERT INTO manufacturing_orders (mo_number, product_id, bom_id, quantity, status, source_type, created_by)
      VALUES (next_mo_number(), v_row.product_id, v_row.bom_id, v_row.suggested_qty, 'draft', 'reorder', auth.uid())
      RETURNING id INTO v_mo;
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'candidate_count', jsonb_array_length(v_candidates),
    'created', v_created,
    'candidates', v_candidates
  );
END;
$$;

-- ===== normalize_email (from 20260616120000_7d5dab95-d0ec-4d18-b10d-3761f17f9bf4.sql) =====
CREATE OR REPLACE FUNCTION "public"."normalize_email"("p_email" "text")
RETURNS "text" LANGUAGE "sql" IMMUTABLE AS $$
  SELECT CASE
           WHEN p_email IS NULL OR btrim(p_email) = '' THEN NULL
           ELSE lower(regexp_replace(btrim(p_email), '\+[^@]*@', '@'))
         END;
$$;

-- ===== on_invoice_status_book (from 20260610100000_ff885761-428c-452a-96d0-f81103465f39.sql) =====
CREATE OR REPLACE FUNCTION public.on_invoice_status_book()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' THEN
      PERFORM public.book_invoice_issued(NEW.id);
    ELSIF NEW.status = 'paid' THEN
      PERFORM public.book_invoice_paid(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- ===== record_invoice_payment (from 20260614100000_1cf39977-0252-4902-b436-42ade360473d.sql) =====
CREATE OR REPLACE FUNCTION "public"."record_invoice_payment"(
  "p_invoice_id" "uuid",
  "p_amount_cents" bigint,
  "p_method" "text" DEFAULT 'manual',
  "p_paid_at" timestamptz DEFAULT now()
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
  v_inv RECORD;
  v_remaining bigint;
  v_new_paid bigint;
  v_fully boolean;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'approver')) THEN
    RAISE EXCEPTION 'Not authorized to record payments';
  END IF;
  IF p_amount_cents <= 0 THEN RAISE EXCEPTION 'p_amount_cents must be positive'; END IF;

  SELECT id, total_cents, COALESCE(paid_amount_cents,0) AS paid_amount_cents, status, invoice_type
    INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice_id; END IF;
  IF v_inv.status::text = 'cancelled' THEN RAISE EXCEPTION 'Cannot pay a cancelled invoice'; END IF;
  IF COALESCE(v_inv.invoice_type,'invoice') <> 'invoice' THEN RAISE EXCEPTION 'Cannot pay a credit note'; END IF;

  v_remaining := GREATEST(0, v_inv.total_cents - v_inv.paid_amount_cents);
  IF p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Payment % exceeds remaining balance %', p_amount_cents, v_remaining;
  END IF;

  v_new_paid := v_inv.paid_amount_cents + p_amount_cents;
  v_fully := (v_new_paid >= v_inv.total_cents);

  UPDATE invoices
    SET paid_amount_cents = v_new_paid,
        status = CASE WHEN v_fully THEN 'paid'::invoice_status ELSE status END,
        paid_at = CASE WHEN v_fully THEN COALESCE(paid_at, p_paid_at) ELSE paid_at END
  WHERE id = p_invoice_id;

  INSERT INTO audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('invoice.payment_recorded', 'invoice', p_invoice_id, auth.uid(),
    jsonb_build_object('amount_cents', p_amount_cents, 'method', p_method,
      'paid_amount_cents', v_new_paid, 'fully_paid', v_fully));

  RETURN jsonb_build_object(
    'success', true, 'invoice_id', p_invoice_id,
    'amount_cents', p_amount_cents, 'paid_amount_cents', v_new_paid,
    'remaining_cents', GREATEST(0, v_inv.total_cents - v_new_paid),
    'fully_paid', v_fully,
    'status', CASE WHEN v_fully THEN 'paid' ELSE v_inv.status::text END
  );
END;
$$;

-- ===== request_callback (from 20260616180000_094de1e3-d818-4ca9-8ae8-bc2e7ab7efe6.sql) =====
CREATE OR REPLACE FUNCTION "public"."request_callback"(
  "p_action" "text",
  "p_callback_id" "uuid" DEFAULT NULL,
  "p_conversation_id" "uuid" DEFAULT NULL,
  "p_customer_name" "text" DEFAULT NULL,
  "p_customer_email" "text" DEFAULT NULL,
  "p_customer_phone" "text" DEFAULT NULL,
  "p_preferred_time" timestamp with time zone DEFAULT NULL,
  "p_notes" "text" DEFAULT NULL
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_id uuid;
  v_start timestamptz;
  v_attempts integer;
  v_rows jsonb;
BEGIN
  IF p_action = 'create' THEN
    v_start := COALESCE(p_preferred_time, now());
    INSERT INTO bookings (service_id, customer_name, customer_email, customer_phone,
                          start_time, end_time, status, notes, metadata)
    VALUES (
      NULL,
      COALESCE(NULLIF(btrim(p_customer_name), ''), 'Callback request'),
      COALESCE(p_customer_email, ''),
      p_customer_phone,
      v_start,
      v_start + interval '15 minutes',
      'pending',
      p_notes,
      jsonb_build_object('kind', 'callback', 'conversation_id', p_conversation_id, 'attempts', 0)
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'callback_id', v_id, 'scheduled_for', v_start);

  ELSIF p_action = 'mark_attempted' THEN
    IF p_callback_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'callback_id is required for mark_attempted');
    END IF;
    UPDATE bookings SET
      metadata = metadata
        || jsonb_build_object(
             'attempts', COALESCE((metadata->>'attempts')::int, 0) + 1,
             'last_attempt_at', now()),
      updated_at = now()
    WHERE id = p_callback_id AND metadata->>'kind' = 'callback'
    RETURNING COALESCE((metadata->>'attempts')::int, 0) INTO v_attempts;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'callback not found');
    END IF;
    RETURN jsonb_build_object('success', true, 'callback_id', p_callback_id, 'attempts', v_attempts);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.start_time), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT id, customer_name, customer_email, customer_phone, start_time, status,
             notes, metadata, created_at
      FROM bookings WHERE metadata->>'kind' = 'callback'
      ORDER BY start_time DESC LIMIT 100
    ) b;
    RETURN jsonb_build_object('success', true, 'callbacks', v_rows);

  ELSE
    RETURN jsonb_build_object('success', false, 'error',
      format('unknown action %L (use create | mark_attempted | list)', p_action));
  END IF;
END $$;

-- ===== return_reason_report (from 20260612110000_476c5daf-b2df-422e-8050-e6d9132a455a.sql) =====
CREATE OR REPLACE FUNCTION "public"."return_reason_report"(
  "p_days" integer DEFAULT 90
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_rows jsonb;
BEGIN
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
END $$;

-- ===== record_pos_sale_v2 (from 20260610160000_54ddaa90-ef73-43c7-a36c-c7f30ce832f7.sql) =====
CREATE OR REPLACE FUNCTION "public"."record_pos_sale_v2"("p_register_id" "uuid", "p_session_id" "uuid", "p_lines" "jsonb", "p_payments" "jsonb", "p_customer_id" "uuid" DEFAULT NULL::"uuid", "p_customer_email" "text" DEFAULT NULL::"text", "p_discount_cents" integer DEFAULT 0, "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sale_id uuid;
  v_receipt text;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_total integer := 0;
  v_paid integer := 0;
  v_line jsonb;
  v_payment jsonb;
  v_register_currency text;
  v_default_tax numeric;
  v_line_subtotal integer;
  v_line_tax integer;
  v_tax_rate numeric;
  v_product record;
  v_variant record;
  v_payment_summary text;
  v_unit_price integer;
  v_sku text;
  v_variant_id uuid;
BEGIN
  -- Validate session is open
  IF NOT EXISTS (
    SELECT 1 FROM public.pos_sessions
     WHERE id = p_session_id AND register_id = p_register_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Session % is not open for register %', p_session_id, p_register_id;
  END IF;

  SELECT currency, default_tax_rate
    INTO v_register_currency, v_default_tax
    FROM public.pos_registers WHERE id = p_register_id;

  -- Generate receipt
  v_receipt := 'R-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((EXTRACT(EPOCH FROM now())::bigint % 100000)::text, 5, '0');

  -- Single pass: resolve + validate every line into a temp table (avoids the
  -- old duplicated calc/insert loops drifting apart), accumulate totals.
  DROP TABLE IF EXISTS _pos_lines;
  CREATE TEMP TABLE _pos_lines (
    product_id uuid, variant_id uuid, product_name text, sku text,
    quantity numeric, unit_price_cents integer, discount_cents integer,
    tax_rate numeric, line_total_cents integer
  ) ON COMMIT DROP;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, v_default_tax, 0);
    v_unit_price := (v_line->>'unit_price_cents')::integer;
    v_sku := v_line->>'sku';
    v_variant_id := NULLIF(v_line->>'variant_id','')::uuid;
    v_product := NULL;
    v_variant := NULL;

    -- If product_id given, ensure it's POS-enabled
    IF (v_line->>'product_id') IS NOT NULL THEN
      SELECT id, name, available_in_pos, price_cents INTO v_product
        FROM public.products WHERE id = (v_line->>'product_id')::uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found', v_line->>'product_id';
      END IF;
      IF NOT v_product.available_in_pos THEN
        RAISE EXCEPTION 'Product % is not available in POS', v_product.name;
      END IF;
    END IF;

    -- If variant_id given, validate it and resolve price/SKU from it
    IF v_variant_id IS NOT NULL THEN
      SELECT id, product_id, sku, price_delta_cents, is_active INTO v_variant
        FROM public.product_variants WHERE id = v_variant_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant % not found', v_variant_id;
      END IF;
      IF NOT v_variant.is_active THEN
        RAISE EXCEPTION 'Variant % is not active', COALESCE(v_variant.sku, v_variant_id::text);
      END IF;
      IF v_product.id IS NOT NULL AND v_variant.product_id <> v_product.id THEN
        RAISE EXCEPTION 'Variant % does not belong to product %', v_variant_id, v_product.id;
      END IF;
      v_sku := COALESCE(v_sku, v_variant.sku);
      IF v_unit_price IS NULL AND v_product.id IS NOT NULL THEN
        v_unit_price := v_product.price_cents + v_variant.price_delta_cents;
      END IF;
    END IF;

    -- Fall back to product base price when price omitted
    IF v_unit_price IS NULL AND v_product.id IS NOT NULL THEN
      v_unit_price := v_product.price_cents;
    END IF;
    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Line "%" needs unit_price_cents or a product/variant to resolve the price from',
        COALESCE(v_line->>'product_name', '?');
    END IF;

    v_line_subtotal := (v_unit_price * (v_line->>'quantity')::numeric)::integer
                       - COALESCE((v_line->>'discount_cents')::integer, 0);
    v_line_tax := round(v_line_subtotal * v_tax_rate / 100.0)::integer;

    v_subtotal := v_subtotal + v_line_subtotal;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_subtotal + v_line_tax;

    INSERT INTO _pos_lines VALUES (
      NULLIF(v_line->>'product_id','')::uuid,
      v_variant_id,
      v_line->>'product_name',
      v_sku,
      (v_line->>'quantity')::numeric,
      v_unit_price,
      COALESCE((v_line->>'discount_cents')::integer, 0),
      v_tax_rate,
      v_line_subtotal + v_line_tax
    );
  END LOOP;

  v_total := v_total - COALESCE(p_discount_cents, 0);

  -- Validate payments cover the total
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_paid := v_paid + (v_payment->>'amount_cents')::integer;
  END LOOP;

  IF v_paid < v_total THEN
    RAISE EXCEPTION 'Insufficient payment: paid %, total %', v_paid, v_total;
  END IF;

  -- Determine payment_method label (split if >1)
  IF jsonb_array_length(p_payments) > 1 THEN
    v_payment_summary := 'split';
  ELSE
    v_payment_summary := COALESCE(p_payments->0->>'method', 'cash');
  END IF;

  -- Create sale
  INSERT INTO public.pos_sales (
    receipt_number, register_id, session_id, customer_id, customer_email,
    subtotal_cents, tax_cents, discount_cents, total_cents, currency,
    payment_method, status, metadata
  )
  VALUES (
    v_receipt, p_register_id, p_session_id, p_customer_id, p_customer_email,
    v_subtotal, v_tax, COALESCE(p_discount_cents, 0), v_total, v_register_currency,
    v_payment_summary, 'completed', p_metadata
  )
  RETURNING id INTO v_sale_id;

  -- Insert lines from the resolved set
  INSERT INTO public.pos_sale_lines (
    sale_id, product_id, variant_id, product_name, sku, quantity,
    unit_price_cents, discount_cents, tax_rate, line_total_cents
  )
  SELECT v_sale_id, product_id, variant_id, product_name, sku, quantity,
         unit_price_cents, discount_cents, tax_rate, line_total_cents
  FROM _pos_lines;

  -- Stock events (fire-and-forget — stock module listens)
  FOR v_line IN
    SELECT to_jsonb(l) FROM _pos_lines l WHERE l.product_id IS NOT NULL
  LOOP
    PERFORM public.emit_platform_event(
      'stock.movement',
      jsonb_build_object(
        'product_id', v_line->>'product_id',
        'variant_id', v_line->>'variant_id',
        'quantity', -((v_line->>'quantity')::numeric),
        'reason', 'pos_sale',
        'reference_type', 'pos_sale',
        'reference_id', v_sale_id,
        'sku', v_line->>'sku'
      ),
      'pos'
    );
  END LOOP;

  -- Insert payments
  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (sale_id, method, amount_cents, reference, metadata)
    VALUES (
      v_sale_id,
      v_payment->>'method',
      (v_payment->>'amount_cents')::integer,
      v_payment->>'reference',
      COALESCE(v_payment->'metadata', '{}'::jsonb)
    );
  END LOOP;

  -- Update session totals
  UPDATE public.pos_sessions
     SET total_sales_cents = total_sales_cents + v_total,
         sales_count = sales_count + 1
   WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'receipt_number', v_receipt,
    'total_cents', v_total,
    'tax_cents', v_tax,
    'change_cents', v_paid - v_total
  );
END;
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
