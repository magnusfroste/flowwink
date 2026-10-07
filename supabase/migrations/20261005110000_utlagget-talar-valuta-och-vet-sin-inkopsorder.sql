-- Utlägget talar valuta — och vet vilken inköpsorder det betalar.
--
-- Två luckor i expenses mot Odoo (hr.expense), båda med samma rot: utlägget
-- bar en valuta och en exchange_rate-kolumn (default 1) som ingenting satte,
-- och book_expense_report summerade amount_cents rakt in i huvudboken. Ett
-- kvitto på 100 EUR bokfördes som 100 kr. Och ett utlägg som betalade en
-- inköpsorder (medarbetaren tog kortet) hade ingen koppling till ordern, så
-- leverantörsfakturan på samma leverans matchade "0 % avvikelse" en gång till —
-- samma klass av fynd som Nordbrygg 2026-08-23, nu via utläggsdörren.
--
--   1. FX. expenses får base_currency / base_amount_cents / base_vat_cents /
--      fx_rate_source. En BEFORE-trigger räknar om vid insert och vid ändring
--      av belopp, valuta, datum eller kurs: basvalutan är plattformens
--      (platform_default_currency), kursen tas från exchange_rates på kvittots
--      datum (direkt eller inverterad). Ingen kurs → fx_rate_source = 'missing'
--      och basbeloppen NULL — aldrig tyst 1:1. En kurs satt av anroparen
--      (exchange_rate ≠ 1) är 'manual' och vinner. Rapportens total, bokningen
--      och utbetalningen läser basbeloppen; bokningen vägrar medan en kurs saknas
--      och plockar upp en kurs som satts efter kvittot.
--   2. PO-matchning. expenses.purchase_order_id + po_match_status / po_variance_cents.
--      Anspråket på en inköpsorder är EN läsare: po_invoiced_value_cents (det
--      matchningen, betalningsgrinden och UI:t redan läser) räknar nu även
--      matchade utlägg (netto, basvaluta), precis som 2026-08-27-migrationen
--      förutsåg — kreditnotorna (20260920010000) följer med. match_expense_to_po(p_expense_id, p_purchase_order_id) kopplar
--      utlägget, vägrar en order i utkast och ett anspråk över det som återstår
--      (utanför toleransen) utan p_force; en trigger håller statusen aktuell
--      när beloppet ändras. Gatat på expenses-modulen eller utläggets ägare.

-- 1 ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS base_currency text,
  ADD COLUMN IF NOT EXISTS base_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS base_vat_cents bigint,
  ADD COLUMN IF NOT EXISTS fx_rate_source text NOT NULL DEFAULT 'same_currency',
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS po_match_status text,
  ADD COLUMN IF NOT EXISTS po_variance_cents bigint,
  ADD COLUMN IF NOT EXISTS po_match_notes text;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_fx_rate_source_check
    CHECK (fx_rate_source IN ('same_currency', 'rate_table', 'manual', 'missing'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.expenses ADD CONSTRAINT expenses_po_match_status_check
    CHECK (po_match_status IS NULL OR po_match_status IN ('matched', 'variance', 'over_claimed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS expenses_purchase_order_idx ON public.expenses (purchase_order_id) WHERE purchase_order_id IS NOT NULL;

-- The strict lookup: NULL when no rate exists. get_exchange_rate answers 1 for a
-- missing pair, which is right for a revaluation fallback and wrong for a receipt.
CREATE OR REPLACE FUNCTION public.exchange_rate_or_null(p_base text, p_quote text, p_date date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN upper(p_base) = upper(p_quote) THEN 1::numeric ELSE COALESCE(
    (SELECT rate FROM exchange_rates WHERE base_currency = upper(p_base) AND quote_currency = upper(p_quote) AND rate_date <= p_date ORDER BY rate_date DESC LIMIT 1),
    (SELECT 1.0 / rate FROM exchange_rates WHERE base_currency = upper(p_quote) AND quote_currency = upper(p_base) AND rate_date <= p_date ORDER BY rate_date DESC LIMIT 1)
  ) END;
$$;
REVOKE ALL ON FUNCTION public.exchange_rate_or_null(text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exchange_rate_or_null(text, text, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expense_fx_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_base text := public.platform_default_currency();
  v_cur text := COALESCE(NULLIF(upper(NEW.currency), ''), v_base);
  v_rate numeric;
BEGIN
  NEW.currency := v_cur;
  NEW.base_currency := v_base;
  IF v_cur = v_base THEN
    NEW.exchange_rate := 1;
    NEW.fx_rate_source := 'same_currency';
  ELSIF COALESCE(NEW.exchange_rate, 1) <> 1
        AND (TG_OP = 'INSERT' OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate) THEN
    -- the caller set a rate: it wins, and stays until they change it
    NEW.fx_rate_source := 'manual';
  ELSIF TG_OP = 'UPDATE' AND OLD.fx_rate_source = 'manual' AND NEW.currency = OLD.currency AND NEW.exchange_rate = OLD.exchange_rate THEN
    NEW.fx_rate_source := 'manual';
  ELSE
    v_rate := public.exchange_rate_or_null(v_cur, v_base, NEW.expense_date);
    IF v_rate IS NULL THEN
      NEW.exchange_rate := 1;
      NEW.fx_rate_source := 'missing';
    ELSE
      NEW.exchange_rate := v_rate;
      NEW.fx_rate_source := 'rate_table';
    END IF;
  END IF;
  IF NEW.fx_rate_source = 'missing' THEN
    NEW.base_amount_cents := NULL;
    NEW.base_vat_cents := NULL;
  ELSE
    NEW.base_amount_cents := round(COALESCE(NEW.amount_cents, 0) * NEW.exchange_rate)::bigint;
    NEW.base_vat_cents := round(COALESCE(NEW.vat_cents, 0) * NEW.exchange_rate)::bigint;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.expense_fx_trg() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_fx_trg() TO service_role;
DROP TRIGGER IF EXISTS aa_expense_fx_trg ON public.expenses;
CREATE TRIGGER aa_expense_fx_trg
  BEFORE INSERT OR UPDATE OF amount_cents, vat_cents, currency, expense_date, exchange_rate ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_fx_trg();

-- 2 ────────────────────────────────────────────────────────────────────────
-- What is already claimed on a purchase order: vendor invoices (net, minus applied
-- credits — 20260920010000) AND the expenses matched to it (net, base currency).
-- The reader every consumer already has keeps its name and signature; its body now
-- counts the expense door too (the 2026-08-27 migration said: "byter kropp och
-- inget annat behöver röras"). Derived, never stored.
CREATE OR REPLACE FUNCTION public.po_invoiced_value_cents(p_purchase_order_id uuid, p_exclude_invoice_id uuid DEFAULT NULL::uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT (SELECT COALESCE(SUM(vi.subtotal_cents - public.vendor_invoice_credited_net_cents(vi.id)), 0)::bigint
            FROM public.vendor_invoices vi
           WHERE vi.purchase_order_id = p_purchase_order_id
             AND (p_exclude_invoice_id IS NULL OR vi.id <> p_exclude_invoice_id)
             AND vi.status NOT IN ('rejected', 'cancelled'))
       + (SELECT COALESCE(SUM(COALESCE(e.base_amount_cents, e.amount_cents) - COALESCE(e.base_vat_cents, e.vat_cents, 0)), 0)::bigint
            FROM public.expenses e
           WHERE e.purchase_order_id = p_purchase_order_id
             AND e.status <> 'rejected');
$function$;
REVOKE ALL ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.po_invoiced_value_cents(uuid, uuid) IS
  'Redan anspråkat värde på en inköpsorder: leverantörsfakturor (netto minus tillämpade krediter) + matchade utlägg (netto, basvaluta). Härlett, inte lagrat. Exkludera fakturan som matchas för att få vad ÖVRIGA redan tagit.';

-- The evaluation: baseline is the order's net subtotal; remaining is what the other
-- claims left; the expense's own net (base currency) is measured against it.
CREATE OR REPLACE FUNCTION public.expense_po_match_eval(p_purchase_order_id uuid, p_expense_net_cents bigint, p_exclude_expense_id uuid DEFAULT NULL, p_tolerance_pct numeric DEFAULT 2.0)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_po public.purchase_orders;
  v_claimed bigint;
  v_remaining bigint;
  v_over bigint;
  v_status text;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_order_not_found'; END IF;
  v_claimed := public.po_invoiced_value_cents(p_purchase_order_id)
             - COALESCE((SELECT COALESCE(e.base_amount_cents, e.amount_cents) - COALESCE(e.base_vat_cents, e.vat_cents, 0)
                           FROM expenses e WHERE e.id = p_exclude_expense_id AND e.purchase_order_id = p_purchase_order_id AND e.status <> 'rejected'), 0);
  v_remaining := GREATEST(v_po.subtotal_cents::bigint - v_claimed, 0);
  v_over := GREATEST(p_expense_net_cents - v_remaining, 0);
  v_status := CASE
    WHEN v_over = 0 THEN 'matched'
    WHEN v_po.subtotal_cents > 0 AND v_over::numeric * 100 / v_po.subtotal_cents <= COALESCE(p_tolerance_pct, 2.0) THEN 'variance'
    ELSE 'over_claimed' END;
  RETURN jsonb_build_object(
    'po_number', v_po.po_number, 'po_status', v_po.status, 'po_currency', v_po.currency,
    'baseline_cents', v_po.subtotal_cents, 'claimed_by_others_cents', v_claimed,
    'remaining_cents', v_remaining, 'expense_net_cents', p_expense_net_cents,
    'over_by_cents', v_over, 'tolerance_pct', COALESCE(p_tolerance_pct, 2.0), 'status', v_status,
    'notes', CASE v_status
      WHEN 'matched' THEN format('%s of %s remaining on %s claimed (%s already claimed by invoices and expenses)', p_expense_net_cents, v_remaining, v_po.po_number, v_claimed)
      WHEN 'variance' THEN format('%s over what remains on %s, within %s %% tolerance', v_over, v_po.po_number, round(COALESCE(p_tolerance_pct, 2.0), 2))
      ELSE format('%s over what remains on %s (%s remaining of %s, %s already claimed)', v_over, v_po.po_number, v_remaining, v_po.subtotal_cents, v_claimed) END);
END $$;
REVOKE ALL ON FUNCTION public.expense_po_match_eval(uuid, bigint, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_po_match_eval(uuid, bigint, uuid, numeric) TO authenticated, service_role;

-- The status follows the row: fires after the FX trigger (alphabetical), so the net
-- it measures is in the base currency.
CREATE OR REPLACE FUNCTION public.expense_po_match_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_eval jsonb;
BEGIN
  IF NEW.purchase_order_id IS NULL THEN
    NEW.po_match_status := NULL; NEW.po_variance_cents := NULL; NEW.po_match_notes := NULL;
    RETURN NEW;
  END IF;
  v_eval := public.expense_po_match_eval(NEW.purchase_order_id,
              COALESCE(NEW.base_amount_cents, NEW.amount_cents) - COALESCE(NEW.base_vat_cents, NEW.vat_cents, 0), NEW.id);
  NEW.po_match_status := v_eval->>'status';
  NEW.po_variance_cents := (v_eval->>'over_by_cents')::bigint;
  NEW.po_match_notes := v_eval->>'notes';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.expense_po_match_trg() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_po_match_trg() TO service_role;
DROP TRIGGER IF EXISTS ab_expense_po_match_trg ON public.expenses;
CREATE TRIGGER ab_expense_po_match_trg
  BEFORE INSERT OR UPDATE OF purchase_order_id, amount_cents, vat_cents, currency, exchange_rate ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_po_match_trg();

CREATE OR REPLACE FUNCTION public.match_expense_to_po(p_expense_id uuid, p_purchase_order_id uuid DEFAULT NULL, p_tolerance_pct numeric DEFAULT 2.0, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_exp public.expenses;
  v_po public.purchase_orders;
  v_eval jsonb;
BEGIN
  SELECT * INTO v_exp FROM expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(), 'expenses') OR v_exp.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the expense owner or someone granted the expenses module can match expense %', p_expense_id;
  END IF;
  IF v_exp.status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Only a draft or submitted expense can be matched to a purchase order (it is %)', v_exp.status;
  END IF;

  IF p_purchase_order_id IS NULL THEN
    UPDATE expenses SET purchase_order_id = NULL, updated_at = now() WHERE id = p_expense_id;
    RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id, 'purchase_order_id', NULL, 'unlinked', v_exp.purchase_order_id IS NOT NULL);
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_order_not_found'; END IF;
  IF v_po.status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Purchase order % is % — an expense can only pay for an order that was sent or confirmed', v_po.po_number, v_po.status;
  END IF;
  IF v_exp.fx_rate_source = 'missing' THEN
    RAISE EXCEPTION 'No exchange rate for % on %: set one before matching, so the claim is measured in %', v_exp.currency, v_exp.expense_date, v_exp.base_currency;
  END IF;

  v_eval := public.expense_po_match_eval(p_purchase_order_id,
              COALESCE(v_exp.base_amount_cents, v_exp.amount_cents) - COALESCE(v_exp.base_vat_cents, v_exp.vat_cents, 0), p_expense_id, p_tolerance_pct);
  IF v_eval->>'status' = 'over_claimed' AND NOT COALESCE(p_force, false) THEN
    RAISE EXCEPTION 'Expense net % exceeds what remains on %: % remaining of %, % already claimed by vendor invoices and expenses — unlink the other claim, or p_force to record it as over-claimed',
      v_eval->>'expense_net_cents', v_po.po_number, v_eval->>'remaining_cents', v_eval->>'baseline_cents', v_eval->>'claimed_by_others_cents';
  END IF;

  UPDATE expenses
     SET purchase_order_id = p_purchase_order_id,
         vendor = COALESCE(NULLIF(vendor, ''), (SELECT name FROM vendors WHERE id = v_po.vendor_id)),
         updated_at = now()
   WHERE id = p_expense_id
   RETURNING * INTO v_exp;
  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id, 'purchase_order_id', p_purchase_order_id,
                            'po_number', v_po.po_number, 'match_status', v_exp.po_match_status,
                            'variance_cents', v_exp.po_variance_cents, 'forced', (v_eval->>'status') = 'over_claimed', 'match', v_eval);
END $$;
REVOKE ALL ON FUNCTION public.match_expense_to_po(uuid, uuid, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_expense_to_po(uuid, uuid, numeric, boolean) TO authenticated, service_role;

-- Existing rows get their base amounts (the trigger fires on UPDATE OF currency).
UPDATE public.expenses SET currency = currency WHERE base_currency IS NULL;

-- ── book_expense_report: sums in the base currency, refuses a missing rate ──
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
-- ── submit_expense_report: the report total is in the base currency ──
CREATE OR REPLACE FUNCTION public.submit_expense_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report record;
  v_total bigint;
  v_lines integer;
BEGIN
  SELECT * INTO v_report FROM expense_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Report not found');
  END IF;

  -- Own report, or admin, or an agent running under the service key.
  IF NOT (
    auth.role() = 'service_role'
    OR v_report.user_id = auth.uid()
    OR can_access_module(auth.uid(),'expenses')
  ) THEN
    RAISE EXCEPTION 'Only the report owner or someone granted the expenses module can submit expense report %', p_report_id;
  END IF;

  IF v_report.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only draft reports can be submitted');
  END IF;

  UPDATE expenses
     SET status = 'submitted', updated_at = now()
   WHERE report_id = p_report_id AND status = 'draft';

  SELECT COUNT(*), COALESCE(SUM(COALESCE(base_amount_cents, amount_cents)), 0) INTO v_lines, v_total
    FROM expenses WHERE report_id = p_report_id;

  UPDATE expense_reports
     SET status = 'submitted',
         submitted_at = now(),
         total_cents = v_total,
         updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', 'submitted',
    'expense_count', v_lines, 'total_cents', v_total);
END;
$function$;
-- ── mark_expense_report_paid: the payout is in the base currency ──
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

  v_date := COALESCE(p_paid_at, CURRENT_DATE);

  INSERT INTO journal_entries (entry_date, description, source, status)
  VALUES (v_date, 'Payment of expense report ' || p_report_id::text, 'expense_payment', 'posted')
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit_cents, credit_cents, description)
  VALUES
    (v_entry_id, p_liability_account, v_total_cents, 0, 'Settle liability'),
    (v_entry_id, p_bank_account, 0, v_total_cents, 'Bank payment');

  INSERT INTO expense_payments (report_id, user_id, amount_cents, method, reference, paid_at, journal_entry_id, notes, recorded_by)
  VALUES (p_report_id, v_report.user_id, v_total_cents, p_method::text, p_reference, v_date, v_entry_id, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  UPDATE expense_reports
  SET status = 'paid'
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'payment_id', v_payment_id, 'journal_entry_id', v_entry_id);
END;
$function$;
