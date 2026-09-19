import type { Scenario, ScenarioModule } from '../lib';

/**
 * Acquire-to-Retire: a machine bought for 12 000 kr on 60 months (straight line,
 * 200 kr a month), a van for 10 000 kr on 30 % declining balance, and a tool
 * for 1 000 kr on three months. Three months are depreciated, the machine is
 * impaired to 10 000 kr and sold for 11 000 kr (gain 1 000), the van is
 * scrapped (loss = its book value).
 * The end state that must hold: every entry balances, accumulated depreciation
 * on the asset = Σ depreciation entries = what the ledger carries, a month is
 * booked once, a disposed asset is gone from the asset accounts to the öre,
 * and nothing more is booked on it afterwards.
 */
const Y = 2031; // far from any period another scenario may close

async function run(s: Scenario): Promise<void> {
  const acct = await s.one<Record<string, string>>(
    `select public.account_for('fixed_asset') as asset, public.account_for('accumulated_depreciation') as accumulated,
            public.account_for('depreciation_expense') as expense, public.account_for('bank') as bank,
            public.account_for('disposal_gain') as gain, public.account_for('disposal_loss') as loss,
            public.account_for('impairment') as impairment`);
  s.equal('the SE chart resolves the roles the doc names (1210/1219/7832, 3970/7970)',
    `${acct?.asset}/${acct?.accumulated}/${acct?.expense}/${acct?.gain}/${acct?.loss}`, '1210/1219/7832/3970/7970');

  // ── Acquire ───────────────────────────────────────────────────────────────
  await s.mustRefuse('an asset with no useful life is refused', 'register_fixed_asset',
    { name: `Battery nolla ${s.tag}`, cost_cents: 100_000, useful_life_months: 0, purchase_date: `${Y}-10-01` }, /useful_life|check|violates/i);
  // FINDING 2026-09-19: nothing compares salvage to cost — the asset is accepted, its depreciable base is negative.
  await s.mustRefuse('a residual value above the cost is refused', 'register_fixed_asset',
    { name: `Battery restvärde ${s.tag}`, cost_cents: 100_000, salvage_cents: 150_000, useful_life_months: 12, purchase_date: `${Y}-10-01`, create_journal_entry: false },
    /salvage|residual|exceed/i);

  const machineName = `Battery svarv ${s.tag}`;
  const machine = await s.must('a machine is capitalised: 12 000 kr on 60 months', 'register_fixed_asset', {
    name: machineName, cost_cents: 1_200_000, useful_life_months: 60, purchase_date: `${Y}-10-01`,
  });
  const machineId = s.idOf(machine, 'asset');
  await s.booksBalance('the acquisition entry balances', `e.source = 'fixed_asset_register' and e.description like '%' || $1`, [machineName]);
  const acq = await s.sql<{ account_code: string; d: string; c: string; entry_date: string }>(
    `select l.account_code, l.debit_cents as d, l.credit_cents as c, e.entry_date::text
       from journal_entries e join journal_entry_lines l on l.journal_entry_id = e.id
      where e.source = 'fixed_asset_register' and e.description like '%' || $1`, [machineName]);
  s.check('Dt 1210 12 000 / Cr 1930 12 000, dated the purchase day',
    acq.length === 2 && acq.some((r) => r.account_code === acct?.asset && r.d === '1200000')
      && acq.some((r) => r.account_code === acct?.bank && r.c === '1200000') && acq.every((r) => r.entry_date === `${Y}-10-01`), JSON.stringify(acq));

  const van = await s.must('a van is capitalised through the aliases an external agent uses', 'register_fixed_asset', {
    name: `Battery skåpbil ${s.tag}`, acquisition_cost_cents: 1_000_000, useful_life_years: 5, acquisition_date: `${Y}-10-01`,
    depreciation_method: 'declining', declining_rate: 0.3,
  });
  const vanId = s.idOf(van, 'asset');
  s.equal('the aliases land as 10 000 kr on 60 months', `${van.cost_cents}/${van.useful_life_months}/${van.purchase_date}`, `1000000/60/${Y}-10-01`);
  const tool = await s.must('a tool is capitalised: 1 000 kr on three months', 'register_fixed_asset', {
    name: `Battery verktyg ${s.tag}`, cost_cents: 100_000, useful_life_months: 3, purchase_date: `${Y}-10-01`,
  });
  const toolId = s.idOf(tool, 'asset');

  // ── Depreciate ────────────────────────────────────────────────────────────
  await s.must('the month BEFORE the assets were in service is run', 'run_monthly_depreciation', { period_date: `${Y}-09-15` });
  s.equal('nothing is depreciated before the in-service date', await entries(s, machineId), '0/0');

  await s.must('October is run', 'run_monthly_depreciation', { period_date: `${Y}-10-15` });
  s.equal('the machine takes 200 kr', await entries(s, machineId), '1/20000');
  s.equal('the van takes 30 % / 12 of 10 000 kr = 250 kr', await entries(s, vanId), '1/25000');
  await s.must('October is run a second time', 'run_monthly_depreciation', { period_date: `${Y}-10-28` });
  s.equal('the month is booked once', await entries(s, machineId), '1/20000');
  const oct = await s.one<{ entry_date: string; lines: string }>(
    `select e.entry_date::text, string_agg(l.account_code || ':' || l.debit_cents || ':' || l.credit_cents, ',' order by l.debit_cents desc) as lines
       from depreciation_entries d join journal_entries e on e.id = d.journal_entry_id join journal_entry_lines l on l.journal_entry_id = e.id
      where d.asset_id = $1 group by e.id`, [machineId]);
  s.equal('Dt 7832 / Cr 1219, dated the last of the month', `${oct?.entry_date} ${oct?.lines}`, `${Y}-10-31 ${acct?.expense}:20000:0,${acct?.accumulated}:0:20000`);

  await s.must('November is run', 'run_monthly_depreciation', { period_date: `${Y}-11-01` });
  await s.must('December is run', 'run_monthly_depreciation', { period_date: `${Y}-12-01` });
  s.equal('the machine: three months, 600 kr', await entries(s, machineId), '3/60000');
  s.equal('the van: 250 + 243.75 + 237.66 = 731.41 kr', await entries(s, vanId), '3/73141');
  const accumulated = await s.sql<{ id: string; accumulated_cents: string; status: string }>(
    'select id, accumulated_cents, status from fixed_assets where id = any($1)', [[machineId, vanId, toolId]]);
  const asset = (id: string) => accumulated.find((r) => r.id === id);
  s.equal('the assets carry what their entries sum to', `${asset(machineId)?.accumulated_cents}/${asset(vanId)?.accumulated_cents}`, '60000/73141');
  // FINDING 2026-09-19: straight line is cost / months in integer division and the remainder is never placed —
  // 1 000 kr on three months books 333.33 × 3 and leaves 1 öre and an "active" asset for a fourth month.
  s.equal('the three-month tool is fully depreciated after three months', `${asset(toolId)?.accumulated_cents}/${asset(toolId)?.status}`, '100000/fully_depreciated');
  await s.booksBalance('every depreciation entry balances',
    'e.id in (select journal_entry_id from depreciation_entries where asset_id = any($1))', [[machineId, vanId, toolId]]);

  // ── Year-end ──────────────────────────────────────────────────────────────
  const proposal = await s.must('the year-end proposal is read', 'propose_annual_depreciation', { p_year: Y });
  const mine = ((proposal.proposals ?? []) as Array<{ asset_id: string; annual_amount_cents: number; book_value_before_cents: number }>).find((p) => p.asset_id === machineId);
  s.equal('the proposal knows the machine\'s book value (12 000 − 600)', mine?.book_value_before_cents, 1_140_000);
  // FINDING 2026-09-19: the proposal is always twelve months of the plan — it ignores that the asset went into
  // service in October and that October–December are already booked. Posting it (as its own note instructs)
  // puts 3 000 kr of depreciation on a year that should carry 600.
  s.equal('nothing more is proposed for a year whose three in-service months are already booked', mine?.annual_amount_cents ?? 0, 0);
  const ye = await s.must('run_year_end orchestrates the same proposal', 'run_year_end', { p_year: Y });
  s.check('its report carries the depreciation proposals', JSON.stringify(ye).includes(machineId), JSON.stringify(ye).slice(0, 300));
  s.equal('reading proposals posts nothing', await entries(s, machineId), '3/60000');

  // ── Impair ────────────────────────────────────────────────────────────────
  await s.mustRefuse('a manual write-down below zero is refused', 'post_manual_depreciation',
    { asset_id: machineId, amount_cents: 1_140_001, period_date: `${Y}-12-31` }, /exceeds remaining/i);
  const imp = await s.must('the machine is impaired to 10 000 kr', 'revalue_fixed_asset', {
    asset_id: machineId, new_value_cents: 1_000_000, reason: 'process battery', revaluation_date: `${Y}-12-31`,
  });
  s.equal('an impairment of 1 400 kr is posted', `${imp.kind}/${imp.amount_cents}/${imp.new_nbv_cents}`, 'impairment/140000/1000000');
  await s.booksBalance('the impairment entry balances', 'e.id = $1', [String(imp.journal_entry_id)]);
  // FINDING 2026-09-19: the skill says "Revaluing above original cost is rejected"; the function only rejects when there
  // is nothing accumulated — otherwise it answers success and quietly reverses ALL depreciation back to cost.
  // (Tried on the throw-away tool so the machine's numbers below stay what they are.)
  await s.mustRefuse('revaluing above the original cost is refused', 'revalue_fixed_asset',
    { asset_id: toolId, new_value_cents: 5_000_000, revaluation_date: `${Y}-12-31` }, /above original cost|cannot revalue/i);

  // ── Retire ────────────────────────────────────────────────────────────────
  const gates = s.handshakes.length;
  const sold = await s.must('the machine is sold for 11 000 kr', 'dispose_fixed_asset', {
    asset_id: machineId, sale_amount_cents: 1_100_000, disposal_date: `${Y + 1}-01-15`,
  });
  s.check('the disposal waited for a human', s.handshakes.slice(gates).some((g) => g.skill === 'dispose_fixed_asset' && g.gate === 'human'), JSON.stringify(s.handshakes.slice(gates)));
  s.equal('book value 10 000, sold 11 000 → gain 1 000', `${sold.nbv_cents}/${sold.gain_loss_cents}`, '1000000/100000');
  await s.booksBalance('the disposal entry balances', 'e.id = $1', [String(sold.journal_entry_id)]);
  const disposal = await s.sql<{ account_code: string; d: string; c: string }>(
    'select account_code, debit_cents as d, credit_cents as c from journal_entry_lines where journal_entry_id = $1', [String(sold.journal_entry_id)]);
  const dl = (code?: string) => disposal.find((r) => r.account_code === code);
  s.equal('Cr 1210 cost, Dt 1219 accumulated, Dt 1930 proceeds, Cr 3970 gain',
    `${dl(acct?.asset)?.c}/${dl(acct?.accumulated)?.d}/${dl(acct?.bank)?.d}/${dl(acct?.gain)?.c}`, '1200000/200000/1100000/100000');

  const scrapped = await s.must('the van is scrapped for nothing', 'dispose_fixed_asset', { asset_id: vanId, sale_amount_cents: 0, disposal_date: `${Y + 1}-01-15` });
  s.equal('its whole book value is the loss: 10 000 − 731.41', scrapped.gain_loss_cents, -926_859);
  const loss = await s.one<{ d: string }>(
    'select debit_cents as d from journal_entry_lines where journal_entry_id = $1 and account_code = $2', [String(scrapped.journal_entry_id), acct?.loss]);
  s.equal('Dt 7970 carries the loss', loss?.d, 926_859);
  await s.booksBalance('the scrapping entry balances', 'e.id = $1', [String(scrapped.journal_entry_id)]);

  // Everything ever booked on the two assets, per account: the asset accounts must be back at zero.
  const net = await s.sql<{ account_code: string; net: string }>(
    `select l.account_code, sum(l.debit_cents - l.credit_cents) as net from journal_entry_lines l
      where l.journal_entry_id in (
        select journal_entry_id from depreciation_entries where asset_id = any($1)
        union select journal_entry_id from asset_revaluations where asset_id = any($1)
        union select id from journal_entries where source = 'fixed_asset_register' and description = any($2)
        union select unnest($3::uuid[]))
      group by 1`, [[machineId, vanId], [machineName, `Battery skåpbil ${s.tag}`].map((x) => `Acquisition of fixed asset: ${x}`), [String(sold.journal_entry_id), String(scrapped.journal_entry_id)]]);
  const n = (code?: string) => Number(net.find((r) => r.account_code === code)?.net ?? 0);
  s.equal('1210 and 1219 are back at zero for the two disposed assets', `${n(acct?.asset)}/${n(acct?.accumulated)}`, '0/0');
  // 22 000 paid, 11 000 received; 600 + 731.41 depreciation, 1 400 impairment, 9 268.59 loss, 1 000 gain.
  s.equal('the bank is down 11 000 kr, and the P&L explains exactly that',
    `${n(acct?.bank)}/${n(acct?.expense) + n(acct?.impairment) + n(acct?.loss) + n(acct?.gain)}`, '-1100000/1100000');

  const gone = await s.sql<{ status: string; disposed_at: string; disposed_amount_cents: string }>(
    'select status, disposed_at::text, disposed_amount_cents from fixed_assets where id = any($1) order by cost_cents desc', [[machineId, vanId]]);
  s.equal('both assets are disposed on the day, with their proceeds', gone.map((g) => `${g.status}/${g.disposed_at}/${g.disposed_amount_cents}`).join(' '),
    `disposed/${Y + 1}-01-15/1100000 disposed/${Y + 1}-01-15/0`);
  await s.mustRefuse('an asset cannot be disposed twice', 'dispose_fixed_asset', { asset_id: machineId, sale_amount_cents: 1 }, /already disposed/i);
  await s.mustRefuse('no depreciation is posted on a disposed asset', 'post_manual_depreciation', { asset_id: machineId, amount_cents: 100, period_date: `${Y + 1}-02-01` }, /disposed/i);
  await s.must('the month after the disposal is run', 'run_monthly_depreciation', { period_date: `${Y + 1}-02-01` });
  s.equal('the sweep leaves the disposed machine alone', await entries(s, machineId), '3/60000');

  // Leave nothing active behind for the next run's sweep.
  await s.skill('dispose_fixed_asset', { asset_id: toolId, sale_amount_cents: 0, disposal_date: `${Y + 1}-02-28` });
  const stray = await s.one<{ id: string }>(`select id from fixed_assets where name = $1 and status <> 'disposed'`, [`Battery restvärde ${s.tag}`]);
  if (stray) await s.skill('dispose_fixed_asset', { asset_id: stray.id, sale_amount_cents: 0, disposal_date: `${Y + 1}-02-28` });
}

/** "<count>/<sum>" of the non-manual depreciation entries on an asset. */
async function entries(s: Scenario, assetId: string): Promise<string> {
  const row = await s.one<{ n: string; cents: string }>(
    'select count(*) as n, coalesce(sum(amount_cents), 0) as cents from depreciation_entries where asset_id = $1', [assetId]);
  return `${row?.n}/${row?.cents}`;
}

export default { process: 'acquire-to-retire', run } satisfies ScenarioModule;
