import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describeRefusals,
  NEVER_SUGGEST_OFF,
  NEW_MODULE_DAYS,
  planModuleChange,
  planModuleKeep,
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

  it('one list of kept utilities — the browser has no teardown of its own any more', () => {
    // Until 2026-11-06 module-bootstrap.ts carried a UTILITY_SKILLS copy and
    // a guard kept the two equal; the browser now runs the shared switch.
    expect(read('src/lib/module-bootstrap.ts')).not.toMatch(/UTILITY_SKILLS/);
    expect(read('supabase/functions/_shared/modules/module-switch.ts')).toMatch(/skillsToDisable\(artifactModules, plan\.modules, enabledAfter\)/);
    expect(TEARDOWN_KEEP_SKILLS).toContain('search_web');
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

// liteit 2026-11-04: fixedAssets and purchasing were kept by the owner on
// 10-31 and still listed in suggest_off every time; reports (#885) was listed
// the day it shipped. purchasing's automations ran 61 times on nothing.
describe('module_usage_report: a decision and a module\'s age', () => {
  const idle = { module: 'purchasing', enabled: true, core: false, rows: 0, calls: 0, automation_runs: 61, automations_enabled: 1, required_by: [] };
  const kept = { at: '2026-10-31T12:00:00Z', by: 'user:magnus', reason: 'GB10 resale and the consultancy book purchases' };

  it('a kept module is not proposed again — the why names who kept it, when and why', () => {
    const v = suggestOff({ ...idle, automations_enabled: 0 }, { kept });
    expect(v).toEqual({ candidate: false, why: 'kept by user:magnus 2026-10-31: GB10 resale and the consultancy book purchases' });
  });

  it('a kept module whose automations still run on nothing says so — the runs, not the module', () => {
    const v = suggestOff(idle, { kept });
    expect(v.candidate).toBe(false);
    expect(v.why).toMatch(/^kept by user:magnus 2026-10-31: .* — but its automations ran 61 times on nothing; pause them \(manage_automations disable\)/);
  });

  it(`a module younger than ${NEW_MODULE_DAYS} days on the instance is not judged yet`, () => {
    const reports = { ...idle, module: 'reports', automation_runs: 0, automations_enabled: 0 };
    expect(suggestOff(reports, { age_days: 2 })).toEqual({ candidate: false, why: 'new on this instance 2 days ago — too early to judge' });
    expect(suggestOff(reports, { age_days: NEW_MODULE_DAYS }).candidate).toBe(true);
    expect(suggestOff(reports, { age_days: null }).candidate).toBe(true);
  });

  it('use, need and core still decide before a keep or an age', () => {
    expect(suggestOff({ ...idle, rows: 3 }, { kept }).why).toBe('in use');
    expect(suggestOff({ ...idle, required_by: ['inventory'] }, { age_days: 1 }).why).toBe('required by inventory');
  });

  it('keep is for a module that is on; an unknown or switched-off module is refused by name', () => {
    expect(planModuleKeep(on, ['hr', 'payroll'])).toEqual({ modules: ['hr', 'payroll'], refusals: [] });
    const refused = planModuleKeep(on, ['projects', 'nope']);
    expect(refused).toEqual({ modules: [], refusals: [{ module: 'projects', reason: 'off' }, { module: 'nope', reason: 'unknown' }] });
    expect(describeRefusals(refused.refusals)).toMatch(/projects is off — keep is for a module that is on/);
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
    const exec = read('supabase/functions/_shared/execute/core.ts');
    expect(exec).toMatch(/handler === 'internal:module_usage_report'/);
    expect(exec).toMatch(/handler === 'internal:manage_modules'/);
    // The switch itself is the shared one (module-switch.ts, 2026-11-06).
    expect(exec).toMatch(/switchModules\(supabase, MODULE_CATALOG, ARTIFACT_MODULES, \{\s+action, modules: requested, by, reason, attended: ctx\.attended === true, via: 'manage_modules',/);
    expect(exec).toMatch(/attended: Boolean\(attendedUserId\)/);
    expect(exec).toMatch(/if \(teardowns\[settingKey\]\) return null;/);
    const sw = read('supabase/functions/_shared/modules/module-switch.ts');
    expect(sw).toMatch(/planModuleChange\(catalog, current, input\.action, input\.modules, \{ attended: input\.attended \}\)/);
    expect(sw).toMatch(/\.from\('agent_automations'\)\.update\(\{ enabled: false \}\)\.in\('skill_name', own\)/);
  });

  // www 2026-11-05: three approved switch-offs (27 modules) had stopped the
  // automations and left all 332 skills in the catalog. enabled:false alone is
  // refused by trg_enforce_mcp_exposure_invariant for an exposed skill, one
  // refused row fails the statement, and nobody read the error.
  it('a switch-off takes the skills out of the catalog — both flags in one write, the result read', () => {
    const exec = read('supabase/functions/_shared/execute/core.ts');
    // hideSkills moved to _shared/skills/skill-visibility.ts (2026-11-05) so
    // self-healing and the integrity repair write the same way.
    expect(exec).toMatch(/import \{ hideSkills[^}]*\} from '\.\.\/skills\/skill-visibility\.ts'/);
    const shared = read('supabase/functions/_shared/skills/skill-visibility.ts');
    const hide = shared.slice(shared.indexOf('export async function hideSkills'), shared.indexOf('export function isQuarantined'));
    expect(hide).toMatch(/\.update\(\{ enabled: false, mcp_exposed: false[^}]*\}\)\s*\.in\(column, chunk\)\.select\('name'\)/);
    expect(hide).toMatch(/if \(error\) \{ out\.failures\.push/);
    const sw = read('supabase/functions/_shared/modules/module-switch.ts');
    expect(sw).toMatch(/import \{ hideSkills \} from '\.\.\/skills\/skill-visibility\.ts'/);
    expect(sw).toMatch(/const hidden = await hideSkills\(db, mine\)/);
    expect(sw).not.toMatch(/agent_skills'\)\.update\(\{ enabled: false \}\)/);
    // The browser has no teardown of its own any more.
    expect(read('src/lib/module-bootstrap.ts')).not.toMatch(/export async function teardownModule/);
  });

  it('the skill sync heals a module switched off before the fix: its skills leave the catalog on the next admin visit', () => {
    const exec = read('supabase/functions/_shared/execute/core.ts');
    const sync = exec.slice(exec.indexOf('async function executeSyncSkillsFromCode'));
    expect(sync).toMatch(/\.in\('key', \['skills_artifact_sha', 'modules', 'module_teardowns'\]\)/);
    // Since 2026-11-06 every off module is healed (module-gate.ts), guarded by the row being present.
    expect(sync).toMatch(/const decidedOff = modulesRowPresent\s+\? ARTIFACT_MODULES\.map\(\(m\) => m\.moduleId\)\.filter\(\(id\) => id !== 'platform' && !isEnabled\(id\)\)\s+: \[\];/);
    expect(sync).toMatch(/skillsToDisable\(ARTIFACT_MODULES, decidedOff, isEnabled\)/);
    // Before the fast path, or an instance that carries this deploy never heals.
    expect(sync.indexOf('const teardownHeal = await hideSkills')).toBeLessThan(sync.indexOf("status: 'unchanged'"));
  });

  it('the report reads the keeps and dates the module; a keep lives outside module_teardowns, which autoActivate reads as "off"', () => {
    const exec = read('supabase/functions/_shared/execute/core.ts');
    const report = exec.slice(exec.indexOf('async function executeModuleUsageReport'), exec.indexOf('async function executeManageModules'));
    expect(report).toMatch(/'module_keeps'\]/);
    expect(report).toMatch(/suggestOff\(evidence, \{ age_days: ageDays, kept \}\)/);
    expect(report).toMatch(/kept_with_idle_automations/);
    const manage = exec.slice(exec.indexOf('async function executeManageModules'), exec.indexOf('async function readAllSkills'));
    expect(manage).toMatch(/upsert\(\{ key: 'module_keeps', value: keeps \}/);
    expect(manage).not.toMatch(/teardowns\[id\] = \{ at, by, reason \}/);
  });

  it('the seeds: the read runs, the switch waits for a person, and manage_site_settings points at it', () => {
    const byName = new Map(PLATFORM_SKILLS.map((s) => [s.name, s]));
    expect(byName.get('module_usage_report')?.trust_level).toBe('auto');
    expect(byName.get('manage_modules')?.trust_level).toBe('approve');
    const actions = (byName.get('manage_modules')?.tool_definition as { function: { parameters: { properties: { action: { enum: string[] } } } } }).function.parameters.properties.action.enum;
    expect(actions).toEqual(['enable', 'disable', 'keep', 'unkeep']);
    expect(byName.get('manage_site_settings')?.description).toMatch(/NOT for: switching modules on or off \(manage_modules/);
    expect(byName.get('manage_site_settings')?.description).not.toMatch(/Use when:[^.]*enabling or disabling modules/);
  });
});
