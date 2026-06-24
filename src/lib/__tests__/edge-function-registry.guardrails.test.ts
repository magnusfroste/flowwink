/**
 * Guardrail: the edge-function registry must stay in sync with the deployable
 * functions on disk, and every module-mapped function must actually exist.
 *
 * If this fails, an edge function was added or removed — update
 * `src/lib/edge-function-registry.ts` (ALL_EDGE_FUNCTIONS / MODULE_EDGE_FUNCTIONS).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ALL_EDGE_FUNCTIONS,
  MODULE_EDGE_FUNCTIONS,
  coreEdgeFunctions,
  requiredEdgeFunctions,
} from '../edge-function-registry';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

/** Deployable function dirs = have index.ts, excluding helpers. */
function deployableFunctionDirs(): string[] {
  const SKIP = new Set(['_shared', 'shared', 'tests']);
  return readdirSync(FUNCTIONS_DIR)
    .filter((name) => !SKIP.has(name))
    .filter((name) => {
      const p = join(FUNCTIONS_DIR, name);
      return statSync(p).isDirectory() && existsSync(join(p, 'index.ts'));
    })
    .sort();
}

describe('edge-function registry', () => {
  it('ALL_EDGE_FUNCTIONS matches the deployable function dirs on disk', () => {
    const onDisk = deployableFunctionDirs();
    const inRegistry = [...ALL_EDGE_FUNCTIONS].sort();

    const missing = onDisk.filter((f) => !inRegistry.includes(f));
    const stale = inRegistry.filter((f) => !onDisk.includes(f));

    expect(
      { missing, stale },
      `Registry drift — update ALL_EDGE_FUNCTIONS in src/lib/edge-function-registry.ts.\n` +
        `Missing (on disk, not in registry): ${missing.join(', ') || 'none'}\n` +
        `Stale (in registry, not on disk): ${stale.join(', ') || 'none'}`,
    ).toEqual({ missing: [], stale: [] });
  });

  it('every module-mapped function exists in ALL_EDGE_FUNCTIONS', () => {
    const known = new Set(ALL_EDGE_FUNCTIONS);
    const unknown: string[] = [];
    for (const [moduleId, fns] of Object.entries(MODULE_EDGE_FUNCTIONS)) {
      for (const fn of fns ?? []) {
        if (!known.has(fn)) unknown.push(`${moduleId} → ${fn}`);
      }
    }
    expect(unknown, `Module map references unknown functions: ${unknown.join(', ')}`).toEqual([]);
  });

  it('core + every module-owned function partitions the full set (no orphans)', () => {
    const core = new Set(coreEdgeFunctions());
    const owned = new Set(Object.values(MODULE_EDGE_FUNCTIONS).flatMap((f) => [...(f ?? [])]));
    for (const fn of ALL_EDGE_FUNCTIONS) {
      expect(core.has(fn) || owned.has(fn), `${fn} is neither core nor module-owned`).toBe(true);
    }
  });

  it('no enabled modules → only core functions are required', () => {
    expect(requiredEdgeFunctions([]).sort()).toEqual(coreEdgeFunctions().sort());
  });

  it('enabling a module adds exactly its (still-disabled-elsewhere) functions', () => {
    // liveSupport owns its adapters exclusively → enabling it adds all of them.
    const base = requiredEdgeFunctions([]).length;
    const withLiveSupport = requiredEdgeFunctions(['liveSupport']).length;
    expect(withLiveSupport).toBe(base + (MODULE_EDGE_FUNCTIONS.liveSupport?.length ?? 0));
  });

  it('edge-function-map.json is in sync with the registry (run `npm run edge-map:json`)', () => {
    const mapPath = join(process.cwd(), 'supabase', 'seed', 'edge-function-map.json');
    expect(existsSync(mapPath), 'edge-function-map.json missing — run `npm run edge-map:json`').toBe(true);
    const artifact = JSON.parse(readFileSync(mapPath, 'utf8')) as {
      total: number;
      core: string[];
      modules: Record<string, string[]>;
    };

    expect(artifact.total, 'total drift — run `npm run edge-map:json`').toBe(ALL_EDGE_FUNCTIONS.length);
    expect([...artifact.core].sort(), 'core drift — run `npm run edge-map:json`').toEqual(coreEdgeFunctions().sort());

    const expectedModules = Object.fromEntries(
      Object.entries(MODULE_EDGE_FUNCTIONS).map(([id, fns]) => [id, [...(fns ?? [])].sort()]),
    );
    const actualModules = Object.fromEntries(
      Object.entries(artifact.modules).map(([id, fns]) => [id, [...fns].sort()]),
    );
    expect(actualModules, 'module map drift — run `npm run edge-map:json`').toEqual(expectedModules);
  });
});
