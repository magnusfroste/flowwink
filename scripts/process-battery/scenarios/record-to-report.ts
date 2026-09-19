import type { Scenario, ScenarioModule } from '../lib';

/**
 * Record-to-Report: book a month, read it back in the reports and the VAT
 * return, reconcile the bank, close the month, prove the lock, correct by
 * reversal, reopen.
 *
 * The period lock is INSTANCE-WIDE and the stack is shared, so the scenario
 * never closes the running month: it books into an empty month far in the past
 * (picked per run from an untouched year, 1900–2015), which also makes every period total exact —
 * nothing else has ever been posted there.
 *
 * The end state that must hold: every entry balances, the trial balance and the
 * VAT boxes add up to the ledger to the öre, a closed month refuses every
 * writer, a correction is a mirror entry (never an edit), and a bank line is
 * imported once and settles its invoice once.
 */
async function run(s: Scenario): Promise<void> {
  const { year, month } = await emptyMonth(s);
  const mm = String(month).padStart(2, '0');
  const day = (d: number) => `${year}-${mm}-${String(d).padStart(2, '0')}`;
  const acc = (await s.one<Record<'bank' | 'rev25' | 'vat25' | 'rev12' | 'vat12' | 'vatIn' | 'cost', string>>(
    `select public.account_for('bank') as bank, public.account_for('sales_revenue') as rev25, public.account_for('vat_output') as vat25,
            public.account_for_or('sales_revenue_12', 'sales_revenue') as rev12, public.account_for_or('vat_output_12', 'vat_output') as vat12,
            public.account_for('vat_input') as "vatIn", public.account_for('expense_default') as cost`))!;

  // ── Book the month ─────────────────────────────────────────────────────────
  await s.mustRefuse('an entry whose debits and credits differ is refused', 'manage_journal_entry', {
    action: 'create', entry_date: day(3), description: `Battery unbalanced ${s.tag}`,
    lines: [{ account_code: acc.bank, debit_cents: 125_000, credit_cents: 0 }, { account_code: acc.rev25, debit_cents: 0, credit_cents: 100_000 }],
  }, /balanc|debit|credit/i);
  // FINDING 2026-09-19: manage_journal_entry posts to any string — '9Z9Z' is in no chart of
  // accounts, the entry is created and posted, and the balance sheet grows an "unclassified" row.
  // Dated in the NEIGHBOUR month so the month under test keeps exact totals; reversed if accepted.
  const otherMonth = `${year}-${String(month === 12 ? 11 : month + 1).padStart(2, '0')}-03`;
  const ghost = await s.skill('manage_journal_entry', {
    action: 'create', entry_date: otherMonth, description: `Battery ghost account ${s.tag}`,
    lines: [{ account_code: '9Z9Z', debit_cents: 100, credit_cents: 0 }, { account_code: acc.bank, debit_cents: 0, credit_cents: 100 }],
  });
  s.check('an entry on an account that does not exist is refused', !ghost.ok, `accepted: ${JSON.stringify(ghost.data).slice(0, 200)}`);
  if (ghost.ok && typeof ghost.data.entry_id === 'string') await s.skill('manage_journal_entry', { action: 'void', entry_id: ghost.data.entry_id });

  const sale25 = await book(s, 'a cash sale at 25 % VAT is booked: 1 000 kr + 250 kr', day(5), `Battery sale 25 ${s.tag}`, [
    [acc.bank, 125_000, 0], [acc.rev25, 0, 100_000], [acc.vat25, 0, 25_000]]);
  const sale12 = await book(s, 'a cash sale at 12 % VAT is booked: 100 kr + 12 kr', day(9), `Battery sale 12 ${s.tag}`, [
    [acc.bank, 11_200, 0], [acc.rev12, 0, 10_000], [acc.vat12, 0, 1_200]]);
  const purchase = await book(s, 'a purchase is booked: 400 kr + 100 kr input VAT', day(12), `Battery purchase ${s.tag}`, [
    [acc.cost, 40_000, 0], [acc.vatIn, 10_000, 0], [acc.bank, 0, 50_000]]);
  // Trust `approve` and the staged envelope are ONE dial on the ledger perimeter: a new instance
  // books directly (dial at notify), and a skill turned to approve is staged. The doc used to say
  // these skills were always staged; what must hold is that the two never disagree.
  const dial = await s.sql<{ name: string }>(
    `select name from agent_skills
      where name in ('manage_journal_entry', 'book_expense_report', 'mark_expense_report_paid', 'record_pos_sale_v2',
                     'close_pos_session_v2', 'close_accounting_period', 'reopen_accounting_period')
        and (trust_level = 'approve') is distinct from coalesce(requires_staging, false)`);
  s.check('on the ledger perimeter, trust approve and the staged envelope are one dial', dial.length === 0, `disagree: ${dial.map((d) => d.name).join(', ')}`);
  const mjeStaged = (await s.one<{ st: boolean }>(`select coalesce(requires_staging, false) as st from agent_skills where name = 'manage_journal_entry'`))?.st === true;
  s.check('booking went through the envelope exactly when the dial says so',
    s.handshakes.some((h) => h.skill === 'manage_journal_entry' && h.gate === 'staged') === mjeStaged, `staged=${mjeStaged}, handshakes=${JSON.stringify(s.handshakes)}`);
  await s.booksBalance('every entry of the month balances', `e.entry_date between $1 and $2`, [day(1), day(28)]);
  const vouchers = await s.sql<{ status: string; voucher_number: number | null }>(
    `select status, voucher_number from journal_entries where id = any($1::uuid[]) order by voucher_number`, [[sale25, sale12, purchase]]);
  s.check('the three entries are posted', vouchers.length === 3 && vouchers.every((v) => v.status === 'posted'), JSON.stringify(vouchers));
  s.check('voucher numbers run without a gap', vouchers.every((v, i) => i === 0 || Number(v.voucher_number) === Number(vouchers[i - 1].voucher_number) + 1),
    JSON.stringify(vouchers));
  const gaps = await s.must('the voucher series is checked for gaps', 'list_voucher_gaps', { p_year: year });
  s.check('no gap is reported for the year', JSON.stringify(gaps) === '{}' || JSON.stringify(gaps) === '[]' || Number((gaps as { count?: number }).count ?? 0) === 0
    || (Array.isArray((gaps as { gaps?: unknown[] }).gaps) && (gaps as { gaps: unknown[] }).gaps.length === 0), JSON.stringify(gaps).slice(0, 300));

  // ── Reports ────────────────────────────────────────────────────────────────
  const tb = await s.must('the trial balance of the month is read', 'accounting_reports', { type: 'trial_balance', from_date: day(1), to_date: day(28) });
  s.equal('the month turned over 1 862 kr in debit', tb.total_debit_cents, 186_200);
  s.equal('and the same in credit', tb.total_credit_cents, 186_200);
  s.equal('the trial balance says it balances', tb.balanced, true);
  const bankRow = ((tb.accounts ?? []) as Array<{ account_code: string; debit_total: number; credit_total: number }>).find((a) => a.account_code === acc.bank);
  s.equal('the bank account moved +1 362 − 500 kr', Number(bankRow?.debit_total) - Number(bankRow?.credit_total), 86_200);
  const pnl = await s.must('the income statement of the month is read', 'accounting_reports', { type: 'income_statement', from_date: day(1), to_date: day(28) });
  const result = Number(pnl.net_result_cents ?? pnl.result_cents ?? pnl.net_income_cents ?? (pnl.totals as { net_result_cents?: number } | undefined)?.net_result_cents ?? NaN);
  s.check('the result of the month is 1 100 − 400 = 700 kr', result === 70_000, `income statement answered ${JSON.stringify(pnl).slice(0, 400)}`);
  const allTime = await s.must('the trial balance of the whole ledger is read', 'accounting_reports', { type: 'trial_balance' });
  // `allTime.balanced` is NOT asserted: on a truncated read it is luck, and it flipped between runs.
  // FINDING 2026-09-19: the report reads journal lines without paging, so PostgREST cuts it at 1 000
  // rows — with 2 322 posted lines it reported 3.3 M where the ledger holds 7.95 M, and "balanced"
  // was luck (it flipped between runs depending on where the cut fell). Totals are the assertion.
  const ledger = await s.one<{ debit: string }>(
    `select coalesce(sum(l.debit_cents), 0) as debit from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id where e.status = 'posted'`);
  const after = await s.must('…and read again, against the ledger itself', 'accounting_reports', { type: 'trial_balance' });
  s.check('the trial balance of the whole ledger covers every posted line, not the first thousand',
    Math.abs(Number(after.total_debit_cents) - Number(ledger?.debit)) <= Number(ledger?.debit) * 0.001,
    `report says ${after.total_debit_cents} (balanced: ${allTime.balanced}), the ledger holds ${ledger?.debit}`);

  // ── VAT return ─────────────────────────────────────────────────────────────
  const vat = await s.must('the VAT return of the month is prepared', 'prepare_vat_return', { year, month });
  const box = (code: string) => Number(((vat.boxes ?? []) as Array<{ code: string; amount_cents: number }>).find((b) => String(b.code) === code)?.amount_cents ?? 0);
  s.equal('box 05: sales liable to VAT, 1 100 kr', box('05'), 110_000);
  s.equal('box 10: output VAT 25 %, 250 kr', box('10'), 25_000);
  s.equal('box 11: output VAT 12 %, 12 kr', box('11'), 1_200);
  s.equal('box 48: input VAT, 100 kr', box('48'), 10_000);
  s.equal('box 49: VAT to pay, 250 + 12 − 100 = 162 kr', Math.abs(Number(vat.net_to_pay_cents ?? box('49'))), 16_200);
  const ledgerVat = await s.one<{ out: string; inp: string }>(
    `select coalesce(sum(l.credit_cents - l.debit_cents) filter (where l.account_code in ($3, $4)), 0) as out,
            coalesce(sum(l.debit_cents - l.credit_cents) filter (where l.account_code = $5), 0) as inp
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.status = 'posted' and e.entry_date between $1 and $2`, [day(1), day(28), acc.vat25, acc.vat12, acc.vatIn]);
  s.equal('the output boxes add up to the VAT accounts in the ledger', box('10') + box('11') + box('12'), ledgerVat?.out);
  s.equal('the input box adds up to the input VAT account', box('48'), ledgerVat?.inp);
  await s.mustRefuse('a VAT return without a period is refused', 'prepare_vat_return', {}, /period is required/i);

  // ── Close the month ────────────────────────────────────────────────────────
  const closed = await s.must('the month is closed', 'close_accounting_period', { year, month, notes: `process battery ${s.tag}` });
  const closeStaged = (await s.one<{ st: boolean }>(`select coalesce(requires_staging, false) as st from agent_skills where name = 'close_accounting_period'`))?.st === true;
  s.check('closing went through the envelope exactly when the dial says so',
    s.handshakes.some((h) => h.skill === 'close_accounting_period' && h.gate === 'staged') === closeStaged, `staged=${closeStaged}, handshakes=${JSON.stringify(s.handshakes)}`);
  const period = await s.one<{ status: string; total_debit_cents: string; total_credit_cents: string; entry_count: number }>(
    'select status, total_debit_cents, total_credit_cents, entry_count from accounting_periods where fiscal_year = $1 and period_month = $2', [year, month]);
  s.equal('the period is closed', period?.status, 'closed');
  s.equal('the close snapshots the debit turnover', period?.total_debit_cents, 186_200);
  s.equal('the close snapshots the credit turnover', period?.total_credit_cents, 186_200);
  s.equal('the close counts three entries', period?.entry_count, 3);
  s.check('the skill answers with the period row', String((closed as { status?: string }).status ?? '') === 'closed', JSON.stringify(closed).slice(0, 200));

  await s.mustRefuse('posting into the closed month is refused', 'manage_journal_entry', {
    action: 'create', entry_date: day(20), description: `Battery late entry ${s.tag}`,
    lines: [{ account_code: acc.bank, debit_cents: 1_000, credit_cents: 0 }, { account_code: acc.rev25, debit_cents: 0, credit_cents: 1_000 }],
  }, /closed/i);
  s.equal('the closed month still holds three entries', await entriesIn(s, day(1), day(28)), 3);

  const project = await s.must('a project exists', 'manage_project', { action: 'create', name: `Battery r2r ${s.tag}`, hourly_rate_cents: 100_000, is_billable: true });
  const employee = await s.must('an employee exists', 'manage_employee', { action: 'create', name: `Battery Bokhållare ${s.tag}`, email: `bok-${s.tag}@example.test` });
  await s.mustRefuse('time cannot be logged into the closed month', 'log_time', {
    action: 'create', project_id: s.idOf(project, 'project'), employee_id: s.idOf(employee, 'employee'), entry_date: day(15), hours: 2, description: 'late hours',
  }, /closed/i);

  // An invoice dated in the closed month: issuing it would book the receivable there.
  const backdated = await s.must('an invoice dated in the closed month is drafted', 'manage_invoice', {
    action: 'create', customer_name: `Battery Kund ${s.tag}`, customer_email: `kund-${s.tag}@example.test`, issue_date: day(18),
    line_items: [{ description: 'Backdated', qty: 1, unit_price_cents: 10_000 }],
  });
  const backdatedId = s.idOf(backdated, 'invoice');
  await s.mustRefuse('issuing it is refused — its entry would land in the closed month', 'manage_invoice', { action: 'send', invoice_id: backdatedId }, /closed/i);
  s.equal('the refused invoice is still a draft', (await s.one<{ status: string }>('select status::text from invoices where id = $1', [backdatedId]))?.status, 'draft');
  s.equal('nothing reached the closed month', await entriesIn(s, day(1), day(28)), 3);

  // ── Correct by reversal, never by edit ─────────────────────────────────────
  await s.mustRefuse('a posted entry cannot be deleted', 'manage_journal_entry', { action: 'delete', entry_id: purchase }, /posted|void/i);
  const voided = await s.must('the purchase in the closed month is reversed', 'manage_journal_entry', { action: 'void', entry_id: purchase });
  const reversalId = String(voided.reversal_id ?? '');
  const reversal = await s.one<{ entry_date: string; in_closed: boolean }>(
    `select entry_date::text, (entry_date between $2::date and $3::date) as in_closed from journal_entries where id = $1`, [reversalId, day(1), day(28)]);
  s.check('the reversal is dated today, outside the closed month', reversal?.in_closed === false, JSON.stringify(reversal));
  await s.booksBalance('the reversal balances', 'e.id = $1', [reversalId]);
  const mirror = await s.one<{ net: string }>(
    `select coalesce(sum(l.debit_cents - l.credit_cents), 0) as net from journal_entry_lines l
      where l.journal_entry_id in ($1, $2) and l.account_code = $3`, [purchase, reversalId, acc.cost]);
  s.equal('original and reversal net to zero on the cost account', mirror?.net, 0);
  s.equal('the original in the closed month is untouched — still three entries', await entriesIn(s, day(1), day(28)), 3);
  // FINDING 2026-09-19 (if red): void stamps reversed_by on the ORIGINAL with an unchecked UPDATE.
  // In a closed month the period guard refuses that UPDATE, so the original never learns it was
  // reversed — and a second void books a second mirror entry.
  await s.mustRefuse('an entry that is already reversed cannot be reversed again', 'manage_journal_entry', { action: 'void', entry_id: purchase }, /already been reversed/i);
  s.equal('one reversal exists for the purchase', (await s.one<{ n: string }>('select count(*) as n from journal_entries where reverses = $1', [purchase]))?.n, 1);

  // ── Reopen ─────────────────────────────────────────────────────────────────
  await s.must('the month is reopened with a reason', 'reopen_accounting_period', { year, month, reason: `process battery ${s.tag}: late supplier invoice` });
  s.equal('the period is open again', (await s.one<{ status: string }>(
    'select status from accounting_periods where fiscal_year = $1 and period_month = $2', [year, month]))?.status, 'open');
  await s.mustRefuse('a period that is already open cannot be reopened', 'reopen_accounting_period', { year, month, reason: 'again' }, /already open|not found/i);
  await book(s, 'posting into the reopened month works', day(20), `Battery late entry ${s.tag}`, [[acc.bank, 1_000, 0], [acc.rev25, 0, 1_000]]);
  await s.must('the month is closed again', 'close_accounting_period', { year, month });
  s.equal('the second close counts four entries', (await s.one<{ entry_count: number }>(
    'select entry_count from accounting_periods where fiscal_year = $1 and period_month = $2', [year, month]))?.entry_count, 4);

  // ── Bank reconciliation ────────────────────────────────────────────────────
  const recInvoice = await s.must('an invoice of 3 437,50 kr is issued', 'manage_invoice', {
    action: 'create', customer_name: `Battery Bankkund ${s.tag}`, customer_email: `bank-${s.tag}@example.test`,
    line_items: [{ description: 'Reconciliation probe', qty: 1, unit_price_cents: 275_000 }], tax_rate: 0.25,
  });
  const recInvoiceId = s.idOf(recInvoice, 'invoice');
  await s.must('it is sent', 'manage_invoice', { action: 'send', invoice_id: recInvoiceId });
  const recNumber = String(recInvoice.invoice_number);
  const today = new Date().toISOString().slice(0, 10);
  // The way a Swedish bank exports it: semicolons between columns, comma as the decimal sign.
  const svCsv = `Datum;Belopp;Referens;Motpart\n${today};1234,50;SV-${s.tag};Battery Svensk ${s.tag}\n`;
  const svImport = await s.must('a Swedish-format bank file is imported', 'import_bank_file', { fileName: `battery-sv-${s.tag}.csv`, content: svCsv, format: 'csv' });
  const svLine = await s.one<{ amount_cents: string; reference: string | null }>(
    `select amount_cents, reference from bank_transactions where batch_id = $1`, [String(svImport.batch_id)]);
  // FINDING 2026-09-19: parseCSV splits on comma AND semicolon, so the decimal comma is a column
  // break — 1234,50 is read as 1 234,00 kr (the öre are gone) and every later column shifts one
  // step: the reference reads "50".
  s.equal('1234,50 is read as 1 234,50 kr', svLine?.amount_cents, 123_450);
  s.equal('the reference column survives the decimal comma', svLine?.reference, `SV-${s.tag}`);

  const csv = `Date;Amount;Reference;Counterparty\n${today};3437.50;${recNumber};Battery Bankkund ${s.tag}\n`;
  const imported = await s.must('the bank file with the payment is imported', 'import_bank_file', { fileName: `battery-${s.tag}.csv`, content: csv, format: 'csv' });
  s.equal('one bank line is imported', imported.imported, 1);
  const line = await s.one<{ id: string; amount_cents: string; reference: string | null }>(
    `select id, amount_cents, reference from bank_transactions where batch_id = $1`, [String(imported.batch_id)]);
  s.equal('the bank line carries 3 437,50 kr', line?.amount_cents, 343_750);

  await s.must('the same bank file is imported a second time', 'import_bank_file', { fileName: `battery-${s.tag}.csv`, content: csv, format: 'csv' });
  // FINDING 2026-09-19: a CSV line's external_id is `csv:<new batch id>:<row>`, so the promised
  // duplicate skip can never fire for CSV — importing a file twice doubles every bank line.
  s.equal('a bank line imported twice exists once', (await s.one<{ n: string }>(
    `select count(*) as n from bank_transactions where reference = $1`, [recNumber]))?.n, 1);

  await s.must('the auto-matcher runs', 'auto_match_transactions', {});
  const match = await s.one<{ match_type: string; entity_id: string }>(
    `select m.match_type, m.entity_id from reconciliation_matches m where m.bank_transaction_id = $1`, [line?.id]);
  s.equal('the bank line is matched to the invoice it names', match?.entity_id, recInvoiceId);
  s.equal('amount + reference is an automatic match', match?.match_type, 'auto');
  const recPaid = await s.one<{ status: string; paid: string }>(`select status::text, coalesce(paid_amount_cents, 0) as paid from invoices where id = $1`, [recInvoiceId]);
  s.equal('a reconciled bank line marks the invoice paid', recPaid?.status, 'paid');
  s.equal('the invoice is settled once, not once per imported copy', recPaid?.paid, 343_750);

  // ── Approval of manual entries ─────────────────────────────────────────
  // A rule for 'journal_entry' gates EVERY manual entry while it is active, so it lives only inside this block.
  // Booked today: the scenario's own month is closed by now.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [rule] = await s.asService<{ id: string }>(
    `insert into approval_rules (name, entity_type, amount_threshold_cents, currency, required_role)
     values ($1, 'journal_entry', 1000000, public.platform_default_currency(), 'admin') returning id`, [`Battery manual entries ${s.tag}`]);
  try {
    const small = await s.must('a manual entry below the threshold', 'manage_journal_entry', {
      action: 'create', entry_date: todayIso, description: `Battery small ${s.tag}`,
      lines: [{ account_code: acc.cost, debit_cents: 50_000, credit_cents: 0 }, { account_code: acc.bank, debit_cents: 0, credit_cents: 50_000 }],
    });
    s.equal('below the threshold it is booked at once', small.status, 'posted');
    const big = await s.must('a manual entry of 20 000 kr, above the threshold', 'manage_journal_entry', {
      action: 'create', entry_date: todayIso, description: `Battery big ${s.tag}`,
      lines: [{ account_code: acc.cost, debit_cents: 2_000_000, credit_cents: 0 }, { account_code: acc.bank, debit_cents: 0, credit_cents: 2_000_000 }],
    });
    const bigId = s.idOf(big, 'entry');
    s.equal('above it the entry is held as a draft', big.status, 'draft');
    s.equal('…and the answer says approval is required', big.approval_required, true);
    s.check('…with the request that was opened', typeof big.approval_request_id === 'string', JSON.stringify(big).slice(0, 200));
    const tbHeld = await s.one<{ n: string }>(
      `select count(*) as n from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
        where e.id = $1 and e.status = 'posted'`, [bigId]);
    s.equal('a held entry is not in the books', tbHeld?.n, 0);
    await s.mustRefuse('an unapproved draft cannot be posted', 'post_journal_entry', { p_entry_id: bigId }, /needs approval/i);
    const again = await s.must('asking for approval again is the same request', 'request_journal_entry_approval', { p_entry_id: bigId });
    s.equal('one request per entry and amount', again.approval_request_id, big.approval_request_id);
    await s.asService(`select public.resolve_approval($1::uuid, 'approve', 'process battery: human approver')`, [String(big.approval_request_id)]);
    const posted = await s.must('the approved entry is posted', 'post_journal_entry', { p_entry_id: bigId });
    s.equal('the approved entry is in the books', posted.status, 'posted');
    await s.booksBalance('the approved entry balances', `e.id = $1`, [bigId]);
    const automatic = await s.one<{ n: string }>(
      `select count(*) as n from journal_entries where source not in ('manual','upload','mcp','chat','flowpilot','agent') and status = 'draft'`);
    s.equal('automatic bookings are never held', automatic?.n, 0);
  } finally {
    await s.asService(`delete from approval_rules where id = $1`, [rule.id]);
  }

  // ── Cash-flow forecast ─────────────────────────────────────────────────
  const forecast = await s.must('a 13-week cash-flow forecast', 'cash_flow_forecast', { p_weeks: 13 });
  const weeks = (forecast.by_week ?? []) as Array<{ net_cents: number; closing_cents: number }>;
  s.equal('it answers thirteen weeks', weeks.length, 13);
  const bankNow = await s.one<{ cents: string }>(
    `select coalesce(sum(l.debit_cents - l.credit_cents), 0) as cents from journal_entry_lines l join journal_entries e on e.id = l.journal_entry_id
      where e.status = 'posted' and e.entry_date <= current_date
        and l.account_code in (select account_code from account_roles where role in ('bank', 'cash_register'))`);
  s.equal('it starts from the posted bank and cash balance', Number(forecast.opening_cents), Number(bankNow?.cents));
  s.check('every week closes at the previous balance plus its net',
    weeks.every((w, i) => w.closing_cents === (i === 0 ? Number(forecast.opening_cents) : weeks[i - 1].closing_cents) + w.net_cents),
    JSON.stringify(weeks.slice(0, 3)));
  s.check('it says what it leaves out', Array.isArray(forecast.not_included) && (forecast.not_included as string[]).some((x) => /payroll/i.test(x)));

  s.skip('sync_stripe_payouts settles the clearing account', 'needs Stripe');
  s.skip('import_bank_image reads a statement photo', 'needs an AI provider');
  s.skip('suggest_accounting_template learns from repeated entries', 'pattern mining over a shared ledger — not an end state this scenario owns');
}

type Line = [account: string, debit: number, credit: number];
async function book(s: Scenario, step: string, date: string, description: string, lines: Line[]): Promise<string> {
  const out = await s.must(step, 'manage_journal_entry', {
    action: 'create', entry_date: date, description,
    lines: lines.map(([account_code, debit_cents, credit_cents]) => ({ account_code, debit_cents, credit_cents })),
  });
  return s.idOf(out, 'entry');
}

async function entriesIn(s: Scenario, from: string, to: string): Promise<number> {
  return Number((await s.one<{ n: string }>('select count(*) as n from journal_entries where entry_date between $1 and $2', [from, to]))?.n ?? 0);
}

/** A month in a year nobody has ever posted into — so period totals and the voucher series are exact. */
async function emptyMonth(s: Scenario): Promise<{ year: number; month: number }> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const year = 1900 + Math.floor(Math.random() * 116);
    const month = 1 + Math.floor(Math.random() * 12);
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const busy = await s.one<{ n: string }>(
      `select (select count(*) from journal_entries where entry_date >= $1::date and entry_date < $1::date + interval '1 month')
            + (select count(*) from accounting_periods where fiscal_year = $2 and period_month = $3)
            + (select count(*) from journal_entries where entry_date >= make_date($2, 1, 1) and entry_date < make_date($2 + 1, 1, 1)) as n`, [from, year, month]);
    if (Number(busy?.n ?? 1) === 0) return { year, month };
  }
  throw new Error('no empty year found between 1900 and 2015');
}

export default { process: 'record-to-report', run } satisfies ScenarioModule;
