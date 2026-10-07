-- Förskottet räknas av mot utlägget.
--
-- Den sista luckan i expenses mot Odoo: ett reseförskott. Medarbetaren får
-- pengar INNAN resan, lämnar kvitton EFTER, och skillnaden betalas ut eller
-- betalas tillbaka. Payroll har löneförskott (salary_advances: Dt 1610 / Cr
-- 1930, dras på nästa lönekörning) — men ett utläggsförskott dras inte på
-- lönen, det räknas av mot utläggsrapporten. Inget i expenses visste att
-- pengarna redan var utbetalda: rapporten bokades med hela skulden på 2890 och
-- mark_expense_report_paid betalade ut hela beloppet en gång till.
--
--   1. expense_advances: beviljat belopp (basvaluta), syfte, utbetalningssätt,
--      bokningen (Dt employee_advance / Cr bank), avräknat och återbetalt;
--      status open → closed när inget återstår. expense_advance_settlements:
--      en rad per rapport som förskottet räknades av mot, med sin verifikation.
--      Kontorollen employee_advance seedas för båda paketen (BAS 1610
--      Kortfristiga fordringar hos anställda; IFRS 1400 Other Current Assets).
--   2. manage_expense_advance(p_action …): grant / repay / list / get. Gatat på
--      expenses-modulen (service_role för agenten); medarbetaren läser sina egna.
--   3. book_expense_report räknar av öppna förskott (äldst först) mot skulden i
--      en egen avräkningsverifikation (Dt 2890 / Cr 1610) och skriver
--      expense_reports.advance_settled_cents. mark_expense_report_paid betalar
--      ut resten — och ingenting när förskottet täckte allt.

-- 1 ────────────────────────────────────────────────────────────────────────
INSERT INTO public.account_roles (locale, role, account_code, description)
VALUES ('se-bas2024',   'employee_advance', '1610', 'Kortfristiga fordringar hos anställda — utbetalda förskott'),
       ('ifrs-generic', 'employee_advance', '1400', 'Other Current Assets — advances to employees (the coarse chart has no own line)')
ON CONFLICT (locale, role) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.expense_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  purpose text,
  status text NOT NULL DEFAULT 'open',
  settled_cents bigint NOT NULL DEFAULT 0,
  repaid_cents bigint NOT NULL DEFAULT 0,
  granted_at date NOT NULL DEFAULT current_date,
  method text,
  reference text,
  journal_entry_id uuid,
  closed_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.expense_advances ADD CONSTRAINT expense_advances_status_check CHECK (status IN ('open', 'closed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expense_advances ADD CONSTRAINT expense_advances_never_over_settled
    CHECK (settled_cents >= 0 AND repaid_cents >= 0 AND settled_cents + repaid_cents <= amount_cents);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expense_advances_user_open_idx ON public.expense_advances (user_id, status, granted_at);

CREATE TABLE IF NOT EXISTS public.expense_advance_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.expense_advances(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (advance_id, report_id)
);

ALTER TABLE public.expense_reports ADD COLUMN IF NOT EXISTS advance_settled_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.expense_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_advance_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Expenses module manages advances" ON public.expense_advances;
CREATE POLICY "Expenses module manages advances" ON public.expense_advances
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'expenses')) WITH CHECK (can_access_module(auth.uid(), 'expenses'));
DROP POLICY IF EXISTS "Employees see their own advances" ON public.expense_advances;
CREATE POLICY "Employees see their own advances" ON public.expense_advances
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Expenses module manages advance settlements" ON public.expense_advance_settlements;
CREATE POLICY "Expenses module manages advance settlements" ON public.expense_advance_settlements
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'expenses')) WITH CHECK (can_access_module(auth.uid(), 'expenses'));
DROP POLICY IF EXISTS "Employees see their own advance settlements" ON public.expense_advance_settlements;
CREATE POLICY "Employees see their own advance settlements" ON public.expense_advance_settlements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expense_advances a WHERE a.id = expense_advance_settlements.advance_id AND a.user_id = auth.uid()));

-- 2 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_expense_advance(
  p_action text,
  p_advance_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_amount_cents bigint DEFAULT NULL,
  p_purpose text DEFAULT NULL,
  p_method text DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_paid_at date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_adv public.expense_advances;
  v_entry uuid;
  v_remaining bigint;
  v_amount bigint;
  v_date date;
  v_who text;
  v_out jsonb;
  v_is_staff boolean := (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'expenses'));
BEGIN
  IF p_action IN ('grant', 'repay') AND NOT v_is_staff THEN
    RAISE EXCEPTION 'Granting or repaying an expense advance requires the expenses module';
  END IF;

  IF p_action = 'grant' THEN
    IF p_user_id IS NULL THEN RAISE EXCEPTION 'grant requires p_user_id — the employee (profiles.id) who receives the money; there is no default user'; END IF;
    IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'grant requires p_amount_cents > 0 (base currency)'; END IF;
    v_date := COALESCE(p_paid_at, current_date);
    SELECT COALESCE(full_name, email) INTO v_who FROM profiles WHERE id = p_user_id;
    INSERT INTO journal_entries (entry_date, description, source, status)
    VALUES (v_date, 'Expense advance to ' || COALESCE(v_who, p_user_id::text) || COALESCE(' — ' || p_purpose, ''), 'expense_advance', 'posted')
    RETURNING id INTO v_entry;
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry, public.account_for('employee_advance'), p_amount_cents, 0, 'Expense advance paid out'),
           (v_entry, public.account_for('bank'), 0, p_amount_cents, 'Expense advance paid out');
    INSERT INTO expense_advances (user_id, amount_cents, currency, purpose, granted_at, method, reference, journal_entry_id, notes, created_by)
    VALUES (p_user_id, p_amount_cents, public.platform_default_currency(), p_purpose, v_date, p_method, p_reference, v_entry, p_notes, auth.uid())
    RETURNING * INTO v_adv;
    RETURN jsonb_build_object('success', true, 'advance_id', v_adv.id, 'status', v_adv.status, 'amount_cents', v_adv.amount_cents,
                              'remaining_cents', v_adv.amount_cents, 'journal_entry_id', v_entry, 'currency', v_adv.currency);

  ELSIF p_action = 'repay' THEN
    IF p_advance_id IS NULL THEN RAISE EXCEPTION 'repay requires p_advance_id'; END IF;
    SELECT * INTO v_adv FROM expense_advances WHERE id = p_advance_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'advance_not_found'; END IF;
    v_remaining := v_adv.amount_cents - v_adv.settled_cents - v_adv.repaid_cents;
    IF v_remaining <= 0 THEN RAISE EXCEPTION 'Advance % is already closed — nothing left to repay', p_advance_id; END IF;
    v_amount := COALESCE(p_amount_cents, v_remaining);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'repay requires p_amount_cents > 0'; END IF;
    IF v_amount > v_remaining THEN
      RAISE EXCEPTION 'Repayment % exceeds what remains of the advance (% of % — % settled against reports, % repaid)',
        v_amount, v_remaining, v_adv.amount_cents, v_adv.settled_cents, v_adv.repaid_cents;
    END IF;
    v_date := COALESCE(p_paid_at, current_date);
    INSERT INTO journal_entries (entry_date, description, source, status)
    VALUES (v_date, 'Expense advance repaid ' || p_advance_id::text, 'expense_advance', 'posted')
    RETURNING id INTO v_entry;
    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_entry, public.account_for('bank'), v_amount, 0, 'Expense advance repaid'),
           (v_entry, public.account_for('employee_advance'), 0, v_amount, 'Expense advance repaid');
    UPDATE expense_advances
       SET repaid_cents = repaid_cents + v_amount,
           status = CASE WHEN amount_cents - settled_cents - repaid_cents - v_amount <= 0 THEN 'closed' ELSE 'open' END,
           closed_at = CASE WHEN amount_cents - settled_cents - repaid_cents - v_amount <= 0 THEN now() ELSE closed_at END,
           notes = COALESCE(p_notes, notes), updated_at = now()
     WHERE id = p_advance_id RETURNING * INTO v_adv;
    RETURN jsonb_build_object('success', true, 'advance_id', v_adv.id, 'status', v_adv.status, 'repaid_cents', v_amount,
                              'remaining_cents', v_adv.amount_cents - v_adv.settled_cents - v_adv.repaid_cents, 'journal_entry_id', v_entry);

  ELSIF p_action = 'get' THEN
    IF p_advance_id IS NULL THEN RAISE EXCEPTION 'get requires p_advance_id'; END IF;
    SELECT * INTO v_adv FROM expense_advances WHERE id = p_advance_id AND (v_is_staff OR user_id = auth.uid());
    IF NOT FOUND THEN RAISE EXCEPTION 'advance_not_found'; END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(s) || jsonb_build_object('period', r.period) ORDER BY s.created_at), '[]'::jsonb) INTO v_out
      FROM expense_advance_settlements s JOIN expense_reports r ON r.id = s.report_id WHERE s.advance_id = p_advance_id;
    RETURN jsonb_build_object('advance', to_jsonb(v_adv) || jsonb_build_object('remaining_cents', v_adv.amount_cents - v_adv.settled_cents - v_adv.repaid_cents),
                              'settlements', v_out);

  ELSIF p_action = 'list' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(a) || jsonb_build_object('remaining_cents', a.amount_cents - a.settled_cents - a.repaid_cents,
                                                                 'employee_name', (SELECT COALESCE(full_name, email) FROM profiles p WHERE p.id = a.user_id))
                              ORDER BY a.status, a.granted_at DESC, a.created_at DESC), '[]'::jsonb) INTO v_out
      FROM (SELECT * FROM expense_advances
             WHERE (v_is_staff OR user_id = auth.uid())
               AND (p_user_id IS NULL OR user_id = p_user_id)
               AND (p_status IS NULL OR status = p_status)
             ORDER BY status, granted_at DESC, created_at DESC
             LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) a;
    RETURN jsonb_build_object('advances', v_out,
                              'open_cents', (SELECT COALESCE(SUM(amount_cents - settled_cents - repaid_cents), 0) FROM expense_advances
                                              WHERE status = 'open' AND (v_is_staff OR user_id = auth.uid()) AND (p_user_id IS NULL OR user_id = p_user_id)));

  ELSE
    RAISE EXCEPTION 'Unknown action: % (grant, repay, get, list)', p_action;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.manage_expense_advance(text, uuid, uuid, bigint, text, text, text, date, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_expense_advance(text, uuid, uuid, bigint, text, text, text, date, text, text, integer) TO authenticated, service_role;

-- 3 ────────────────────────────────────────────────────────────────────────

-- ── book_expense_report: the advance is settled against the liability ──
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
  v_adv record;
  v_apply bigint;
  v_settled bigint := 0;
  v_settle_entry uuid;
  v_receivable text;
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

  -- FX: a foreign receipt is booked in the base currency. A rate added since the receipt
  -- was filed is picked up here; a rate still missing stops the booking — 100 EUR must
  -- never land in the ledger as 100 kr.
  UPDATE public.expenses SET currency = currency WHERE report_id = p_report_id AND fx_rate_source = 'missing';
  IF EXISTS (SELECT 1 FROM public.expenses WHERE report_id = p_report_id AND fx_rate_source = 'missing') THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('No exchange rate for %s — set one (set_exchange_rate) or enter exchange_rate on the expense',
             (SELECT string_agg(DISTINCT currency || ' on ' || expense_date::text, ', ')
                FROM public.expenses WHERE report_id = p_report_id AND fx_rate_source = 'missing')));
  END IF;

  SELECT COALESCE(SUM(COALESCE(base_amount_cents, amount_cents)),0), COALESCE(SUM(COALESCE(base_vat_cents, vat_cents)),0)
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
           SUM(COALESCE(base_amount_cents, amount_cents) - COALESCE(base_vat_cents, vat_cents, 0)) AS net_cents
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
           SUM(COALESCE(base_amount_cents, amount_cents) - COALESCE(base_vat_cents, vat_cents, 0)) AS net_cents
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

  -- Advances: money the employee already holds is settled against what the report
  -- now owes them — oldest advance first, one settlement entry (Dt liability /
  -- Cr employee receivable), never more than the liability. What remains of the
  -- liability is what mark_expense_report_paid pays out; what remains of an
  -- advance stays open for the next report or a repayment.
  FOR v_adv IN
    SELECT * FROM public.expense_advances
     WHERE user_id = v_report.user_id AND status = 'open'
     ORDER BY granted_at, created_at
     FOR UPDATE
  LOOP
    v_apply := LEAST(v_adv.amount_cents - v_adv.settled_cents - v_adv.repaid_cents, v_total_cents - v_settled);
    EXIT WHEN v_apply <= 0;
    IF v_settle_entry IS NULL THEN
      v_receivable := public.account_for('employee_advance');
      INSERT INTO public.journal_entries (entry_date, description, source, status)
      VALUES (v_date, 'Expense advance settled against report ' || p_report_id::text, 'expense_advance', 'posted')
      RETURNING id INTO v_settle_entry;
    END IF;
    INSERT INTO public.journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES (v_settle_entry, p_liability_account, v_apply, 0, 'Advance applied to expense report'),
           (v_settle_entry, v_receivable, 0, v_apply, 'Expense advance settled');
    INSERT INTO public.expense_advance_settlements (advance_id, report_id, amount_cents, journal_entry_id)
    VALUES (v_adv.id, p_report_id, v_apply, v_settle_entry);
    UPDATE public.expense_advances
       SET settled_cents = settled_cents + v_apply,
           status = CASE WHEN amount_cents - settled_cents - v_apply - repaid_cents <= 0 THEN 'closed' ELSE 'open' END,
           closed_at = CASE WHEN amount_cents - settled_cents - v_apply - repaid_cents <= 0 THEN now() ELSE closed_at END,
           updated_at = now()
     WHERE id = v_adv.id;
    v_settled := v_settled + v_apply;
  END LOOP;

  UPDATE public.expense_reports
  SET status = 'booked', journal_entry_id = v_entry_id, advance_settled_cents = v_settled
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
    'receipts_attached', v_receipts,
    'advance_settled_cents', v_settled,
    'to_pay_cents', v_total_cents - v_settled,
    'settlement_entry_id', v_settle_entry
  );
END;
$function$;

-- ── mark_expense_report_paid: pays what the advance did not cover ──
CREATE OR REPLACE FUNCTION public.mark_expense_report_paid(p_report_id uuid, p_method text DEFAULT 'manual'::text, p_reference text DEFAULT NULL::text, p_paid_at date DEFAULT NULL::date, p_bank_account text DEFAULT NULL::text, p_liability_account text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_total_cents bigint;
  v_entry_id uuid;
  v_payment_id uuid;
  v_date date;
BEGIN
  -- staff-guard 20260917090000
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'expenses')) THEN
    RAISE EXCEPTION 'Paying an expense report requires the expenses module' USING ERRCODE = '42501';
  END IF;
  p_bank_account := COALESCE(p_bank_account, public.account_for('bank'));
  p_liability_account := COALESCE(p_liability_account, public.account_for('employee_liability'));
  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;
  IF v_report.status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only booked reports can be marked paid');
  END IF;

  SELECT COALESCE(SUM(COALESCE(base_amount_cents, amount_cents)),0) INTO v_total_cents
  FROM expenses WHERE report_id = p_report_id;
  -- An advance settled at booking already cleared part of the liability: the payout is the rest.
  v_total_cents := GREATEST(v_total_cents - COALESCE(v_report.advance_settled_cents, 0), 0);

  v_date := COALESCE(p_paid_at, CURRENT_DATE);

  IF v_total_cents > 0 THEN
    INSERT INTO journal_entries (entry_date, description, source, status)
    VALUES (v_date, 'Payment of expense report ' || p_report_id::text, 'expense_payment', 'posted')
    RETURNING id INTO v_entry_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
    VALUES
      (v_entry_id, p_liability_account, v_total_cents, 0, 'Settle liability'),
      (v_entry_id, p_bank_account, 0, v_total_cents, 'Bank payment');
  END IF;

  INSERT INTO expense_payments (report_id, user_id, amount_cents, method, reference, paid_at, journal_entry_id, notes, recorded_by)
  VALUES (p_report_id, v_report.user_id, v_total_cents, p_method::text, p_reference, v_date, v_entry_id, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  UPDATE expense_reports
  SET status = 'paid'
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'payment_id', v_payment_id, 'journal_entry_id', v_entry_id,
                            'paid_cents', v_total_cents, 'advance_settled_cents', COALESCE(v_report.advance_settled_cents, 0));
END;
$function$;
