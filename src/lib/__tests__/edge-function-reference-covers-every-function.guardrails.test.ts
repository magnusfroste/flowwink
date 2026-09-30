import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * docs/reference/edge-functions.md is generated from supabase/functions; this
 * pins that it was regenerated after the last function was added or removed.
 * The count of edge functions drifted through three different numbers in the
 * docs ("100+", "75", "~100") while the source held 77 — a page built from
 * the source cannot drift, but only if it is rebuilt.
 */
const root = join(__dirname, '../../..');
const NOT_FUNCTIONS = new Set(['_shared', 'shared', 'tests']);
const onDisk = readdirSync(join(root, 'supabase/functions'))
  .filter((d) => !NOT_FUNCTIONS.has(d) && statSync(join(root, 'supabase/functions', d)).isDirectory())
  .sort();
const doc = readFileSync(join(root, 'docs/reference/edge-functions.md'), 'utf-8');
const listed = [...doc.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]).sort();

describe('the edge-function reference is built from the source', () => {
  it('lists every function directory', () => {
    const missing = onDisk.filter((f) => !listed.includes(f));
    expect(missing, 'run: bun run scripts/generate-edge-function-docs.ts').toEqual([]);
  });
  it('lists nothing that is not on disk', () => {
    const stale = listed.filter((f) => !onDisk.includes(f));
    expect(stale, 'run: bun run scripts/generate-edge-function-docs.ts').toEqual([]);
  });
  it('states the count it lists', () => {
    expect(doc).toContain(`${onDisk.length} functions`);
  });
});
