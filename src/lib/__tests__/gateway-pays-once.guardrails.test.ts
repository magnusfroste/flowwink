/**
 * The gateway pays for its own work once (mcp-server, 2026-11-07).
 *
 * Measured on a local stack: /rest/execute answered in 220 ms where native
 * tools/call answered in 32 ms for the SAME skill, and the database explained
 * ten of those milliseconds. The rest: every REST call and every dispatch tool
 * re-read the whole exposed register (650 rows with schemas) to find one name,
 * and the owner filter built a Supabase client per skill (`serviceClient()` →
 * `createClient`, 648 times) before even asking whether the owner is an admin.
 * What holds now:
 *
 *   1. the exposed list is remembered a minute per (groups, peer ceiling),
 *      inside loadExposedSkills itself — the one function the absence guard
 *      holds to readAllRows;
 *   2. one service client per isolate;
 *   3. ownerMayRun asks the admin cache before it builds anything, and an
 *      admin owner's reach is decided once per filter, not once per skill;
 *   4. a non-admin owner's module verdicts are remembered a minute, like the
 *      admin verdict.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MCP = readFileSync(join(process.cwd(), 'supabase/functions/mcp-server/index.ts'), 'utf8');
const fn = (name: string) => {
  const at = MCP.indexOf(name);
  expect(at, name).toBeGreaterThan(0);
  return MCP.slice(at, MCP.indexOf('\n}\n', at));
};

describe('the gateway pays for its own work once', () => {
  it('the exposed list is remembered a minute, inside loadExposedSkills', () => {
    const body = fn('async function loadExposedSkills(');
    expect(body).toContain('exposedSkillsCache.get(cacheKey)');
    expect(body).toContain('exposedSkillsCache.set(cacheKey');
    expect(body).toContain('readAllRows<SkillRow>(sb, "agent_skills"');
    expect(MCP).toMatch(/const EXPOSED_SKILLS_TTL_MS = 60 \* 1000;/);
    // A failed read is never remembered.
    expect(body).toContain('if (r.failed) exposedSkillsCache.delete(cacheKey)');
  });

  it('one service client per isolate', () => {
    expect(MCP).toMatch(/function serviceClient\(\) \{\s*return serviceClientSingleton \?\?= getServiceClient\(\);/);
  });

  it('ownerMayRun asks the admin cache before it builds a client', () => {
    const body = fn('async function ownerMayRun(');
    const cacheAt = body.indexOf('ownerAdminCache.get(ownerUserId)');
    const clientAt = body.indexOf('serviceClient()');
    expect(cacheAt).toBeGreaterThan(0);
    expect(clientAt).toBeGreaterThan(cacheAt);
    expect(body).toContain('ownerModuleCache.get(ownerModKey)');
  });

  it("an admin owner's reach is decided once per filter", () => {
    const body = fn('async function filterByOwner<');
    expect(body.indexOf('ownerAdminCache.get(ownerUserId)) return skills')).toBeGreaterThan(0);
    expect(body.indexOf('ownerAdminCache.get(ownerUserId)) return skills')).toBeLessThan(body.indexOf('for (const sk of skills)'));
  });
});
