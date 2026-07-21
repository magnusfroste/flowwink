#!/usr/bin/env bun
/**
 * Seed Sync — the CLI/server-side equivalent of the "Sync skills from code"
 * button. Brings a target instance in line with the code seeds for every
 * ENABLED module, across three layers:
 *
 *   agent_skills        from module-skills.json      (insert + update)
 *   agent_automations   from module-automations.json (insert by name only)
 *   chart_of_accounts   from locale-packs.json       (insert missing codes)
 *
 * This closes the drift gap: schema ships via migrations, but none of the
 * above does. Skills used to be the only layer this tool covered, which meant
 * automations and the chart were reachable ONLY by loading the admin UI in a
 * browser. FlowWink is sold as agent-operated, so "no human logs in" is a
 * supported case — and both gaps cost real bugs on 2026-07-20/21.
 *
 * Mirrors src/lib/module-bootstrap.ts and useTenantLocalePack.ts semantics
 * exactly, including the deliberate asymmetry: skills are updated in place,
 * automations are only ever inserted. An operator who retunes a cron keeps
 * their schedule.
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

interface Skill { name: string; description?: string; category?: string; handler?: string; scope?: string; instructions?: string; trust_level?: string; requires_staging?: boolean; tool_definition?: unknown }
const artifact = JSON.parse(readFileSync(resolve(import.meta.dir, '..', 'supabase', 'seed', 'module-skills.json'), 'utf8'));
const modules: Array<{ moduleId: string; skills: Skill[] }> = artifact.modules;

const c = new Client({ connectionString: dbUrl });
await c.connect();

// Enabled modules on this instance.
const ss = await c.query(`select value from site_settings where key = 'modules' limit 1`);
const enabledMap: Record<string, { enabled?: boolean }> = ss.rows[0]?.value ?? {};
// `platform` is the pseudo-module for src/lib/platform-seeds.ts — those skills
// exist on every instance regardless of module toggles, so it is always synced.
const isEnabled = (id: string) => id === 'platform' || enabledMap[id]?.enabled === true;

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
          `insert into agent_skills (name, description, category, handler, scope, tool_definition, instructions, enabled, mcp_exposed, origin, trust_level, requires_staging)
           values ($1,$2,$3,$4,$5,$6,$7,true,true,'bundled',$8,$9)`,
          [seed.name, seed.description, seed.category, seed.handler, seed.scope, seed.tool_definition, seed.instructions ?? null, seed.trust_level ?? 'notify', seed.requires_staging ?? false],
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
// ── Automations ─────────────────────────────────────────────────────────────
// bootstrapModule() inserts an automation only when no row with that name
// exists, and never updates — so a schedule the operator retuned survives.
// Mirror that exactly. It also skips executor='flowpilot' automations when the
// FlowPilot module is off, because nothing would run them.
const autoArtifact = JSON.parse(
  readFileSync(resolve(import.meta.dir, '..', 'supabase', 'seed', 'module-automations.json'), 'utf8'),
);
interface Automation { name: string; description?: string; trigger_type?: string; trigger_config?: unknown; skill_name?: string; skill_arguments?: unknown; executor?: string }
const flowpilotEnabled = enabledMap['flowpilot']?.enabled === true;
const existingAutos = new Set(
  (await c.query(`select name from agent_automations`)).rows.map((r: any) => r.name),
);
const autoStats = { inserted: [] as string[], skippedExisting: 0, skippedDisabled: 0, skippedNoFlowPilot: 0 };

for (const mod of (autoArtifact.modules ?? []) as Array<{ moduleId: string; automations: Automation[] }>) {
  if (!isEnabled(mod.moduleId)) { autoStats.skippedDisabled += mod.automations.length; continue; }
  for (const a of mod.automations) {
    if (!a?.name) continue;
    const executor = a.executor ?? 'platform';
    if (executor === 'flowpilot' && !flowpilotEnabled) { autoStats.skippedNoFlowPilot++; continue; }
    if (existingAutos.has(a.name)) { autoStats.skippedExisting++; continue; }
    autoStats.inserted.push(`${a.name} (${mod.moduleId})`);
    if (APPLY) {
      await c.query(
        `insert into agent_automations (name, description, trigger_type, trigger_config, skill_name, skill_arguments, executor, enabled)
         values ($1,$2,$3,$4,$5,$6,$7,true)`,
        [a.name, a.description ?? null, a.trigger_type, a.trigger_config ?? {}, a.skill_name, a.skill_arguments ?? {}, executor],
      );
      existingAutos.add(a.name);
    }
  }
}

// ── Chart of accounts ───────────────────────────────────────────────────────
// Mirrors topUpLocalePackSeeds(): insert the active pack's missing account
// codes, touch nothing that already exists.
const packArtifact = JSON.parse(
  readFileSync(resolve(import.meta.dir, '..', 'supabase', 'seed', 'locale-packs.json'), 'utf8'),
);
const localeRow = await c.query(`select value from site_settings where key = 'accounting_locale' limit 1`);
const rawLocale = localeRow.rows[0]?.value;
// Empty-until-chosen: no accounting_locale row means no pack has been
// ACTIVATED, and the correct chart for that state is the empty one. Seeding
// the default here is how a German instance wakes up with 263 Swedish
// accounts. Activate via the admin UI, or explicitly:
//   psql "$DATABASE_URL" -c "insert into site_settings (key, value)
//     values ('accounting_locale', '\"se-bas2024\"'::jsonb)"
const activePackId = (typeof rawLocale === 'string' ? rawLocale : rawLocale?.id) || null;
const pack = activePackId ? (packArtifact.packs ?? []).find((p: any) => p.id === activePackId) : null;
const coaStats = {
  pack: activePackId ?? '(inget pack aktiverat — hoppar över kontoplanen)',
  inserted: 0,
  present: 0,
  missing: [] as string[],
};

if (pack) {
  // By account_code alone — the table has UNIQUE (account_code), so scoping
  // this to the pack's locale would ask a narrower question than the
  // constraint enforces and report codes as missing that cannot be inserted.
  // See the same note in useTenantLocalePack.ts, where it actually bit.
  const have = new Set(
    (await c.query(`select account_code from chart_of_accounts`)).rows.map((r: any) => r.account_code),
  );
  for (const a of pack.accounts as Array<Record<string, unknown>>) {
    const code = String(a.account_code);
    if (have.has(code)) { coaStats.present++; continue; }
    coaStats.missing.push(code);
    if (APPLY) {
      await c.query(
        `insert into chart_of_accounts (account_code, account_name, account_type, account_category, normal_balance, is_active, locale)
         values ($1,$2,$3,$4,$5,true,$6) on conflict (account_code) do nothing`,
        [code, a.account_name, a.account_type, a.account_category, a.normal_balance, pack.id],
      );
      coaStats.inserted++;
    }
  }
}

// ── Bookkeeping templates ───────────────────────────────────────────────────
// Mirrors the template half of topUpLocalePackSeeds(): insert the active
// pack's missing templates by (template_name, locale), touch nothing that
// exists. User-created and learned templates are unaffected. These are what
// propose_bookkeeping matches bank events against — an instance missing them
// books WORSE, silently (liteit ran the proof week on 15 of 98).
const tplStats = { inserted: 0, present: 0 };
if (pack && Array.isArray((pack as any).templates)) {
  const haveTpl = new Set(
    (await c.query(`select template_name from accounting_templates where locale = $1`, [pack.id])).rows.map(
      (r: any) => r.template_name,
    ),
  );
  for (const t of (pack as any).templates as Array<Record<string, unknown>>) {
    if (!t?.template_name) continue;
    if (haveTpl.has(t.template_name)) { tplStats.present++; continue; }
    if (APPLY) {
      await c.query(
        `insert into accounting_templates (template_name, description, category, keywords, template_lines, is_system, locale)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [t.template_name, t.description ?? null, t.category ?? null, t.keywords ?? [], JSON.stringify(t.template_lines ?? []), t.is_system ?? true, pack.id],
      );
    }
    tplStats.inserted++;
  }
}

// ── Manifest stamp ──────────────────────────────────────────────────────────
// The Instance Sync card compares site_settings.instance_manifest_stamp
// against the bundled manifest's seed_hash. Only ModulesPage wrote it — the
// same browser-only class as automations and the chart — so an instance
// synced from the CLI kept reporting a stale or missing skills layer no
// matter how in-sync it actually was.
if (APPLY) {
  const manifest = JSON.parse(
    readFileSync(resolve(import.meta.dir, '..', 'supabase', 'seed', 'instance-manifest.json'), 'utf8'),
  );
  const stamp = {
    seed_hash: manifest.layers.skills.seed_hash,
    skill_count: manifest.layers.skills.skill_count,
    stamped_at: new Date().toISOString(),
    stamped_by: 'sync-skills-cli',
  };
  await c.query(
    `insert into site_settings (key, value) values ('instance_manifest_stamp', $1)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(stamp)],
  );
}

await c.end();

console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'} — modules synced: ${stats.modulesSynced}, skipped (disabled): ${stats.modulesSkipped}`);
console.log(`  unchanged: ${stats.unchanged}  |  to insert: ${stats.inserts.length}  |  to update: ${stats.updates.length}`);
if (stats.inserts.length) { console.log('\n  INSERT:'); stats.inserts.forEach((x) => console.log('    + ' + x)); }
if (stats.updates.length) { console.log('\n  UPDATE:'); stats.updates.slice(0, 60).forEach((x) => console.log('    ~ ' + x)); if (stats.updates.length > 60) console.log(`    … +${stats.updates.length - 60} more`); }

console.log(
  `\n  automations — to insert: ${autoStats.inserted.length}  |  already present: ${autoStats.skippedExisting}` +
    `  |  skipped (module off): ${autoStats.skippedDisabled}  |  skipped (FlowPilot off): ${autoStats.skippedNoFlowPilot}`,
);
if (autoStats.inserted.length) autoStats.inserted.forEach((x) => console.log('    + ' + x));

console.log(
  `\n  chart of accounts [${coaStats.pack}] — to insert: ${coaStats.missing.length}  |  already present: ${coaStats.present}`,
);
console.log(
  `  bookkeeping templates — to insert: ${tplStats.inserted}  |  already present: ${tplStats.present}`,
);
if (coaStats.missing.length) {
  console.log('    + ' + coaStats.missing.slice(0, 20).join(', ') + (coaStats.missing.length > 20 ? `, … +${coaStats.missing.length - 20} more` : ''));
}

const anything =
  stats.inserts.length || stats.updates.length || autoStats.inserted.length || coaStats.missing.length || tplStats.inserted;
if (!APPLY && anything) console.log('\n  Re-run with --apply to write these changes.');
