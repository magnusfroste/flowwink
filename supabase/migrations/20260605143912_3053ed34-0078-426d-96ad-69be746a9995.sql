
-- =========================================================================
-- Demo seeders for 7 modules: timesheets, subscriptions, accounting,
-- reconciliation, pos, approvals, sla.
-- All idempotent + register every inserted row via _demo_register_row.
-- =========================================================================

-- ─── TIMESHEETS ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_timesheets(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  v_proj RECORD;
  v_emp_id uuid;
  i int;
BEGIN
  FOR v_proj IN SELECT id FROM projects ORDER BY created_at DESC LIMIT 5 LOOP
    SELECT id INTO v_emp_id FROM employees ORDER BY random() LIMIT 1;
    FOR i IN 1..7 LOOP
      INSERT INTO time_entries (project_id, employee_id, entry_date, hours, description, is_billable)
      VALUES (
        v_proj.id, v_emp_id,
        (CURRENT_DATE - (i * (1 + floor(random()*2))::int))::date,
        round((1 + random()*6)::numeric, 1),
        (ARRAY['Development', 'Code review', 'Client meeting', 'Documentation', 'Bug fixing', 'Planning', 'Testing'])[1 + floor(random()*7)::int],
        random() > 0.2
      ) RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'time_entries', v_id);
      v_count := v_count + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('time_entries', v_count);
END $$;

-- ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_subscriptions(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Acme Corp',         'billing@acme.example',     'Pro Plan',       'active',     19900, 'month', false),
    ('Globex Inc',        'finance@globex.example',   'Enterprise',     'active',     99900, 'month', false),
    ('Initech AB',        'ekonomi@initech.example',  'Starter',        'trialing',    4900, 'month', false),
    ('Hooli Ltd',         'ap@hooli.example',         'Pro Annual',     'active',    199900, 'year',  false),
    ('Pied Piper',        'billing@piedpiper.example','Pro Plan',       'past_due',   19900, 'month', false),
    ('Stark Industries',  'accounts@stark.example',   'Enterprise',     'active',     99900, 'month', false),
    ('Wayne Enterprises', 'billing@wayne.example',    'Pro Plan',       'canceled',   19900, 'month', true),
    ('Umbrella Corp',     'finance@umbrella.example', 'Starter',        'paused',      4900, 'month', false)
  ) AS t(cust, email, plan, status_, amount, interval_, canceled) LOOP
    INSERT INTO subscriptions (
      customer_name, customer_email, product_name, status, unit_amount_cents,
      currency, billing_interval, current_period_start, current_period_end,
      trial_end, canceled_at, provider, metadata
    ) VALUES (
      r.cust, r.email, r.plan, r.status_::subscription_status, r.amount,
      'sek', r.interval_,
      now() - interval '15 days',
      CASE WHEN r.interval_='year' THEN now() + interval '350 days' ELSE now() + interval '15 days' END,
      CASE WHEN r.status_='trialing' THEN now() + interval '7 days' END,
      CASE WHEN r.canceled THEN now() - interval '5 days' END,
      'manual',
      jsonb_build_object('seeded', true)
    ) RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'subscriptions', v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('subscriptions', v_count);
END $$;

-- ─── ACCOUNTING ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_accounting(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_je int := 0;
  v_jel int := 0;
  v_id uuid;
  r RECORD;
  v_line_id uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Office supplies — Kontorshuset AB',   '6110', 'Office supplies',         '2440', 'Trade payables',    125000, CURRENT_DATE - 25),
    ('Cloud hosting — AWS',                 '6540', 'IT services',             '1930', 'Bank',              348000, CURRENT_DATE - 20),
    ('Consulting income — Globex',          '1510', 'Trade receivables',       '3041', 'Consulting revenue',1500000, CURRENT_DATE - 15),
    ('Bank fee',                            '6570', 'Bank fees',               '1930', 'Bank',               7500, CURRENT_DATE - 10),
    ('Office rent — November',              '5010', 'Rent',                    '1930', 'Bank',             2500000, CURRENT_DATE - 5),
    ('Software license — Adobe',            '6540', 'IT services',             '1930', 'Bank',              125000, CURRENT_DATE - 2)
  ) AS t(descr, debit_code, debit_name, credit_code, credit_name, amount_cents, when_) LOOP
    INSERT INTO journal_entries (entry_date, description, status, source)
    VALUES (r.when_, r.descr, 'posted', 'manual')
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'journal_entries', v_id);
    v_je := v_je + 1;

    INSERT INTO journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
    VALUES (v_id, r.debit_code, r.debit_name, r.amount_cents, 0)
    RETURNING id INTO v_line_id;
    PERFORM _demo_register_row(p_run_id, 'journal_entry_lines', v_line_id);

    INSERT INTO journal_entry_lines (journal_entry_id, account_code, account_name, debit_cents, credit_cents)
    VALUES (v_id, r.credit_code, r.credit_name, 0, r.amount_cents)
    RETURNING id INTO v_line_id;
    PERFORM _demo_register_row(p_run_id, 'journal_entry_lines', v_line_id);
    v_jel := v_jel + 2;
  END LOOP;
  RETURN jsonb_build_object('journal_entries', v_je, 'lines', v_jel);
END $$;

-- ─── RECONCILIATION ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_reconciliation(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  v_bank_id uuid;
  r RECORD;
  i int := 1;
BEGIN
  SELECT id INTO v_bank_id FROM bank_accounts WHERE archived = false ORDER BY is_default DESC, created_at LIMIT 1;
  IF v_bank_id IS NULL THEN
    INSERT INTO bank_accounts (name, account_number, currency, gl_account, is_default)
    VALUES ('Demo Operating Account', 'SE45 5000 0000 0583 9825 7466', 'SEK', '1930', true)
    RETURNING id INTO v_bank_id;
    PERFORM _demo_register_row(p_run_id, 'bank_accounts', v_bank_id);
  END IF;

  FOR r IN SELECT * FROM (VALUES
    ('Globex Inc',          'INV-2025-0142',    1500000, CURRENT_DATE - 14, 'matched'),
    ('Acme Corp',           'INV-2025-0151',     199000, CURRENT_DATE - 10, 'matched'),
    ('Stripe payout',       'STRP-20251115',     348750, CURRENT_DATE - 8,  'unmatched'),
    ('Pied Piper',          'INV-2025-0156',     125000, CURRENT_DATE - 6,  'partial'),
    ('AWS EMEA SARL',       'AWS-INV-9381',     -348000, CURRENT_DATE - 5,  'matched'),
    ('Kontorshuset AB',     'KH-22341',         -125000, CURRENT_DATE - 4,  'matched'),
    ('Bank fee',            'FEE-202511',         -7500, CURRENT_DATE - 3,  'unmatched'),
    ('Hooli Ltd',           'INV-2025-0160',     199900, CURRENT_DATE - 2,  'unmatched'),
    ('Initech AB',          'INV-2025-0162',      49000, CURRENT_DATE - 1,  'unmatched'),
    ('Unknown transfer',    'TXN-998877',         85000, CURRENT_DATE,      'unmatched')
  ) AS t(party, ref_, amount, when_, status_) LOOP
    INSERT INTO bank_transactions (
      bank_account_id, source, external_id, transaction_date, amount_cents,
      currency, counterparty, reference, description, status, matched_amount_cents
    ) VALUES (
      v_bank_id, 'csv', 'demo-'||p_run_id::text||'-'||i, r.when_, r.amount,
      'SEK', r.party, r.ref_, r.party || ' — ' || r.ref_, r.status_,
      CASE r.status_ WHEN 'matched' THEN abs(r.amount) WHEN 'partial' THEN abs(r.amount)/2 ELSE 0 END
    ) RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'bank_transactions', v_id);
    v_count := v_count + 1;
    i := i + 1;
  END LOOP;
  RETURN jsonb_build_object('bank_transactions', v_count);
END $$;

-- ─── POS ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_pos(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg_id uuid;
  v_sess_id uuid;
  v_sale_id uuid;
  v_id uuid;
  v_count_sales int := 0;
  v_lines int := 0;
  v_prod RECORD;
  i int;
  v_methods text[] := ARRAY['cash','card','swish'];
  v_total int;
  v_line_count int;
  v_qty int;
  v_unit int;
  v_line_total int;
BEGIN
  SELECT id INTO v_reg_id FROM pos_registers WHERE active = true LIMIT 1;
  IF v_reg_id IS NULL THEN
    INSERT INTO pos_registers (name, location, currency, default_tax_rate, active)
    VALUES ('Demo Register #1', 'Main store', 'SEK', 25.00, true)
    RETURNING id INTO v_reg_id;
    PERFORM _demo_register_row(p_run_id, 'pos_registers', v_reg_id);
  END IF;

  INSERT INTO pos_sessions (register_id, cashier_name, status, opening_cash_cents, opened_at, closed_at, closing_cash_cents, expected_cash_cents, total_sales_cents, sales_count)
  VALUES (v_reg_id, 'Demo Cashier', 'closed', 100000, now() - interval '8 hours', now() - interval '30 minutes', 250000, 247500, 0, 0)
  RETURNING id INTO v_sess_id;
  PERFORM _demo_register_row(p_run_id, 'pos_sessions', v_sess_id);

  FOR i IN 1..8 LOOP
    v_total := 0;
    v_line_count := 1 + floor(random()*3)::int;

    INSERT INTO pos_sales (register_id, session_id, cashier_id, subtotal_cents, tax_cents, discount_cents, total_cents, currency, payment_method, status, created_at)
    VALUES (v_reg_id, v_sess_id, NULL, 0, 0, 0, 0, 'SEK', v_methods[1 + floor(random()*3)::int], 'completed', now() - (i * interval '45 minutes'))
    RETURNING id INTO v_sale_id;
    PERFORM _demo_register_row(p_run_id, 'pos_sales', v_sale_id);
    v_count_sales := v_count_sales + 1;

    FOR v_prod IN SELECT id, name, COALESCE(price_cents, 9900) AS p FROM products ORDER BY random() LIMIT v_line_count LOOP
      v_qty := 1 + floor(random()*3)::int;
      v_unit := v_prod.p;
      v_line_total := v_qty * v_unit;
      v_total := v_total + v_line_total;
      INSERT INTO pos_sale_lines (sale_id, product_id, product_name, quantity, unit_price_cents, tax_rate, line_total_cents)
      VALUES (v_sale_id, v_prod.id, v_prod.name, v_qty, v_unit, 25.00, v_line_total)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_sale_lines', v_id);
      v_lines := v_lines + 1;
    END LOOP;

    -- If no products existed, add a manual line
    IF v_line_count > 0 AND v_total = 0 THEN
      v_total := 9900;
      INSERT INTO pos_sale_lines (sale_id, product_name, quantity, unit_price_cents, tax_rate, line_total_cents)
      VALUES (v_sale_id, 'Walk-in item', 1, 9900, 25.00, 9900)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'pos_sale_lines', v_id);
      v_lines := v_lines + 1;
    END IF;

    UPDATE pos_sales SET subtotal_cents = round(v_total/1.25)::int, tax_cents = v_total - round(v_total/1.25)::int, total_cents = v_total WHERE id = v_sale_id;

    INSERT INTO pos_payments (sale_id, method, amount_cents)
    VALUES (v_sale_id, v_methods[1 + floor(random()*3)::int], v_total)
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'pos_payments', v_id);
  END LOOP;

  UPDATE pos_sessions SET total_sales_cents = (SELECT COALESCE(SUM(total_cents),0) FROM pos_sales WHERE session_id = v_sess_id),
                          sales_count = (SELECT COUNT(*) FROM pos_sales WHERE session_id = v_sess_id)
  WHERE id = v_sess_id;

  RETURN jsonb_build_object('sales', v_count_sales, 'lines', v_lines);
END $$;

-- ─── APPROVALS ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_approvals(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rules int := 0;
  v_reqs int := 0;
  v_id uuid;
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Expense over 5,000 SEK',     'Expenses above the standard limit require manager approval', 'expense', 500000, 'admin'::app_role),
    ('Purchase order over 25k',    'Large procurement decisions',                                 'purchase_order', 2500000, 'admin'::app_role),
    ('Customer discount over 20%', 'Discount exceeding standard pricing policy',                  'quote', NULL, 'admin'::app_role)
  ) AS t(name_, desc_, entity, thresh, role_) LOOP
    INSERT INTO approval_rules (name, description, entity_type, amount_threshold_cents, currency, required_role)
    VALUES (r.name_, r.desc_, r.entity, r.thresh, 'SEK', r.role_)
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'approval_rules', v_id);
    v_rules := v_rules + 1;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('expense',        'Travel — Berlin trip',         750000, 'pending',  'Need to attend industry conference'),
    ('expense',        'Equipment — MacBook Pro',     3500000, 'pending',  'Replacement for engineering hire'),
    ('purchase_order', 'Annual license renewal',      4800000, 'pending',  'Adobe Creative Cloud team'),
    ('quote',          'Acme Corp — 25% discount',          0, 'approved', 'Strategic account, multi-year commitment'),
    ('expense',        'Client dinner',                620000, 'rejected', 'Above per-diem limit')
  ) AS t(entity, reason_, amount, status_, ctx_) LOOP
    INSERT INTO approval_requests (entity_type, entity_id, amount_cents, currency, reason, status, required_role, context, resolved_at)
    VALUES (
      r.entity, gen_random_uuid()::text, r.amount, 'SEK', r.reason_,
      r.status_::approval_status, 'admin'::app_role,
      jsonb_build_object('demo_note', r.ctx_),
      CASE WHEN r.status_ IN ('approved','rejected') THEN now() - interval '1 day' END
    ) RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'approval_requests', v_id);
    v_reqs := v_reqs + 1;
  END LOOP;

  RETURN jsonb_build_object('rules', v_rules, 'requests', v_reqs);
END $$;

-- ─── SLA ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_demo_sla(p_run_id uuid, p_scenario text DEFAULT 'default')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pols int := 0;
  v_viols int := 0;
  v_id uuid;
  v_policy_id uuid;
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Ticket first response — urgent',  'First reply within 1 hour for urgent tickets',          'ticket', 'first_response',  60,  'urgent'),
    ('Ticket first response — high',    'First reply within 4 hours for high priority',          'ticket', 'first_response', 240, 'high'),
    ('Ticket resolution — all',         'Resolve tickets within 5 business days',                'ticket', 'resolution',    7200, 'all'),
    ('Lead follow-up',                  'Sales contact new leads within 24 hours',                'lead',   'first_contact', 1440, 'all'),
    ('Quote acceptance follow-up',      'Follow up sent quotes within 3 days',                    'quote',  'follow_up',     4320, 'all')
  ) AS t(name_, desc_, entity, metric_, mins, prio) LOOP
    INSERT INTO sla_policies (name, description, entity_type, metric, threshold_minutes, priority, enabled)
    VALUES (r.name_, r.desc_, r.entity, r.metric_, r.mins, r.prio, true)
    RETURNING id INTO v_id;
    PERFORM _demo_register_row(p_run_id, 'sla_policies', v_id);
    v_pols := v_pols + 1;
  END LOOP;

  -- Use one policy to attach some violations
  SELECT id INTO v_policy_id FROM sla_policies WHERE entity_type='ticket' AND metric='first_response' ORDER BY created_at DESC LIMIT 1;
  IF v_policy_id IS NOT NULL THEN
    FOR r IN SELECT * FROM (VALUES
      ('ticket', 'first_response',  60,   95, 'warning',  NULL::timestamptz),
      ('ticket', 'first_response',  60,  180, 'critical', NULL::timestamptz),
      ('ticket', 'first_response',  60,   72, 'warning',  now() - interval '2 days'),
      ('ticket', 'resolution',    7200, 8400, 'warning',  NULL::timestamptz)
    ) AS t(entity, metric_, thresh, actual_, sev, resolved) LOOP
      INSERT INTO sla_violations (policy_id, entity_type, entity_id, metric, threshold_minutes, actual_minutes, severity, resolved_at)
      VALUES (v_policy_id, r.entity, gen_random_uuid()::text, r.metric_, r.thresh, r.actual_, r.sev, r.resolved)
      RETURNING id INTO v_id;
      PERFORM _demo_register_row(p_run_id, 'sla_violations', v_id);
      v_viols := v_viols + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('policies', v_pols, 'violations', v_viols);
END $$;

-- ─── DISPATCHER UPDATE ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module text, p_scenario text DEFAULT 'default'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id uuid;
  v_result jsonb;
BEGIN
  INSERT INTO demo_runs (module, scenario, status) VALUES (p_module, p_scenario, 'running') RETURNING id INTO v_run_id;

  CASE p_module
    WHEN 'crm', 'leads' THEN v_result := seed_demo_crm(v_run_id, p_scenario);
    WHEN 'quotes' THEN v_result := seed_demo_quotes(v_run_id, p_scenario);
    WHEN 'invoices' THEN v_result := seed_demo_invoices(v_run_id, p_scenario);
    WHEN 'expenses' THEN v_result := seed_demo_expenses(v_run_id, p_scenario);
    WHEN 'tickets' THEN v_result := seed_demo_tickets(v_run_id, p_scenario);
    WHEN 'products', 'ecommerce' THEN v_result := seed_demo_ecommerce(v_run_id, p_scenario);
    WHEN 'subscriptions' THEN v_result := seed_demo_subscriptions(v_run_id, p_scenario);
    WHEN 'kb' THEN v_result := seed_demo_kb(v_run_id, p_scenario);
    WHEN 'blog' THEN v_result := seed_demo_blog(v_run_id, p_scenario);
    WHEN 'bookings' THEN v_result := seed_demo_bookings(v_run_id, p_scenario);
    WHEN 'hr', 'employees' THEN v_result := seed_demo_hr(v_run_id, p_scenario);
    WHEN 'contracts' THEN v_result := seed_demo_contracts(v_run_id, p_scenario);
    WHEN 'companies' THEN v_result := seed_demo_companies(v_run_id, p_scenario);
    WHEN 'deals' THEN v_result := seed_demo_deals(v_run_id, p_scenario);
    WHEN 'recruitment' THEN v_result := seed_demo_recruitment(v_run_id, p_scenario);
    WHEN 'pricelists' THEN v_result := seed_demo_pricelists(v_run_id, p_scenario);
    WHEN 'surveys' THEN v_result := seed_demo_surveys(v_run_id, p_scenario);
    WHEN 'projects' THEN v_result := seed_demo_projects(v_run_id, p_scenario);
    WHEN 'documents' THEN v_result := seed_demo_documents(v_run_id, p_scenario);
    WHEN 'inventory' THEN v_result := seed_demo_inventory(v_run_id, p_scenario);
    WHEN 'webinars' THEN v_result := seed_demo_webinars(v_run_id, p_scenario);
    WHEN 'timesheets' THEN v_result := seed_demo_timesheets(v_run_id, p_scenario);
    WHEN 'accounting' THEN v_result := seed_demo_accounting(v_run_id, p_scenario);
    WHEN 'reconciliation' THEN v_result := seed_demo_reconciliation(v_run_id, p_scenario);
    WHEN 'pos' THEN v_result := seed_demo_pos(v_run_id, p_scenario);
    WHEN 'approvals' THEN v_result := seed_demo_approvals(v_run_id, p_scenario);
    WHEN 'sla' THEN v_result := seed_demo_sla(v_run_id, p_scenario);
    ELSE
      UPDATE demo_runs SET status='failed', error='Unknown module: '||p_module, finished_at=now() WHERE id=v_run_id;
      RETURN jsonb_build_object('error', 'Unknown module: '||p_module);
  END CASE;

  UPDATE demo_runs SET status='completed', finished_at=now(), result=v_result WHERE id=v_run_id;
  RETURN jsonb_build_object('run_id', v_run_id, 'result', v_result);
END $$;
