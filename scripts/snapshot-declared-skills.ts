#!/usr/bin/env bun
/**
 * Snapshot all skill names declared in `src/lib/modules/*-module.ts` skillSeeds
 * arrays into `supabase/functions/run-platform-tests/_declared-skills.json`.
 *
 * The platform-test suite `skill_manifest_coverage` reads this snapshot to
 * detect orphan skills in the live DB (rows in agent_skills with no manifest
 * declaration — a maintenance hazard since they never get schema updates from
 * a module bootstrap).
 *
 * Run:  bun run scripts/snapshot-declared-skills.ts
 *
 * The script uses regex (not TS imports) so it can never crash a build via
 * runtime errors in the modules themselves.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MODULES_DIR = 'src/lib/modules';
const OUT_PATH = 'supabase/functions/run-platform-tests/_declared-skills.json';

const declared = new Set<string>();

for (const file of readdirSync(MODULES_DIR).sort()) {
  if (!file.endsWith('.ts')) continue;
  const src = readFileSync(join(MODULES_DIR, file), 'utf-8');
  // Match `name: 'snake_case_name'` and confirm a `tool_definition` and
  // `handler` appear within ~3KB after — that disambiguates skill seeds
  // from automation seeds, types, and other `name:` occurrences.
  const re = /name:\s*'([a-z_][a-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const window = src.slice(m.index + m[0].length, m.index + m[0].length + 3000);
    if (window.includes('tool_definition') && window.includes('handler')) {
      declared.add(m[1]);
    }
  }
}

const out = { declared: [...declared].sort() };
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.declared.length} declared skill names → ${OUT_PATH}`);
