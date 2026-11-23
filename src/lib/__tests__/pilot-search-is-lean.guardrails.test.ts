/**
 * FlowPilot's own skill search answers what it needs (2026-11-23).
 *
 * After folding (#1075) and lean reads (#1077), www's heartbeat still stopped
 * at its token budget: each search_skills answered 20 FULL contracts (~28 000
 * tokens), and the run searched three times in a row. FlowPilot's search now
 * answers 10 hits, the best 3 with their contract and the rest named with one
 * line; searching a skill's exact name answers its contract. The outward
 * gateway keeps full contracts for every hit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSkillCatalog, PILOT_FULL_CONTRACTS, PILOT_SEARCH_LIMIT } from '../../../supabase/functions/_shared/skills/dispatch';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const def = (name: string, words: string) => ({
  type: 'function',
  function: {
    name,
    description: `${words} for the business. Use when: you need ${words}. NOT for: anything else. ${'Long manual text. '.repeat(40)}`,
    parameters: { type: 'object', properties: { a: { type: 'string', description: 'x'.repeat(300) } }, required: ['a'] },
  },
});
const DEFS = Array.from({ length: 30 }, (_, i) => def(`blog_skill_${i}`, `blog post work number ${i}`));

describe("FlowPilot's search", () => {
  it('the best three carry their contract, the rest one line and the way to get it', () => {
    const c = buildSkillCatalog(DEFS, 'blog post work', {}, PILOT_SEARCH_LIMIT, { fullContracts: PILOT_FULL_CONTRACTS });
    expect(c.count).toBe(10);
    expect(c.skills.slice(0, 3).every((s) => s.input_schema && !s.contract)).toBe(true);
    const rest = c.skills.slice(3);
    expect(rest.every((s) => !s.input_schema && s.contract && s.description.length <= 220)).toBe(true);
    expect(c.note).toMatch(/exact name/);
  });

  it('is far smaller than the full catalogue', () => {
    const lean = JSON.stringify(buildSkillCatalog(DEFS, 'blog post work', {}, PILOT_SEARCH_LIMIT, { fullContracts: PILOT_FULL_CONTRACTS })).length;
    const full = JSON.stringify(buildSkillCatalog(DEFS, 'blog post work', {}, 20)).length;
    expect(lean).toBeLessThan(full / 3);
  });

  it('a search by exact name answers that skill whole, wherever it ranks', () => {
    const c = buildSkillCatalog(DEFS, 'blog_skill_17', {}, PILOT_SEARCH_LIMIT, { fullContracts: PILOT_FULL_CONTRACTS });
    const hit = c.skills.find((s) => s.name === 'blog_skill_17');
    expect(hit?.input_schema).toBeTruthy();
  });

  it('the gateway is unchanged: no option, every hit whole', () => {
    const c = buildSkillCatalog(DEFS, 'blog post work', {}, 20);
    expect(c.skills.every((s) => s.input_schema)).toBe(true);
    expect(c.note).toBeUndefined();
    expect(read('supabase/functions/mcp-server/index.ts')).toMatch(/buildSkillCatalog\(defs, query, usageBoost, limit\)/);
  });

  it('the loop asks for the lean answer and says so to the model', () => {
    expect(read('supabase/functions/_shared/pilot/reason.ts')).toMatch(/\{ fullContracts: PILOT_FULL_CONTRACTS \}/);
    expect(read('supabase/functions/_shared/pilot/built-in-tools.ts')).toMatch(/the best 3 with their FULL contract/);
  });
});
