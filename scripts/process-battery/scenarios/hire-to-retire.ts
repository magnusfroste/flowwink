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
  }
  s.skip('the employment contract is signed by both parties', 'no skill reaches employment_contracts — send_contract_for_signature works on the contracts table');

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
