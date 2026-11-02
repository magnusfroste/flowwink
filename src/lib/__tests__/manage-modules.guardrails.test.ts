import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeRefusals,
  NEVER_SUGGEST_OFF,
  planModuleChange,
  skillsToDisable,
  suggestOff,
  TEARDOWN_KEEP_SKILLS,
  type ModuleCatalogEntry,
} from '../../../supabase/functions/_shared/modules/module-plan';
import { PLATFORM_SKILLS } from '../platform-seeds';

/**
 * Guardrail: an agent can switch modules off, and it stays off.
 *
 * Found 2026-10-31 tidying www, liteit and resta: the only agent path was
 * writing site_settings.modules (manage_site_settings). That left the module's
 * skills and automations running, and the next write through one of them
 * switched the module back on (autoActivateModule). On www five automations ran
 * ~45 times a day against modules with no data. manage_modules does what
 * /admin/modules does, behind approval; module_usage_report is the evidence.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const entry = (moduleId: string, requires: string[] = [], core = false): ModuleCatalogEntry =>
  ({ moduleId, name: moduleId, tier: null, requires, tables: [], core });
const catalog = [entry('pages', [], true), entry('hr'), entry('payroll', ['hr']), entry('projects'), entry('timesheets', ['projects'])];
const on = { pages: { enabled: true }, hr: { enabled: true }, payroll: { enabled: true }, projects: { enabled: false }, timesheets: { enabled: false } };

describe('manage_modules plan', () => {
  it('refuses a core module, an unknown one, and a parent whose dependents stay on — naming what to add', () => {
    expect(planModuleChange(catalog, on, 'disable', ['pages']).refusals).toEqual([{ module: 'pages', reason: 'core' }]);
    expect(planModuleChange(catalog, on, 'disable', ['nope']).refusals[0].reason).toBe('unknown');
    const hrAlone = planModuleChange(catalog, on, 'disable', ['hr']);
    expect(hrAlone.refusals).toEqual([{ module: 'hr', reason: 'needed_by', others: ['payroll'] }]);
    expect(hrAlone.modules).toEqual([]);
    expect(planModuleChange(catalog, on, 'disable', ['hr', 'payroll'])).toEqual({ modules: ['hr', 'payroll'], refusals: [] });
  });

  it('an enable names the parent that is off, and a no-op is not a change', () => {
    expect(planModuleChange(catalog, on, 'enable', ['timesheets']).refusals).toEqual([{ module: 'timesheets', reason: 'needs', others: ['projects'] }]);
    expect(planModuleChange(catalog, on, 'enable', ['projects', 'timesheets']).modules).toEqual(['projects', 'timesheets']);
    expect(planModuleChange(catalog, on, 'enable', ['hr']).modules).toEqual([]);
  });

  it('switches off the module\'s own skills, never a shared utility or one another enabled module carries', () => {
    const artifact = [
      { moduleId: 'hr', skills: [{ name: 'manage_employee' }, { name: 'sla_check' }, { name: 'shared_one' }] },
      { moduleId: 'tickets', skills: [{ name: 'shared_one' }] },
      { moduleId: 'platform', skills: [{ name: 'check_operations' }] },
    ];
    expect(skillsToDisable(artifact, ['hr'], (id) => id === 'tickets')).toEqual(['manage_employee']);
    expect(skillsToDisable(artifact, ['hr'], () => false)).toEqual(['manage_employee', 'shared_one']);
  });

  it('keeps the same utilities as the browser teardown', () => {
    const block = read('src/lib/module-bootstrap.ts').match(/UTILITY_SKILLS = new Set\(\[([\s\S]*?)\]\)/)![1];
    expect([...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...TEARDOWN_KEEP_SKILLS].sort());
  });

  it('suggests only an enabled, non-core, unneeded module with no data and no calls', () => {
    const base = { module: 'webinars', enabled: true, core: false, rows: 0, calls: 0, automation_runs: 4041, automations_enabled: 1, required_by: [] };
    expect(suggestOff(base)).toEqual({ candidate: true, why: 'no data and no calls; its automations ran 4041 times on nothing' });
    expect(suggestOff({ ...base, rows: 2 }).candidate).toBe(false);
    expect(suggestOff({ ...base, calls: 1 }).candidate).toBe(false);
    expect(suggestOff({ ...base, rows: null }).candidate).toBe(false);
    expect(suggestOff({ ...base, required_by: ['payroll'] }).candidate).toBe(false);
    expect(suggestOff({ ...base, core: true }).candidate).toBe(false);
  });

  // liteit 2026-11-02: feedback had no rows and no calls and was listed in
  // suggest_off — but it is the instance's upstream defect channel.
  it('never proposes feedback, and only a person can switch it off', () => {
    expect(NEVER_SUGGEST_OFF).toContain('feedback');
    const idle = { module: 'feedback', enabled: true, core: false, rows: 0, calls: 0, automation_runs: 0, automations_enabled: 1, required_by: [] };
    expect(suggestOff(idle)).toEqual({ candidate: false, why: 'the instance reports platform defects through it — keep it on' });

    const withFeedback = [...catalog, entry('feedback')];
    const fbOn = { ...on, feedback: { enabled: true } };
    const agent = planModuleChange(withFeedback, fbOn, 'disable', ['feedback']);
    expect(agent).toEqual({ modules: [], refusals: [{ module: 'feedback', reason: 'reports_defects' }] });
    expect(describeRefusals(agent.refusals)).toMatch(/reports platform defects.*only a person/);
    expect(planModuleChange(withFeedback, fbOn, 'disable', ['feedback'], { attended: true })).toEqual({ modules: ['feedback'], refusals: [] });
    expect(planModuleChange(withFeedback, { ...fbOn, feedback: { enabled: false } }, 'enable', ['feedback']).modules).toEqual(['feedback']);
  });
});

describe('manage_modules wiring', () => {
  it('the catalog travels in the edge bundle with parents, tables and core', () => {
    const gen = read('scripts/skills-to-json.ts');
    expect(gen).toMatch(/modules: out, catalog:/);
    expect(gen).toMatch(/core: coreIds\.has\(m\.id\)/);
    expect(read('src/pages/admin/ModulesPage.tsx')).toMatch(/from "@\/lib\/module-dependencies"/);
  });

  it('agent-execute dispatches both skills, and a switched-off module is not woken by a write', () => {
    const exec = read('supabase/functions/agent-execute/index.ts');
    expect(exec).toMatch(/handler === 'internal:module_usage_report'/);
    expect(exec).toMatch(/handler === 'internal:manage_modules'/);
    expect(exec).toMatch(/planModuleChange\(MODULE_CATALOG, current, action, requested, \{ attended: ctx\.attended === true \}\)/);
    expect(exec).toMatch(/attended: Boolean\(attendedUserId\)/);
    expect(exec).toMatch(/if \(teardowns\[settingKey\]\) return null;/);
    expect(exec).toMatch(/\.from\('agent_automations'\)\.update\(\{ enabled: false \}\)\.in\('skill_name', own\)/);
  });

  it('the seeds: the read runs, the switch waits for a person, and manage_site_settings points at it', () => {
    const byName = new Map(PLATFORM_SKILLS.map((s) => [s.name, s]));
    expect(byName.get('module_usage_report')?.trust_level).toBe('auto');
    expect(byName.get('manage_modules')?.trust_level).toBe('approve');
    expect(byName.get('manage_site_settings')?.description).toMatch(/NOT for: switching modules on or off \(manage_modules/);
    expect(byName.get('manage_site_settings')?.description).not.toMatch(/Use when:[^.]*enabling or disabling modules/);
  });
});
