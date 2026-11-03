-- ─────────────────────────────────────────────────────────────────────────────
-- HR guides a founder through someone leaving — hr_process_guide('offboarding')
-- ─────────────────────────────────────────────────────────────────────────────
-- The second guide on HR → Start here. Nothing in FlowWink recorded that an
-- employment was ending: there was no way to set the last day (no field in
-- the admin, no skill), nothing said who ended it, and nothing checked the
-- notice against LAS 11 §. So a founder letting someone go — or receiving a
-- resignation — had no support at the moment it matters most.
--
-- end_employment records the decision (who, notice day, last day, reason) on
-- the employee, refuses a notice shorter than the law allows unless a shorter
-- one was agreed (p_force), sets the contract's end date and creates the
-- offboarding checklist. The checklist holds what only a person can confirm
-- (the notice in writing, things returned, the certificate given); the guide
-- reads its items by key, and both the admin and an agent tick them with the
-- same call (onboarding_checklist update).
--
-- Also: the onboarding steps ignore the offboarding checklist, and their
-- introduction fix uses `list` (onboarding_checklist's get_status was never
-- answered by the generic handler).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Who ends it, and the last day — end_employment ──────────────────────
-- The decision is recorded on the employee (employees.termination); the
-- contract gets its end date; the offboarding checklist is born with it.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination jsonb;
COMMENT ON COLUMN public.employees.termination IS
  'How the employment ends (end_employment): {initiator, notice_date, last_day, reason, minimum_notice_days, recorded_at, recorded_by}. NULL = not ending.';

-- LAS 11 §: the employer's notice grows with the length of employment.
CREATE OR REPLACE FUNCTION public._las_notice_months(p_start date, p_notice date)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_start IS NULL OR p_notice IS NULL THEN 1
    WHEN age(p_notice, p_start) >= INTERVAL '10 years' THEN 6
    WHEN age(p_notice, p_start) >= INTERVAL '8 years' THEN 5
    WHEN age(p_notice, p_start) >= INTERVAL '6 years' THEN 4
    WHEN age(p_notice, p_start) >= INTERVAL '4 years' THEN 3
    WHEN age(p_notice, p_start) >= INTERVAL '2 years' THEN 2
    ELSE 1 END;
$fn$;

CREATE OR REPLACE FUNCTION public.end_employment(
  p_employee_id uuid,
  p_initiator text,
  p_last_day date DEFAULT NULL,
  p_notice_date date DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_dry_run boolean DEFAULT false,
  p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_emp public.employees;
  v_contract public.employment_contracts;
  v_init text := lower(btrim(COALESCE(p_initiator, '')));
  v_notice date := COALESCE(p_notice_date, public.platform_today());
  v_min_end date;
  v_rule text;
  v_last date;
  v_checklist uuid;
  v_term jsonb;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.can_access_module(auth.uid(), 'hr')) THEN
    RAISE EXCEPTION 'Requires the hr module — an admin can grant it under Users → Role Permissions' USING ERRCODE = '42501';
  END IF;
  IF v_init NOT IN ('employee', 'employer_personal', 'employer_redundancy', 'probation', 'fixed_term_end', 'mutual') THEN
    RAISE EXCEPTION 'p_initiator must be employee | employer_personal | employer_redundancy | probation | fixed_term_end | mutual (got %)', p_initiator USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee % not found', p_employee_id USING ERRCODE = 'P0002'; END IF;
  IF v_emp.status = 'terminated' THEN
    RAISE EXCEPTION '% has already left (status terminated)', v_emp.name USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_contract FROM public.employment_contracts
   WHERE employee_id = v_emp.id AND status <> 'terminated'
   ORDER BY (status IN ('signed', 'active')) DESC, created_at DESC LIMIT 1;

  -- The shortest lawful notice; a longer one in the contract wins.
  CASE v_init
    WHEN 'employee' THEN
      v_min_end := (v_notice + INTERVAL '1 month')::date;
      v_rule := 'The employee gives one month''s notice (LAS 11 §)';
    WHEN 'employer_personal', 'employer_redundancy' THEN
      v_min_end := (v_notice + make_interval(months => public._las_notice_months(v_emp.start_date, v_notice)))::date;
      v_rule := 'The employer gives ' || public._las_notice_months(v_emp.start_date, v_notice) || ' month(s) after '
             || COALESCE(EXTRACT(YEAR FROM age(v_notice, v_emp.start_date))::int, 0) || ' full year(s) of employment (LAS 11 §)';
    WHEN 'probation' THEN
      v_min_end := v_notice + 14;
      v_rule := 'Ending a probation: tell the person at least two weeks before (LAS 31 §)';
    ELSE
      v_min_end := v_notice;
      v_rule := CASE v_init WHEN 'mutual' THEN 'By agreement — the date you both signed' ELSE 'The fixed term ends on the date in the contract' END;
  END CASE;
  IF v_init IN ('employee', 'employer_personal', 'employer_redundancy') AND COALESCE(v_contract.notice_period_days, 0) > (v_min_end - v_notice) THEN
    v_min_end := v_notice + v_contract.notice_period_days;
    v_rule := v_rule || '; the contract says ' || v_contract.notice_period_days || ' days, which wins';
  END IF;
  v_last := COALESCE(p_last_day, CASE WHEN v_init = 'fixed_term_end' THEN v_contract.end_date END, v_min_end);
  IF v_last IS NULL THEN
    RAISE EXCEPTION 'p_last_day is required — a fixed-term contract without an end date has no last day' USING ERRCODE = '22023';
  END IF;
  IF v_last < v_min_end AND NOT p_force THEN
    RAISE EXCEPTION 'The last day % is shorter than the notice allows (earliest %): %. Agree a shorter notice in writing and pass p_force, or choose a later day.', v_last, v_min_end, v_rule USING ERRCODE = '22023';
  END IF;

  v_term := jsonb_build_object(
    'initiator', v_init, 'notice_date', v_notice, 'last_day', v_last, 'reason', NULLIF(btrim(COALESCE(p_reason, '')), ''),
    'minimum_last_day', v_min_end, 'rule', v_rule, 'shortened', v_last < v_min_end,
    'recorded_at', now(), 'recorded_by', auth.uid());
  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'employee_id', v_emp.id, 'name', v_emp.name, 'termination', v_term);
  END IF;

  UPDATE public.employees SET end_date = v_last, termination = v_term, updated_at = now() WHERE id = v_emp.id;
  IF v_contract.id IS NOT NULL THEN
    UPDATE public.employment_contracts
       SET end_date = v_last,
           termination_reason = COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), v_init),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('termination', v_term),
           updated_at = now()
     WHERE id = v_contract.id;
  END IF;

  -- The person-confirmed facts live as items of one checklist: ticked in the
  -- admin or by onboarding_checklist update — the guide reads them by key.
  SELECT id INTO v_checklist FROM public.onboarding_checklists
   WHERE employee_id = v_emp.id AND title ILIKE 'offboarding%' ORDER BY created_at DESC LIMIT 1;
  IF v_checklist IS NULL THEN
    INSERT INTO public.onboarding_checklists (employee_id, title, items, created_by)
    VALUES (v_emp.id, 'Offboarding', jsonb_build_array(
      jsonb_build_object('key', 'written_notice', 'title', CASE WHEN v_init = 'employee' THEN 'Their resignation in writing, a copy kept' ELSE 'The notice handed over in writing, a copy kept' END, 'done', false),
      jsonb_build_object('key', 'handover', 'title', 'Ongoing work and customers handed over', 'done', false),
      jsonb_build_object('key', 'returned', 'title', 'Laptop, phone, keys and cards returned', 'done', false),
      jsonb_build_object('key', 'schedules', 'title', 'Removed from schedules, shifts and recurring meetings', 'done', false),
      jsonb_build_object('key', 'exit_talk', 'title', 'Exit talk — what worked, what did not', 'done', false),
      jsonb_build_object('key', 'certificate', 'title', 'Employer''s certificate (arbetsgivarintyg) given, if they asked', 'done', false)),
      auth.uid())
    RETURNING id INTO v_checklist;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
  VALUES ('employment.ending', 'employee', v_emp.id, auth.uid(), v_term);

  RETURN jsonb_build_object(
    'success', true, 'employee_id', v_emp.id, 'name', v_emp.name, 'termination', v_term,
    'contract_id', v_contract.id, 'offboarding_checklist_id', v_checklist,
    'next', jsonb_build_object('skill', 'hr_process_guide', 'args', jsonb_build_object('p_process', 'offboarding', 'p_employee_id', v_emp.id)));
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.end_employment(uuid, text, date, date, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_employment(uuid, text, date, date, text, boolean, boolean) TO authenticated, service_role;

-- ── 2. The offboarding steps ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._hr_offboarding_steps(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  v_today date := public.platform_today();
  v_se boolean := COALESCE(public.business_country(), 'SE') = 'SE';
  v_emp public.employees;
  v_known boolean;
  v_t jsonb;
  v_init text;
  v_employer boolean;
  v_steps jsonb := '[]'::jsonb;
  v_contract public.employment_contracts;
  v_cl public.onboarding_checklists;
  v_state text; v_detail text; v_fix jsonb; v_due date;
  v_n int; v_open int; v_total int;
  v_year int; v_left numeric;
  v_paid boolean := false;
  v_roles int := 0;
  v_written_idx int; v_cert_idx int;
BEGIN
  IF p_employee_id IS NOT NULL THEN SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id; END IF;
  v_known := v_emp.id IS NOT NULL;
  v_t := v_emp.termination;
  v_init := v_t ->> 'initiator';
  v_employer := v_init IN ('employer_personal', 'employer_redundancy', 'probation');
  SELECT * INTO v_contract FROM public.employment_contracts WHERE employee_id = v_emp.id ORDER BY (status IN ('signed', 'active', 'terminated')) DESC, created_at DESC LIMIT 1;
  SELECT * INTO v_cl FROM public.onboarding_checklists WHERE employee_id = v_emp.id AND title ILIKE 'offboarding%' ORDER BY created_at DESC LIMIT 1;
  SELECT (o.n - 1)::int INTO v_written_idx FROM jsonb_array_elements(COALESCE(v_cl.items, '[]'::jsonb)) WITH ORDINALITY o(item, n) WHERE o.item ->> 'key' = 'written_notice' LIMIT 1;
  SELECT (o.n - 1)::int INTO v_cert_idx FROM jsonb_array_elements(COALESCE(v_cl.items, '[]'::jsonb)) WITH ORDINALITY o(item, n) WHERE o.item ->> 'key' = 'certificate' LIMIT 1;

  -- ── The decision ─────────────────────────────────────────────────────────
  v_steps := v_steps || jsonb_build_object(
    'id', 'decision', 'phase', 'notice', 'required', true,
    'label', 'Who ends it, and the last day',
    'why', 'Two facts decide everything after: who ended the employment and on which day. They set the notice, the final salary and what you owe afterwards.',
    'law', CASE WHEN v_se THEN 'LAS 11 § — the employee gives one month''s notice; the employer 1 to 6 months by length of employment (1 under two years, then one more month per two years, 6 from ten years). A longer period in the contract wins.' END,
    'state', CASE WHEN v_t IS NOT NULL AND v_emp.end_date IS NOT NULL THEN 'done' ELSE 'todo' END,
    'due', NULL,
    'detail', CASE WHEN v_t IS NULL THEN 'Not recorded yet — use End employment.'
                   ELSE CASE v_init WHEN 'employee' THEN 'They resigned' WHEN 'employer_personal' THEN 'You ended it for personal reasons'
                                    WHEN 'employer_redundancy' THEN 'You ended it for redundancy (arbetsbrist)' WHEN 'probation' THEN 'You ended the probation'
                                    WHEN 'fixed_term_end' THEN 'The fixed term ends' ELSE 'Ended by agreement' END
                        || ' on ' || (v_t ->> 'notice_date') || '; last day ' || v_emp.end_date || '. ' || COALESCE(v_t ->> 'rule', '') || '.' END,
    'fix', CASE WHEN v_known AND v_t IS NULL THEN jsonb_build_object('skill', 'end_employment', 'args', jsonb_build_object(
      'p_employee_id', v_emp.id, 'p_initiator', '<employee | employer_personal | employer_redundancy | probation | fixed_term_end | mutual>', 'p_dry_run', true)) END,
    'open', 'dialog:end_employment');

  -- ── Grounds (only when the employer ends it) ─────────────────────────────
  v_n := 0;
  BEGIN
    SELECT COUNT(*) INTO v_n FROM public.disciplinary_actions
     WHERE employee_id = v_emp.id AND action_type IN ('written_warning', 'final_warning') AND status <> 'withdrawn';
  EXCEPTION WHEN undefined_table THEN v_n := 0; END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'grounds', 'phase', 'notice', 'required', false,
    'label', 'The grounds, when you end it',
    'why', 'When the employer ends an employment it must be able to show why — and the way there matters as much as the reason.',
    'law', CASE WHEN NOT v_se THEN NULL
                WHEN v_init = 'employer_redundancy' THEN 'LAS 7 § — redundancy (arbetsbrist) is objective grounds. With a collective agreement, negotiate with the union before deciding (MBL 11 §). The order of priority follows length of employment (LAS 22 §); the employer may exempt three people.'
                WHEN v_init = 'probation' THEN 'LAS 6 § — a probation can be ended without grounds; tell the person at least two weeks before (LAS 31 §), and their union if they are a member.'
                ELSE 'LAS 7 § — the employer needs objective grounds (saklig grund). For personal reasons: a documented warning and a real chance to improve first, and tell the person at least two weeks before the notice (LAS 30 §).' END,
    'state', CASE WHEN v_init IS NULL THEN 'info' WHEN NOT v_employer THEN 'done' ELSE 'info' END,
    'due', NULL,
    'detail', CASE WHEN v_init IS NULL THEN 'Only when you, the employer, end it.'
                   WHEN NOT v_employer THEN 'No grounds needed — ' || CASE v_init WHEN 'employee' THEN 'they resigned.' WHEN 'mutual' THEN 'you agreed.' ELSE 'the term ends.' END
                   WHEN v_init = 'employer_personal' THEN v_n || ' written warning' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' on record (HR → Disciplinary).' || CASE WHEN v_n = 0 THEN ' Without one, talk to a lawyer or your employers'' organisation before the notice.' ELSE '' END
                   WHEN v_init = 'employer_redundancy' THEN 'Write down why the work is gone and how the order of priority was applied.'
                   ELSE 'The two weeks are counted to the last day.' END,
    'fix', NULL, 'open', CASE WHEN v_init = 'employer_personal' THEN 'disciplinary' END);

  -- ── The notice in writing (a person ticks it) ────────────────────────────
  v_state := CASE WHEN v_written_idx IS NOT NULL AND COALESCE((v_cl.items -> v_written_idx ->> 'done')::boolean, false) THEN 'done'
                  WHEN v_t IS NULL THEN 'info' ELSE 'todo' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'written_notice', 'phase', 'notice', 'required', v_employer,
    'label', CASE WHEN v_init = 'employee' THEN 'Their resignation in writing' ELSE 'The notice in writing' END,
    'why', 'A date and a decision on paper settle what a conversation cannot: when the notice started, and what was said.',
    'law', CASE WHEN v_se AND v_employer THEN 'LAS 8 § — the employer''s notice is in writing and says how to challenge it, and whether the person has a priority right to re-employment. Hand it over in person if you can.' END,
    'state', v_state, 'due', (v_t ->> 'notice_date')::date,
    'detail', CASE WHEN v_state = 'done' THEN 'Confirmed on the offboarding checklist.'
                   WHEN v_t IS NULL THEN 'Comes with the decision.'
                   WHEN v_init = 'employee' THEN 'Ask for the resignation in writing — by e-mail is fine — and keep it. Tick it here when you have it.'
                   ELSE 'Hand it over in writing, keep a copy, then tick it here.' END,
    'fix', CASE WHEN v_state = 'todo' AND v_cl.id IS NOT NULL AND v_written_idx IS NOT NULL THEN jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object(
      'action', 'update', 'id', v_cl.id, 'items', jsonb_set(v_cl.items, ARRAY[v_written_idx::text, 'done'], 'true'::jsonb))) END,
    'open', NULL);

  -- ── The notice is long enough ────────────────────────────────────────────
  v_state := CASE WHEN v_t IS NULL THEN 'info'
                  WHEN COALESCE((v_t ->> 'shortened')::boolean, false) THEN 'todo' ELSE 'done' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'notice_period', 'phase', 'notice', 'required', true,
    'label', 'A notice period the law allows',
    'why', 'Too short a notice is the most common way a correct decision still costs money: the person is owed salary for the days that were cut.',
    'law', CASE WHEN v_se THEN 'LAS 11 § — the notice runs from the day it is given. A shorter notice only by written agreement.' END,
    'state', v_state, 'due', NULL,
    'detail', CASE WHEN v_t IS NULL THEN 'Checked when the decision is recorded.'
                   WHEN v_state = 'todo' THEN 'Last day ' || v_emp.end_date || ' is before ' || (v_t ->> 'minimum_last_day') || ' — make sure a shorter notice was agreed in writing.'
                   ELSE 'Last day ' || v_emp.end_date || ' — the earliest allowed was ' || (v_t ->> 'minimum_last_day') || '.' END,
    'fix', NULL, 'open', NULL);

  -- ── Vacation left ────────────────────────────────────────────────────────
  v_year := EXTRACT(YEAR FROM COALESCE(v_emp.end_date, v_today))::int;
  SELECT COALESCE(la.allocated_days, 0) + COALESCE(la.carried_over_days, 0)
         - COALESCE((SELECT SUM(days) FROM public.leave_requests lr
                      WHERE lr.employee_id = v_emp.id AND lr.leave_type = 'vacation' AND lr.status = 'approved'
                        AND EXTRACT(YEAR FROM lr.start_date)::int = v_year), 0)
    INTO v_left FROM public.leave_allocations la
   WHERE la.employee_id = v_emp.id AND la.leave_type = 'vacation' AND la.year = v_year;
  BEGIN
    SELECT EXISTS (SELECT 1 FROM public.payroll_lines l JOIN public.payroll_runs r ON r.id = l.run_id
                    WHERE l.employee_id = v_emp.id AND r.status = 'paid'
                      AND v_emp.end_date IS NOT NULL AND r.period_date >= date_trunc('month', v_emp.end_date)::date) INTO v_paid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_paid := false; END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'vacation', 'phase', 'last_weeks', 'required', true,
    'label', 'Vacation days left',
    'why', 'Days not taken are not lost for the person: they are taken before the last day, or paid out with the final salary.',
    'law', CASE WHEN v_se THEN 'Semesterlagen 28 § — paid vacation days not taken when the employment ends are paid out as vacation pay (semesterersättning).' END,
    'state', CASE WHEN v_paid OR COALESCE(v_left, 0) <= 0 THEN 'done' WHEN v_t IS NULL THEN 'info' ELSE 'todo' END,
    'due', v_emp.end_date,
    'detail', CASE WHEN v_left IS NULL THEN 'No vacation allocation for ' || v_year || ' — nothing recorded to settle.'
                   WHEN v_left <= 0 THEN 'No days left.'
                   WHEN v_paid THEN v_left || ' days were left — the final salary is paid; check it carried the vacation pay.'
                   ELSE v_left || ' day' || CASE WHEN v_left = 1 THEN '' ELSE 's' END || ' left in ' || v_year || ': plan them before the last day, or pay them out in the final salary.' END,
    'fix', NULL, 'open', 'balances');

  -- ── Handover, returns, exit talk (the checklist) ─────────────────────────
  SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT COALESCE((i ->> 'done')::boolean, false))
    INTO v_total, v_open
    FROM jsonb_array_elements(COALESCE(v_cl.items, '[]'::jsonb)) i
   WHERE COALESCE(i ->> 'key', '') NOT IN ('written_notice', 'certificate');
  v_state := CASE WHEN v_cl.id IS NOT NULL AND v_open = 0 THEN 'done' WHEN v_t IS NULL THEN 'info' ELSE 'todo' END;
  IF v_state = 'todo' AND v_emp.end_date IS NOT NULL AND v_today > v_emp.end_date THEN v_state := 'overdue'; END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'handover', 'phase', 'last_weeks', 'required', true,
    'label', 'Handover, things returned, an exit talk',
    'why', 'The work and the customers stay when the person goes — and an honest exit talk is the cheapest feedback you will ever get.',
    'law', NULL,
    'state', v_state, 'due', v_emp.end_date,
    'detail', CASE WHEN v_cl.id IS NULL THEN 'The offboarding checklist comes with the decision.'
                   ELSE (v_total - v_open) || ' of ' || v_total || ' done — tick them on the employee''s checklist (HR → Employees).' END,
    'fix', CASE WHEN v_known AND v_cl.id IS NULL AND v_t IS NOT NULL THEN jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object(
      'action', 'create', 'employee_id', v_emp.id, 'title', 'Offboarding', 'items', jsonb_build_array(
        jsonb_build_object('key', 'handover', 'title', 'Ongoing work and customers handed over', 'done', false),
        jsonb_build_object('key', 'returned', 'title', 'Laptop, phone, keys and cards returned', 'done', false),
        jsonb_build_object('key', 'exit_talk', 'title', 'Exit talk — what worked, what did not', 'done', false)))) END,
    'checklist', CASE WHEN v_cl.id IS NOT NULL THEN jsonb_build_object('id', v_cl.id, 'items', v_cl.items, 'skip_keys', jsonb_build_array('written_notice', 'certificate')) END,
    'open', 'employees');

  -- ── Access ───────────────────────────────────────────────────────────────
  IF v_emp.user_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_roles FROM public.user_roles WHERE user_id = v_emp.user_id;
  END IF;
  v_state := CASE WHEN v_emp.user_id IS NULL OR v_roles = 0 THEN 'done' WHEN v_t IS NULL THEN 'info'
                  WHEN v_emp.end_date IS NOT NULL AND v_today > v_emp.end_date THEN 'overdue' ELSE 'todo' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'access', 'phase', 'last_weeks', 'required', true,
    'label', 'Access removed on the last day',
    'why', 'Until their roles are removed, a person who has left can still sign in and see customers, salaries and the books.',
    'law', NULL,
    'state', v_state, 'due', v_emp.end_date,
    'detail', CASE WHEN v_emp.user_id IS NULL THEN 'No login to remove.'
                   WHEN v_roles = 0 THEN 'No roles left on their login.'
                   ELSE v_roles || ' role' || CASE WHEN v_roles = 1 THEN '' ELSE 's' END || ' on their login — remove them under Users on the last day. A person does this, not an agent.' END,
    'fix', NULL, 'open', 'route:/admin/users');

  -- ── The final salary ─────────────────────────────────────────────────────
  v_due := CASE WHEN v_emp.end_date IS NOT NULL THEN (date_trunc('month', v_emp.end_date) + INTERVAL '1 month' - INTERVAL '1 day')::date END;
  v_state := CASE WHEN v_paid THEN 'done' WHEN v_emp.end_date IS NULL OR v_emp.end_date > v_today THEN 'info'
                  WHEN v_today > v_due + 10 THEN 'overdue' ELSE 'todo' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'final_salary', 'phase', 'after', 'required', true,
    'label', 'The final salary, with vacation pay',
    'why', 'The last payslip settles everything: salary to the last day, vacation pay, and any advance still owed.',
    'law', CASE WHEN v_se THEN 'Reported to Skatteverket like any salary (AGI) by the 12th of the month after payday — the 17th in January and August.' END,
    'state', v_state, 'due', v_due,
    'detail', CASE WHEN v_paid THEN 'Paid in a run for the last month.'
                   WHEN v_emp.end_date IS NULL THEN 'Comes after the last day.'
                   ELSE 'Include them in the payroll run for ' || to_char(v_emp.end_date, 'YYYY-MM') || ' — the run stops paying after their last day.' END,
    'fix', CASE WHEN v_known AND NOT v_paid AND v_emp.end_date IS NOT NULL THEN jsonb_build_object('skill', 'create_payroll_run', 'args', jsonb_build_object('period_date', v_emp.end_date)) END,
    'open', 'payroll');

  -- ── The certificate (a person ticks it) ──────────────────────────────────
  v_state := CASE WHEN v_cert_idx IS NOT NULL AND COALESCE((v_cl.items -> v_cert_idx ->> 'done')::boolean, false) THEN 'done' ELSE 'info' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'certificate', 'phase', 'after', 'required', false,
    'label', 'An employer''s certificate, when they ask',
    'why', 'The unemployment fund needs it to pay them, and a work certificate helps with the next job. Delays here hit the person directly.',
    'law', CASE WHEN v_se THEN 'Lag om arbetslöshetsförsäkring 47 § — the employer gives an employer''s certificate (arbetsgivarintyg) on request.' END,
    'state', v_state, 'due', NULL,
    'detail', CASE WHEN v_state = 'done' THEN 'Given.' ELSE 'Give it when they ask, then tick it.' END,
    'fix', CASE WHEN v_state <> 'done' AND v_cl.id IS NOT NULL AND v_cert_idx IS NOT NULL THEN jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object(
      'action', 'update', 'id', v_cl.id, 'items', jsonb_set(v_cl.items, ARRAY[v_cert_idx::text, 'done'], 'true'::jsonb))) END,
    'open', NULL);

  -- ── The priority right (redundancy only) ─────────────────────────────────
  IF v_init = 'employer_redundancy' THEN
    v_steps := v_steps || jsonb_build_object(
      'id', 'priority_right', 'phase', 'after', 'required', false,
      'label', 'Their right to come back',
      'why', 'If the work returns, they come first.',
      'law', CASE WHEN v_se THEN 'LAS 25 § — after a redundancy, someone employed more than 12 months in the last three years has a priority right to re-employment for nine months after the last day.' END,
      'state', 'info', 'due', CASE WHEN v_emp.end_date IS NOT NULL THEN (v_emp.end_date + INTERVAL '9 months')::date END,
      'detail', 'If you hire for the same kind of work before ' || COALESCE(((v_emp.end_date + INTERVAL '9 months')::date)::text, 'nine months after the last day') || ', offer it to them first.',
      'fix', NULL, 'open', NULL);
  END IF;

  -- ── Close the record ─────────────────────────────────────────────────────
  v_state := CASE WHEN v_emp.status = 'terminated' THEN 'done'
                  WHEN v_emp.end_date IS NULL OR v_emp.end_date >= v_today THEN 'info' ELSE 'todo' END;
  v_steps := v_steps || jsonb_build_object(
    'id', 'close_record', 'phase', 'after', 'required', true,
    'label', 'Close the employee record',
    'why', 'So they leave the headcount, the leave calendar and future payroll runs — the record itself is kept.',
    'law', CASE WHEN v_se THEN 'Salary records are part of the accounts and kept for seven years (bokföringslagen 7 kap.) — close the record, never delete it.' END,
    'state', v_state, 'due', CASE WHEN v_emp.end_date IS NOT NULL THEN v_emp.end_date + 1 END,
    'detail', CASE WHEN v_state = 'done' THEN 'Closed.' WHEN v_emp.end_date IS NULL THEN 'After the last day.' WHEN v_state = 'info' THEN 'After ' || v_emp.end_date || '.' ELSE 'The last day has passed — close it.' END,
    'fix', CASE WHEN v_state = 'todo' THEN jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object('action', 'update', 'employee_id', v_emp.id, 'status', 'terminated')) END,
    'open', 'employees');

  RETURN v_steps;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public._hr_offboarding_steps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._hr_offboarding_steps(uuid) TO service_role;

-- ── 3. The onboarding steps, without the offboarding checklist ─────────────
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
    FROM public.onboarding_checklists c WHERE c.employee_id = v_emp.id AND c.title NOT ILIKE 'offboarding%';
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
                ELSE jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object('action', 'list', 'employee_id', v_emp.id)) END,
    'checklist', CASE WHEN v_checklist_id IS NOT NULL THEN (SELECT jsonb_build_object('id', c.id, 'items', c.items) FROM public.onboarding_checklists c WHERE c.id = v_checklist_id) END,
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

-- ── 4. The guide answers both processes ────────────────────────────────────
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
  IF v_process NOT IN ('onboarding', 'offboarding') THEN
    RAISE EXCEPTION 'Unknown process "%". Known: onboarding, offboarding', p_process USING ERRCODE = '22023';
  END IF;

  IF p_employee_id IS NOT NULL THEN
    SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
    IF v_emp.id IS NULL THEN RAISE EXCEPTION 'Employee % not found', p_employee_id USING ERRCODE = 'P0002'; END IF;
    v_steps := CASE v_process WHEN 'offboarding' THEN public._hr_offboarding_steps(v_emp.id) ELSE public._hr_onboarding_steps(v_emp.id) END;
    SELECT s INTO v_next FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' IN ('overdue', 'todo') AND (s ->> 'required')::boolean LIMIT 1;
    RETURN jsonb_build_object(
      'process', v_process, 'title', CASE v_process WHEN 'offboarding' THEN 'When someone leaves' ELSE 'Welcome a new employee' END,
      'employee', jsonb_build_object('id', v_emp.id, 'name', v_emp.name, 'title', v_emp.title, 'start_date', v_emp.start_date, 'end_date', v_emp.end_date, 'status', v_emp.status, 'termination', v_emp.termination),
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
    SELECT e.id, e.name, e.title, e.start_date, e.end_date FROM public.employees e
     WHERE CASE v_process
             WHEN 'offboarding' THEN (e.termination IS NOT NULL OR e.end_date IS NOT NULL) AND COALESCE(e.end_date, v_today) >= v_today - 120
             ELSE e.status <> 'terminated' AND e.termination IS NULL AND (e.start_date IS NULL OR e.start_date >= v_today - 190) END
     ORDER BY CASE WHEN v_process = 'offboarding' THEN e.end_date ELSE e.start_date END NULLS LAST, e.name
     LIMIT 50
  LOOP
    v_steps := CASE v_process WHEN 'offboarding' THEN public._hr_offboarding_steps(r.id) ELSE public._hr_onboarding_steps(r.id) END;
    SELECT s INTO v_next FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' IN ('overdue', 'todo') AND (s ->> 'required')::boolean LIMIT 1;
    v_people := v_people || jsonb_build_object(
      'employee_id', r.id, 'name', r.name, 'title', r.title, 'start_date', r.start_date, 'end_date', r.end_date,
      'required_total', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE (s ->> 'required')::boolean),
      'required_done', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE (s ->> 'required')::boolean AND s ->> 'state' = 'done'),
      'overdue', (SELECT COUNT(*) FROM jsonb_array_elements(v_steps) s WHERE s ->> 'state' = 'overdue'),
      'complete', v_next IS NULL,
      'next', CASE WHEN v_next IS NULL THEN NULL ELSE jsonb_build_object('id', v_next ->> 'id', 'label', v_next ->> 'label', 'state', v_next ->> 'state', 'due', v_next -> 'due') END);
  END LOOP;

  RETURN jsonb_build_object(
    'process', v_process, 'title', CASE v_process WHEN 'offboarding' THEN 'When someone leaves' ELSE 'Welcome a new employee' END,
    'purpose', CASE v_process WHEN 'offboarding' THEN 'From the decision to the closed record: who ends it and when, the notice the law allows, vacation left, handover and access, the final salary and what you owe after — with the rule behind each step.' ELSE 'From signed offer to the end of probation: the contract, pay, vacation, the introduction and the first salary — in order, with the rule behind each step.' END,
    'country', public.business_country(),
    'people', v_people,
    'outline', (SELECT jsonb_agg(jsonb_build_object('id', s ->> 'id', 'phase', s ->> 'phase', 'label', s ->> 'label', 'why', s ->> 'why', 'law', s -> 'law', 'required', s -> 'required'))
                  FROM jsonb_array_elements(CASE v_process WHEN 'offboarding' THEN public._hr_offboarding_steps(NULL) ELSE public._hr_onboarding_steps(NULL) END) s),
    'next', jsonb_build_object('skill', 'hr_process_guide', 'args', jsonb_build_object('p_process', v_process, 'p_employee_id', '<employee_id>')),
    'generated_at', now());
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.hr_process_guide(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_process_guide(text, uuid) TO authenticated, service_role;


-- ── Bevisas där den körs ───────────────────────────────────────────────────
-- An employer's notice after three years needs two months; a shorter last day
-- is refused; the decision opens the offboarding guide with its checklist;
-- ticking the written notice closes that step; the onboarding guide ignores
-- the offboarding checklist. Rolled back.
DO $$
DECLARE v_emp uuid; v_out jsonb; v_g jsonb; v_cl uuid; v_items jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.employees (name, email, title, start_date, status)
    VALUES ('Proof Leaver', 'leaver@example.invalid', 'Fiber technician', public.platform_today() - 3 * 365 - 10, 'active')
    RETURNING id INTO v_emp;
    BEGIN
      PERFORM public.end_employment(v_emp, 'employer_redundancy', public.platform_today() + 30);
      RAISE EXCEPTION 'proof: a one-month notice after three years was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN
      IF SQLERRM NOT LIKE '%shorter than the notice allows%' THEN RAISE; END IF;
    END;
    v_out := public.end_employment(v_emp, 'employer_redundancy', NULL, NULL, 'Proof: the work is gone');
    IF (v_out -> 'termination' ->> 'last_day')::date < (public.platform_today() + INTERVAL '2 months')::date THEN
      RAISE EXCEPTION 'proof: the default last day should be two months out, got %', v_out -> 'termination';
    END IF;
    v_cl := (v_out ->> 'offboarding_checklist_id')::uuid;
    IF v_cl IS NULL THEN RAISE EXCEPTION 'proof: no offboarding checklist'; END IF;
    v_g := public.hr_process_guide('offboarding', v_emp);
    IF (SELECT s ->> 'state' FROM jsonb_array_elements(v_g -> 'steps') s WHERE s ->> 'id' = 'decision') <> 'done' THEN
      RAISE EXCEPTION 'proof: the decision step should be done, got %', v_g -> 'steps';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_g -> 'steps') s WHERE s ->> 'id' = 'priority_right') THEN
      RAISE EXCEPTION 'proof: a redundancy carries the priority right';
    END IF;
    v_items := (SELECT s -> 'fix' -> 'args' -> 'items' FROM jsonb_array_elements(v_g -> 'steps') s WHERE s ->> 'id' = 'written_notice');
    UPDATE public.onboarding_checklists SET items = v_items WHERE id = v_cl;
    v_g := public.hr_process_guide('offboarding', v_emp);
    IF (SELECT s ->> 'state' FROM jsonb_array_elements(v_g -> 'steps') s WHERE s ->> 'id' = 'written_notice') <> 'done' THEN
      RAISE EXCEPTION 'proof: ticking the written notice should close the step';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.hr_process_guide('offboarding', NULL) -> 'people') p WHERE (p ->> 'employee_id')::uuid = v_emp) THEN
      RAISE EXCEPTION 'proof: the leaver should be in the offboarding list';
    END IF;
    IF (SELECT s ->> 'detail' FROM jsonb_array_elements(public.hr_process_guide('onboarding', v_emp) -> 'steps') s WHERE s ->> 'id' = 'introduction') NOT LIKE 'No plan yet%' THEN
      RAISE EXCEPTION 'proof: the onboarding guide should not count the offboarding checklist';
    END IF;
    RAISE NOTICE 'hr offboarding proof ok';
    RAISE EXCEPTION '__hr_offboarding_proof_ok__';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> '__hr_offboarding_proof_ok__' THEN RAISE; END IF;
  END;
END $$;
