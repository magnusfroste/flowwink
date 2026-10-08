import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A requirement JSON Schema cannot say — "p_lead_id OR p_email", "and/or",
 * "one of three" — lives in the handler's refusal and nowhere an agent reads
 * before the call. The schema says `required: []`, the agent calls with
 * nothing, and gets an error it could not foresee (QA SURFACE-4 / CRM-4,
 * optic 2026-08-05). The description is what the scorer and the agent read
 * pre-call (skill metadata tier 1), so the requirement belongs there.
 *
 * Discovered, not listed: every SQL function's LATEST definition and every
 * single-purpose edge executor is scanned for the refusal shape, and each
 * parameter the refusal names must appear in its skill's description.
 */
const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

type Params = { properties?: Record<string, unknown> };
type ToolDef = { function?: { parameters?: Params }; parameters?: Params };
type Seed = { name: string; handler?: string; description: string; tool_definition?: ToolDef };
const seeds: Seed[] = (JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> })
  .modules.flatMap((m) => m.skills);

// "Provide a or b", "Either a or b", "a or b is required", "a and/or b"
const REFUSAL = /'((?:Provide|Pass|Either)[^']{0,140}?\b(?:or|and\/or)\b[^']{0,100}|[^']{0,60}\b(?:or|and\/or)\b[^']{0,80}(?:is|are) required[^']{0,60})'/g;
const notAuth = (m: string) => !/service.?role|admin or/i.test(m);

function propsOf(s: Seed): string[] {
  const td = s.tool_definition;
  const p = (td?.function?.parameters ?? td?.parameters)?.properties ?? {};
  return Object.keys(p);
}
const bare = (k: string) => k.replace(/^p_/, '');

/** Parameters a refusal names, as the skill's schema spells them. */
function namedParams(message: string, s: Seed): string[] {
  const words = new Set((message.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map(bare));
  return propsOf(s).filter((k) => words.has(bare(k)));
}

function describes(s: Seed, param: string): boolean {
  const d = s.description;
  return d.includes(param) || new RegExp(`\\b${bare(param)}\\b`).test(d);
}

const subjects: Array<{ skill: Seed; message: string; params: string[]; where: string }> = [];

// 1. SQL: the last CREATE FUNCTION per name wins, like the database.
const fnDef = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?(\w+)"?\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi;
const latest = new Map<string, string>();
for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort()) {
  for (const m of read(`supabase/migrations/${f}`).matchAll(fnDef)) latest.set(m[1], m[3]);
}
for (const s of seeds) {
  if (!s.handler?.startsWith('rpc:')) continue;
  const body = latest.get(s.handler.slice(4));
  if (!body) continue;
  for (const [, message] of body.matchAll(REFUSAL)) {
    if (!notAuth(message)) continue;
    const params = namedParams(message, s);
    if (params.length >= 2) subjects.push({ skill: s, message, params, where: s.handler });
  }
}

// 2. Edge: executors reached from an internal: handler that serve ONE purpose
//    (no action switch) — their refusal is the skill's only contract.
const ae = read('supabase/functions/agent-execute/index.ts');
const executors = new Map(
  [...ae.matchAll(/async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)].map((m) => [m[1], m[2]] as const),
);
for (const [, skillName, fn] of ae.matchAll(/handler === 'internal:(\w+)'\)\s*\{\s*result = await (\w+)\(/g)) {
  const body = executors.get(fn);
  const s = seeds.find((x) => x.name === skillName);
  if (!body || !s || /action ===/.test(body)) continue;
  for (const [, message] of body.matchAll(REFUSAL)) {
    if (!notAuth(message)) continue;
    const params = namedParams(message, s);
    if (params.length >= 2) subjects.push({ skill: s, message, params, where: fn });
  }
}

describe('either-or requirements are in the description an agent reads before the call', () => {
  it('the scan finds the class (it is not empty)', () => {
    expect(subjects.length).toBeGreaterThanOrEqual(10);
    expect(subjects.map((x) => x.skill.name)).toEqual(expect.arrayContaining(['predict_lead_score', 'list_flowtable_tables', 'upload_document']));
  });

  it('every parameter a refusal names appears in its skill description', () => {
    const missing = subjects.flatMap(({ skill, message, params, where }) =>
      params.filter((p) => !describes(skill, p)).map((p) => `${skill.name} (${where}) — "${message}" names ${p}`),
    );
    expect(missing, 'add "Requires one of: …" to the description').toEqual([]);
  });
});
