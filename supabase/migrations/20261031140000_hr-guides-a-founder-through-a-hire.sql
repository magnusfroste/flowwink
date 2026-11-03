-- ─────────────────────────────────────────────────────────────────────────────
-- HR guides a founder through a hire — hr_process_guide('onboarding')
-- ─────────────────────────────────────────────────────────────────────────────
-- The HR page has fourteen tabs and every one of them works, but a founder
-- hiring their first person does not know which of them matter, in what order,
-- or why. A HR person would. This is that person's checklist, read from the
-- records instead of remembered: for one employee, every step of "welcome a
-- new employee" with
--   why     — the reason in plain words
--   law     — the Swedish rule behind it (only when the business is in SE)
--   state   — done | todo | overdue | info, judged from the rows themselves
--   due     — the date the rule sets (contract: day one + 7, LAS 6 c §)
--   fix     — the exact skill call that does it (an agent runs it as is)
--   open    — the HR tab a person does it in
-- Without an employee it answers who is being onboarded and how far each has
-- come, plus the outline of the process — so the HR page and an agent over MCP
-- read the same guide (the month_close_checklist pattern).
--
-- One process today; p_process is the dial for the next ones (offboarding).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._hr_onboarding_steps(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  v_today date := public.platform_today();
  v_se boolean := COALESCE(public.business_country(), 'SE') = 'SE';
  v_emp public.employees;
  v_known boolean;
  v_steps jsonb := '[]'::jsonb;
  v_contract public.employment_contracts;
  v_has_contract_template boolean := false;
  v_has_onboarding_template boolean := false;
  v_missing text[];
  v_state text;
  v_detail text;
  v_due date;
  v_fix jsonb;
  v_year int;
  v_alloc_days numeric;
  v_vac_days int;
  v_total int; v_done int;
  v_checklist_id uuid;
  v_paid_period date;
  v_any_payroll boolean := false;
  v_n int;
  v_probation_months numeric;
  v_template_items jsonb;
BEGIN
  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  END IF;
  v_known := v_emp.id IS NOT NULL;

  -- ── 1. The person ────────────────────────────────────────────────────────
  v_missing := ARRAY[]::text[];
  IF v_emp.email IS NULL OR btrim(v_emp.email) = '' THEN v_missing := array_append(v_missing, 'e-mail'); END IF;
  IF v_emp.title IS NULL OR btrim(v_emp.title) = '' THEN v_missing := array_append(v_missing, 'job title'); END IF;
  IF v_emp.start_date IS NULL THEN v_missing := array_append(v_missing, 'start date'); END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'person', 'phase', 'prepare', 'required', true,
    'label', 'Add the person, with a start date',
    'why', 'Everything else hangs on the record: the contract, pay, vacation and the introduction all start from the first day.',
    'law', NULL,
    'state', CASE WHEN NOT v_known THEN 'todo' WHEN cardinality(v_missing) = 0 THEN 'done' ELSE 'todo' END,
    'due', NULL,
    'detail', CASE WHEN NOT v_known THEN 'Add them under HR → New employee — or hire them from Recruitment, which also drafts the contract and the introduction.'
                   WHEN cardinality(v_missing) = 0 THEN v_emp.name || ' starts ' || v_emp.start_date
                   ELSE 'Missing: ' || array_to_string(v_missing, ', ') END,
    'fix', CASE WHEN NOT v_known THEN jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object('action', 'create', 'name', '<full name>', 'email', '<e-mail>', 'title', '<job title>', 'start_date', '<YYYY-MM-DD>'))
                WHEN cardinality(v_missing) = 0 THEN NULL
                ELSE jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object('action', 'update', 'employee_id', v_emp.id)) END,
    'open', 'employees');

  -- ── 2. The written contract ──────────────────────────────────────────────
  SELECT * INTO v_contract FROM public.employment_contracts
   WHERE employee_id = v_emp.id AND status <> 'terminated'
   ORDER BY (status IN ('signed', 'active')) DESC, created_at DESC LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM public.employment_contract_templates WHERE is_active) INTO v_has_contract_template;
  v_due := CASE WHEN v_emp.start_date IS NOT NULL THEN v_emp.start_date + 7 END;
  IF v_contract.id IS NULL THEN
    v_state := 'todo';
    v_detail := 'No contract yet.' || CASE WHEN v_has_contract_template THEN ' Create it from your contract template.' ELSE ' Write your contract template once (HR → Contracts → Templates) and every contract starts from it.' END;
    v_fix := CASE WHEN v_known THEN jsonb_build_object('skill', 'manage_employment_contract', 'args', jsonb_build_object(
      'action', 'create', 'employee_id', v_emp.id, 'title', COALESCE(v_emp.title, '<job title>'), 'employment_type', 'permanent',
      'start_date', COALESCE(v_emp.start_date::text, '<YYYY-MM-DD>'), 'monthly_salary_cents', NULLIF(v_emp.monthly_salary_cents, 0),
      'probation_end_date', CASE WHEN v_emp.start_date IS NOT NULL THEN (v_emp.start_date + INTERVAL '6 months')::date END,
      'notice_period_days', 30, 'status', 'draft')) END;
  ELSIF v_contract.status IN ('signed', 'active') THEN
    v_state := 'done';
    v_detail := 'Signed' || COALESCE(' ' || to_char(v_contract.signed_at, 'YYYY-MM-DD'), '') || '.';
    v_fix := NULL;
  ELSE
    v_state := 'todo';
    v_detail := CASE WHEN v_contract.status = 'draft' THEN 'A draft is ready — read it, send it to ' || COALESCE(v_emp.name, 'the person') || ' and both sign.'
                     ELSE 'Sent — waiting for ' ||
                          CASE WHEN v_contract.signed_by_employer_at IS NULL AND v_contract.signed_by_employee_at IS NULL THEN 'both signatures'
                               WHEN v_contract.signed_by_employer_at IS NULL THEN 'your signature (employer)'
                               ELSE 'the employee''s signature' END || '.' END;
    v_fix := jsonb_build_object('skill', 'sign_employment_contract', 'args', jsonb_build_object(
      'p_contract_id', v_contract.id, 'p_side', CASE WHEN v_contract.signed_by_employer_at IS NULL THEN 'employer' ELSE 'employee' END));
  END IF;
  IF v_state <> 'done' AND v_due IS NOT NULL AND v_today > v_due THEN v_state := 'overdue'; END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'contract', 'phase', 'prepare', 'required', true,
    'label', 'A written contract, signed by both of you',
    'why', 'The contract is what you agreed: role, pay, hours, probation and notice. Without it a disagreement is one word against another.',
    'law', CASE WHEN v_se THEN 'LAS 6 c § — the essential terms in writing no later than 7 days after the first day, the rest within a month. Employment is permanent unless the contract says otherwise (LAS 4 §).' END,
    'state', v_state, 'due', v_due, 'detail', v_detail, 'fix', v_fix, 'open', 'contracts');

  -- ── 3. Pay details ───────────────────────────────────────────────────────
  v_missing := ARRAY[]::text[];
  IF COALESCE(v_emp.monthly_salary_cents, 0) <= 0 THEN v_missing := array_append(v_missing, 'monthly salary'); END IF;
  IF v_emp.personal_number IS NULL OR btrim(v_emp.personal_number) = '' THEN v_missing := array_append(v_missing, 'personal identity number'); END IF;
  v_detail := CASE WHEN cardinality(v_missing) = 0 THEN 'Salary and personal identity number recorded.' ELSE 'Missing: ' || array_to_string(v_missing, ', ') || '.' END;
  IF v_se AND v_known AND COALESCE(v_emp.tax_rate_pct, 30) = 30 THEN
    v_detail := v_detail || ' Tax is 30 % — the side-income rate. For a main employment use the person''s tax table (ask them, or look it up at Skatteverket).';
  END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'pay_details', 'phase', 'prepare', 'required', true,
    'label', 'Salary, personal identity number and tax',
    'why', 'Payroll pays what is on the record: without a salary the run pays nothing, and without the identity number the salary cannot be reported.',
    'law', CASE WHEN v_se THEN 'Every salary is reported per person to Skatteverket each month (AGI, arbetsgivardeklaration på individnivå), keyed by the personal identity number.' END,
    'state', CASE WHEN v_known AND cardinality(v_missing) = 0 THEN 'done' ELSE 'todo' END,
    'due', v_emp.start_date, 'detail', v_detail,
    'fix', CASE WHEN v_known AND cardinality(v_missing) > 0 THEN jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object(
      'action', 'update', 'employee_id', v_emp.id, 'monthly_salary_cents', NULLIF(COALESCE(v_emp.monthly_salary_cents, v_contract.monthly_salary_cents), 0),
      'personal_number', '<YYYYMMDD-XXXX>', 'tax_rate_pct', v_emp.tax_rate_pct)) END,
    'open', 'employees');

  -- ── 4. Registered as an employer (only until the first salary is paid) ──
  BEGIN
    SELECT EXISTS (SELECT 1 FROM public.payroll_runs WHERE status = 'paid') INTO v_any_payroll;
  EXCEPTION WHEN undefined_table THEN v_any_payroll := false; END;
  IF NOT v_any_payroll AND v_se THEN
    v_steps := v_steps || jsonb_build_object(
      'id', 'employer_registration', 'phase', 'prepare', 'required', false,
      'label', 'Registered as an employer',
      'why', 'Your first employee: before the first salary is paid the company must be registered to pay employer contributions and withhold tax.',
      'law', 'Register with Skatteverket (skatte- och avgiftsanmälan) in good time before the first payday.',
      'state', 'info', 'due', v_emp.start_date,
      'detail', 'FlowWink cannot see the registration itself, so this stays a reminder until the first payroll run is paid.',
      'fix', NULL, 'open', 'payroll');
  END IF;

  -- ── 5. A login ───────────────────────────────────────────────────────────
  v_steps := v_steps || jsonb_build_object(
    'id', 'login', 'phase', 'prepare', 'required', false,
    'label', 'A login to FlowWink',
    'why', 'Time reports, leave requests, payslips and their own contract are in the employee portal — with a login. Someone who never uses the system can be paid without one.',
    'law', NULL,
    'state', CASE WHEN v_emp.user_id IS NOT NULL THEN 'done' ELSE 'todo' END,
    'due', v_emp.start_date,
    'detail', CASE WHEN v_emp.user_id IS NOT NULL THEN 'Linked to a login.' ELSE 'Invite them; once they sign in, link the login on the employee (user_id).' END,
    'fix', CASE WHEN v_emp.user_id IS NULL AND v_known THEN jsonb_build_object('skill', 'invite_colleague', 'args', jsonb_build_object('email', v_emp.email, 'full_name', v_emp.name, 'role', '<role they need>')) END,
    'open', 'employees');

  -- ── 6. Vacation for the year ─────────────────────────────────────────────
  v_year := EXTRACT(YEAR FROM GREATEST(v_today, COALESCE(v_emp.start_date, v_today)))::int;
  SELECT allocated_days INTO v_alloc_days FROM public.leave_allocations
   WHERE employee_id = v_emp.id AND leave_type = 'vacation' AND year = v_year;
  v_vac_days := NULL;
  IF v_known AND v_alloc_days IS NULL THEN
    BEGIN v_vac_days := public.calculate_vacation_days(v_emp.id, v_year);
    EXCEPTION WHEN OTHERS THEN v_vac_days := 25; END;
  END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'vacation', 'phase', 'first_week', 'required', true,
    'label', 'Vacation days for ' || v_year,
    'why', 'So the person, you and payroll see the same number from the start — and leave requests have something to draw from.',
    'law', CASE WHEN v_se THEN 'Semesterlagen 4 § — 25 vacation days a year. In the first year, how many of them are paid depends on the earning year (7 §); the rest can be taken unpaid.' END,
    'state', CASE WHEN v_alloc_days IS NOT NULL THEN 'done' ELSE 'todo' END,
    'due', CASE WHEN v_emp.start_date IS NOT NULL THEN v_emp.start_date + 7 END,
    'detail', CASE WHEN v_alloc_days IS NOT NULL THEN v_alloc_days || ' days allocated for ' || v_year || '.' ELSE 'No allocation for ' || v_year || ' yet — your vacation policy gives ' || COALESCE(v_vac_days, 25) || ' days.' END,
    'fix', CASE WHEN v_known AND v_alloc_days IS NULL THEN jsonb_build_object('skill', 'manage_leave_allocation', 'args', jsonb_build_object(
      'action', 'create', 'employee_id', v_emp.id, 'leave_type', 'vacation', 'year', v_year, 'allocated_days', COALESCE(v_vac_days, 25))) END,
    'open', 'allocations');

  -- ── 7. The introduction ──────────────────────────────────────────────────
  v_total := 0; v_done := 0; v_checklist_id := NULL;
  SELECT COALESCE(SUM(jsonb_array_length(COALESCE(items, '[]'::jsonb))), 0),
         COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(c.items, '[]'::jsonb)) i WHERE COALESCE((i ->> 'done')::boolean, false))), 0),
         (array_agg(id ORDER BY created_at))[1]
    INTO v_total, v_done, v_checklist_id
    FROM public.onboarding_checklists c WHERE c.employee_id = v_emp.id;
  -- The template hire_application would pick: department, then employment type, then the default.
  SELECT t.items INTO v_template_items FROM public.onboarding_templates t
   WHERE t.is_active AND jsonb_typeof(t.items) = 'array' AND jsonb_array_length(t.items) > 0
   ORDER BY (t.department IS NOT NULL AND t.department = v_emp.department) DESC,
            (t.employment_type IS NOT NULL AND t.employment_type = v_emp.employment_type) DESC,
            t.is_default DESC, t.created_at
   LIMIT 1;
  v_has_onboarding_template := v_template_items IS NOT NULL;
  v_due := CASE WHEN v_emp.start_date IS NOT NULL THEN v_emp.start_date + 14 END;
  v_state := CASE WHEN v_checklist_id IS NOT NULL AND v_total > 0 AND v_done = v_total THEN 'done' ELSE 'todo' END;
  IF v_state = 'todo' AND v_due IS NOT NULL AND v_today > v_due THEN v_state := 'overdue'; END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'introduction', 'phase', 'first_week', 'required', true,
    'label', 'An introduction plan for the first weeks',
    'why', 'Who they meet, what they need on day one, how the work is done and what is risky in it. A planned first week is the difference between "welcome" and "where do I sit?".',
    'law', CASE WHEN v_se THEN 'Arbetsmiljölagen 3 kap. 3 § — the employer makes sure the employee knows the conditions of the work and its risks.' END,
    'state', v_state, 'due', v_due,
    'detail', CASE WHEN v_checklist_id IS NULL THEN 'No plan yet.' || CASE WHEN v_has_onboarding_template THEN ' Create it from your introduction template.' ELSE ' Write an introduction template once and every new hire gets it.' END
                   ELSE v_done || ' of ' || v_total || ' items done.' END,
    'fix', CASE WHEN NOT v_known OR v_state = 'done' THEN NULL
                WHEN v_checklist_id IS NULL THEN jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object('action', 'create', 'employee_id', v_emp.id, 'title', 'Introduction', 'items', COALESCE(v_template_items, jsonb_build_array(
                  jsonb_build_object('title', 'Workplace, keys and equipment ready', 'done', false),
                  jsonb_build_object('title', 'Welcome talk: the role, expectations, who to ask', 'done', false),
                  jsonb_build_object('title', 'Walk through the work environment and its risks', 'done', false),
                  jsonb_build_object('title', 'Accounts and tools set up', 'done', false),
                  jsonb_build_object('title', 'Meet the team and key customers', 'done', false),
                  jsonb_build_object('title', 'Follow-up talk after the first weeks', 'done', false)))))
                ELSE jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object('action', 'get_status', 'employee_id', v_emp.id)) END,
    'open', 'employees');

  -- ── 8. A manager ─────────────────────────────────────────────────────────
  v_steps := v_steps || jsonb_build_object(
    'id', 'manager', 'phase', 'first_week', 'required', false,
    'label', 'Who they report to',
    'why', 'One named person who approves their leave and time and holds the follow-up talks. In a small company that is usually the founder.',
    'law', NULL,
    'state', CASE WHEN v_emp.manager_id IS NOT NULL THEN 'done' ELSE 'todo' END, 'due', NULL,
    'detail', CASE WHEN v_emp.manager_id IS NOT NULL THEN 'Reports to ' || COALESCE((SELECT name FROM public.employees WHERE id = v_emp.manager_id), 'their manager') || '.' ELSE 'No manager set.' END,
    'fix', CASE WHEN v_known AND v_emp.manager_id IS NULL THEN jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object('action', 'update', 'employee_id', v_emp.id, 'manager_id', '<employees.id of the manager>')) END,
    'open', 'orgchart');

  -- ── 9. An emergency contact ──────────────────────────────────────────────
  v_steps := v_steps || jsonb_build_object(
    'id', 'emergency_contact', 'phase', 'first_week', 'required', false,
    'label', 'Someone to call if something happens',
    'why', 'If they are hurt or fall ill at work, you need to know whom to call — and you do not want to be looking for it then.',
    'law', NULL,
    'state', CASE WHEN v_emp.emergency_contact IS NOT NULL AND v_emp.emergency_contact <> '{}'::jsonb THEN 'done' ELSE 'todo' END, 'due', NULL,
    'detail', CASE WHEN v_emp.emergency_contact IS NOT NULL AND v_emp.emergency_contact <> '{}'::jsonb THEN 'Recorded.' ELSE 'Not recorded.' END,
    'fix', CASE WHEN v_known AND (v_emp.emergency_contact IS NULL OR v_emp.emergency_contact = '{}'::jsonb) THEN jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object('action', 'update', 'employee_id', v_emp.id, 'emergency_contact', jsonb_build_object('name', '<name>', 'phone', '<phone>', 'relation', '<relation>'))) END,
    'open', 'employees');

  -- ── 10. The probation decision ───────────────────────────────────────────
  v_due := CASE WHEN v_contract.probation_end_date IS NOT NULL THEN v_contract.probation_end_date - 14 END;
  v_probation_months := CASE WHEN v_contract.probation_end_date IS NOT NULL AND v_contract.start_date IS NOT NULL
                             THEN (v_contract.probation_end_date - v_contract.start_date) / 30.4 END;
  IF v_contract.id IS NULL THEN
    v_state := 'info'; v_detail := 'Comes with the contract: probation is set there.';
  ELSIF v_contract.probation_end_date IS NULL THEN
    v_state := 'done'; v_detail := 'No probation on the contract — the employment is permanent from the first day.';
  ELSIF v_se AND v_probation_months > 6.1 THEN
    v_state := 'todo'; v_detail := 'Probation ends ' || v_contract.probation_end_date || ' — longer than the six months the law allows. Shorten it on the contract.';
  ELSIF v_contract.probation_end_date <= v_today THEN
    v_state := 'done'; v_detail := 'Probation ended ' || v_contract.probation_end_date || ' — the employment continues.';
  ELSIF v_today >= v_due - 28 THEN
    v_state := 'todo'; v_detail := 'Probation ends ' || v_contract.probation_end_date || '. Decide now: if it should not continue, tell them by ' || v_due || '. Doing nothing means it continues.';
  ELSE
    v_state := 'info'; v_detail := 'Probation ends ' || v_contract.probation_end_date || '. Hold a follow-up talk before ' || v_due || ' — that is the last day to say it will not continue.';
  END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'probation', 'phase', 'first_months', 'required', true,
    'label', 'Decide on the probation period',
    'why', 'Probation is the time for both of you to see whether it works. Letting the date pass is also a decision: the employment continues.',
    'law', CASE WHEN v_se THEN 'LAS 6 § — probation is at most six months. To end it, tell the person at least two weeks before (LAS 31 §); a union they belong to is told too.' END,
    'state', v_state, 'due', v_due, 'detail', v_detail,
    'fix', CASE WHEN v_known AND v_state = 'todo' AND v_contract.id IS NOT NULL THEN jsonb_build_object('skill', 'manage_performance', 'args', jsonb_build_object(
      'p_action', 'schedule_one_on_one', 'p_employee_id', v_emp.id, 'p_scheduled_at', '<ISO time before ' || v_due || '>', 'p_agenda', 'Probation follow-up: how is it going, for both of us?')) END,
    'open', 'contracts');

  -- ── 11. The first salary ─────────────────────────────────────────────────
  v_paid_period := NULL;
  BEGIN
    SELECT MIN(r.period_date) INTO v_paid_period FROM public.payroll_lines l JOIN public.payroll_runs r ON r.id = l.run_id
     WHERE l.employee_id = v_emp.id AND r.status = 'paid';
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_paid_period := NULL; END;
  v_due := CASE WHEN v_emp.start_date IS NOT NULL THEN (date_trunc('month', v_emp.start_date) + INTERVAL '1 month' - INTERVAL '1 day')::date END;
  v_state := CASE WHEN v_paid_period IS NOT NULL THEN 'done'
                  WHEN v_emp.start_date IS NULL OR v_emp.start_date > v_today THEN 'info'
                  WHEN v_today > v_due + 10 THEN 'overdue' ELSE 'todo' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'first_salary', 'phase', 'first_months', 'required', true,
    'label', 'The first salary, paid and reported',
    'why', 'The first payday is when the person finds out whether everything above was right.',
    'law', CASE WHEN v_se THEN 'The salary and the tax withheld are reported to Skatteverket (AGI) by the 12th of the month after payday — the 17th in January and August.' END,
    'state', v_state, 'due', v_due,
    'detail', CASE WHEN v_paid_period IS NOT NULL THEN 'First paid in the run for ' || to_char(v_paid_period, 'YYYY-MM') || '; its AGI was due ' || public._se_agency_day((date_trunc('month', v_paid_period) + INTERVAL '1 month')::date, 12) || '.'
                   WHEN v_emp.start_date IS NULL THEN 'Comes after the start date.'
                   ELSE 'Include them in the payroll run for ' || to_char(v_emp.start_date, 'YYYY-MM') || '.' END,
    'fix', CASE WHEN v_known AND v_paid_period IS NULL AND v_emp.start_date IS NOT NULL THEN jsonb_build_object('skill', 'create_payroll_run', 'args', jsonb_build_object('period_date', v_emp.start_date)) END,
    'open', 'payroll');

  -- ── 12. Pension and insurance ────────────────────────────────────────────
  v_n := 0;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.employee_benefits WHERE employee_id = v_emp.id AND status = 'active';
  EXCEPTION WHEN undefined_table THEN v_n := 0; END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'benefits', 'phase', 'first_months', 'required', false,
    'label', 'Pension and insurance',
    'why', 'Most employees expect occupational pension and insurance, and it is often what a good candidate compares between offers. Write down what you give, so it is the same for everyone.',
    'law', CASE WHEN v_se THEN 'Without a collective agreement no law requires occupational pension or the agreement insurances; with one (kollektivavtal) they are part of the deal.' END,
    'state', CASE WHEN v_n > 0 THEN 'done' ELSE 'todo' END, 'due', NULL,
    'detail', CASE WHEN v_n > 0 THEN v_n || ' benefit' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' active.' ELSE 'None recorded.' END,
    'fix', CASE WHEN v_known AND v_n = 0 THEN jsonb_build_object('skill', 'manage_benefits', 'args', jsonb_build_object('p_action', 'enroll', 'p_employee_id', v_emp.id, 'p_plan_id', '<plan id — list_plans>')) END,
    'open', 'compensation');

  RETURN v_steps;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public._hr_onboarding_steps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._hr_onboarding_steps(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.hr_process_guide(p_process text DEFAULT 'onboarding', p_employee_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_process text := lower(COALESCE(NULLIF(btrim(p_process), ''), 'onboarding'));
  v_emp public.employees;
  v_steps jsonb;
  v_people jsonb := '[]'::jsonb;
  v_today date := public.platform_today();
  r record;
  v_next jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'Requires the hr module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF v_process NOT IN ('onboarding') THEN
    RAISE EXCEPTION 'Unknown process "%". Known: onboarding', p_process USING ERRCODE = '22023';
  END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee % not found', p_employee_id USING ERRCODE = 'P0002'; END IF;
    v_steps := public._hr_onboarding_steps(v_emp.id);
    SELECT s INTO v_next FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' IN ('overdue', 'todo') AND (s ->> 'required')::boolean LIMIT 1;
    RETURN jsonb_build_object(
      'process', v_process, 'title', 'Welcome a new employee',
      'employee', jsonb_build_object('id', v_emp.id, 'name', v_emp.name, 'title', v_emp.title, 'start_date', v_emp.start_date, 'status', v_emp.status),
      'country', public.business_country(),
      'steps', v_steps,
      'required_total', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE (s ->> 'required')::boolean),
      'required_done', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE (s ->> 'required')::boolean AND s ->> 'state' = 'done'),
      'overdue', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' = 'overdue'),
      'complete', v_next IS NULL,
      'next', v_next,
      'generated_at', now());
  END IF;

  -- Who is being onboarded: everyone not gone whose start is ahead or within
  -- the last six months (probation's length), or who still has a required step open.
  FOR r IN
    SELECT e.id, e.name, e.title, e.start_date FROM public.employees e
     WHERE e.status <> 'terminated'
       AND (e.start_date IS NULL OR e.start_date >= v_today - 190)
     ORDER BY e.start_date NULLS LAST, e.name
     LIMIT 50
  LOOP
    v_steps := public._hr_onboarding_steps(r.id);
    SELECT s INTO v_next FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' IN ('overdue', 'todo') AND (s ->> 'required')::boolean LIMIT 1;
    v_people := v_people || jsonb_build_object(
      'employee_id', r.id, 'name', r.name, 'title', r.title, 'start_date', r.start_date,
      'required_total', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE (s ->> 'required')::boolean),
      'required_done', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE (s ->> 'required')::boolean AND s ->> 'state' = 'done'),
      'overdue', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' = 'overdue'),
      'complete', v_next IS NULL,
      'next', CASE WHEN v_next IS NULL THEN NULL ELSE jsonb_build_object('id', v_next ->> 'id', 'label', v_next ->> 'label', 'state', v_next ->> 'state', 'due', v_next -> 'due') END);
  END LOOP;

  RETURN jsonb_build_object(
    'process', v_process, 'title', 'Welcome a new employee',
    'purpose', 'From signed offer to the end of probation: the contract, pay, vacation, the introduction and the first salary — in order, with the rule behind each step.',
    'country', public.business_country(),
    'people', v_people,
    'outline', (SELECT jsonb_agg(jsonb_build_object('id', s ->> 'id', 'phase', s ->> 'phase', 'label', s ->> 'label', 'why', s ->> 'why', 'law', s -> 'law', 'required', s -> 'required'))
                  FROM jsonb_array_elements(public._hr_onboarding_steps(NULL)) s),
    'next', jsonb_build_object('skill', 'hr_process_guide', 'args', jsonb_build_object('p_process', v_process, 'p_employee_id', '<employee_id>')),
    'generated_at', now());
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.hr_process_guide(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_process_guide(text, uuid) TO authenticated, service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- A new hire with nothing but a name has the contract and pay open; a signed
-- contract and a salary close those steps; the person shows in the list.
-- Rolled back.
DO $$
DECLARE v_emp uuid; v_out jsonb; v_list jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.employees (name, email, title, start_date, status)
    VALUES ('Proof Person', 'proof@example.invalid', 'Fiber technician', public.platform_today() + 14, 'active')
    RETURNING id INTO v_emp;
    v_out := public.hr_process_guide('onboarding', v_emp);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'steps') s WHERE s ->> 'id' = 'contract' AND s ->> 'state' = 'todo') THEN
      RAISE EXCEPTION 'proof: a hire without a contract should have the contract open, got %', v_out -> 'steps';
    END IF;
    IF (v_out ->> 'complete')::boolean OR v_out -> 'next' ->> 'id' <> 'contract' THEN
      RAISE EXCEPTION 'proof: next should be the contract, got %', v_out -> 'next';
    END IF;
    IF (SELECT s -> 'fix' ->> 'skill' FROM jsonb_array_elements(v_out -> 'steps') s WHERE s ->> 'id' = 'contract') <> 'manage_employment_contract' THEN
      RAISE EXCEPTION 'proof: the contract fix should be manage_employment_contract';
    END IF;
    INSERT INTO public.employment_contracts (employee_id, title, start_date, status, signed_at, signed_by_employee_at, signed_by_employer_at, probation_end_date)
    VALUES (v_emp, 'Fiber technician', public.platform_today() + 14, 'signed', now(), now(), now(), public.platform_today() + 14 + 180);
    UPDATE public.employees SET monthly_salary_cents = 3500000, personal_number = '19900101-0000' WHERE id = v_emp;
    v_out := public.hr_process_guide('onboarding', v_emp);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out -> 'steps') s WHERE s ->> 'id' IN ('contract', 'pay_details') AND s ->> 'state' <> 'done') THEN
      RAISE EXCEPTION 'proof: signed contract and salary should close their steps, got %', v_out -> 'steps';
    END IF;
    v_list := public.hr_process_guide('onboarding', NULL);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_list -> 'people') p WHERE (p ->> 'employee_id')::uuid = v_emp) THEN
      RAISE EXCEPTION 'proof: the new hire should be in the onboarding list';
    END IF;
    IF jsonb_array_length(v_list -> 'outline') < 10 THEN
      RAISE EXCEPTION 'proof: the outline should carry every step, got %', v_list -> 'outline';
    END IF;
    BEGIN
      PERFORM public.hr_process_guide('nonsense', NULL);
      RAISE EXCEPTION 'proof: an unknown process was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    RAISE NOTICE 'hr process guide proof ok';
    RAISE EXCEPTION '__hr_guide_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__hr_guide_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
