#!/usr/bin/env bun
/**
 * Skill Sync — the CLI/server-side equivalent of the "Sync skills from code"
 * button. Brings a target instance's agent_skills rows in line with the code
 * seeds (supabase/seed/module-skills.json) for every ENABLED module.
 *
 * This closes the drift gap: schema ships via migrations, but skill metadata
 * (description, tool_definition, handler, …) only reaches an instance when
 * bootstrap runs. Running this as part of `flowwink update` keeps every site
 * in sync after a deploy — no manual UI click, no DB-only skills rotting.
 *
 * Mirrors src/lib/module-bootstrap.ts upsert semantics exactly.
 *
 * Usage:
 *   DATABASE_URL=postgresql://… bun run scripts/sync-skills.ts            # dry-run (default)
 *   DATABASE_URL=postgresql://… bun run scripts/sync-skills.ts --apply    # write changes
 *
 * Regenerate the artifact first if seeds changed:  bun run scripts/skills-to-json.ts
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APPLY = process.argv.includes('--apply');
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('Set DATABASE_URL'); process.exit(1); }

interface Skill { name: string; description?: string; category?: string; handler?: string; scope?: string; instructions?: string; trust_level?: string; tool_definition?: unknown }
const artifact = JSON.parse(readFileSync(resolve(import.meta.dir, '..', 'supabase', 'seed', 'module-skills.json'), 'utf8'));
const modules: Array<{ moduleId: string; skills: Skill[] }> = artifact.modules;

const c = new Client({ connectionString: dbUrl });
await c.connect();

// Enabled modules on this instance.
const ss = await c.query(`select value from site_settings where key = 'modules' limit 1`);
const enabledMap: Record<string, { enabled?: boolean }> = ss.rows[0]?.value ?? {};
const isEnabled = (id: string) => enabledMap[id]?.enabled === true;

// Current skill rows (the fields bootstrap manages).
const existing = new Map<string, any>();
for (const r of (await c.query(`select name, description, category, handler, scope, instructions, enabled, mcp_exposed, tool_definition from agent_skills`)).rows) {
  existing.set(r.name, r);
}

const stats = { modulesSynced: 0, modulesSkipped: 0, inserts: [] as string[], updates: [] as string[], unchanged: 0 };

// Canonical JSON: recursively sort object keys so semantically-equal values
// compare equal. Postgres jsonb does NOT preserve key order, so a plain
// JSON.stringify would report spurious tool_definition diffs.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  }
  return v ?? null;
}
const norm = (v: unknown) => JSON.stringify(canon(v));
function changedFields(seed: Skill, row: any): string[] {
  const diffs: string[] = [];
  if ((seed.description ?? '') !== (row.description ?? '')) diffs.push('description');
  if ((seed.category ?? '') !== (row.category ?? '')) diffs.push('category');
  if ((seed.handler ?? '') !== (row.handler ?? '')) diffs.push('handler');
  if ((seed.scope ?? '') !== (row.scope ?? '')) diffs.push('scope');
  if ((seed.instructions ?? null) !== (row.instructions ?? null)) diffs.push('instructions');
  if (norm(seed.tool_definition) !== norm(row.tool_definition)) diffs.push('tool_definition');
  if (row.enabled !== true) diffs.push('enabled');
  if (row.mcp_exposed !== true) diffs.push('mcp_exposed');
  return diffs;
}

for (const mod of modules) {
  if (!isEnabled(mod.moduleId)) { stats.modulesSkipped++; continue; }
  stats.modulesSynced++;
  for (const seed of mod.skills) {
    if (!seed || typeof seed !== 'object' || !seed.name) continue; // mirror bootstrap's invalid-seed guard
    const row = existing.get(seed.name);
    if (!row) {
      stats.inserts.push(`${seed.name} (${mod.moduleId})`);
      if (APPLY) {
        await c.query(
          `insert into agent_skills (name, description, category, handler, scope, tool_definition, instructions, enabled, mcp_exposed, origin, trust_level)
           values ($1,$2,$3,$4,$5,$6,$7,true,true,'bundled',$8)`,
          [seed.name, seed.description, seed.category, seed.handler, seed.scope, seed.tool_definition, seed.instructions ?? null, seed.trust_level ?? 'notify'],
        );
      }
    } else {
      const diffs = changedFields(seed, row);
      if (diffs.length === 0) { stats.unchanged++; continue; }
      stats.updates.push(`${seed.name} (${mod.moduleId}): ${diffs.join(', ')}`);
      if (APPLY) {
        await c.query(
          `update agent_skills set enabled=true, mcp_exposed=true, description=$2, instructions=$3, tool_definition=$4, category=$5, handler=$6, scope=$7 where name=$1`,
          [seed.name, seed.description, seed.instructions ?? null, seed.tool_definition, seed.category, seed.handler, seed.scope],
        );
      }
    }
  }
}
await c.end();

console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — modules synced: ${stats.modulesSynced}, skipped (disabled): ${stats.modulesSkipped}`);
console.log(`  unchanged: ${stats.unchanged}  |  to insert: ${stats.inserts.length}  |  to update: ${stats.updates.length}`);
if (stats.inserts.length) { console.log('\n  INSERT:'); stats.inserts.forEach((x) => console.log('    + ' + x)); }
if (stats.updates.length) { console.log('\n  UPDATE:'); stats.updates.slice(0, 60).forEach((x) => console.log('    ~ ' + x)); if (stats.updates.length > 60) console.log(`    … +${stats.updates.length - 60} more`); }
if (!APPLY && (stats.inserts.length || stats.updates.length)) console.log('\n  Re-run with --apply to write these changes.');
