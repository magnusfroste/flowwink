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
  // 1) Full skillSeed objects: `name: 'snake'` followed by tool_definition+handler.
  const re = /name:\s*'([a-z_][a-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const window = src.slice(m.index + m[0].length, m.index + m[0].length + 3000);
    if (window.includes('tool_definition') && window.includes('handler')) {
      declared.add(m[1]);
    }
  }
  // 2) String-only ownership arrays: `skills: ['foo', 'bar', ...]` on the
  //    module manifest. These declare ownership without re-providing schema
  //    (schema lives in DB seed migrations). Multi-line arrays supported.
  const skillsArrayRe = /skills:\s*\[([\s\S]*?)\]/g;
  let s: RegExpExecArray | null;
  while ((s = skillsArrayRe.exec(src)) !== null) {
    const body = s[1];
    for (const nameMatch of body.matchAll(/'([a-z_][a-z0-9_]*)'/g)) {
      declared.add(nameMatch[1]);
    }
  }
}

const out = { declared: [...declared].sort() };
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${out.declared.length} declared skill names → ${OUT_PATH}`);
