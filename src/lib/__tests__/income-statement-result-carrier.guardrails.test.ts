import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildIncomeStatement,
  unclosedResultCents,
  EMPTY_CLASSIFICATION,
  type StatementAccount,
  type StatementClassification,
} from '../../../supabase/functions/_shared/accounting/income-statement.ts';

/**
 * Guardrail: an income statement whose net result is zero for every closed year.
 *
 * The closing entry books the year's result onto a P&L-side account and credits
 * equity. Summing every P&L account therefore counts the result twice with
 * opposite signs and lands on exactly zero — silently, and for every company.
 *
 * The fixtures below are LiteIT's real posted ledger (instance cdwpqcevbcbqxhycsqhm,
 * read 2026-08-10), and the expected results are the ones in the filed
 * årsredovisningar. Two years, one profit and one loss, because a fix that only
 * handles a debit-side carrier passes half of this.
 */

const acct = (
  code: string,
  name: string,
  type: string,
  normal: 'debit' | 'credit',
  debit: number,
  credit: number,
): StatementAccount => ({
  account_code: code,
  account_name: name,
  account_type: type,
  debit_total: debit,
  credit_total: credit,
  balance: normal === 'debit' ? debit - credit : credit - debit,
});

/** LiteIT 2024. Årsredovisningen: result +19 537,11, tax 5 069,00. */
const LITEIT_2024: StatementAccount[] = [
  acct('3740', 'Öres- och kronutjämning', 'income', 'credit', 10, 0),
  acct('6570', 'Bankkostnader', 'expense', 'debit', 156600, 0),
  acct('8221', 'Resultat vid försäljning av andelar', 'revenue', 'credit', 0, 2599121),
  acct('8314', 'Skattefria ränteintäkter', 'revenue', 'credit', 0, 18100),
  acct('8910', 'Skatt som belastar årets resultat', 'expense', 'debit', 506900, 0),
  acct('8999', 'Årets resultat', 'expense', 'debit', 1953711, 0),
];

/** LiteIT 2025. Årsredovisningen: result −16 344,35, no tax. */
const LITEIT_2025: StatementAccount[] = [
  acct('6570', 'Bankkostnader', 'expense', 'debit', 171035, 0),
  acct('8221', 'Resultat vid försäljning av andelar', 'revenue', 'credit', 1470000, 0),
  acct('8314', 'Skattefria ränteintäkter', 'revenue', 'credit', 0, 6600),
  acct('8999', 'Årets resultat', 'expense', 'debit', 0, 1634435),
];

const SE: StatementClassification = {
  resultCarrierAccounts: ['8990', '8999'],
  taxAccounts: ['8910', '8920', '8930', '8940', '8980'],
  source: 'account_statement_sections',
};

describe('the year-result account is not a line on the income statement', () => {
  it('LiteIT 2024 reports the result in the årsredovisning, not zero', () => {
    const s = buildIncomeStatement(LITEIT_2024, SE);
    expect(s.net_result_cents).toBe(1953711);
    expect(s.result_before_tax_cents).toBe(2460611);
    expect(s.tax_cents).toBe(506900);
    expect(s.total_income_cents).toBe(2617211);
    // Tax and the carrier are both out of the expense block; only 6570 is left.
    expect(s.expenses.map((e) => e.account_code)).toEqual(['6570']);
    expect(s.tax.map((e) => e.account_code)).toEqual(['8910']);
    expect(s.income.concat(s.expenses, s.tax).map((r) => r.account_code)).not.toContain('8999');
    expect(s.profitable).toBe(true);
  });

  it('LiteIT 2025 reports the loss, and a credit-side carrier is handled too', () => {
    // A fix that only subtracts a debit balance passes 2024 and silently keeps
    // returning zero for every loss-making year.
    const s = buildIncomeStatement(LITEIT_2025, SE);
    expect(s.net_result_cents).toBe(-1634435);
    expect(s.result_before_tax_cents).toBe(-1634435);
    expect(s.tax_cents).toBe(0);
    expect(s.profitable).toBe(false);
  });

  it('reports that the closing entry agrees with the result it computed', () => {
    // The carrier must hold exactly the net result once the year is closed.
    // If it does not, either the closing entry is partial or an account is
    // classified wrongly, and the report is the place that finds out.
    for (const fixture of [LITEIT_2024, LITEIT_2025]) {
      const s = buildIncomeStatement(fixture, SE);
      expect(s.result_carrier.closed_to_equity_cents).toBe(s.net_result_cents);
      expect(s.result_carrier.agrees_with_net_result).toBe(true);
    }
  });

  it('flags a half-booked closing entry instead of averaging it away', () => {
    const partial = LITEIT_2024.map((a) =>
      a.account_code === '8999' ? acct('8999', 'Årets resultat', 'expense', 'debit', 1000000, 0) : a,
    );
    const s = buildIncomeStatement(partial, SE);
    expect(s.net_result_cents).toBe(1953711);
    expect(s.result_carrier.agrees_with_net_result).toBe(false);
  });

  it('an open year — no closing entry yet — reports the same result', () => {
    const open = LITEIT_2024.filter((a) => a.account_code !== '8999');
    const s = buildIncomeStatement(open, SE);
    expect(s.net_result_cents).toBe(1953711);
    expect(s.result_carrier.closed_to_equity_cents).toBe(0);
    // Nothing carried across yet is not a disagreement.
    expect(s.result_carrier.agrees_with_net_result).toBe(true);
  });

  it('a chart with no carrier at all (IFRS closes to retained earnings) is fine', () => {
    const ifrs: StatementAccount[] = [
      acct('4000', 'Revenue from Contracts', 'revenue', 'credit', 0, 500000),
      acct('6700', 'Office & General', 'expense', 'debit', 120000, 0),
      acct('8000', 'Income Tax Expense', 'expense', 'debit', 80000, 0),
    ];
    const s = buildIncomeStatement(ifrs, {
      resultCarrierAccounts: [],
      taxAccounts: ['8000'],
      source: 'account_statement_sections',
    });
    expect(s.result_before_tax_cents).toBe(380000);
    expect(s.net_result_cents).toBe(300000);
    expect(s.result_carrier.note).toBeUndefined();
  });

  it('NEGATIVE CONTROL: unclassified, the bug is still there and this test sees it', () => {
    // The check above only proves anything if the same fixture through the OLD
    // behaviour actually fails it. With no carrier mapped, 8999 is an ordinary
    // expense — which is precisely what shipped, and what returned zero.
    const s = buildIncomeStatement(LITEIT_2024, EMPTY_CLASSIFICATION);
    expect(s.net_result_cents).toBe(0);
    expect(s.total_income_cents).toBe(s.total_expenses_cents);
    // And an unmapped instance says so rather than presenting the zero as fact.
    expect(s.result_carrier.source).toBe('unmapped');
    expect(s.result_carrier.note).toMatch(/read as zero/);
  });
});

describe('the balance sheet counts the result in equity exactly once', () => {
  it('a closed year adds no plug — equity already holds it', () => {
    // 2099 "Årets resultat" carries 1 953 711 on the equity side. Adding the
    // P&L result on top would overstate equity by the whole year's profit.
    expect(unclosedResultCents(LITEIT_2024, SE)).toBe(0);
    expect(unclosedResultCents(LITEIT_2025, SE)).toBe(0);
  });

  it('an open year plugs the full result, so the sheet balances mid-year', () => {
    const open = LITEIT_2024.filter((a) => a.account_code !== '8999');
    expect(unclosedResultCents(open, SE)).toBe(1953711);
  });

  it('a half-booked closing entry plugs exactly the remainder', () => {
    const partial = LITEIT_2024.map((a) =>
      a.account_code === '8999' ? acct('8999', 'Årets resultat', 'expense', 'debit', 1000000, 0) : a,
    );
    expect(unclosedResultCents(partial, SE)).toBe(1953711 - 1000000);
  });
});

describe('the classification lives in data, not in the engine', () => {
  const migrations = join(process.cwd(), 'supabase/migrations');
  const file = readdirSync(migrations).find((f) => f.includes('income-statement-result-carrier'));
  const sql = file ? readFileSync(join(migrations, file), 'utf8') : '';
  const handler = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/accounting/income-statement.ts'),
    'utf8',
  );

  it('the migration exists and seeds the map', () => {
    expect(file, 'the result-carrier migration is gone').toBeTruthy();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.account_statement_sections');
    expect(sql).toMatch(/UNIQUE \(locale, section, account_code\)/);
  });

  it('the engine reads the map from the instance and never names an account', () => {
    expect(handler).toMatch(/\.from\('account_statement_sections'\)/);
    expect(handler).toMatch(/\.eq\('role', 'year_result'\)/);
    // The whole point. A 4-digit literal here is the bug wearing a fix's clothes.
    const code = handler
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/['"`](1\d{3}|2\d{3}|[3-8]\d{3})['"`]/);
  });

  it('the role and the section map agree about the carrier', () => {
    // Two sources for one fact drift. The report prefers the section map and
    // falls back to the role, so the role's account must be IN the map.
    // The two INSERTs share a row shape, so they are separated by the table
    // they write to before matching.
    const roleBlock = sql.slice(sql.indexOf('INSERT INTO public.account_roles'));
    const sectionBlock = sql.slice(
      sql.indexOf('INSERT INTO public.account_statement_sections'),
      sql.indexOf('INSERT INTO public.account_roles'),
    );
    const roles = [...roleBlock.matchAll(/\('([a-z0-9-]+)',\s*'year_result',\s*'(\d{4})'/g)].map(
      (m) => `${m[1]}:${m[2]}`,
    );
    const sections = [
      ...sectionBlock.matchAll(/\('([a-z0-9-]+)',\s*'year_result',\s*'(\d{4})'/g),
    ].map((m) => `${m[1]}:${m[2]}`);
    // Negative control on the matcher: a pattern that finds nothing would make
    // the comparison below pass vacuously.
    expect(roles.length, 'no year_result role seeded').toBeGreaterThan(0);
    expect(sections.length, 'no year_result section seeded').toBeGreaterThan(0);
    const orphanRoles = roles.filter((r) => !sections.includes(r));
    expect(
      orphanRoles,
      'a role points at an account the section map does not exclude — the report ' +
        'would keep counting it whenever the section map is present',
    ).toEqual([]);
  });

  it('the report handler asks the map instead of filtering by account type alone', () => {
    const index = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/execute/core.ts'),
      'utf8',
    );
    expect(index).toMatch(/loadStatementClassification\(supabase\)/);
    expect(index).toMatch(/buildIncomeStatement\(balances, stmtClassification\)/);
    expect(index).toMatch(/unclosedResultCents\(balances, stmtClassification\)/);
    // The old sum is what produced the zero; it must not survive alongside.
    expect(index).not.toMatch(
      /const currentYearResult = balances\.reduce/,
    );
  });
});
