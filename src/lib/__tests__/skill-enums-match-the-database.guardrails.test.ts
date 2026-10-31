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
import { enumValues, columnValues, rpcArgValues } from './fixtures/db-schema';
import * as modules from '@/lib/modules';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';

interface Seed {
  name: string;
  handler?: string;
  tool_definition?: { function?: { parameters?: { properties?: Record<string, { enum?: unknown[] }> } } };
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
