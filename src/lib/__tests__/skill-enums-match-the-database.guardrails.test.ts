/**
 * A skill parameter's enum is a promise about what the database accepts.
 * browse_products offered type ∈ {physical, digital, service} against
 * product_type {one_time, recurring} and every typed browse died on the cast
 * (Nordbrygg, 2026-10-31); manage_job_posting offered 'contractor' against
 * employment_kind's 'contract'. An agent picks from the enum it is shown —
 * a value the column refuses is a skill that fails exactly when used right.
 *
 * Discover, don't enumerate: every skill whose handler names its target
 * (`db:<table>`, `rpc:<function>`) is checked, every enum parameter that maps
 * to a column (enum type or `= ANY (ARRAY[...])` CHECK) or an enum-typed RPC
 * argument. The skill may offer FEWER values than the database, never others.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as modules from '@/lib/modules';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';

interface Seed {
  name: string;
  handler?: string;
  tool_definition?: { function?: { parameters?: { properties?: Record<string, { enum?: unknown[] }> } } };
}

const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));

const quoted = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

// Enum types, with every value added later.
const enumValues = new Map<string, Set<string>>();
for (const sql of migrations) {
  for (const m of sql.matchAll(/CREATE TYPE (?:"?public"?\.)?"?(\w+)"? AS ENUM \(([^)]*)\)/gi)) {
    if (!enumValues.has(m[1])) enumValues.set(m[1], new Set(quoted(m[2])));
  }
  for (const m of sql.matchAll(/ALTER TYPE (?:"?public"?\.)?"?(\w+)"? ADD VALUE (?:IF NOT EXISTS )?'([^']+)'/gi)) {
    if (!enumValues.has(m[1])) enumValues.set(m[1], new Set());
    enumValues.get(m[1])!.add(m[2]);
  }
}

// Column → allowed values: enum-typed columns (from the generated types) and
// CHECK (col = ANY (ARRAY[...])) constraints, the last definition winning.
const columnValues = new Map<string, Set<string>>(); // "table.column"
{
  const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  let table = '';
  let inRow = false;
  for (const line of types.split('\n')) {
    const t = line.match(/^ {6}(\w+): \{$/);
    if (t) table = t[1];
    if (/^ {8}Row: \{/.test(line)) inRow = true;
    else if (/^ {8}\}/.test(line)) inRow = false;
    const c = inRow && line.match(/^ {10}(\w+)\??: Database\["public"\]\["Enums"\]\["(\w+)"\]/);
    if (c && enumValues.has(c[2])) columnValues.set(`${table}.${c[1]}`, enumValues.get(c[2])!);
  }
  const checks = new Map<string, Set<string>>(); // constraint name → values
  const checkColumn = new Map<string, string>(); // constraint name → table.column
  for (const sql of migrations) {
    let table = '';
    for (const line of sql.split('\n')) {
      const t = line.match(/(?:CREATE TABLE|ALTER TABLE)(?: IF NOT EXISTS)?(?: ONLY)? (?:"?public"?\.)"?(\w+)"?/i);
      if (t) table = t[1];
      for (const m of line.matchAll(/CONSTRAINT "?(\w+)"? CHECK \(+"?(\w+)"?(?:::text)? = ANY \(\(?ARRAY\[([^\]]*)\]/gi)) {
        if (!table) continue;
        checks.set(m[1], new Set(quoted(m[3])));
        checkColumn.set(m[1], `${table}.${m[2]}`);
      }
      for (const m of line.matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/gi)) {
        checks.delete(m[1]);
      }
    }
  }
  for (const [name, values] of checks) {
    const col = checkColumn.get(name)!;
    if (!columnValues.has(col)) columnValues.set(col, values);
  }
}

// RPC argument → enum values (any overload).
const rpcArgValues = new Map<string, Set<string>>(); // "fn.p_arg"
for (const sql of migrations) {
  for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION (?:"?public"?\.)"?(\w+)"?\(([^)]*)\)/gi)) {
    for (const a of m[2].matchAll(/"?(\w+)"? (?:"?public"?\.)"?(\w+)"?/g)) {
      const values = enumValues.get(a[2]);
      if (values) rpcArgValues.set(`${m[1]}.${a[1]}`, values);
    }
  }
}

function allSeeds(): Seed[] {
  const out: Seed[] = [...(PLATFORM_SKILLS as unknown as Seed[])];
  for (const m of Object.values(modules) as Array<{ skillSeeds?: unknown[] }>) {
    if (m && typeof m === 'object' && Array.isArray(m.skillSeeds)) out.push(...(m.skillSeeds as Seed[]));
  }
  return out;
}

describe('skill enums offer only values the database accepts', () => {
  const seeds = allSeeds();

  it('the scanner sees the schema it judges against', () => {
    expect(enumValues.get('product_type')).toEqual(new Set(['one_time', 'recurring']));
    expect(columnValues.get('job_postings.employment_type')?.has('contract')).toBe(true);
    expect(columnValues.get('service_orders.status')?.has('scheduled')).toBe(true);
    expect(seeds.filter((s) => /^(db|rpc):/.test(s.handler ?? '')).length).toBeGreaterThan(100);
  });

  it('every db:/rpc: skill enum is a subset of its column or argument', () => {
    const wrong: string[] = [];
    let checked = 0;
    for (const s of seeds) {
      const h = (s.handler ?? '').match(/^(db|rpc):(\w+)$/);
      if (!h) continue;
      for (const [param, def] of Object.entries(s.tool_definition?.function?.parameters?.properties ?? {})) {
        if (!Array.isArray(def?.enum)) continue;
        const allowed = h[1] === 'db'
          ? columnValues.get(`${h[2]}.${param}`)
          : rpcArgValues.get(`${h[2]}.${param}`);
        if (!allowed) continue;
        checked++;
        const extra = def.enum.map(String).filter((v) => !allowed.has(v));
        if (extra.length) wrong.push(`${s.name}.${param}: ${extra.join(', ')} ∉ {${[...allowed].join(', ')}}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(20);
  });

  // module:/internal: handlers do not name their table, so the target is
  // inferred: the tables whose name the skill names (browse_products →
  // products), with a constrained column of the parameter's name. Flagged
  // only when NONE of them accepts every value the skill offers.
  it('every module skill enum fits a table the skill names', () => {
    const moduleChecked: string[] = [];
    const stem = (t: string) => t.replace(/ies$/, 'y').replace(/s$/, '');
    const wrong: string[] = [];
    for (const s of seeds) {
      if (/^(db|rpc):/.test(s.handler ?? '')) continue;
      for (const [param, def] of Object.entries(s.tool_definition?.function?.parameters?.properties ?? {})) {
        if (!Array.isArray(def?.enum) || param === 'action') continue;
        const candidates = [...columnValues.entries()]
          .filter(([col]) => col.endsWith(`.${param}`))
          .filter(([col]) => stem(col.split('.')[0]).split('_').some((w) => w.length > 3 && s.name.split('_').map(stem).includes(w)));
        if (!candidates.length) continue;
        moduleChecked.push(`${s.name}.${param}`);
        // 'all' / 'any' are filter sentinels, not stored values.
        const values = def.enum.map(String).filter((v) => v !== 'all' && v !== 'any');
        if (candidates.some(([, allowed]) => values.every((v) => allowed.has(v)))) continue;
        wrong.push(`${s.name}.${param}: {${values.join(', ')}} vs ${candidates.map(([c, a]) => `${c} {${[...a].join(', ')}}`).join('; ')}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(moduleChecked).toContain('browse_products.type');
    expect(moduleChecked.length).toBeGreaterThan(10);
  });
});
