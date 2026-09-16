import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An `rpc:` skill must point at a function PostgREST can call.
 *
 * auto_mark_invoice_paid (invoicing) was `rpc:auto_mark_invoice_paid` — a
 * function that RETURNS trigger. It exists, the name matches, every static check
 * was green, and every call failed ("Could not find the function … without
 * parameters"): an agent on optic tried seven times in August. A trigger cannot be
 * called, only fired. The skill was a description of behaviour dressed as a tool.
 *
 * This reads every function's LAST definition across the migrations and fails on
 * any seed whose rpc handler resolves only to trigger functions.
 */

const DIR = join(__dirname, '../../../supabase/migrations');

function lastReturnTypes(): Map<string, Set<string>> {
  const byName = new Map<string, Set<string>>();
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*returns\s+(setof\s+)?"?([a-z_.]+)"?/gi;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const name = m[1].toLowerCase();
      const args = m[2].replace(/\s+/g, ' ').trim();
      const key = `${name}(${args})`;
      const set = byName.get(name) ?? new Set<string>();
      // keep one entry per overload, last definition wins
      for (const e of [...set]) if (e.startsWith(key + '→')) set.delete(e);
      set.add(`${key}→${m[4].toLowerCase().replace(/^public\./, '')}`);
      byName.set(name, set);
    }
  }
  return byName;
}

describe('rpc skills target callable functions', () => {
  const fns = lastReturnTypes();
  // The generated seed artifact (npm run skills:json) — every module's skillSeeds.
  const artifact = JSON.parse(readFileSync(join(__dirname, '../../../supabase/seed/module-skills.json'), 'utf8')) as {
    modules: Array<{ skills: Array<{ name: string; handler?: string }> }>;
  };
  const rpcSkills = artifact.modules.flatMap((m) => m.skills)
    .filter((s) => typeof s.handler === 'string' && s.handler.startsWith('rpc:'))
    .map((s) => ({ skill: s.name, fn: s.handler!.slice(4).toLowerCase() }));

  it('finds the rpc seeds and the migration definitions it reads', () => {
    expect(rpcSkills.length).toBeGreaterThan(50);
    expect(fns.get('refund_return')).toBeDefined();
  });

  it('no rpc skill resolves only to trigger functions', () => {
    const offenders = rpcSkills.filter(({ fn }) => {
      const overloads = fns.get(fn);
      return overloads && [...overloads].every((o) => o.endsWith('→trigger'));
    });
    expect(offenders, offenders.map((o) => `${o.skill} → ${o.fn} RETURNS trigger`).join('\n')).toEqual([]);
  });

  it('the scanner recognises the shape that bit us', () => {
    const t = fns.get('auto_mark_invoice_paid');
    expect(t && [...t].every((o) => o.endsWith('→trigger'))).toBe(true);
  });
});
