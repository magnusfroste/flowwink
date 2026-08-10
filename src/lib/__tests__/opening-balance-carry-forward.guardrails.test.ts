import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * UB blir IB — and the opening balance is never stored twice.
 *
 * The balance sheet used to read `opening_balances` for the SELECTED year, so
 * any year without a stored row opened at zero. On liteit only 2026 had rows;
 * 2023, 2024 and 2025 showed no opening balance at all despite four years of
 * reconciled bookkeeping.
 *
 * The missing rows were the symptom. The defect was storing a carry-forward:
 * the same number lived as 2025's closing balance AND 2026's opening balance,
 * and the two had already drifted — one said the loan sat on 2393 (long-term),
 * the other on 2893 (short-term). Same money, different balance sheet.
 *
 * These tests lock the RULE, not the SQL. If someone reintroduces a per-year
 * lookup the drift comes back, and it comes back silently.
 */

const ROOT = join(__dirname, '../../..');
const hook = readFileSync(join(ROOT, 'src/hooks/useAccounting.ts'), 'utf8');
const migration = readFileSync(
  join(ROOT, 'supabase/migrations/20260810230000_the-closing-balance-becomes-the-opening-balance.sql'),
  'utf8',
);

describe('the opening balance is derived, not stored per year', () => {
  it('the report does not look up opening_balances by fiscal year', () => {
    // The exact shape of the old bug: .from('opening_balances') … .eq('fiscal_year', year)
    const readsTable = /from\(\s*['"]opening_balances['"]\s*\)/.test(hook);
    expect(
      readsTable,
      'useAccounting must not read opening_balances directly — a year without a row would open at zero. Use opening_balances_for_year().',
    ).toBe(false);
  });

  it('both the balance sheet and the account ledger use the same rule', () => {
    // One rule in one place. When these diverged, the balance sheet and the
    // account ledger could disagree about the same account on the same day.
    const calls = hook.match(/opening_balances_for_year/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('derives from entries posted BEFORE the year starts', () => {
    expect(migration).toMatch(/entry_date\s*<\s*v_start/);
    expect(migration).toMatch(/status\s*=\s*'posted'/);
  });

  it('counts only balance-sheet accounts, by account_type — never by digit', () => {
    // 2641 is an asset in class 2, and class 8 holds income, revenue and
    // expense side by side. Prefix logic gets both wrong. Same ruling as the
    // 8999 result-carrier incident: classification belongs to the chart.
    expect(migration).toMatch(/account_type\s+IN\s*\(\s*'asset',\s*'equity',\s*'liability'\s*\)/);
    expect(
      /left\(\s*(c\.)?account_code\s*,\s*1\s*\)/.test(migration),
      'classification must come from the chart of accounts, not from the leading digit',
    ).toBe(false);
  });

  it('treats only the EARLIEST stored year as the bridge', () => {
    // Later years are legacy copies of a carry-forward. Honouring them would
    // re-create the drift this replaces.
    expect(migration).toMatch(/min\(fiscal_year\)/);
  });

  it('does not double-count entries that predate the bridge', () => {
    // The bridge already states the position at its own start; entries before
    // it are inside that number.
    expect(migration).toMatch(/entry_date\s*>=\s*make_date\(\s*v_bridge_year/);
  });

  it('does not apply a bridge dated after the year being asked about', () => {
    expect(migration).toMatch(/p_year\s*>=\s*v_bridge_year/);
  });
});

describe('one piece of state, one control', () => {
  const tab = readFileSync(
    join(ROOT, 'src/components/admin/accounting/OpeningBalancesTab.tsx'),
    'utf8',
  );

  it('the opening balances tab has no year picker of its own', () => {
    // It used to carry a second one, hardcoded to the current year ±2 — so
    // picking 2022 in the page header left this control blank while the table
    // below showed a year the control could not represent.
    expect(tab).not.toMatch(/currentYear\s*[-+]\s*\d/);
    expect(tab).not.toMatch(/setFiscalYear/);
  });
});
