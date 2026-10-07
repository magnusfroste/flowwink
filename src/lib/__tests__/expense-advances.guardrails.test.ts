import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expensesModule } from '@/lib/modules/expenses-module';

/**
 * The expense advance is settled against the report.
 *
 * An employee paid BEFORE the trip was paid again by mark_expense_report_paid,
 * because nothing in expenses knew the money was already out. The advance is now
 * a row with a booking; booking the report settles it against the liability; the
 * payout is only the rest. These guards keep that chain — and the one account
 * role it rides on — in place.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261005120000_forskottet-raknas-av-mot-utlagget.sql');

describe('the expense advance', () => {
  it('rides one account role, seeded for both shipped charts, never a literal in the function', () => {
    expect(migration).toMatch(/\('se-bas2024',\s+'employee_advance', '1610'/);
    expect(migration).toMatch(/\('ifrs-generic',\s+'employee_advance', '1400'/);
    const fn = migration.slice(migration.indexOf('FUNCTION public.manage_expense_advance('), migration.indexOf('-- 3 ─'));
    expect(fn).toMatch(/account_for\('employee_advance'\)/);
    expect(fn).toMatch(/account_for\('bank'\)/);
    expect(fn).not.toMatch(/'1610'|'1930'/);
  });

  it('can never be settled or repaid past its amount', () => {
    expect(migration).toMatch(/settled_cents \+ repaid_cents <= amount_cents/);
    expect(migration).toMatch(/exceeds what remains of the advance/);
    expect(migration).toMatch(/already closed — nothing left to repay/);
  });

  it('is settled when the report is booked — oldest first, in its own entry, never beyond the liability', () => {
    const book = migration.slice(migration.indexOf('FUNCTION public.book_expense_report('), migration.indexOf('FUNCTION public.mark_expense_report_paid('));
    expect(book).toMatch(/FROM public\.expense_advances[\s\S]*status = 'open'[\s\S]*ORDER BY granted_at, created_at[\s\S]*FOR UPDATE/);
    expect(book).toMatch(/LEAST\(v_adv\.amount_cents - v_adv\.settled_cents - v_adv\.repaid_cents, v_total_cents - v_settled\)/);
    expect(book).toMatch(/'expense_advance', 'posted'/);
    expect(book).toMatch(/INSERT INTO public\.expense_advance_settlements/);
    expect(book).toMatch(/advance_settled_cents = v_settled/);
  });

  it('the payout is what the advance did not cover, and a covered report moves no money', () => {
    const paid = migration.slice(migration.indexOf('FUNCTION public.mark_expense_report_paid('));
    expect(paid).toMatch(/GREATEST\(v_total_cents - COALESCE\(v_report\.advance_settled_cents, 0\), 0\)/);
    expect(paid).toMatch(/IF v_total_cents > 0 THEN[\s\S]*INSERT INTO journal_entries/);
    expect(paid).toMatch(/'paid_cents', v_total_cents/);
  });

  it('is gated on the expenses module, and the employee reads their own', () => {
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR can_access_module\(auth\.uid\(\), 'expenses'\)/);
    expect(migration).toMatch(/Employees see their own advances/);
    expect(migration).not.toMatch(/has_role\(/);
  });

  it('has both surfaces: the skill and the Advances tab', () => {
    const skill = expensesModule.skillSeeds?.find((s) => s.name === 'manage_expense_advance');
    expect(skill?.handler).toBe('rpc:manage_expense_advance');
    const actions = (skill?.tool_definition as { function: { parameters: { properties: { p_action: { enum: string[] } } } } }).function.parameters.properties.p_action.enum;
    expect(actions).toEqual(['grant', 'repay', 'get', 'list']);
    expect(expensesModule.skillSeeds?.find((s) => s.name === 'book_expense_report')?.description).toMatch(/advance/);
    expect(expensesModule.skillSeeds?.find((s) => s.name === 'mark_expense_report_paid')?.description).toMatch(/advance/);
    expect(read('src/pages/admin/ExpensesPage.tsx')).toContain('<ExpenseAdvancesTab />');
    expect(read('src/components/admin/expenses/ExpenseReportsTab.tsx')).toContain('advance_settled_cents');
  });

  it('the process battery runs it end to end', () => {
    const scenario = read('scripts/process-battery/scenarios/procure-to-pay.ts');
    for (const a of ['grant', 'repay', 'get', 'list']) expect(scenario).toContain(`p_action: '${a}'`);
    expect(scenario).toMatch(/exceeds what remains/);
    expect(scenario).toMatch(/already closed/);
    expect(scenario).toMatch(/settlement_entry_id/);
  });
});
