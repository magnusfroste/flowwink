import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * One model for the fiscal year (20261026120000): the key is the calendar
 * year it ends in, the dates come from fiscal_year_of / fiscal_year_range,
 * and nothing in the accounting pages or the SQL spells January–December
 * on its own again.
 */
describe('the fiscal year has one model', () => {
  const sql = read('supabase/migrations/20261026120000_rakenskapsaret-far-en-modell.sql');

  it('the readers go through fiscal_year_of / fiscal_year_range', () => {
    for (const fn of ['is_period_closed', 'close_accounting_period', 'list_fiscal_years', 'year_end_readiness', 'propose_accruals']) {
      const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}(`));
      const end = body.indexOf('$fn$;');
      expect(body.slice(0, end), `${fn} does not read the fiscal model`).toMatch(/fiscal_(year_of|year_range|period_start)\(/);
    }
    expect(sql).toMatch(/v_year := public\.fiscal_year_of\(NEW\.entry_date\);/); // vouchers per fiscal year
    expect(sql).toMatch(/EXCLUDE USING gist \(daterange\(date_from, date_to, '\[\]'\) WITH &&\)/);
  });

  it('the accounting pages take the year\'s dates from the context, never from `${year}-01-01`', () => {
    const ctx = read('src/components/admin/accounting/FiscalYearContext.tsx');
    expect(ctx).toMatch(/fiscalYearRange\(year, startMonth, explicitYears\)/);
    for (const f of ['BalanceSheetTab', 'ProfitLossTab', 'LedgerTab', 'dashboard/ResultCard', 'dashboard/PeriodStatusCard']) {
      const src = read(`src/components/admin/accounting/${f}.tsx`);
      expect(src, `${f} spells its own calendar year`).not.toMatch(/\$\{(year|fiscalYear)\}-(01-01|12-31)/);
    }
    const hook = read('src/hooks/useAccounting.ts');
    expect(hook).toMatch(/range\?\.fromDate \?\? `\$\{year\}-01-01`/);
  });

  it('agent-execute asks the database which period a date is in', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/rpc\('period_status_for_date'/);
    expect(src).toMatch(/rpc\('fiscal_year_of'/);
    expect(src).not.toMatch(/\.eq\('fiscal_year', d\.getFullYear\(\)\)/);
  });
});
