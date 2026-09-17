import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A skill's schema is the agent's whole picture of what it can do. The process
 * sweep 2026-09-17 found schemas that lied in both directions: fields that
 * existed on the table but not in the schema (an employee could not be given a
 * salary, a project a rate, a product a place at the till), fields and actions
 * in the schema that nothing accepted (salary_range, publish, close, job_id),
 * tables no skill reached at all, and account numbers in instruction text that
 * named the wrong BAS account.
 *
 * These pin the shapes, not the names.
 */

const root = join(__dirname, '../../..');
const artifact = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8')) as {
  modules: Array<{ moduleId: string; skills: Array<{ name: string; handler?: string; instructions?: string; description?: string; tool_definition?: { function?: { parameters?: { properties?: Record<string, unknown>; 'x-action-required'?: Record<string, string[]> } } } }> }>;
};
const seeds = artifact.modules.flatMap((m) => m.skills);
const byName = new Map(seeds.map((s) => [s.name, s]));
const props = (name: string) => Object.keys(byName.get(name)?.tool_definition?.function?.parameters?.properties ?? {});
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrations.indexOf(e, start)).filter((x) => x > -1);
  return migrations.slice(start, Math.min(...ends));
}

describe('the schema names what the row carries', () => {
  it('an employee can be given what payroll reads', () => {
    for (const f of ['monthly_salary_cents', 'tax_rate_pct', 'user_id', 'payroll_country', 'personal_number']) expect(props('manage_employee'), f).toContain(f);
  });
  it('a project can be given the rate invoicing prices time at', () => {
    for (const f of ['hourly_rate_cents', 'currency', 'is_billable', 'partner_id']) expect(props('manage_project'), f).toContain(f);
  });
  it('a product can be born sellable at the till', () => {
    expect(props('manage_product')).toContain('available_in_pos');
    expect(agentExecute).toMatch(/if \(available_in_pos !== undefined\) insertData\.available_in_pos = available_in_pos;/);
  });
  it('a job posting advertises only columns that exist, and its verbs run', () => {
    const p = props('manage_job_posting');
    for (const f of ['salary_range', 'job_id']) expect(p, `${f} is not a column`).not.toContain(f);
    for (const f of ['job_posting_id', 'required_skills', 'salary_min_cents']) expect(p).toContain(f);
    expect(agentExecute).toMatch(/job_postings: \{\s*publish: \{ status: 'published'/);
  });
  it('every depreciation method the table accepts is offered', () => {
    const enumValues = (byName.get('register_fixed_asset')?.tool_definition?.function?.parameters?.properties?.depreciation_method as { enum?: string[] })?.enum ?? [];
    expect(enumValues.sort()).toEqual(['declining', 'straight_line', 'sum_of_years', 'units_of_production']);
  });
});

describe('every table a process needs has a skill', () => {
  it.each(['manage_application', 'manage_skill', 'manage_employee_skill', 'manage_maintenance_schedule', 'manage_pos_register'])('%s exists', (name) => {
    expect(byName.has(name)).toBe(true);
  });
  it('the generic CRUD allowlist reaches the tables behind them', () => {
    for (const t of ['employee_skills', 'skills_catalog', 'maintenance_schedules', 'pos_registers', 'applications']) {
      expect(agentExecute, t).toMatch(new RegExp(`'${t}'`));
    }
  });
});

describe('instruction text names the right BAS accounts', () => {
  it('representation is 6071/6072, travel is 5800, and 7690 is never called representation', () => {
    const text = seeds.map((s) => `${s.description ?? ''} ${s.instructions ?? ''}`).join('\n');
    expect(text).not.toMatch(/7690 for representation/);
    expect(text).not.toMatch(/6071 for travel/);
    const receipt = readFileSync(join(root, 'supabase/functions/ai-task/tasks.ts'), 'utf8');
    expect(receipt).toMatch(/representation: "6071"/);
  });
});

describe('small truths in the RPCs', () => {
  it('a webinar registration scores the lead once and respects capacity', () => {
    const b = latestFunctionBody('register_for_webinar');
    expect(b).toMatch(/webinar is full/);
    expect(b).toMatch(/IF v_is_new AND v_lead_id IS NOT NULL AND v_lead_existed THEN/);
  });
  it('attendance scores on the flip, not the repeat', () => {
    expect(latestFunctionBody('mark_webinar_attendance')).toMatch(/NOT COALESCE\(v_was, false\)/);
  });
  it('the stage comment is written, the churn reason is one row, the depreciation proposal is capped', () => {
    expect(latestFunctionBody('move_application_stage')).toMatch(/set comment = p_comment/);
    expect(latestFunctionBody('record_churn_reason')).toMatch(/UPDATE public\.subscription_churn_reasons/);
    expect(latestFunctionBody('propose_annual_depreciation')).toMatch(/book_value_before_cents/);
    expect(latestFunctionBody('propose_annual_depreciation')).toMatch(/post_manual_depreciation/);
  });
});
