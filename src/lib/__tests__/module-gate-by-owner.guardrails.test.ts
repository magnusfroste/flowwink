/**
 * The module gate is the skill's OWNING module, not its category (2026-11-06).
 * A category was open when any module listed for it was on — commerce lists
 * 24 — so a module that was off but whose rows had leaked stayed visible to
 * agents and ran. One rule (module-gate.ts), three consumers: the gateway's
 * discovery, FlowPilot's skill loading, and the executor, which refuses
 * MODULE_DISABLED — a refusal, never a failure. The one exception is Law 4:
 * an explicit write through a module: handler wakes a module nobody switched
 * off. The sync heals leaked rows for every off module.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_MODULES, moduleDisabledRefusal, ownerModuleOf, skillModuleOn } from '../../../supabase/functions/_shared/skills/module-gate';
import { TEARDOWN_KEEP_SKILLS } from '../../../supabase/functions/_shared/modules/module-plan';

const read = (p: string) => readFileSync(p, 'utf8');

describe('skillModuleOn', () => {
  it('passes a skill whose owner is on, refuses one whose owner is off, and fails open without a row', () => {
    const owner = ownerModuleOf('manage_webinar');
    expect(owner).toBe('webinars');
    expect(skillModuleOn('manage_webinar', new Set(['webinars', 'pages']))).toBe(true);
    expect(skillModuleOn('manage_webinar', new Set(['pages']))).toBe(false);
    expect(skillModuleOn('manage_webinar', new Set([ALL_MODULES]))).toBe(true);
  });

  it('platform skills, unknown skills and the kept utilities always pass', () => {
    expect(ownerModuleOf('manage_site_settings')).toBe('platform');
    expect(skillModuleOn('manage_site_settings', new Set())).toBe(true);
    expect(skillModuleOn('an_agent_made_this', new Set())).toBe(true);
    for (const n of TEARDOWN_KEEP_SKILLS) expect(skillModuleOn(n, new Set()), n).toBe(true);
  });

  it('the refusal has the envelope shape: refused, a stable code, not retryable, a hint that names the module', () => {
    const r = moduleDisabledRefusal('manage_webinar', 'webinars');
    expect(r).toMatchObject({ status: 'refused', code: 'MODULE_DISABLED', retryable: false, module: 'webinars' });
    expect(r.hint).toMatch(/webinars module, which is off/);
    expect(r.hint).toMatch(/manage_modules/);
    expect(r).not.toHaveProperty('error');
  });
});

describe('the three consumers', () => {
  it('the gateway and FlowPilot filter discovery by owner, with the category gate as the second net', () => {
    const mcp = read('supabase/functions/mcp-server/index.ts');
    expect(mcp).toMatch(/import \{ skillModuleOn \} from "\.\.\/_shared\/skills\/module-gate\.ts";/);
    expect(mcp).toMatch(/let filtered = all\.filter\(\(s\) => skillModuleOn\(s\.name, activeModules\) && isCategoryActive\(s\.category, activeModules\)\);/);
    const reason = read('supabase/functions/_shared/pilot/reason.ts');
    expect(reason).toMatch(/gatedSkills\.filter\(\(s: any\) => skillModuleOn\(s\.name, activeModules\) && isCategoryActive\(/);
  });

  it('the executor refuses MODULE_DISABLED after authorization and before scope, logs it as refused, and lets the one waking write through', () => {
    const exec = read('supabase/functions/agent-execute/index.ts');
    const gate = exec.indexOf('// 1c. THE MODULE GATE');
    expect(gate).toBeGreaterThan(exec.indexOf('// 1b. AUTHORIZATION'));
    expect(gate).toBeLessThan(exec.indexOf('// 2. Validate scope'));
    const block = exec.slice(gate, exec.indexOf('// 2. Validate scope'));
    expect(block).toMatch(/if \(!skillModuleOn\(skill\.name, active\)\) \{/);
    expect(block).toMatch(/wakeKey === owner && callWakesModule\(skill\.name, args as Record<string, unknown>\)/);
    expect(block).toMatch(/wakes = !tdErr && !\(\(td\?\.value \?\? \{\}\) as Record<string, unknown>\)\[owner\];/);
    expect(block).toMatch(/const refusal = moduleDisabledRefusal\(skill\.name, owner\);/);
    expect(block).toMatch(/status: 'refused', conversation_id/);
  });

  it('a hidden row of an off module answers MODULE_DISABLED, not "Skill not found"', () => {
    const exec = read('supabase/functions/agent-execute/index.ts');
    const miss = exec.slice(exec.indexOf('if (skillError || !skills) {'), exec.indexOf('const skill = skills;'));
    expect(miss).toMatch(/const owner = missingName \? ownerModuleOf\(missingName\) : null;/);
    expect(miss).toMatch(/if \(!skillModuleOn\(missingName, active\)\) \{/);
    expect(miss.indexOf('moduleDisabledRefusal(missingName, owner)')).toBeLessThan(miss.indexOf('Skill not found:'));
  });

  it('the sync heals leaked rows for every off module — only when the modules row is present', () => {
    const exec = read('supabase/functions/agent-execute/index.ts');
    expect(exec).toMatch(/const decidedOff = modulesRowPresent\s+\? ARTIFACT_MODULES\.map\(\(m\) => m\.moduleId\)\.filter\(\(id\) => id !== 'platform' && !isEnabled\(id\)\)\s+: \[\];/);
  });
});
