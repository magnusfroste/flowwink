-- Anställningen hänger ihop.
--
-- Processbatteriet 2026-09-19 (hire-to-retire):
--
--   SEMESTERN   auto_allocate_vacation föll på "column reference employee_id is
--               ambiguous" så fort EN aktiv anställd fanns (RETURNS TABLE-kolumnen
--               krockar med en okvalificerad employee_id). Den är ENDA skrivaren
--               av leave_allocations, och godkännandetriggern kräver en
--               tilldelning — ingen ledighet kunde godkännas.
--   SJUKDOM     Saldokontrollen gällde VARJE ledighetstyp. Sjukfrånvaro har ingen
--               kvot: "only 0 days available for sick".
--   DAGARNA     leave_requests.days har default 1 och ingenting härledde den ur
--               datumen: en ansökan måndag–fredag drog EN dag från saldot.
--   LÖNEN       hire_application skrev lönen bara på anställningsavtalet.
--               employees.monthly_salary_cents — kolumnen lönekörningen betalar
--               ur — blev 0: den nyanställde fick 0 kr.
--   AVVISAD     hire_application anställde en AVVISAD ansökan (enda vakten var
--               "redan anställd").
--   DATUMEN     create_payroll_run tog varje aktiv anställd, oavsett start- och
--               slutdatum: en kollega som börjar 2040 fick en full lönerad.
--   AVSLUTET    "Offboarding — contracts terminated": anställningsavtalet stod
--               kvar som utkast efter att den anställde avslutats.
--
-- De tre långa funktionerna ändras IN PLACE (levande kropp, markör, ankare som
-- MÅSTE finnas). Idempotent.

-- ── Saldokontrollen gäller bara det som har en kvot ─────────────────────────
CREATE OR REPLACE FUNCTION public.validate_leave_balance_on_approve()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_year INTEGER;
  v_allocated NUMERIC;
  v_carried NUMERIC;
  v_used NUMERIC;
  v_available NUMERIC;
  v_has_allocation BOOLEAN;
BEGIN
  -- Only check on transition into 'approved'
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.start_date)::INTEGER;

  SELECT COALESCE(allocated_days, 0), COALESCE(carried_over_days, 0), true
  INTO v_allocated, v_carried, v_has_allocation
  FROM public.leave_allocations
  WHERE employee_id = NEW.employee_id
    AND leave_type = NEW.leave_type
    AND year = v_year;

  -- Semester är en kvot: utan tilldelning finns inget att ta av. Varje ANNAN typ
  -- (sjuk, vård av barn, tjänstledigt …) har ett saldo bara om organisationen gett
  -- den ett — annars finns ingen kvot att bryta mot.
  IF NOT COALESCE(v_has_allocation, false) AND NEW.leave_type <> 'vacation' THEN
    RETURN NEW;
  END IF;

  v_allocated := COALESCE(v_allocated, 0);
  v_carried := COALESCE(v_carried, 0);

  SELECT COALESCE(SUM(days), 0)
  INTO v_used
  FROM public.leave_requests
  WHERE employee_id = NEW.employee_id
    AND leave_type = NEW.leave_type
    AND status = 'approved'
    AND id <> NEW.id
    AND EXTRACT(YEAR FROM start_date)::INTEGER = v_year;

  v_available := v_allocated + v_carried - v_used;

  IF NEW.days > v_available THEN
    RAISE EXCEPTION 'Cannot approve: requested % days but only % days available for % in % (allocated %, carried %, already approved %)',
      NEW.days, v_available, NEW.leave_type, v_year, v_allocated, v_carried, v_used
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $function$;

-- ── Dagarna följer datumen ──────────────────────────────────────────────────
-- Arbetsdagar måndag–fredag mellan start och slut. En uttrycklig del av en dag
-- (0,5) eller ett eget tal på en endagsansökan står kvar; ett utelämnat värde —
-- kolumnens default 1 — på ett flerdagarsspann är ingen uppgift, det är en lucka.
CREATE OR REPLACE FUNCTION public.leave_request_days()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE v_workdays integer;
BEGIN
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.end_date < NEW.start_date THEN RAISE EXCEPTION 'end_date % is before start_date %', NEW.end_date, NEW.start_date; END IF;
  SELECT count(*) INTO v_workdays FROM generate_series(NEW.start_date, NEW.end_date, interval '1 day') d
   WHERE EXTRACT(isodow FROM d) < 6;
  IF TG_OP = 'INSERT' THEN
    IF NEW.days IS NULL OR (NEW.days = 1 AND NEW.end_date > NEW.start_date) THEN NEW.days := GREATEST(v_workdays, 0); END IF;
  ELSIF (NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date)
        AND NEW.days IS NOT DISTINCT FROM OLD.days THEN
    NEW.days := GREATEST(v_workdays, 0); -- datumen flyttades, dagarna följer med
  END IF;
  IF NEW.days > v_workdays AND v_workdays > 0 THEN
    RAISE EXCEPTION 'days % is more than the % working days between % and %', NEW.days, v_workdays, NEW.start_date, NEW.end_date;
  END IF;
  RETURN NEW;
END $fn$;

-- Namnet sorterar FÖRE leave_request_validate_balance: saldot ska räkna rätt antal dagar.
DROP TRIGGER IF EXISTS leave_request_days_trg ON public.leave_requests;
CREATE TRIGGER leave_request_days_trg
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.leave_request_days();

-- ── Avslutet tar avtalet med sig ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.employee_termination_closes_contracts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.status = 'terminated' AND OLD.status IS DISTINCT FROM 'terminated' THEN
    IF NEW.end_date IS NULL THEN NEW.end_date := CURRENT_DATE; END IF;
    UPDATE public.employment_contracts
       SET status = 'terminated', terminated_at = now(),
           termination_reason = COALESCE(termination_reason, 'Employee offboarded'),
           end_date = COALESCE(end_date, NEW.end_date)
     WHERE employee_id = NEW.id AND status NOT IN ('terminated', 'expired');
  END IF;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.employee_termination_closes_contracts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employee_termination_closes_contracts_trg ON public.employees;
CREATE TRIGGER employee_termination_closes_contracts_trg
  BEFORE UPDATE OF status ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.employee_termination_closes_contracts();

-- ── In place-ändringarna ────────────────────────────────────────────────────
DO $patch$
DECLARE v_def text; MARK constant text := '20260919190000';
BEGIN
  -- auto_allocate_vacation: kolumnen vinner över OUT-parametern med samma namn.
  v_def := pg_get_functiondef('public.auto_allocate_vacation(integer,boolean)'::regprocedure);
  IF position('#variable_conflict use_column' in v_def) = 0 THEN
    IF position(E'AS $function$\nDECLARE' in v_def) = 0 THEN RAISE EXCEPTION 'anstallningen: anchor missing in auto_allocate_vacation'; END IF;
    v_def := replace(v_def, E'AS $function$\nDECLARE', E'AS $function$\n#variable_conflict use_column\n-- ambiguity-fix ' || MARK || E'\nDECLARE');
    EXECUTE v_def;
  END IF;

  -- hire_application: bara en levande ansökan anställs, och lönen landar där lönekörningen läser.
  v_def := pg_get_functiondef('public.hire_application(uuid,date,bigint,uuid,uuid,text,uuid)'::regprocedure);
  IF position('-- hire-guards ' || MARK in v_def) = 0 THEN
    IF position('  SELECT * INTO v_job FROM public.job_postings WHERE id = v_app.job_posting_id;' in v_def) = 0
       OR position(E'start_date, status, manager_id, created_by\n  ) VALUES (' in v_def) = 0
       OR position('v_start_date, ''active'', p_manager_id, auth.uid()' in v_def) = 0 THEN
      RAISE EXCEPTION 'anstallningen: anchor missing in hire_application';
    END IF;
    v_def := replace(v_def, '  SELECT * INTO v_job FROM public.job_postings WHERE id = v_app.job_posting_id;',
      '  -- hire-guards ' || MARK || E'\n' ||
      '  IF v_app.stage::text IN (''rejected'', ''withdrawn'') THEN' || E'\n' ||
      '    RAISE EXCEPTION ''Application is % — only a live application can be hired. Move it back to a live stage first if the decision changed.'', v_app.stage;' || E'\n' ||
      '  END IF;' || E'\n' ||
      '  SELECT * INTO v_job FROM public.job_postings WHERE id = v_app.job_posting_id;');
    v_def := replace(v_def, E'start_date, status, manager_id, created_by\n  ) VALUES (', E'start_date, status, manager_id, created_by, monthly_salary_cents\n  ) VALUES (');
    v_def := replace(v_def, 'v_start_date, ''active'', p_manager_id, auth.uid()', 'v_start_date, ''active'', p_manager_id, auth.uid(), COALESCE(v_salary, 0)');
    EXECUTE v_def;
  END IF;

  -- create_payroll_run: bara den som är anställd under perioden.
  v_def := pg_get_functiondef('public.create_payroll_run(date)'::regprocedure);
  IF position('-- employed-in-period ' || MARK in v_def) = 0 THEN
    IF position('FROM public.employees WHERE COALESCE(status,''active'') = ''active''' in v_def) = 0 THEN
      RAISE EXCEPTION 'anstallningen: anchor missing in create_payroll_run';
    END IF;
    v_def := replace(v_def, 'FROM public.employees WHERE COALESCE(status,''active'') = ''active''',
      'FROM public.employees WHERE COALESCE(status,''active'') = ''active''' || E'\n' ||
      '      -- employed-in-period ' || MARK || E'\n' ||
      '      AND (start_date IS NULL OR start_date <= (date_trunc(''month'', p_period_date) + interval ''1 month - 1 day'')::date)' || E'\n' ||
      '      AND (end_date IS NULL OR end_date >= date_trunc(''month'', p_period_date)::date)');
    EXECUTE v_def;
  END IF;
END $patch$;

-- ── Beviset ─────────────────────────────────────────────────────────────────
DO $proof$
DECLARE v_emp uuid; v_late uuid; v_req uuid; v_days numeric; v_run uuid; v_n int; v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['hire_application(uuid,date,bigint,uuid,uuid,text,uuid)', 'create_payroll_run(date)', 'auto_allocate_vacation(integer,boolean)'] LOOP
    IF position('20260919190000' in pg_get_functiondef(('public.' || v_fn)::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'proof: % does not carry the 20260919190000 change', v_fn;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    INSERT INTO employees (name, email, status, start_date, monthly_salary_cents) VALUES ('Proof Anställd', 'proof-emp@example.test', 'active', current_date - 400, 3000000) RETURNING id INTO v_emp;
    INSERT INTO employees (name, email, status, start_date, monthly_salary_cents) VALUES ('Proof Framtid', 'proof-late@example.test', 'active', date '2040-01-01', 3000000) RETURNING id INTO v_late;

    -- Semestertilldelningen går igenom med aktiva anställda.
    PERFORM * FROM public.auto_allocate_vacation(EXTRACT(year FROM current_date)::int, true);

    -- Måndag–fredag = fem dagar; sjukfrånvaro godkänns utan kvot.
    INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date) VALUES (v_emp, 'sick', date '2031-03-03', date '2031-03-07') RETURNING id, days INTO v_req, v_days;
    IF v_days <> 5 THEN RAISE EXCEPTION 'proof: Monday–Friday is % days (expected 5)', v_days; END IF;
    UPDATE leave_requests SET status = 'approved' WHERE id = v_req;
    -- Semester utan tilldelning vägras fortfarande.
    INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date) VALUES (v_emp, 'vacation', date '2031-07-07', date '2031-07-11') RETURNING id INTO v_req;
    BEGIN
      UPDATE leave_requests SET status = 'approved' WHERE id = v_req;
      RAISE EXCEPTION 'proof: vacation was approved with no allocation';
    EXCEPTION WHEN check_violation THEN NULL; END;

    -- Lönekörningen tar den som är anställd under perioden, inte den som börjar 2040.
    v_run := (public.create_payroll_run(date '2031-04-01') ->> 'run_id')::uuid;
    SELECT count(*) INTO v_n FROM payroll_lines WHERE run_id = v_run AND employee_id = v_late;
    IF v_n <> 0 THEN RAISE EXCEPTION 'proof: an employee starting in 2040 has a payroll line in 2031'; END IF;
    SELECT count(*) INTO v_n FROM payroll_lines WHERE run_id = v_run AND employee_id = v_emp;
    IF v_n <> 1 THEN RAISE EXCEPTION 'proof: the employed colleague has % payroll lines (expected 1)', v_n; END IF;

    -- Avslutet stämplar sista dagen.
    UPDATE employees SET status = 'terminated' WHERE id = v_emp;
    IF (SELECT end_date FROM employees WHERE id = v_emp) IS NULL THEN RAISE EXCEPTION 'proof: termination left end_date empty'; END IF;

    RAISE EXCEPTION 'proof-rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof-rollback' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'anstallningen-hanger-ihop: proof passed';
END $proof$;
