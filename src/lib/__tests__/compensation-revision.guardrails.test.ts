import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hrModule } from '@/lib/modules/hr-module';

/**
 * The salary revision round: the recommendation a review carries (salary_adjustment_pct)
 * becomes a salary through a budgeted round, and every salary change leaves a history row.
 *
 * Before 2026-10-06 a salary change was an UPDATE on employees.monthly_salary_cents with
 * no date, no reason and no trace; the hire-to-retire doc said "⚠️ Compensation planning …
 * what is missing is a budgeted revision round". These guards keep the round's rules and
 * both surfaces (panel + skill) in place.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261005100000_lonerevisionen-gor-rekommendationen-till-lon.sql');

describe('the salary revision round', () => {
  const skills = new Map(hrModule.skillSeeds?.map((s) => [s.name, s]) ?? []);

  it('is a skill in the HR module riding the RPC, with the whole flow as actions', () => {
    const skill = skills.get('manage_compensation_revision');
    expect(skill?.handler).toBe('rpc:manage_compensation_revision');
    const actions = (skill?.tool_definition as { function: { parameters: { properties: { p_action: { enum: string[] } } } } }).function.parameters.properties.p_action.enum;
    for (const a of ['create', 'propose', 'exclude', 'include', 'summary', 'approve', 'apply', 'apply_due', 'cancel', 'history']) expect(actions).toContain(a);
  });

  it('an approved round applies itself on its date — the automation carries apply_due', () => {
    const auto = hrModule.automations?.find((a) => a.skill_name === 'manage_compensation_revision');
    expect(auto?.skill_arguments).toEqual({ p_action: 'apply_due' });
    expect(migration).toMatch(/p_action = 'apply_due'/);
  });

  it('approval is measured against the budget and application against the date', () => {
    expect(migration).toMatch(/Over budget by/);
    expect(migration).toMatch(/not yet effective/);
    expect(migration).toMatch(/Only a draft round can be changed/);
    expect(migration).toMatch(/Only an approved round can be applied/);
    expect(migration).toMatch(/A salary cut needs a rationale/);
  });

  it('a line is pre-filled from the latest review recommendation, never from one an applied round already used', () => {
    expect(migration).toMatch(/r\.salary_adjustment_pct IS NOT NULL/);
    expect(migration).toMatch(/cr\.status = 'applied'/);
  });

  it('applying writes the salary, the history row and the contract in force', () => {
    expect(migration).toMatch(/UPDATE employees SET monthly_salary_cents = v_line\.proposed_cents/);
    expect(migration).toMatch(/INSERT INTO employee_salary_history[\s\S]*'revision'/);
    expect(migration).toMatch(/UPDATE employment_contracts[\s\S]*status IN \('active', 'signed'\)/);
  });

  it('every salary change outside a round is logged by the trigger — and the round does not double-log', () => {
    expect(migration).toMatch(/CREATE TRIGGER employee_salary_history_trg[\s\S]*AFTER INSERT OR UPDATE OF monthly_salary_cents ON public\.employees/);
    expect(migration).toMatch(/current_setting\('flowwink\.salary_change', true\)/);
    expect(migration).toMatch(/set_config\('flowwink\.salary_change', 'revision', true\)/);
  });

  it('is gated on the HR module, and the employee reads their own history', () => {
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR can_access_module\(auth\.uid\(\), 'hr'\)/);
    expect(migration).toMatch(/Employees see their own salary history/);
    expect(migration).not.toMatch(/has_role\(/);
  });

  it('the panel shows the same round and history the skill writes', () => {
    const panel = read('src/components/admin/hr/CompensationPanel.tsx');
    expect(panel).toContain('<SalaryRevisionsCard />');
    expect(panel).toContain('<SalaryHistoryCard />');
    const card = read('src/components/admin/hr/SalaryRevisionsCard.tsx');
    for (const a of ['"create"', '"propose"', '"summary"']) expect(card).toContain(`p_action: ${a}`);
    for (const a of ['run("approve")', 'run("apply"', 'run("cancel")']) expect(card).toContain(a);
    expect(read('src/components/admin/hr/SalaryHistoryCard.tsx')).toContain('p_action: "history"');
  });

  it('the process battery runs the round', () => {
    const scenario = read('scripts/process-battery/scenarios/hire-to-retire.ts');
    for (const a of ['create', 'propose', 'summary', 'approve', 'apply', 'apply_due', 'cancel', 'history']) expect(scenario).toContain(`p_action: '${a}'`);
    expect(scenario).toMatch(/over budget/i);
    expect(scenario).toMatch(/not yet effective/);
  });
});
