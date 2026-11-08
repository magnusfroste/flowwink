/**
 * An id is a GUID, not an RFC 9562 UUID (zod 4, 2026-11-07).
 *
 * zod 3's `z.string().uuid()` accepted any 8-4-4-4-12 hex string. zod 4's
 * `.uuid()` / `z.uuid()` checks the version and variant bits, and rejects ids
 * this platform has in every database: the baseline migration seeds fixed rows
 * such as `aaaaaaa1-0000-0000-0000-000000000001` and `11111111-1111-…`, and a
 * later one seeds `00000000-0000-0000-0000-00000000c0de`. A module contract
 * validating one of those would start refusing after the upgrade, and no unit
 * test would notice — the fixtures are random v4 ids. `z.guid()` is v3's rule
 * exactly. This guard keeps the strict form out of every schema we write.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';

const root = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '__tests__' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

describe('ids are judged as GUIDs, the rule they were seeded under', () => {
  it('no schema uses the strict uuid check', () => {
    const files = [...walk(join(root, 'src')), ...walk(join(root, 'api')), ...walk(join(root, 'supabase/functions'))];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!/from ['"](?:zod|https:\/\/esm\.sh\/zod[^'"]*|npm:zod[^'"]*)['"]/.test(src)) continue;
      for (const m of src.matchAll(/z\.string\(\)\.uuid\(|\bz\.uuid(?:v\d)?\(/g)) {
        hits.push(`${relative(root, f)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(hits, 'use z.guid() — zod 4\'s uuid() rejects ids the baseline seeds (aaaaaaa1-0000-…)').toEqual([]);
  });

  it('z.guid accepts the seeded ids and still refuses what is not an id', () => {
    for (const id of ['aaaaaaa1-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000c0de', '6f1c9a0e-3b2d-4c5e-8f7a-1b2c3d4e5f60']) {
      expect(z.guid().safeParse(id).success, id).toBe(true);
    }
    for (const bad of ['not-a-uuid', '6f1c9a0e3b2d4c5e8f7a1b2c3d4e5f60', '', 'aaaaaaa1-0000-0000-0000-00000000000g']) {
      expect(z.guid().safeParse(bad).success, bad).toBe(false);
    }
  });
});
