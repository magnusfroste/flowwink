#!/usr/bin/env bun
/**
 * Edge Function Map Export
 *
 * Exports the edge-function registry to a versioned artifact:
 *   supabase/seed/edge-function-map.json
 *
 * This lets the provisioning script (scripts/flowwink.sh) do SELECTIVE DEPLOY —
 * deploy only the functions a site's enabled modules require, instead of all of
 * them — without importing TypeScript/React. Same pattern as skills-to-json.ts.
 *
 * Run whenever edge functions or MODULE_EDGE_FUNCTIONS change:
 *   bun run scripts/edge-functions-to-json.ts   (or: npm run edge-map:json)
 *
 * The guardrail test edge-function-registry.guardrails.test.ts fails if this
 * artifact drifts from the registry — regenerate and commit when it does.
 */
import { resolve, join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const ROOT = resolve(import.meta.dir, '..');
const OUT_DIR = join(ROOT, 'supabase', 'seed');
const OUT_FILE = join(OUT_DIR, 'edge-function-map.json');

const reg = (await import(join(ROOT, 'src', 'lib', 'edge-function-registry.ts'))) as typeof import('../src/lib/edge-function-registry');

const core = reg.coreEdgeFunctions().sort();
const modules = Object.fromEntries(
  Object.entries(reg.MODULE_EDGE_FUNCTIONS)
    .map(([id, fns]) => [id, [...(fns ?? [])].sort()])
    .sort(([a], [b]) => a.localeCompare(b)),
);

const artifact = {
  // Static header; no timestamp so the file is reproducible (guardrail-friendly).
  generated_by: 'scripts/edge-functions-to-json.ts',
  note: 'Selective-deploy map. Core = always deployed. modules[<id>] = deployed only when that module is enabled. Unknown/new functions: deploy (fail-open).',
  total: reg.ALL_EDGE_FUNCTIONS.length,
  core_count: core.length,
  plan_limits: reg.PLAN_FUNCTION_LIMITS,
  core,
  modules,
};

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(artifact, null, 2) + '\n');

const moduleFnCount = Object.values(modules).reduce((n, f) => n + f.length, 0);
console.log(
  `✅ Wrote supabase/seed/edge-function-map.json — ${artifact.total} functions ` +
    `(${core.length} core, ${moduleFnCount} module-bound across ${Object.keys(modules).length} modules)`,
);
