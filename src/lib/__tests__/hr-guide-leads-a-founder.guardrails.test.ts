/**
 * HR leads a founder through a hire: the HR page opens on "Start here", the
 * guide is ONE function (hr_process_guide) that the page and an agent both
 * read, every step says why, and every fix it hands out is a skill that
 * exists — a guide pointing at a call nobody can make is worse than none.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { hrModule } from '@/lib/modules/hr-module';
import { oneClickOf, type GuideStep } from '@/lib/hr-guide';

const SQL = readFileSync('supabase/migrations/20261031140000_hr-guides-a-founder-through-a-hire.sql', 'utf8');

/** Every skill name declared anywhere in source — modules and platform seeds. */
function declaredSkills(): Set<string> {
  const names = new Set<string>();
  const files = [
    ...readdirSync('src/lib/modules').filter((f) => f.endsWith('.ts')).map((f) => `src/lib/modules/${f}`),
    'src/lib/platform-seeds.ts',
  ];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/^\s{4}name: '([a-z0-9_]+)',$/gm)) names.add(m[1]);
  }
  return names;
}

describe('HR guides a founder through a hire', () => {
  it('the guide is gated by the hr module and readable by the browser and the service role', () => {
    expect(SQL).toMatch(/FUNCTION public\.hr_process_guide\(p_process text DEFAULT 'onboarding', p_employee_id uuid DEFAULT NULL\)/);
    expect(SQL).toContain("can_access_module(auth.uid(), 'hr')");
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.hr_process_guide\(text, uuid\) TO authenticated, service_role/);
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\._hr_onboarding_steps\(uuid\) FROM PUBLIC, anon, authenticated/);
  });

  it('every step says why, and the rule behind it is Swedish only when the business is', () => {
    const steps = [...SQL.matchAll(/'id', '([a-z_]+)', 'phase', '(prepare|first_week|first_months)'/g)].map((m) => m[1]);
    expect(steps.length).toBeGreaterThanOrEqual(10);
    const whys = SQL.match(/'why', '/g) ?? [];
    expect(whys.length).toBeGreaterThanOrEqual(steps.length);
    for (const m of SQL.matchAll(/'law', ([^\n]+)/g)) {
      const v = m[1];
      expect(v.startsWith('NULL') || v.startsWith('CASE WHEN v_se') || v.startsWith("'Register with Skatteverket") || v.startsWith("s -> 'law'"), v).toBe(true);
    }
    // The registration reminder itself only appears for a Swedish business.
    expect(SQL).toMatch(/IF NOT v_any_payroll AND v_se THEN/);
  });

  it('every fix the guide hands out is a skill that exists', () => {
    const known = declaredSkills();
    const fixes = new Set([...SQL.matchAll(/'skill', '([a-z_]+)'/g)].map((m) => m[1]));
    expect(fixes.size).toBeGreaterThan(5);
    for (const skill of fixes) expect(known.has(skill), `${skill} is not declared`).toBe(true);
  });

  it('an agent has the guide and the two writes its steps need', () => {
    const seeds = (hrModule.skillSeeds ?? []) as Array<{ name: string; handler: string; trust_level?: string }>;
    expect(seeds.find((s) => s.name === 'hr_process_guide')).toMatchObject({ handler: 'rpc:hr_process_guide', trust_level: 'auto' });
    expect(seeds.find((s) => s.name === 'manage_employment_contract')?.handler).toBe('db:employment_contracts');
    expect(seeds.find((s) => s.name === 'manage_leave_allocation')?.handler).toBe('db:leave_allocations');
    const exec = readFileSync('supabase/functions/agent-execute/index.ts', 'utf8');
    expect(exec).toMatch(/'employment_contracts', 'leave_allocations',/);
  });

  it('the HR page opens on the guide', () => {
    const page = readFileSync('src/pages/admin/HRPage.tsx', 'utf8');
    expect(page).toContain("useTabParam('guide')");
    expect(page).toContain('<HrGuide');
  });

  it('one click only when no value needs a person, and never for a signature or a salary', () => {
    const step = (fix: GuideStep['fix'], state: GuideStep['state'] = 'todo'): GuideStep => ({
      id: 'x', phase: 'first_week', label: 'x', why: 'x', law: null, required: true, state, due: null, detail: '', fix, open: null,
    });
    expect(oneClickOf(step({ skill: 'manage_leave_allocation', args: { action: 'create', employee_id: 'e', leave_type: 'vacation', year: 2026, allocated_days: 25 } })))
      .toMatchObject({ table: 'leave_allocations', row: { employee_id: 'e', allocated_days: 25 } });
    expect(oneClickOf(step({ skill: 'manage_employee', args: { action: 'update', employee_id: 'e', personal_number: '<YYYYMMDD-XXXX>' } }))).toBeNull();
    expect(oneClickOf(step({ skill: 'sign_employment_contract', args: { p_contract_id: 'c', p_side: 'employer' } }))).toBeNull();
    expect(oneClickOf(step({ skill: 'create_payroll_run', args: { period_date: '2026-11-01' } }))).toBeNull();
    expect(oneClickOf(step({ skill: 'onboarding_checklist', args: { action: 'create', employee_id: 'e', items: [{ title: '<x>' }] } }))).toBeNull();
    expect(oneClickOf(step({ skill: 'manage_leave_allocation', args: { action: 'create', employee_id: 'e' } }, 'done'))).toBeNull();
    // Ticking a checklist item is an update of that checklist, by id — nothing else is.
    expect(oneClickOf(step({ skill: 'onboarding_checklist', args: { action: 'update', id: 'c1', items: [{ key: 'written_notice', title: 'x', done: true }] } })))
      .toMatchObject({ kind: 'update', id: 'c1', table: 'onboarding_checklists' });
    expect(oneClickOf(step({ skill: 'manage_leave_allocation', args: { action: 'update', id: 'a1', allocated_days: 30 } }))).toBeNull();
    expect(oneClickOf(step({ skill: 'end_employment', args: { p_employee_id: 'e', p_initiator: 'employee' } }))).toBeNull();
  });
});

const OFF = readFileSync('supabase/migrations/20261031150000_hr-guides-someone-leaving.sql', 'utf8');

describe('HR guides a founder through someone leaving', () => {
  it('the decision is one function, gated, checked against LAS 11 §, and waits for a person when an agent asks', () => {
    expect(OFF).toMatch(/FUNCTION public\.end_employment\(/);
    expect(OFF).toContain("can_access_module(auth.uid(), 'hr')");
    expect(OFF).toMatch(/v_last < v_min_end AND NOT p_force/);
    const seed = (hrModule.skillSeeds ?? []).find((s) => s.name === 'end_employment') as { trust_level?: string; handler: string } | undefined;
    expect(seed).toMatchObject({ handler: 'rpc:end_employment', trust_level: 'approve' });
  });

  it('every fix the offboarding guide hands out is a skill that exists, and the guide answers both processes', () => {
    const known = declaredSkills();
    for (const m of OFF.matchAll(/'skill', '([a-z_]+)'/g)) expect(known.has(m[1]), `${m[1]} is not declared`).toBe(true);
    expect(OFF).toContain("IF v_process NOT IN ('onboarding', 'offboarding') THEN");
  });

  it('removing a login is a person\'s step — the guide never hands an agent a call for it', () => {
    const access = OFF.slice(OFF.indexOf("'id', 'access'"), OFF.indexOf("-- ── The final salary"));
    expect(access).toContain("'fix', NULL");
    expect(access).toContain('A person does this, not an agent.');
  });

  it('the onboarding guide no longer counts the offboarding checklist, nor hands out the unanswered get_status', () => {
    expect(OFF).toContain("c.title NOT ILIKE 'offboarding%'");
    expect(OFF).not.toContain("'get_status'");
  });
});

const RULES = readFileSync('supabase/migrations/20261031160000_hr-rules-per-country.sql', 'utf8');

describe('employment rules are data per country, never code', () => {
  it('the latest step bodies and end_employment carry no country check', () => {
    for (const fn of ['_hr_onboarding_steps', '_hr_offboarding_steps', 'end_employment']) {
      const a = RULES.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
      expect(a, fn).toBeGreaterThan(0);
      const body = RULES.slice(a, RULES.indexOf('END; $fn$;', a));
      expect(body, fn).not.toMatch(/\bv_se\b/);
      // The one Swedish calendar (AGI) may ask the country; nothing else may.
      expect(body.replace("v_country = 'SE' THEN ' Its AGI was due '", ''), fn).not.toMatch(/'SE'/);
      expect(body, fn).not.toMatch(/LAS \d/);
    }
    // The one Swedish calendar left (the AGI date) is asked of the country, not assumed.
    expect(RULES).toContain("CASE WHEN v_country = 'SE' THEN ' Its AGI was due '");
  });

  it('Sweden is a template, LAS 11 § in its tiers', () => {
    const se = RULES.match(/\('SE', 'Sweden', '(\[[^']*\])'::jsonb/);
    expect(se).not.toBeNull();
    const tiers = JSON.parse(se![1]) as Array<{ from_years: number; months: number }>;
    expect(tiers.map((t) => [t.from_years, t.months])).toEqual([[0, 1], [2, 2], [4, 3], [6, 4], [8, 5], [10, 6]]);
  });

  it('own terms win over the template, and an agent reaches both', () => {
    expect(RULES).toMatch(/FROM public\.hr_rules r WHERE r\.country = upper\(p_country\)\),\s*\(SELECT to_jsonb\(t\) \|\| jsonb_build_object\('origin', 'template'\)/);
    const seed = (hrModule.skillSeeds ?? []).find((x) => x.name === 'manage_hr_rules') as { handler: string } | undefined;
    expect(seed?.handler).toBe('rpc:manage_hr_rules');
  });

  it('without rules the answer says so instead of applying a country', () => {
    expect(RULES).toContain("No employment rules are saved for ' || v_label || ', so only the contract''s notice is checked");
  });
});
