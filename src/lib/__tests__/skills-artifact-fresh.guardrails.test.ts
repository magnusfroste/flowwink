/**
 * Guardrail: supabase/seed/module-skills.json must stay in sync with the
 * module skillSeeds in code.
 *
 * The artifact is what scripts/sync-skills.ts reads to push skill metadata into
 * each instance's agent_skills. If a developer edits a skillSeed but forgets to
 * run `npm run skills:json`, the artifact goes stale and sync-skills would write
 * an outdated definition to the fleet — reintroducing exactly the drift the tool
 * exists to prevent. This test fails loudly with the fix command.
 *
 * Mirrors scripts/skills-to-json.ts collection logic.
 */
import { describe, expect, it } from 'vitest';
import * as modules from '@/lib/modules';
import artifact from '../../../supabase/seed/module-skills.json';

interface ModuleLike { id?: string; skillSeeds?: unknown[] }

function buildModulesFromCode(): Array<{ moduleId: string; skills: unknown[] }> {
  const out: Array<{ moduleId: string; skills: unknown[] }> = [];
  for (const exported of Object.values(modules) as unknown[]) {
    const m = exported as ModuleLike;
    if (!m || typeof m !== 'object' || !m.id || !Array.isArray(m.skillSeeds) || m.skillSeeds.length === 0) continue;
    out.push({ moduleId: m.id, skills: m.skillSeeds });
  }
  out.sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  return out;
}

describe('skills artifact freshness', () => {
  it('module-skills.json matches the code skillSeeds (run `npm run skills:json` if this fails)', () => {
    const fromCode = buildModulesFromCode();
    const committed = (artifact as { modules: Array<{ moduleId: string; skills: unknown[] }> }).modules;

    // Compare module-by-module so the failure message points at the drifted module.
    const codeIds = fromCode.map((m) => m.moduleId);
    const committedIds = committed.map((m) => m.moduleId);
    expect(committedIds, 'module set differs — run `npm run skills:json`').toEqual(codeIds);

    const drifted: string[] = [];
    for (const codeMod of fromCode) {
      const committedMod = committed.find((m) => m.moduleId === codeMod.moduleId);
      if (JSON.stringify(committedMod?.skills) !== JSON.stringify(codeMod.skills)) {
        drifted.push(codeMod.moduleId);
      }
    }
    expect(
      drifted,
      `\nStale skill artifact for module(s): ${drifted.join(', ')}.\nRun: npm run skills:json (then commit supabase/seed/module-skills.json)`,
    ).toEqual([]);
  });

  it('artifact counts match', () => {
    const fromCode = buildModulesFromCode();
    const skillCount = fromCode.reduce((n, m) => n + m.skills.length, 0);
    expect((artifact as { module_count: number }).module_count).toBe(fromCode.length);
    expect((artifact as { skill_count: number }).skill_count).toBe(skillCount);
  });
});
