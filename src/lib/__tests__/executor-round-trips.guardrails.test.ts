/**
 * The executor's own round trips (agent-execute, 2026-11-07).
 *
 * Measured on a local stack with pg_stat_statements: of a skill call's 5–8
 * statements, 4–6 were the executor's — the skill lookup (the whole row,
 * `instructions` included), the modules row, FlowPilot's trust RPC, the
 * objectives select (on EVERY call, though 9 in 10 skills have no keywords)
 * and the journal insert. The handler was the minority. What holds now:
 *
 *   1. the lookup names its columns — `instructions` (up to 8 KB, read with
 *      skill_read / read_skill) and `description` never travel for a run;
 *   2. the modules row is read ONCE per call, through one memo, started
 *      beside the lookup when the skill's name is known;
 *   3. FlowPilot's trust resolution starts at the lookup and is awaited at
 *      the trust gate, so it overlaps the module gate instead of following it;
 *   4. trackObjectiveProgress asks SKILL_OBJECTIVE_MAP before the database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const INDEX = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const serveAt = INDEX.indexOf('serve(async (req) => {');
const SERVE = INDEX.slice(serveAt, INDEX.indexOf('\n});\n', serveAt));

describe('agent-execute pays for its own statements once', () => {
  it('the skill lookup names its columns — never the whole row', () => {
    const lookupAt = SERVE.indexOf("let query = supabase.from('agent_skills')");
    expect(lookupAt).toBeGreaterThan(0);
    const lookup = SERVE.slice(lookupAt, SERVE.indexOf('.eq(\'enabled\', true)', lookupAt));
    expect(lookup).not.toContain("select('*')");
    for (const col of ['id', 'name', 'handler', 'scope', 'category', 'trust_level', 'requires_staging', 'tool_definition']) {
      expect(lookup, `the executor reads skill.${col}`).toMatch(new RegExp(`[,'\\s]${col}[,'\\s]`));
    }
    expect(lookup).not.toMatch(/instructions|description/);
  });

  it('the modules row is read once per call, through the memo', () => {
    const direct = SERVE.match(/loadActiveModuleIds\(supabase\)/g) ?? [];
    expect(direct, 'one call site: the memo itself').toHaveLength(1);
    expect(SERVE).toContain('activeModulesPromise ??= loadActiveModuleIds(supabase)');
    expect((SERVE.match(/await activeModules\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Started beside the lookup when the name is known.
    expect(SERVE.indexOf('void activeModules()')).toBeLessThan(SERVE.indexOf("let query = supabase.from('agent_skills')"));
  });

  it("FlowPilot's trust RPC starts at the lookup and is awaited at the gate", () => {
    const startAt = SERVE.indexOf("supabase.rpc('resolve_agent_trust'");
    const gateAt = SERVE.indexOf('const active = await activeModules();\n        if (!skillModuleOn(skill.name, active))');
    const awaitAt = SERVE.indexOf('const resolved = await resolvedTrustPromise');
    expect(startAt).toBeGreaterThan(0);
    expect(gateAt).toBeGreaterThan(startAt);
    expect(awaitAt).toBeGreaterThan(gateAt);
    expect((SERVE.match(/resolve_agent_trust/g) ?? []).length, 'one RPC per call').toBe(1);
  });

  it('objective tracking asks the map before the database', () => {
    const fnAt = INDEX.indexOf('async function trackObjectiveProgress(');
    const fn = INDEX.slice(fnAt, INDEX.indexOf('\n}\n', fnAt));
    const mapAt = fn.indexOf('SKILL_OBJECTIVE_MAP[skillName]');
    const selectAt = fn.indexOf(".from('agent_objectives')");
    expect(mapAt).toBeGreaterThan(0);
    expect(selectAt).toBeGreaterThan(mapAt);
    expect(fn.slice(mapAt, selectAt)).toContain('if (!keywords.length) return;');
  });
});
