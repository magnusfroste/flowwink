import type { Scenario, ScenarioModule } from '../lib';

/**
 * Hire-to-Retire: a candidate applies, is offered 42 000 kr/month and accepts,
 * the hire bridge turns the application into employee + draft contract, leave
 * is taken against an allocation, one payroll month is run (two sick days,
 * pension) and paid, and the employee leaves.
 * The end state that must hold: one employee per application, the salary the
 * offer promised is the salary payroll pays, leave never exceeds the
 * allocation, run totals = Σ lines, both payroll entries balance with the
 * amounts computed by hand, and nobody who has left is paid.
 */
const SALARY = 4_200_000; // 42 000 kr → 2 000 kr per day on a 21-day month

async function run(s: Scenario): Promise<void> {
  // ── Recruit ───────────────────────────────────────────────────────────────
  const job = await s.must('a job posting is created', 'manage_job_posting', {
    action: 'create', title: `Battery engineer ${s.tag}`, department: 'Engineering', employment_type: 'full_time',
    salary_min_cents: 4_000_000, salary_max_cents: 4_600_000, currency: 'SEK',
  });
  const jobId = s.idOf(job, 'job_posting');
  await s.must('the posting is published', 'manage_job_posting', { action: 'publish', job_posting_id: jobId });

  const email = `kandidat-${s.tag}@example.test`;
  const app = await s.must('a candidate applies', 'manage_application', {
    action: 'create', job_posting_id: jobId, candidate_name: `Kandidat ${s.tag}`, candidate_email: email, source: 'process battery',
  });
  const appId = s.idOf(app, 'application');
  s.skip('AI screening scores the candidate (score_candidate)', 'needs an AI provider');

  await s.mustRefuse('a stage the pipeline does not have is refused', 'move_application_stage',
    { application_id: appId, to_stage: 'onboarded' }, /invalid stage/i);
  await s.must('the candidate is screened', 'move_application_stage', { application_id: appId, to_stage: 'screened' });
  await s.must('… interviewed', 'move_application_stage', { application_id: appId, to_stage: 'interviewed', comment: 'strong' });
  const log = await s.one<{ n: string }>('select count(*) as n from application_stages where application_id = $1', [appId]);
  s.check('every stage change is on the application\'s log', Number(log?.n) >= 2, `got ${log?.n} rows`);

  const offer = await s.must('an offer of 42 000 kr is generated', 'manage_job_offer', {
    p_action: 'generate', p_application_id: appId, p_salary_cents: SALARY, p_currency: 'SEK', p_start_date: '2026-01-01',
  });
  const offerId = s.idOf(offer, 'offer');
  s.check('the offer letter names the salary', /42[\s,.]?000/.test(String((offer.offer as { body_markdown?: string })?.body_markdown ?? '')),
    String((offer.offer as { body_markdown?: string })?.body_markdown ?? '').slice(0, 200));
  s.check('the offer letter has no unfilled merge field', !String((offer.offer as { body_markdown?: string })?.body_markdown ?? '').includes('{{'),
    String((offer.offer as { body_markdown?: string })?.body_markdown).slice(0, 200));
  await s.must('the offer is sent', 'manage_job_offer', { p_action: 'send', p_offer_id: offerId });
  s.skip('the offer letter is e-mailed to the candidate', 'no e-mail integration locally');
  await s.must('the application moves to offer_sent', 'move_application_stage', { application_id: appId, to_stage: 'offer_sent' });
  await s.mustRefuse('an offer that is already sent cannot be sent again', 'manage_job_offer', { p_action: 'send', p_offer_id: offerId }, /not in draft/i);
  await s.must('the candidate accepts', 'manage_job_offer', { p_action: 'record_response', p_offer_id: offerId, p_status: 'accepted' });

  // ── Hire bridge ───────────────────────────────────────────────────────────
  // A rejected applicant on the same posting: the bridge must not turn a "no" into an employee.
  const rejected = s.idOf(await s.must('a second candidate applies', 'manage_application', {
    action: 'create', job_posting_id: jobId, candidate_name: `Avböjd ${s.tag}`, candidate_email: `avbojd-${s.tag}@example.test`,
  }), 'application');
  await s.must('… and is rejected', 'move_application_stage', { application_id: rejected, to_stage: 'rejected', rejected_reason: 'not a fit' });
  // FINDING 2026-09-19: hire_application checks only "already hired" — a rejected application is hired,
  // becomes an active employee and lands on the next payroll run.
  await s.mustRefuse('a rejected application cannot be hired', 'hire_application',
    { application_id: rejected, start_date: '2026-01-01' }, /reject|stage|offer/i);

  const strayId = (await s.one<{ employee_id: string | null }>('select employee_id from applications where id = $1', [rejected]))?.employee_id;
  if (strayId) await s.skill('manage_employee', { action: 'update', employee_id: strayId, status: 'terminated' }); // keep the stray hire off the payroll below

  // A fresh install has neither template; the agent sets them up through skills
  // (2026-10-05 — before, no skill could, and the two steps below were skipped).
  await s.must('a default onboarding template is created', 'manage_onboarding_template', {
    action: 'create', name: `Standard onboarding ${s.tag}`, is_default: true, is_active: true,
    items: [{ title: 'IT setup', done: false }, { title: 'Meet the team', done: false }],
  });
  await s.must('a default employment contract template is created', 'manage_employment_contract_template', {
    action: 'create', name: `Permanent employment ${s.tag}`, is_default: true, is_active: true, employment_type: 'permanent',
    body_markdown: 'Employment agreement between the company and {{employee_name}} as {{title}}, starting {{start_date}}, at {{monthly_salary}} kr per month.',
  });
  const templates = await s.one<{ contract: string; onboarding: string }>(
    `select (select count(*) from employment_contract_templates where is_active) as contract,
            (select count(*) from onboarding_templates where is_active) as onboarding`);
  const hired = await s.must('the accepted application is hired in one call', 'hire_application', {
    application_id: appId, start_date: '2026-01-01', monthly_salary_cents: SALARY, department: 'Engineering',
  });
  const h = (Array.isArray(hired) ? hired[0] : ((hired as { rows?: unknown[] }).rows?.[0] ?? hired)) as Record<string, string>;
  const employeeId = String(h.employee_id ?? '');
  s.check('the bridge answers with the employee id', /^[0-9a-f-]{36}$/.test(employeeId), JSON.stringify(hired).slice(0, 300));

  const appRow = await s.one<{ stage: string; employee_id: string }>('select stage, employee_id from applications where id = $1', [appId]);
  s.check('the application is hired and points at the employee', appRow?.stage === 'hired' && appRow?.employee_id === employeeId, JSON.stringify(appRow));
  const emp = await s.one<{ status: string; department: string; start_date: string; monthly_salary_cents: string | null }>(
    `select status, department, start_date::text, monthly_salary_cents from employees where id = $1`, [employeeId]);
  s.equal('the employee is active in Engineering from 2026-01-01', `${emp?.status}/${emp?.department}/${emp?.start_date}`, 'active/Engineering/2026-01-01');
  const contract = await s.one<{ status: string; monthly_salary_cents: string; probation_end_date: string; n: string }>(
    `select status, monthly_salary_cents, probation_end_date::text,
            (select count(*) from employment_contracts where employee_id = $1) as n
       from employment_contracts where employee_id = $1`, [employeeId]);
  s.equal('exactly one draft contract at 42 000 kr, probation to 2026-07-01',
    `${contract?.n}/${contract?.status}/${contract?.monthly_salary_cents}/${contract?.probation_end_date}`, `1/draft/${SALARY}/2026-07-01`);
  // FINDING 2026-09-19: the salary goes on the contract only — employees.monthly_salary_cents stays 0,
  // and that is the column create_payroll_run pays from. The hired employee is paid 0 kr until someone notices.
  s.equal('the salary the bridge was given is the salary payroll will pay', emp?.monthly_salary_cents, SALARY);
  await s.mustRefuse('the same application cannot be hired twice', 'hire_application', { application_id: appId, start_date: '2026-01-01' }, /already hired/i);
  s.equal('one employee carries the candidate\'s e-mail', (await s.one<{ n: string }>('select count(*) as n from employees where email = $1', [email]))?.n, 1);

  if (Number(templates?.onboarding) > 0) {
    s.equal('the onboarding checklist is seeded from the template',
      (await s.one<{ n: string }>('select count(*) as n from onboarding_checklists where employee_id = $1', [employeeId]))?.n, 1);
  } else {
    s.skip('the onboarding checklist is seeded from the best-matching template', 'no onboarding template on a fresh install, and no skill creates one');
  }
  if (Number(templates?.contract) === 0) {
    s.skip('the draft contract is rendered from a contract template', 'no employment contract template on a fresh install, and no skill creates one');
  } else {
    const draft = await s.one<{ id: string; template_id: string | null; body: string }>(
      'select id, template_id, body_markdown as body from employment_contracts where employee_id = $1', [employeeId]);
    s.check('the draft contract is rendered from the template', !!draft?.template_id && (draft?.body ?? '').includes('Employment agreement'), JSON.stringify(draft).slice(0, 200));
    s.check('every merge field in the contract is filled', !(draft?.body ?? '').includes('{{'), String(draft?.body).slice(0, 200));
    if (draft?.id) {
      await s.must('the employer signs the contract', 'sign_employment_contract', { p_contract_id: draft.id, p_side: 'employer' });
      await s.must('the employee signature is recorded', 'sign_employment_contract', { p_contract_id: draft.id, p_side: 'employee' });
      const signed = await s.one<{ status: string; signed: boolean }>('select status, signed_at is not null as signed from employment_contracts where id = $1', [draft.id]);
      s.equal('both sides signed → the contract is signed', `${signed?.status}/${signed?.signed}`, 'signed/true');
    }
  }

  await s.must('payroll data is completed on the employee', 'manage_employee', {
    action: 'update', employee_id: employeeId, monthly_salary_cents: SALARY, tax_rate_pct: 30, payroll_country: 'SE',
  });

  // ── Onboarding ────────────────────────────────────────────────────────────
  const checklist = await s.must('an onboarding checklist is created', 'onboarding_checklist', {
    action: 'create', employee_id: employeeId, items: [{ title: 'IT setup', done: false }, { title: 'Welcome meeting', done: false }],
  });
  const checklistId = s.idOf(checklist, 'checklist');
  s.equal('it carries the two items', (await s.one<{ n: string }>(
    'select jsonb_array_length(items) as n from onboarding_checklists where id = $1', [checklistId]))?.n, 2);

  // ── Leave ─────────────────────────────────────────────────────────────────
  // FINDING 2026-09-19: auto_allocate_vacation RETURNS TABLE(employee_id …) and then reads an unqualified
  // employee_id from leave_requests — "column reference employee_id is ambiguous" as soon as ONE active
  // employee exists (dry run included). No other skill writes leave_allocations.
  const allocated = await s.skill('auto_allocate_vacation', { p_year: 2026 });
  s.check('vacation is allocated for 2026 (auto_allocate_vacation)', allocated.ok, allocated.error.slice(0, 200));
  if (!allocated.ok) {
    // The HR admin's allocation dialog, played by hand so the leave arithmetic can still be tested.
    await s.asService(
      `insert into leave_allocations (employee_id, leave_type, year, allocated_days, carried_over_days, notes)
       values ($1, 'vacation', 2026, 25, 0, 'process battery: HR admin allocation') on conflict (employee_id, leave_type, year) do nothing`, [employeeId]);
  }
  const alloc = await s.one<{ allocated_days: string; carried_over_days: string }>(
    `select allocated_days, carried_over_days from leave_allocations where employee_id = $1 and leave_type = 'vacation' and year = 2026`, [employeeId]);
  s.equal('the new hire has the statutory 25 days, nothing carried over', `${Number(alloc?.allocated_days)}/${Number(alloc?.carried_over_days)}`, '25/0');

  const week = await s.must('a week of vacation is requested (Mon–Fri, days left to the platform)', 'manage_leave', {
    action: 'create', employee_id: employeeId, leave_type: 'vacation', start_date: '2026-10-05', end_date: '2026-10-09', reason: 'process battery',
  });
  const weekId = s.idOf(week, 'request');
  // FINDING 2026-09-19: nothing derives days from the dates — the column default (1) is what the balance is charged.
  s.equal('Monday to Friday is five days', Number((await s.one<{ days: string }>('select days from leave_requests where id = $1', [weekId]))?.days), 5);
  await s.must('the operator states the five days itself', 'manage_leave', { action: 'update', id: weekId, days: 5 });
  await advertised(s, 'the week is approved', 'manage_leave', { action: 'approve', request_id: weekId }, { id: weekId, status: 'approved' });

  const ten = s.idOf(await s.must('ten more days are requested, days stated', 'manage_leave', {
    action: 'create', employee_id: employeeId, leave_type: 'vacation', start_date: '2026-11-02', end_date: '2026-11-13', days: 10,
  }), 'request');
  await advertised(s, '… and approved', 'manage_leave', { action: 'approve', request_id: ten }, { id: ten, status: 'approved' });
  const big = s.idOf(await s.must('sixteen more days are requested', 'manage_leave', {
    action: 'create', employee_id: employeeId, leave_type: 'vacation', start_date: '2026-12-01', end_date: '2026-12-22', days: 16,
  }), 'request');
  const bal = await s.one<{ used_days: string; pending_days: string; remaining_days: string }>(
    `select used_days, pending_days, remaining_days from get_leave_balance($1, 'vacation', 2026)`, [employeeId]);
  s.equal('the balance reads 25 − 15 used − 16 pending = −6', `${Number(bal?.used_days)}/${Number(bal?.pending_days)}/${Number(bal?.remaining_days)}`, '15/16/-6');
  await s.mustRefuse('approving more than the allocation is refused', 'manage_leave', { action: 'update', id: big, status: 'approved' }, /only .* days available|cannot approve/i);
  await advertised(s, 'the request is rejected instead', 'manage_leave', { action: 'reject', request_id: big }, { id: big, status: 'rejected' });
  s.equal('approved vacation stays at fifteen days', Number((await s.one<{ d: string }>(
    `select coalesce(sum(days), 0) as d from leave_requests where employee_id = $1 and leave_type = 'vacation' and status = 'approved'`, [employeeId]))?.d), 15);

  const sick = s.idOf(await s.must('two sick days are reported', 'manage_leave', {
    action: 'create', employee_id: employeeId, leave_type: 'sick', start_date: '2026-09-14', end_date: '2026-09-15', days: 2,
  }), 'request');
  // FINDING 2026-09-19: the balance trigger treats every leave type as allocated leave — sick leave has no
  // allocation (and no skill writes one), so it can never be approved.
  const sickApproved = await s.skill('manage_leave', { action: 'update', id: sick, status: 'approved' });
  s.check('sick leave can be approved without a "sick allocation"', sickApproved.ok, sickApproved.error.slice(0, 200));

  // ── Payroll ───────────────────────────────────────────────────────────────
  const future = s.idOf(await s.must('a colleague who starts in 2040 is registered', 'manage_employee', {
    action: 'create', name: `Framtid ${s.tag}`, email: `framtid-${s.tag}@example.test`, start_date: '2040-01-01', monthly_salary_cents: 3_000_000,
  }), 'employee');
  const gone = s.idOf(await s.must('a colleague who already left is registered', 'manage_employee', {
    action: 'create', name: `Slutat ${s.tag}`, email: `slutat-${s.tag}@example.test`, start_date: '2020-01-01', monthly_salary_cents: 3_000_000,
  }), 'employee');
  await advertised(s, '… and deactivated', 'manage_employee', { action: 'deactivate', employee_id: gone }, { employee_id: gone, status: 'terminated', end_date: '2026-06-30' });

  const period = (await s.one<{ d: string }>(
    `select to_char(m, 'YYYY-MM-DD') as d from generate_series('2027-01-01'::date, '2099-12-01'::date, interval '1 month') m
      where not exists (select 1 from payroll_runs r where r.period_date = m::date) order by m limit 1`))!.d;
  const created = await s.must(`a payroll run is created for ${period.slice(0, 7)}`, 'create_payroll_run', { period_date: period });
  const runId = String(created.run_id);
  await s.mustRefuse('a second run for the same month is refused', 'create_payroll_run', { period_date: period }, /duplicate|already|unique|exists/i);

  const line = async () => s.one<Record<string, string>>(
    `select gross_cents, tax_cents, social_fee_cents, net_cents, pension_employer_cents, pension_employee_cents, sick_pay_cents, sick_deduction_cents
       from payroll_lines where run_id = $1 and employee_id = $2`, [runId, employeeId]);
  let l = await line();
  s.equal('42 000 gross → 12 600 tax (30 %), 13 196.40 employer fee (31.42 %), 29 400 net',
    `${l?.gross_cents}/${l?.tax_cents}/${l?.social_fee_cents}/${l?.net_cents}`, '4200000/1260000/1319640/2940000');
  s.equal('the colleague who left has no line', (await s.one<{ n: string }>(
    'select count(*) as n from payroll_lines where run_id = $1 and employee_id = $2', [runId, gone]))?.n, 0);
  // FINDING 2026-09-19: create_payroll_run reads status only — start_date/end_date are never compared to the period.
  s.equal('the colleague who starts in 2040 has no line', (await s.one<{ n: string }>(
    'select count(*) as n from payroll_lines where run_id = $1 and employee_id = $2', [runId, future]))?.n, 0);

  const sp = await s.must('two sick days are applied to the line', 'apply_sick_pay', { p_run_id: runId, p_employee_id: employeeId, p_sick_days: 2 });
  s.equal('4 000 kr deducted, 3 200 sick pay less 1 600 karens = 1 600', `${sp.salary_deduction_cents}/${sp.sick_pay_cents}/${sp.karensavdrag_cents}`, '400000/160000/160000');
  await s.must('pension is applied: 4.5 % employer, 2 % employee', 'apply_pension', { p_run_id: runId, p_employer_pct: 4.5, p_employee_pct: 2 });
  l = await line();
  s.equal('gross 39 600 → tax 11 880, fee 12 442.32, pension 1 782 + 792, net 26 928',
    `${l?.gross_cents}/${l?.tax_cents}/${l?.social_fee_cents}/${l?.pension_employer_cents}/${l?.pension_employee_cents}/${l?.net_cents}`,
    '3960000/1188000/1244232/178200/79200/2692800');

  const totals = await s.one<Record<string, string>>(
    `select r.total_gross_cents = sum(l.gross_cents) and r.total_tax_cents = sum(l.tax_cents)
        and r.total_social_fee_cents = sum(l.social_fee_cents) and r.total_net_cents = sum(l.net_cents)
        and r.total_pension_employer_cents = sum(l.pension_employer_cents)
        and r.total_pension_employee_cents = sum(l.pension_employee_cents) as ok,
            r.total_gross_cents, r.total_tax_cents, r.total_social_fee_cents, r.total_net_cents,
            r.total_pension_employer_cents, r.total_pension_employee_cents
       from payroll_runs r join payroll_lines l on l.run_id = r.id where r.id = $1 group by r.id`, [runId]);
  s.check('run totals = Σ lines, column by column', String(totals?.ok) === 'true', JSON.stringify(totals));

  const before = s.handshakes.length;
  const approved = await s.must('the run is approved', 'approve_payroll_run', { run_id: runId });
  s.check('approval waited for a human', s.handshakes.slice(before).some((x) => x.skill === 'approve_payroll_run' && x.gate === 'human'), JSON.stringify(s.handshakes.slice(before)));
  const jeId = String(approved.journal_entry_id);
  await s.booksBalance('the payroll entry balances', 'e.id = $1', [jeId]);
  const je = await s.sql<{ account_code: string; d: string; c: string }>(
    `select account_code, sum(debit_cents) as d, sum(credit_cents) as c from journal_entry_lines where journal_entry_id = $1 group by 1`, [jeId]);
  const acc = (code: string) => je.find((r) => r.account_code === code);
  s.equal('7210 carries total gross', acc('7210')?.d, totals?.total_gross_cents);
  s.equal('7510 and 2731 carry the employer fee', `${acc('7510')?.d}/${acc('2731')?.c}`, `${totals?.total_social_fee_cents}/${totals?.total_social_fee_cents}`);
  s.equal('2710 carries the withheld tax', acc('2710')?.c, totals?.total_tax_cents);
  s.equal('7410 carries the employer pension', acc('7410')?.d, totals?.total_pension_employer_cents);
  s.equal('2950 owes employer + employee pension', acc('2950')?.c, Number(totals?.total_pension_employer_cents) + Number(totals?.total_pension_employee_cents));
  s.equal('2890 owes the net pay', acc('2890')?.c, totals?.total_net_cents);

  await s.mustRefuse('an approved run takes no more sick pay', 'apply_sick_pay', { p_run_id: runId, p_employee_id: employeeId, p_sick_days: 3 }, /only be applied to a draft/i);
  await s.mustRefuse('a run cannot be approved twice', 'approve_payroll_run', { run_id: runId }, /already approved/i);
  const paid = await s.must('the run is paid', 'mark_payroll_paid', { run_id: runId, payment_date: period });
  await s.booksBalance('the payment entry balances', 'e.id = $1', [String(paid.journal_entry_id)]);
  const bank = await s.one<{ c: string }>(
    `select sum(credit_cents) as c from journal_entry_lines where journal_entry_id = $1 and account_code = '1930'`, [String(paid.journal_entry_id)]);
  s.equal('the bank pays out exactly the net', bank?.c, totals?.total_net_cents);
  await s.mustRefuse('a paid run cannot be paid twice', 'mark_payroll_paid', { run_id: runId }, /approved first|already/i);
  const owed = await s.one<{ open: string }>(
    `select coalesce(sum(l.credit_cents - l.debit_cents), 0) as open from journal_entry_lines l
      where l.account_code = '2890' and l.journal_entry_id in ($1, $2)`, [jeId, String(paid.journal_entry_id)]);
  s.equal('nothing is left owed to the employees for the month', owed?.open, 0);
  const slip = await s.must('the payslip is read back', 'get_payslip', { p_run_id: runId, p_employee_id: employeeId });
  s.check('the payslip shows the net that was paid', JSON.stringify(slip).includes('2692800'), JSON.stringify(slip).slice(0, 300));

  await s.skill('manage_employee', { action: 'update', employee_id: future, status: 'terminated' }); // keep the next run's payroll free of this run's people

  // ── Perform: goals, 1:1s, the review (since 2026-10-05) ──────────────
  // The tables and the admin panel existed since July; no skill did, so the agent could
  // neither set a goal nor write a review, and this battery never ran the layer.
  const mgr = s.idOf(await s.must('a manager exists', 'manage_employee', { action: 'create', name: `Chef ${s.tag}`, email: `chef-${s.tag}@example.test`, title: 'Head of Engineering' }), 'employee');
  await s.must('the new hire reports to the manager', 'manage_employee', { action: 'update', employee_id: employeeId, manager_id: mgr });
  const chart = await s.must('the org chart is read from the new hire\'s seat', 'org_chart', { p_employee_id: employeeId });
  s.check('the manager is above, the hire is the root of their own tree',
    (chart.managers_above as Array<{ id: string }>).some((m) => m.id === mgr) && (chart.tree as Array<{ id: string; depth: number }>).some((n) => n.id === employeeId && n.depth === 0), JSON.stringify(chart).slice(0, 200));
  const fromTop = await s.must('…and from the manager\'s seat', 'org_chart', { p_employee_id: mgr });
  s.check('the hire is one level below the manager with one direct report counted on the manager',
    (fromTop.tree as Array<{ id: string; depth: number; direct_reports: number }>).some((n) => n.id === employeeId && n.depth === 1)
      && (fromTop.tree as Array<{ id: string; direct_reports: number }>).find((n) => n.id === mgr)?.direct_reports === 1, JSON.stringify(fromTop).slice(0, 200));

  const goal = await s.must('a goal is set', 'manage_performance', { p_action: 'create_goal', p_employee_id: employeeId, p_title: 'Ship the battery runner', p_category: 'business', p_weight: 3, p_target_date: '2026-03-31' });
  const goalId = String(goal.goal_id);
  await s.mustRefuse('a goal without a title is refused', 'manage_performance', { p_action: 'create_goal', p_employee_id: employeeId, p_title: '  ' }, /title/);
  await s.must('progress is logged', 'manage_performance', { p_action: 'update_goal', p_goal_id: goalId, p_progress_pct: 60 });
  s.equal('60 % keeps the goal active', (await s.one<{ status: string; pct: number }>('select status, progress_pct as pct from performance_goals where id = $1', [goalId]))?.status, 'active');
  const done = await s.must('the goal reaches 100 %', 'manage_performance', { p_action: 'update_goal', p_goal_id: goalId, p_progress_pct: 100 });
  s.equal('100 % completes it', done.status, 'completed');

  const oneOnOne = await s.must('a 1:1 is scheduled with the manager from the org chart', 'manage_performance', { p_action: 'schedule_one_on_one', p_employee_id: employeeId, p_scheduled_at: '2026-02-03T09:00:00+01:00', p_agenda: 'Onboarding so far' });
  s.equal('the manager is taken from employees.manager_id', oneOnOne.manager_id, mgr);
  await s.must('the 1:1 is held and written down', 'manage_performance', { p_action: 'complete_one_on_one', p_one_on_one_id: String(oneOnOne.one_on_one_id), p_notes: 'Going well', p_employee_mood: 'energised', p_action_items: [{ text: 'Pair with Bo on the runner', owner: 'Chef', due: '2026-02-10' }] });
  const held = await s.one<{ status: string; items: number; mood: string }>('select status, jsonb_array_length(action_items) as items, employee_mood as mood from one_on_ones where id = $1', [String(oneOnOne.one_on_one_id)]);
  s.equal('the 1:1 is completed with its action item and mood', `${held?.status}/${held?.items}/${held?.mood}`, 'completed/1/energised');

  const review = await s.must('the probation review is started', 'manage_performance', { p_action: 'start_review', p_employee_id: employeeId, p_period_start: '2026-01-01', p_period_end: '2026-06-30', p_period_type: 'probation' });
  const reviewId = String(review.review_id);
  await s.mustRefuse('a rating of 7 is refused', 'manage_performance', { p_action: 'submit_review', p_review_id: reviewId, p_overall_rating: 7 }, /1.5/);
  await s.mustRefuse('a draft review cannot be acknowledged', 'manage_performance', { p_action: 'acknowledge_review', p_review_id: reviewId }, /completed review/);
  await s.must('the manager submits the review', 'manage_performance', { p_action: 'submit_review', p_review_id: reviewId, p_overall_rating: 4, p_achievements: 'Shipped the runner', p_areas_of_improvement: 'Delegation', p_goals_next_period: 'Lead one project', p_salary_adjustment_pct: 3, p_promotion_recommended: false });
  await s.must('the employee acknowledges it', 'manage_performance', { p_action: 'acknowledge_review', p_review_id: reviewId, p_employee_comments: 'Agreed' });
  const rev = await s.one<{ status: string; rating: number; adj: string; reviewer: string }>('select status, overall_rating as rating, salary_adjustment_pct::text as adj, reviewer_id as reviewer from performance_reviews where id = $1', [reviewId]);
  s.equal('the review is acknowledged with rating 4 and a 3 % adjustment, reviewed by the manager', `${rev?.status}/${rev?.rating}/${Number(rev?.adj)}/${rev?.reviewer === mgr}`, 'acknowledged/4/3/true');
  const listed = await s.must('the reviews are listed', 'manage_performance', { p_action: 'list_reviews', p_employee_id: employeeId });
  s.equal('one review on file', (listed.reviews as unknown[]).length, 1);
  const seat = await s.must('the org chart shows what is open', 'org_chart', { p_employee_id: employeeId });
  const me = (seat.tree as Array<{ id: string; open_goals: number; last_review_period_end: string | null }>).find((n) => n.id === employeeId);
  s.check('no open goals and the review period on record', me?.open_goals === 0 && me?.last_review_period_end === '2026-06-30', JSON.stringify(me));

  // ── Revise: the budgeted salary round (since 2026-10-06) ──────────────────
  // Bands existed (manage_salary_grade) and the review above carries +3 % — but nothing turned a
  // recommendation into a salary, and a salary change left no trace. The round does, and the
  // history trigger records every change made outside one.
  await s.must('the manager has a salary too', 'manage_employee', { action: 'update', employee_id: mgr, monthly_salary_cents: 6_000_000 });
  const nextYear = await s.must('a round for next year is opened for the two of them', 'manage_compensation_revision',
    { p_action: 'create', p_name: `Lönerevision 2027 ${s.tag}`, p_effective_date: '2027-01-01', p_employee_ids: [employeeId, mgr], p_default_pct: 1 });
  const futureId = String(nextYear.revision_id);
  await s.must('… and approved', 'manage_compensation_revision', { p_action: 'approve', p_revision_id: futureId });
  await s.mustRefuse('… but cannot be applied before its date', 'manage_compensation_revision', { p_action: 'apply', p_revision_id: futureId }, /not yet effective/);
  const due = await s.must('the morning automation finds nothing due', 'manage_compensation_revision', { p_action: 'apply_due' });
  s.equal('nothing is applied', Number(due.count), 0);
  await s.must('the round is cancelled instead', 'manage_compensation_revision', { p_action: 'cancel', p_revision_id: futureId });

  const round = await s.must('this year\'s round opens with a 2.5 % budget and 2 % default', 'manage_compensation_revision',
    { p_action: 'create', p_name: `Lönerevision ${s.tag}`, p_effective_date: '2026-07-01', p_employee_ids: [employeeId, mgr], p_budget_pct: 2.5, p_default_pct: 2 });
  const roundId = String(round.revision_id);
  type Line = { employee_id: string; proposed_cents: number; recommended_pct: number | null; review_id: string | null; change_pct: number; rationale: string | null };
  const opened = await s.must('the round is read with its lines', 'manage_compensation_revision', { p_action: 'summary', p_revision_id: roundId });
  const mine = (opened.lines as Line[]).find((l) => l.employee_id === employeeId);
  const theirs = (opened.lines as Line[]).find((l) => l.employee_id === mgr);
  s.check('the hire\'s line is pre-filled from the probation review: +3 % → 43 260 kr', mine?.recommended_pct === 3 && mine?.review_id === reviewId && mine?.proposed_cents === 4_326_000, JSON.stringify(mine));
  s.check('the manager, with no review, gets the default 2 % → 61 200 kr', theirs?.change_pct === 2 && theirs?.proposed_cents === 6_120_000, JSON.stringify(theirs));
  s.check('+2.41 % on 102 000 kr is within the 2.5 % budget', (opened.totals as { within_budget: boolean; delta_pct: number }).within_budget && (opened.totals as { delta_pct: number }).delta_pct === 2.41, JSON.stringify(opened.totals));

  await s.mustRefuse('a cut without a rationale is refused', 'manage_compensation_revision', { p_action: 'propose', p_revision_id: roundId, p_employee_id: employeeId, p_pct: -5 }, /rationale/);
  await s.must('the manager asks for 10 % for the hire', 'manage_compensation_revision', { p_action: 'propose', p_revision_id: roundId, p_employee_id: employeeId, p_pct: 10, p_rationale: 'Exceptional year' });
  await s.mustRefuse('… which blows the budget: approval is refused', 'manage_compensation_revision', { p_action: 'approve', p_revision_id: roundId }, /over budget/i);
  await s.must('… so it is set to the recommended 3 %', 'manage_compensation_revision', { p_action: 'propose', p_revision_id: roundId, p_employee_id: employeeId, p_pct: 3, p_rationale: 'Probation review' });
  await s.must('the round is approved', 'manage_compensation_revision', { p_action: 'approve', p_revision_id: roundId });
  await s.mustRefuse('an approved round cannot be edited', 'manage_compensation_revision', { p_action: 'propose', p_revision_id: roundId, p_employee_id: employeeId, p_pct: 4 }, /draft round/);
  const applied = await s.must('the round is applied (its date has passed)', 'manage_compensation_revision', { p_action: 'apply', p_revision_id: roundId });
  s.equal('two salaries changed, none drifted', `${applied.applied}/${applied.drifted}`, '2/0');
  const afterApply = await s.one<{ salary: string; contract: string | null }>(
    `select e.monthly_salary_cents::text as salary,
            (select c.monthly_salary_cents::text from employment_contracts c where c.employee_id = e.id and c.status = 'signed' limit 1) as contract
       from employees e where e.id = $1`, [employeeId]);
  s.equal('payroll will pay 43 260 kr from July', afterApply?.salary, '4326000');
  if (afterApply?.contract != null) s.equal('the signed contract carries the new salary', afterApply.contract, '4326000');
  else s.skip('the signed contract carries the new salary', 'no signed contract on this install');

  await s.must('a manual correction outside a round', 'manage_employee', { action: 'update', employee_id: employeeId, monthly_salary_cents: 4_400_000 });
  const history = await s.must('the salary history is read', 'manage_compensation_revision', { p_action: 'history', p_employee_id: employeeId });
  const rows = history.history as Array<{ source: string; previous_cents: number; new_cents: number; effective_date: string; review_id: string | null; change_pct: number }>;
  s.check('the manual change is on top: 43 260 → 44 000, source manual', rows[0]?.source === 'manual' && rows[0]?.previous_cents === 4_326_000 && rows[0]?.new_cents === 4_400_000, JSON.stringify(rows[0]));
  s.check('the revision is below it, effective 2026-07-01, +3 %, tied to the review', rows[1]?.source === 'revision' && rows[1]?.effective_date === '2026-07-01' && rows[1]?.change_pct === 3 && rows[1]?.review_id === reviewId, JSON.stringify(rows[1]));
  s.check('the hire salary is the first row', rows.length >= 3 && rows[rows.length - 1]?.source === 'hire' && rows[rows.length - 1]?.new_cents === SALARY, JSON.stringify(rows[rows.length - 1]));

  // ── Retire ────────────────────────────────────────────────────────────────
  await advertised(s, 'the employee is offboarded', 'manage_employee', { action: 'deactivate', employee_id: employeeId }, { employee_id: employeeId, status: 'terminated', end_date: '2026-12-31' });
  const left = await s.one<{ status: string; end_date: string | null }>('select status, end_date::text from employees where id = $1', [employeeId]);
  s.equal('the employee is terminated', left?.status, 'terminated');
  s.check('the last day is on the record', left?.end_date != null, 'end_date is NULL after deactivate');
  // Doc step H: "Offboarding — contracts terminated".
  s.equal('the employment contract no longer reads as a live draft',
    (await s.one<{ open: string }>(`select count(*) as open from employment_contracts where employee_id = $1 and status in ('draft', 'active')`, [employeeId]))?.open, 0);
}

/**
 * FINDING 2026-09-19: manage_leave, manage_employee and onboarding_checklist run on the generic db handler, which
 * knows list/get/create/update/delete — the verbs their contracts advertise (approve, reject, deactivate, search,
 * list_by_employee, update_item, get_status, list_incomplete) all answer "Unknown action". The advertised verb is
 * tried and judged ONCE per skill+verb; the step then continues the way an operator who read the error would: update.
 */
const judged = new Set<string>();
async function advertised(s: Scenario, step: string, skill: string, args: Record<string, unknown>, viaUpdate: Record<string, unknown>): Promise<void> {
  const key = `${skill}.${String(args.action)}`;
  if (!judged.has(key)) {
    judged.add(key);
    const out = await s.skill(skill, args);
    s.check(`${skill} runs its advertised verb "${String(args.action)}"`, out.ok, out.error.slice(0, 200));
    if (out.ok) { s.check(step, true); return; }
  }
  await s.must(step, skill, { action: 'update', ...viaUpdate });
}

export default { process: 'hire-to-retire', run } satisfies ScenarioModule;
