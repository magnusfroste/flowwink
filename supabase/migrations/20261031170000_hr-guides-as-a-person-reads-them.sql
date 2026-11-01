-- ─────────────────────────────────────────────────────────────────────────────
-- The HR guides, as a person reads them — fixes from the first walk in a browser
-- ─────────────────────────────────────────────────────────────────────────────
-- The guides were proven in SQL; walking them on a fresh local stack showed
-- three things no proof caught:
--   * "25.00 days allocated" — numeric(…, 2) printed as stored (trim_scale).
--   * Offboarding called vacation DONE when nothing was recorded: three years
--     of employment and "no allocation" is a question, not an answer — it is
--     now a step to do, saying what to find out.
--   * The handover step sent the person to HR → Employees to tick items the
--     step itself shows as checkboxes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._hr_offboarding_steps(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  v_today date := public.platform_today();
  v_country text := COALESCE(public.business_country(), '');
  v_rules jsonb := public.hr_rules_resolved(public.business_country());
  v_laws jsonb := COALESCE(public.hr_rules_resolved(public.business_country()) -> 'laws', '{}'::jsonb);
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
    'law', v_laws ->> 'offboarding.decision',
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
    'law', v_laws ->> ('offboarding.grounds_' || CASE v_init WHEN 'employer_redundancy' THEN 'redundancy' WHEN 'probation' THEN 'probation' ELSE 'personal' END),
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
    'law', CASE WHEN v_employer OR v_init IS NULL THEN v_laws ->> 'offboarding.written_notice' END,
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
    'law', v_laws ->> 'offboarding.notice_period',
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
    'law', v_laws ->> 'offboarding.vacation',
    'state', CASE WHEN v_paid OR (v_left IS NOT NULL AND v_left <= 0) THEN 'done' WHEN v_t IS NULL THEN 'info' ELSE 'todo' END,
    'due', v_emp.end_date,
    'detail', CASE WHEN v_left IS NULL THEN 'No vacation is recorded for ' || v_year || ' — find out how many days they have left, then let them take them or pay them out in the final salary.'
                   WHEN v_left <= 0 THEN 'No days left.'
                   WHEN v_paid THEN trim_scale(v_left) || ' days were left — the final salary is paid; check it carried the vacation pay.'
                   ELSE trim_scale(v_left) || ' day' || CASE WHEN v_left = 1 THEN '' ELSE 's' END || ' left in ' || v_year || ': plan them before the last day, or pay them out in the final salary.' END,
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
                   ELSE (v_total - v_open) || ' of ' || v_total || ' done — tick them here as they happen.' END,
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
    'law', v_laws ->> 'offboarding.final_salary',
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
    'law', v_laws ->> 'offboarding.certificate',
    'state', v_state, 'due', NULL,
    'detail', CASE WHEN v_state = 'done' THEN 'Given.' ELSE 'Give it when they ask, then tick it.' END,
    'fix', CASE WHEN v_state <> 'done' AND v_cl.id IS NOT NULL AND v_cert_idx IS NOT NULL THEN jsonb_build_object('skill', 'onboarding_checklist', 'args', jsonb_build_object(
      'action', 'update', 'id', v_cl.id, 'items', jsonb_set(v_cl.items, ARRAY[v_cert_idx::text, 'done'], 'true'::jsonb))) END,
    'open', NULL);

  -- ── The priority right (redundancy only) ─────────────────────────────────
  IF v_init = 'employer_redundancy' AND v_laws ? 'offboarding.priority_right' THEN
    v_steps := v_steps || jsonb_build_object(
      'id', 'priority_right', 'phase', 'after', 'required', false,
      'label', 'Their right to come back',
      'why', 'If the work returns, they come first.',
      'law', v_laws ->> 'offboarding.priority_right',
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
    'law', v_laws ->> 'offboarding.close_record',
    'state', v_state, 'due', CASE WHEN v_emp.end_date IS NOT NULL THEN v_emp.end_date + 1 END,
    'detail', CASE WHEN v_state = 'done' THEN 'Closed.' WHEN v_emp.end_date IS NULL THEN 'After the last day.' WHEN v_state = 'info' THEN 'After ' || v_emp.end_date || '.' ELSE 'The last day has passed — close it.' END,
    'fix', CASE WHEN v_state = 'todo' THEN jsonb_build_object('skill', 'manage_employee', 'args', jsonb_build_object('action', 'update', 'employee_id', v_emp.id, 'status', 'terminated')) END,
    'open', 'employees');

  RETURN v_steps;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public._hr_offboarding_steps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._hr_offboarding_steps(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._hr_onboarding_steps(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  v_today date := public.platform_today();
  v_country text := COALESCE(public.business_country(), '');
  v_rules jsonb := public.hr_rules_resolved(public.business_country());
  v_laws jsonb := COALESCE(public.hr_rules_resolved(public.business_country()) -> 'laws', '{}'::jsonb);
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
    'law', v_laws ->> 'onboarding.contract',
    'state', v_state, 'due', v_due, 'detail', v_detail, 'fix', v_fix, 'open', 'contracts');

  -- ── 3. Pay details ───────────────────────────────────────────────────────
  v_missing := ARRAY[]::text[];
  IF COALESCE(v_emp.monthly_salary_cents, 0) <= 0 THEN v_missing := array_append(v_missing, 'monthly salary'); END IF;
  IF v_emp.personal_number IS NULL OR btrim(v_emp.personal_number) = '' THEN v_missing := array_append(v_missing, 'personal identity number'); END IF;
  v_detail := CASE WHEN cardinality(v_missing) = 0 THEN 'Salary and personal identity number recorded.' ELSE 'Missing: ' || array_to_string(v_missing, ', ') || '.' END;
  IF v_laws ? 'onboarding.tax_table' AND v_known AND COALESCE(v_emp.tax_rate_pct, 30) = 30 THEN
    v_detail := v_detail || ' ' || (v_laws ->> 'onboarding.tax_table');
  END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'pay_details', 'phase', 'prepare', 'required', true,
    'label', 'Salary, personal identity number and tax',
    'why', 'Payroll pays what is on the record: without a salary the run pays nothing, and without the identity number the salary cannot be reported.',
    'law', v_laws ->> 'onboarding.pay_details',
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
  IF NOT v_any_payroll AND v_laws ? 'onboarding.employer_registration' THEN
    v_steps := v_steps || jsonb_build_object(
      'id', 'employer_registration', 'phase', 'prepare', 'required', false,
      'label', 'Registered as an employer',
      'why', 'Your first employee: before the first salary is paid the company must be registered to pay employer contributions and withhold tax.',
      'law', v_laws ->> 'onboarding.employer_registration',
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
    EXCEPTION WHEN OTHERS THEN v_vac_days := NULL; END;
    v_vac_days := COALESCE(NULLIF(v_vac_days, 0), (v_rules ->> 'vacation_days')::int);
  END IF;
  v_steps := v_steps || jsonb_build_object(
    'id', 'vacation', 'phase', 'first_week', 'required', true,
    'label', 'Vacation days for ' || v_year,
    'why', 'So the person, you and payroll see the same number from the start — and leave requests have something to draw from.',
    'law', v_laws ->> 'onboarding.vacation',
    'state', CASE WHEN v_alloc_days IS NOT NULL THEN 'done' ELSE 'todo' END,
    'due', CASE WHEN v_emp.start_date IS NOT NULL THEN v_emp.start_date + 7 END,
    'detail', CASE WHEN v_alloc_days IS NOT NULL THEN trim_scale(v_alloc_days) || ' days allocated for ' || v_year || '.' WHEN v_vac_days IS NULL THEN 'No allocation for ' || v_year || ' yet, and no vacation policy or employment rules say how many days — decide it and allocate.' ELSE 'No allocation for ' || v_year || ' yet — your rules give ' || v_vac_days || ' days.' END,
    'fix', CASE WHEN v_known AND v_alloc_days IS NULL THEN jsonb_build_object('skill', 'manage_leave_allocation', 'args', jsonb_build_object(
      'action', 'create', 'employee_id', v_emp.id, 'leave_type', 'vacation', 'year', v_year, 'allocated_days', CASE WHEN v_vac_days IS NULL THEN to_jsonb('<days>'::text) ELSE to_jsonb(v_vac_days) END)) END,
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
    'law', v_laws ->> 'onboarding.introduction',
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
  v_due := CASE WHEN v_contract.probation_end_date IS NOT NULL THEN v_contract.probation_end_date - COALESCE((v_rules ->> 'probation_end_notice_days')::int, 0) END;
  v_probation_months := CASE WHEN v_contract.probation_end_date IS NOT NULL AND v_contract.start_date IS NOT NULL
                             THEN (v_contract.probation_end_date - v_contract.start_date) / 30.4 END;
  IF v_contract.id IS NULL THEN
    v_state := 'info'; v_detail := 'Comes with the contract: probation is set there.';
  ELSIF v_contract.probation_end_date IS NULL THEN
    v_state := 'done'; v_detail := 'No probation on the contract — the employment is permanent from the first day.';
  ELSIF (v_rules ->> 'probation_max_months') IS NOT NULL AND v_probation_months > (v_rules ->> 'probation_max_months')::numeric + 0.1 THEN
    v_state := 'todo'; v_detail := 'Probation ends ' || v_contract.probation_end_date || ' — longer than the ' || (v_rules ->> 'probation_max_months') || ' months your employment rules allow. Shorten it on the contract.';
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
    'law', v_laws ->> 'onboarding.probation',
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
    'law', v_laws ->> 'onboarding.first_salary',
    'state', v_state, 'due', v_due,
    'detail', CASE WHEN v_paid_period IS NOT NULL THEN 'First paid in the run for ' || to_char(v_paid_period, 'YYYY-MM') || '.' || CASE WHEN v_country = 'SE' THEN ' Its AGI was due ' || public._se_agency_day((date_trunc('month', v_paid_period) + INTERVAL '1 month')::date, 12) || '.' ELSE '' END
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
    'law', v_laws ->> 'onboarding.benefits',
    'state', CASE WHEN v_n > 0 THEN 'done' ELSE 'todo' END, 'due', NULL,
    'detail', CASE WHEN v_n > 0 THEN v_n || ' benefit' || CASE WHEN v_n = 1 THEN '' ELSE 's' END || ' active.' ELSE 'None recorded.' END,
    'fix', CASE WHEN v_known AND v_n = 0 THEN jsonb_build_object('skill', 'manage_benefits', 'args', jsonb_build_object('p_action', 'enroll', 'p_employee_id', v_emp.id, 'p_plan_id', '<plan id — list_plans>')) END,
    'open', 'compensation');

  RETURN v_steps;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public._hr_onboarding_steps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._hr_onboarding_steps(uuid) TO service_role;

-- ── Bevisas där den körs ───────────────────────────────────────────────────
DO $$
DECLARE v_emp uuid; v_steps jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.employees (name, email, title, start_date, status)
    VALUES ('Proof Polish', 'polish@example.invalid', 'Technician', public.platform_today() - 1000, 'active') RETURNING id INTO v_emp;
    PERFORM public.end_employment(v_emp, 'employee');
    v_steps := public._hr_offboarding_steps(v_emp);
    IF (SELECT s ->> 'state' FROM jsonb_array_elements(v_steps) s WHERE s ->> 'id' = 'vacation') <> 'todo' THEN
      RAISE EXCEPTION 'proof: unrecorded vacation should be a step to do, got %', v_steps;
    END IF;
    INSERT INTO public.leave_allocations (employee_id, leave_type, year, allocated_days) VALUES (v_emp, 'vacation', EXTRACT(YEAR FROM public.platform_today())::int, 25);
    IF (SELECT s ->> 'detail' FROM jsonb_array_elements(public._hr_onboarding_steps(v_emp)) s WHERE s ->> 'id' = 'vacation') NOT LIKE '25 days allocated%' THEN
      RAISE EXCEPTION 'proof: days should read 25, not 25.00';
    END IF;
    RAISE EXCEPTION '__hr_polish_ok__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__hr_polish_ok__' THEN RAISE; END IF;
  END;
END $$;
