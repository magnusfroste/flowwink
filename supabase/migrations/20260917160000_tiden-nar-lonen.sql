-- Tiden når lönen.
--
-- Processtestet 2026-09-17 loggade tid åt en anställd och körde en lönekörning:
--
--   log_time skrev user_id men aldrig employee_id; log_indirect_time det
--   omvända. payroll_timesheet_basis och apply_timesheet_overtime joinar
--   ENBART på employee_id — så 4 godkända övertidstimmar blev 0 kr och
--   utnyttjanderapporten visade samma person som två rader. Samma rad, två
--   nycklar, ingen som knöt dem.
--
--   lock_timesheet_period skrev timesheet_period_locks — och ingenting läste
--   tabellen. Vakttriggern på time_entries läser bara accounting_periods. Ett
--   låst lönemånad tog emot nya rader och raderingar utan ett ord.
--
--   apply_timesheet_overtime räknade om nettot som brutto − skatt − pension,
--   och glömde skattekorrigering, förmåner, avdrag, förskott och landets
--   arbetsgivaravgift. En andra körning raderade en registrerad
--   skattekorrigering ur nettot medan lönebeskedet fortfarande visade den.
--
-- Fix: en trigger som fyller den saknade nyckeln ur employees (gäller varje
-- skrivare, UI som agent), backfyllning, vakten läser låset, och övertiden
-- räknar nettot som apply_sick_pay redan gör.
--
-- Idempotent: CREATE OR REPLACE, DROP/CREATE TRIGGER, backfyllning som no-op:ar.

-- ── 1. Båda nycklarna på varje tidrad ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.time_entries_link_both_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.employee_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.employee_id FROM public.employees WHERE user_id = NEW.user_id ORDER BY created_at LIMIT 1;
  ELSIF NEW.user_id IS NULL AND NEW.employee_id IS NOT NULL THEN
    SELECT user_id INTO NEW.user_id FROM public.employees WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_time_entries_link_both_ids ON public.time_entries;
CREATE TRIGGER trg_time_entries_link_both_ids
  BEFORE INSERT OR UPDATE OF user_id, employee_id ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_link_both_ids();

-- The owner check runs after the link, so a row that only named an employee
-- with no login still passes as before.
DROP TRIGGER IF EXISTS check_time_entry_owner ON public.time_entries;
CREATE TRIGGER check_time_entry_owner
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.validate_time_entry_owner();

-- Backfill: rows already written with one key. The period guard would refuse
-- rows in closed months, so the guard is bypassed for this one-off — nothing
-- about the entry changes but the link.
DO $bf$
BEGIN
  ALTER TABLE public.time_entries DISABLE TRIGGER trg_guard_time_entries_period;
  UPDATE public.time_entries te SET employee_id = e.id
    FROM public.employees e
   WHERE te.employee_id IS NULL AND te.user_id IS NOT NULL AND e.user_id = te.user_id;
  UPDATE public.time_entries te SET user_id = e.user_id
    FROM public.employees e
   WHERE te.user_id IS NULL AND te.employee_id IS NOT NULL AND e.id = te.employee_id AND e.user_id IS NOT NULL;
  ALTER TABLE public.time_entries ENABLE TRIGGER trg_guard_time_entries_period;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.time_entries ENABLE TRIGGER trg_guard_time_entries_period;
  RAISE;
END $bf$;

-- ── 2. Låset låser ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_timesheet_period_locked(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  -- Plain SQL: only called from the SECURITY DEFINER guard trigger.
  SELECT EXISTS (
    SELECT 1 FROM public.timesheet_period_locks
     WHERE fiscal_year = EXTRACT(YEAR FROM p_date)::integer
       AND period_month = EXTRACT(MONTH FROM p_date)::integer
  );
$fn$;

CREATE OR REPLACE FUNCTION public.guard_time_entries_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check_date DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_check_date := OLD.entry_date;
  ELSE
    v_check_date := NEW.entry_date;
    IF TG_OP = 'UPDATE' AND OLD.entry_date IS NOT NULL THEN
      IF public.is_period_closed(OLD.entry_date) THEN
        RAISE EXCEPTION 'Cannot modify time entry: period %-% is closed (original date %)',
          EXTRACT(YEAR FROM OLD.entry_date)::INTEGER, EXTRACT(MONTH FROM OLD.entry_date)::INTEGER, OLD.entry_date
          USING ERRCODE = 'check_violation';
      END IF;
      IF public.is_timesheet_period_locked(OLD.entry_date) THEN
        RAISE EXCEPTION 'Cannot modify time entry: timesheet period %-% is locked (original date %) — reopen it before correcting',
          EXTRACT(YEAR FROM OLD.entry_date)::INTEGER, EXTRACT(MONTH FROM OLD.entry_date)::INTEGER, OLD.entry_date
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF v_check_date IS NOT NULL THEN
    IF public.is_period_closed(v_check_date) THEN
      RAISE EXCEPTION 'Cannot % time entry: period %-% is closed (entry_date %)',
        LOWER(TG_OP), EXTRACT(YEAR FROM v_check_date)::INTEGER, EXTRACT(MONTH FROM v_check_date)::INTEGER, v_check_date
        USING ERRCODE = 'check_violation';
    END IF;
    IF public.is_timesheet_period_locked(v_check_date) THEN
      RAISE EXCEPTION 'Cannot % time entry: timesheet period %-% is locked (entry_date %) — the month has gone to payroll',
        LOWER(TG_OP), EXTRACT(YEAR FROM v_check_date)::INTEGER, EXTRACT(MONTH FROM v_check_date)::INTEGER, v_check_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- ── 3. Övertiden räknar samma netto som resten av lönen ─────────────────────
CREATE OR REPLACE FUNCTION public.apply_timesheet_overtime(p_run_id uuid, p_employee_id uuid DEFAULT NULL::uuid, p_multiplier numeric DEFAULT 1.5, p_work_days_per_month integer DEFAULT 21, p_hours_per_day numeric DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_period date; v_start date; v_end date;
  v_line public.payroll_lines%ROWTYPE;
  v_monthly bigint; v_tax_pct numeric; v_social_pct numeric; v_hourly numeric;
  v_ot_hours numeric; v_ot_pay bigint;
  v_base_gross bigint; v_base_taxable bigint;
  v_gross bigint; v_taxable bigint; v_tax bigint; v_social bigint; v_net bigint;
  v_results jsonb := '[]'::jsonb; v_applied int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only admins can apply overtime pay';
  END IF;
  IF COALESCE(p_multiplier, 0) <= 0 THEN RAISE EXCEPTION 'multiplier must be > 0'; END IF;

  SELECT status, period_date INTO v_status, v_period FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run % not found', p_run_id; END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Run % is % — overtime can only be applied to a draft', p_run_id, v_status;
  END IF;
  v_start := date_trunc('month', v_period)::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  FOR v_line IN
    SELECT * FROM payroll_lines
    WHERE run_id = p_run_id AND (p_employee_id IS NULL OR employee_id = p_employee_id)
    FOR UPDATE
  LOOP
    -- Either key names the person; the link trigger keeps both filled from now on.
    SELECT COALESCE(SUM(te.overtime_hours), 0) INTO v_ot_hours
      FROM time_entries te
      LEFT JOIN employees e ON e.id = v_line.employee_id
     WHERE (te.employee_id = v_line.employee_id OR (e.user_id IS NOT NULL AND te.user_id = e.user_id))
       AND te.entry_date BETWEEN v_start AND v_end
       AND te.approval_status <> 'rejected';

    SELECT COALESCE(e.monthly_salary_cents, 0), COALESCE(e.tax_rate_pct, 30.00), COALESCE(p.employer_social_pct, 31.42)
      INTO v_monthly, v_tax_pct, v_social_pct
      FROM employees e
      LEFT JOIN payroll_country_profiles p ON p.country_code = COALESCE(e.payroll_country, 'SE')
     WHERE e.id = v_line.employee_id;

    v_hourly := v_monthly::numeric / (p_work_days_per_month * p_hours_per_day);
    v_ot_pay := ROUND(v_ot_hours * v_hourly * p_multiplier)::bigint;

    v_base_gross   := v_line.gross_cents   - v_line.overtime_pay_cents;
    v_base_taxable := v_line.taxable_cents - v_line.overtime_pay_cents;

    v_gross   := v_base_gross   + v_ot_pay;
    v_taxable := v_base_taxable + v_ot_pay;
    v_tax     := ROUND(v_taxable * v_tax_pct / 100.0)::bigint + COALESCE(v_line.tax_correction_cents, 0);
    v_social  := ROUND(v_taxable * v_social_pct / 100.0)::bigint;
    -- The same net as apply_sick_pay: benefits raise the tax base only.
    v_net     := v_taxable - COALESCE(v_line.benefits_cents, 0) - v_tax
                 - COALESCE(v_line.pension_employee_cents, 0) - COALESCE(v_line.advance_deduction_cents, 0);

    UPDATE payroll_lines SET
      gross_cents = v_gross, taxable_cents = v_taxable, tax_cents = v_tax,
      social_fee_cents = v_social, net_cents = v_net,
      overtime_hours = v_ot_hours, overtime_pay_cents = v_ot_pay
    WHERE id = v_line.id;

    IF v_ot_pay > 0 OR v_line.overtime_pay_cents > 0 THEN v_applied := v_applied + 1; END IF;
    v_results := v_results || jsonb_build_object(
      'employee_id', v_line.employee_id, 'overtime_hours', v_ot_hours,
      'overtime_pay_cents', v_ot_pay, 'new_gross_cents', v_gross, 'new_net_cents', v_net);
  END LOOP;

  UPDATE payroll_runs SET
    total_gross_cents      = (SELECT COALESCE(SUM(gross_cents),0)      FROM payroll_lines WHERE run_id = p_run_id),
    total_tax_cents        = (SELECT COALESCE(SUM(tax_cents),0)        FROM payroll_lines WHERE run_id = p_run_id),
    total_social_fee_cents = (SELECT COALESCE(SUM(social_fee_cents),0) FROM payroll_lines WHERE run_id = p_run_id),
    total_net_cents        = (SELECT COALESCE(SUM(net_cents),0)        FROM payroll_lines WHERE run_id = p_run_id)
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true, 'run_id', p_run_id, 'period', to_char(v_start, 'YYYY-MM'),
    'multiplier', p_multiplier, 'lines_adjusted', v_applied, 'lines', v_results,
    'note', 'Overtime hours come from time_entries.overtime_hours — run apply_overtime_rules for the month first.');
END; $function$;

-- ── Bevisar sig själv (rullas alltid tillbaka) ──────────────────────────────
DO $proof$
DECLARE v_uid uuid; v_emp uuid; v_proj uuid; v_te uuid; v_got uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    -- employees.user_id references auth.users, so the link is proven with a
    -- login that already exists; a virgin instance has none and proves the lock only.
    SELECT id INTO v_uid FROM auth.users WHERE id NOT IN (SELECT user_id FROM public.employees WHERE user_id IS NOT NULL) LIMIT 1;
    INSERT INTO public.employees (name, email, status, user_id) VALUES ('proof', 'proof-te@example.test', 'active', v_uid) RETURNING id INTO v_emp;
    INSERT INTO public.projects (name, status) VALUES ('proof-project', 'active') RETURNING id INTO v_proj;
    IF v_uid IS NOT NULL THEN
      -- user_id only → employee_id linked
      INSERT INTO public.time_entries (user_id, project_id, entry_date, hours) VALUES (v_uid, v_proj, '2031-03-10', 2) RETURNING id INTO v_te;
      SELECT employee_id INTO v_got FROM public.time_entries WHERE id = v_te;
      IF v_got IS DISTINCT FROM v_emp THEN RAISE EXCEPTION 'proof: employee_id not linked from user_id'; END IF;
    ELSE
      RAISE NOTICE 'tiden-nar-lonen: no login on this instance — link from user_id not exercised';
    END IF;
    -- employee_id only → user_id linked (NULL when the employee has no login)
    INSERT INTO public.time_entries (employee_id, project_id, entry_date, hours) VALUES (v_emp, v_proj, '2031-03-11', 1) RETURNING id INTO v_te;
    SELECT user_id INTO v_got FROM public.time_entries WHERE id = v_te;
    IF v_got IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'proof: user_id not linked from employee_id'; END IF;
    -- lock the month → insert and delete refused
    INSERT INTO public.timesheet_period_locks (fiscal_year, period_month) VALUES (2031, 3) ON CONFLICT DO NOTHING;
    BEGIN
      INSERT INTO public.time_entries (employee_id, project_id, entry_date, hours) VALUES (v_emp, v_proj, '2031-03-20', 1);
      RAISE EXCEPTION 'proof: a locked timesheet month accepted a new entry';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      DELETE FROM public.time_entries WHERE id = v_te;
      RAISE EXCEPTION 'proof: a locked timesheet month accepted a delete';
    EXCEPTION WHEN check_violation THEN NULL; END;
    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
END $proof$;
