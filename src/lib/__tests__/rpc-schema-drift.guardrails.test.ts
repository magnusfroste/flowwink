import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: an `rpc:` skill must declare the parameters its function actually
 * has, once agent-execute's own name mapping is applied.
 *
 * Why in CI and not in scripts/skill-linter.ts: the linter needs DATABASE_URL,
 * which is why it has never been wired to CI — and why this class was free to
 * grow. Both halves of the comparison are available in the repo without a
 * database: the seeds are TypeScript, and the signatures are in the migrations.
 *
 * Live finding (2026-07-21 sweep): mark_social_post_posted, moderate_blog_comment
 * and utm_attribution_report take `_`-prefixed params but were missing from
 * UNDERSCORE_PARAM_RPCS. Their seeds declared `_post_id` etc., which made them
 * unusable in BOTH directions — agent-execute strips every `_`-prefixed
 * argument as agent-internal before dispatch, and the fallback then produced
 * `p__post_id`. agent_activity showed zero calls on all four instances, so
 * nothing had ever exercised them.
 *
 * Note this sweep also DISPROVED four hand-filed "the schema lies" findings
 * (manage_bom, create_manual_subscription, receive_purchase_order,
 * manage_discount_code). Each declared exactly the right parameters; the caller
 * had guessed different names. Comparing a caller's arguments to a signature
 * tells you nothing — you have to read what the skill declares.
 */

const root = process.cwd();

/** Read the mapping sets FROM agent-execute so they cannot drift from it. */
function dispatcherSets(): { jsonb: Set<string>; underscore: Set<string> } {
  const src = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
  const grab = (name: string) => {
    const m = src.match(new RegExp(`const ${name} = new Set<string>\\(\\[([\\s\\S]*?)\\]\\)`));
    expect(m, `${name} not found in agent-execute — the mapping moved`).toBeTruthy();
    return new Set(Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
  };
  return { jsonb: grab('JSONB_ARG_RPCS'), underscore: grab('UNDERSCORE_PARAM_RPCS') };
}

/** Split a Postgres arg list on top-level commas (DEFAULTs contain commas). */
function parseArgs(sig: string): { names: string[]; required: string[] } {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sig) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const names: string[] = [];
  const required: string[] = [];
  for (const raw of parts) {
    const a = raw.trim();
    if (!a) continue;
    const m = a.match(/^(?:VARIADIC\s+|OUT\s+|INOUT\s+|IN\s+)?([A-Za-z_][A-Za-z0-9_]*)\s/);
    if (!m) continue;
    names.push(m[1]);
    if (!/\sDEFAULT\s/i.test(a)) required.push(m[1]);
  }
  return { names, required };
}

/**
 * Function signatures from the migrations. Later migrations win, so iterate in
 * filename order and overwrite. Functions we cannot parse are simply absent —
 * this guardrail checks alignment, it does not police existence (the fleet is
 * the authority on what is deployed).
 */
function signaturesFromMigrations(): Map<string, { names: Set<string>; required: Set<string> }> {
  const dir = join(root, 'supabase/migrations');
  const out = new Map<string, { names: Set<string>; required: Set<string> }>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    // Strip comments FIRST. An inline `-- [{sale_line_id, quantity}]` next to a
    // parameter carries braces and commas that wreck both the depth counter and
    // the comma split — refund_pos_sale was reported as missing two parameters
    // it plainly has.
    const sql = readFileSync(join(dir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi,
    )) {
      const name = m[1];
      // Walk from the opening paren to its match so nested parens survive.
      let i = m.index! + m[0].length - 1;
      let depth = 0;
      let end = i;
      for (; i < sql.length; i++) {
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const { names, required } = parseArgs(sql.slice(m.index! + m[0].length, end).replace(/"/g, ''));
      out.set(name, { names: new Set(names), required: new Set(required) });
    }
  }
  return out;
}

// A static glob, not a template-literal import: Vite cannot resolve a dynamic
// path, and silently returned a single module — which made every assertion in
// this file vacuously true until the count check caught it.
const MODULE_FILES = import.meta.glob('../modules/*-module.ts');
const PLATFORM_SEEDS = import.meta.glob('../platform-seeds.ts');

async function rpcSkills(): Promise<{ name: string; fn: string; declared: string[] }[]> {
  const seeds: { name: string; fn: string; declared: string[] }[] = [];

  const collect = (mod: Record<string, unknown>) => {
    for (const exported of Object.values(mod)) {
      // skillSeeds holds the definitions; `skills` is just the name list.
      const skills = (exported as any)?.skillSeeds ?? exported;
      if (!Array.isArray(skills)) continue;
      for (const s of skills) {
        if (typeof s?.handler !== 'string' || !s.handler.startsWith('rpc:')) continue;
        const props = s?.tool_definition?.function?.parameters?.properties ?? {};
        seeds.push({
          name: s.name,
          fn: s.handler.slice('rpc:'.length),
          declared: Object.keys(props),
        });
      }
    }
  };

  for (const load of [...Object.values(MODULE_FILES), ...Object.values(PLATFORM_SEEDS)]) {
    collect((await load()) as Record<string, unknown>);
  }
  return seeds;
}

describe('rpc: skill parameters match the function signature', () => {
  it('no skill advertises a parameter the function has no slot for', async () => {
    const { jsonb, underscore } = dispatcherSets();
    const sigs = signaturesFromMigrations();
    const skills = await rpcSkills();
    expect(skills.length, 'no rpc: skills found — the seed shape changed').toBeGreaterThan(50);

    const map = (fn: string, key: string) => {
      if (underscore.has(fn)) return key.startsWith('_') ? key : `_${key}`;
      return key.startsWith('p_') ? key : `p_${key}`;
    };

    const drift: string[] = [];
    for (const s of skills) {
      // The whole argument object is forwarded as `args` — nothing to align.
      if (jsonb.has(s.fn)) continue;
      const sig = sigs.get(s.fn);
      if (!sig) continue; // not parseable from migrations; not this test's job
      for (const key of s.declared) {
        const mapped = map(s.fn, key);
        if (!sig.names.has(mapped)) {
          drift.push(`${s.name}: declares "${key}" → sends "${mapped}", but ${s.fn}(…) has no such parameter`);
        }
      }
    }
    expect(drift, `PostgREST rejects the whole call on an unknown parameter:\n${drift.join('\n')}`).toEqual([]);
  });

  it('an RPC with _-prefixed params is registered in UNDERSCORE_PARAM_RPCS', async () => {
    // The failure mode this catches is silent: agent-execute strips _-prefixed
    // arguments as agent-internal, so an unregistered function receives nothing
    // at all rather than erroring on a name.
    const { jsonb, underscore } = dispatcherSets();
    const sigs = signaturesFromMigrations();
    const missing: string[] = [];
    for (const s of await rpcSkills()) {
      if (jsonb.has(s.fn) || underscore.has(s.fn)) continue;
      const sig = sigs.get(s.fn);
      if (!sig || sig.names.size === 0) continue;
      const allUnderscore = [...sig.names].every((n) => n.startsWith('_'));
      if (allUnderscore) missing.push(`${s.fn} (skill ${s.name})`);
    }
    expect(
      missing,
      `these functions take _-prefixed params but agent-execute maps p_ for them:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('no seed declares a _-prefixed parameter (it would be stripped as agent-internal)', async () => {
    const offenders: string[] = [];
    for (const s of await rpcSkills()) {
      for (const key of s.declared) {
        if (key.startsWith('_')) offenders.push(`${s.name}.${key}`);
      }
    }
    expect(
      offenders,
      'agent-execute drops every _-prefixed argument before dispatch — declare the bare name ' +
        `and register the function in UNDERSCORE_PARAM_RPCS instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
