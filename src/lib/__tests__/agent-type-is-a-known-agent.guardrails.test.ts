import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Every `agent_type` an edge function sends must be a value of the
 * `agent_type` enum — agent-execute writes it to agent_activity.agent, and an
 * unknown value makes that insert fail with only a console.error.
 *
 * On Nordbrygg (2026-10-29) event-dispatcher sent "platform" and
 * automation-dispatcher's task path sent "task": every run they started left
 * NO activity row, so an inbound mail's reply automation looked like it had
 * never run. The enum is read from the migrations (CREATE TYPE + every ADD
 * VALUE), the literals from every edge file — no list of either is kept here.
 */
const repo = join(__dirname, '../../..');

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (ext.test(e)) out.push(p);
  }
  return out;
}

function enumValues(): Set<string> {
  const values = new Set<string>();
  for (const f of walk(join(repo, 'supabase/migrations'), /\.sql$/)) {
    const sql = readFileSync(f, 'utf8');
    const create = sql.match(/CREATE TYPE\s+"?public"?\."?agent_type"?\s+AS\s+ENUM\s*\(([^)]*)\)/i);
    if (create) for (const m of create[1].matchAll(/'([a-z_]+)'/g)) values.add(m[1]);
    for (const m of sql.matchAll(/ALTER TYPE\s+"?public"?\."?agent_type"?\s+ADD VALUE(?:\s+IF NOT EXISTS)?\s+'([a-z_]+)'/gi)) values.add(m[1]);
  }
  return values;
}

describe('agent_type is a known agent', () => {
  it('the enum is found in the migrations', () => {
    const v = enumValues();
    expect(v.has('automation')).toBe(true);
    expect(v.size).toBeGreaterThanOrEqual(6);
  });

  it('every literal agent_type an edge function sends is in the enum', () => {
    const allowed = enumValues();
    const offenders: string[] = [];
    for (const f of walk(join(repo, 'supabase/functions'), /\.(ts|js)$/)) {
      const src = readFileSync(f, 'utf8');
      // Literal values, including both arms of a ternary.
      for (const m of src.matchAll(/agent_type:\s*([^,\n}]+)/g)) {
        for (const lit of m[1].matchAll(/['"]([a-z_]+)['"]/g)) {
          if (!allowed.has(lit[1])) offenders.push(`${relative(repo, f)}: "${lit[1]}"`);
        }
      }
    }
    expect(offenders, `not in the agent_type enum (${[...allowed].join(', ')})`).toEqual([]);
  });
});
