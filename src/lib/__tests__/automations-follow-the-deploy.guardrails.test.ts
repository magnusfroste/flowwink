/**
 * Automations follow the edge deploy (2026-11-04). A module's schedule used to
 * be seeded only by a browser bootstrap (switching the module on, a template
 * install) or by sync-skills.ts with DATABASE_URL, so a module that reached a
 * live instance with the deploy never got its schedule: "Feedback ping"
 * (#803) was on no instance of the fleet (sandbox and www, read-only check),
 * and "Overview dashboard" (#888) would have joined it.
 *
 * Now the edge bundle carries the automations, and sync_skills_from_code —
 * which the admin shell calls on every page load — inserts the missing ones:
 * by name only, never updating (a retuned cron survives), only for enabled
 * modules, flowpilot executors only while FlowPilot is on, and each name once
 * (the ledger site_settings.seeded_automations — a deleted automation stays
 * deleted).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as allModules from '@/lib/modules';
import { PLATFORM_AUTOMATIONS } from '@/lib/platform-seeds';

const GEN = readFileSync('scripts/skills-to-json.ts', 'utf8');
const EXEC = readFileSync('supabase/functions/agent-execute/index.ts', 'utf8');
const fn = EXEC.slice(EXEC.indexOf('async function reconcileModuleAutomations('), EXEC.indexOf('async function executeSyncSkillsFromCode('));
const sync = EXEC.slice(EXEC.indexOf('async function executeSyncSkillsFromCode('));

describe('automations travel with the deploy', () => {
  it('the edge bundle carries every module\'s automations', () => {
    expect(GEN).toMatch(/automations: \[\.\.\.autos\]\.sort/);
    // Discover, don't enumerate: every module that declares automations has
    // them in the list the generator writes (autos), so a new one cannot be
    // left behind.
    const declared = (Object.values(allModules) as unknown[])
      .map((m) => m as { id?: string; automations?: unknown[] })
      .filter((m) => Array.isArray(m?.automations) && m.automations.length > 0)
      .map((m) => m.id);
    expect(declared).toEqual(expect.arrayContaining(['feedback', 'reports']));
    expect(GEN).toMatch(/if \(Array\.isArray\(m\.automations\) && m\.automations\.length > 0\) \{\s*autos\.push/);
    expect(PLATFORM_AUTOMATIONS.length).toBeGreaterThan(0);
  });

  it('every sync reconciles them — outside the skills\' fast path', () => {
    const call = sync.indexOf('await reconcileModuleAutomations(supabase, isEnabled, isEnabled(\'flowpilot\'))');
    const fast = sync.indexOf("status: 'unchanged'");
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(fast);
    expect(sync).toMatch(/status: 'unchanged',\s+sha,\s+automations,/);
  });

  it('insert by name only, never update, enabled modules only, flowpilot executors only with FlowPilot on', () => {
    expect(fn).toMatch(/\.from\('agent_automations'\)\.insert\(/);
    expect(fn).not.toMatch(/\.from\('agent_automations'\)\.(update|upsert|delete)\(/);
    expect(fn).toMatch(/if \(!isEnabled\(g\.moduleId\)\) continue;/);
    expect(fn).toMatch(/if \(executor === 'flowpilot' && !flowpilotEnabled\) continue;/);
  });

  it('each name is seeded once: a person\'s deletion is not undone on the next page load', () => {
    expect(fn).toMatch(/key', 'seeded_automations'/);
    expect(fn).toMatch(/if \(present\.has\(a\.name\)\) \{ alreadyPresent\+\+; ledger\.add\(a\.name\); continue; \}/);
    expect(fn).toMatch(/if \(ledger\.has\(a\.name\)\) continue;/);
  });
});
