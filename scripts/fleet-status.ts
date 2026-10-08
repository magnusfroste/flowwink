#!/usr/bin/env bun
/* eslint-disable @typescript-eslint/no-explicit-any -- ops script over dynamic pg rows */
/**
 * Fleet drift detector — a read-only health snapshot across every FlowWink
 * instance. Productizes the manual cross-instance audit: per site it reports
 * skill counts, malformed tool_definitions, skill drift vs. the code artifact,
 * and unresolvable rpc:/edge: handlers.
 *
 * Read-only — never writes. Run:
 *   PGPW='<db password>' bun run scripts/fleet-status.ts
 *
 * Instances come from scripts/fleet.local.json — gitignored, because WHICH
 * Supabase projects you run is yours, not the product's. Anyone forking
 * FlowWink operates their own instances; ours travelling along in the repo was
 * noise for them and a stale-ref trap for us (see the 2026-08-12 note below).
 * Copy scripts/fleet.example.json to get started. The DB password is the same
 * across a fleet and passed via PGPW.
 */
import { Client } from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const pw = process.env.PGPW;
if (!pw) { console.error('Set PGPW (DB password)'); process.exit(1); }

const ROOT = resolve(import.meta.dir, '..');
const FLEET_FILE = resolve(ROOT, 'scripts', 'fleet.local.json');
if (!existsSync(FLEET_FILE)) {
  console.error(
    'No scripts/fleet.local.json.\n' +
    'It is gitignored on purpose — it lists YOUR Supabase projects.\n' +
    'Start from the template:  cp scripts/fleet.example.json scripts/fleet.local.json',
  );
  process.exit(1);
}
// Refs go stale silently: a project a site has MOVED AWAY from keeps answering
// psql, edge calls and ledger queries with confident, irrelevant data (www,
// 2026-08-12). Confirm a ref against the live site before trusting a reading:
//   curl -sL https://<site>/ | grep -oE '[a-z]{20}\.supabase\.co'
const fleet = JSON.parse(readFileSync(FLEET_FILE, 'utf8')).instances as Array<{ name: string; ref: string; fork?: boolean; poolerHost?: string }>;

// db.<ref>.supabase.co resolves IPv6-only; on IPv4-only networks those
// connections are refused. Prefer the instance's Supavisor pooler when
// the fleet file declares one (user postgres.<ref>, port 6543).
const dbUrl = (inst: { ref: string; poolerHost?: string }) => inst.poolerHost
  ? `postgresql://postgres.${inst.ref}:${pw}@${inst.poolerHost}:6543/postgres`
  : `postgresql://postgres:${pw}@db.${inst.ref}.supabase.co:5432/postgres`;
const artifact = JSON.parse(readFileSync(resolve(ROOT, 'supabase', 'seed', 'module-skills.json'), 'utf8'));
const codeModules: Array<{ moduleId: string; skills: any[] }> = artifact.modules;

const edgeDirs = new Set(readdirSync(resolve(ROOT, 'supabase', 'functions')).filter((d) => existsSync(resolve(ROOT, 'supabase', 'functions', d, 'index.ts'))));
const SUBROUTE_FNS = new Set(['agent-execute', 'content-api', 'docs-sync', 'reconciliation']);

const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as any).sort().map((k) => [k, canon((v as any)[k])])) : (v ?? null);
const norm = (v: unknown) => JSON.stringify(canon(v));

interface Row { name: string; fork: boolean; total: number; exposed: number; malformed: number; drift: number; brokenRpc: string[]; brokenEdge: string[]; error?: string }

async function check(inst: { name: string; ref: string; fork?: boolean }): Promise<Row> {
  const row: Row = { name: inst.name, fork: !!inst.fork, total: 0, exposed: 0, malformed: 0, drift: 0, brokenRpc: [], brokenEdge: [] };
  const c = new Client({ connectionString: dbUrl(inst) });
  try { await c.connect(); } catch (e) { row.error = (e as Error).message; return row; }
  try {
    const skills = (await c.query(`select name, handler, description, tool_definition from agent_skills where enabled and mcp_exposed`)).rows;
    const all = (await c.query(`select count(*)::int n from agent_skills`)).rows[0].n;
    const rpcs = new Set((await c.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows.map((r: any) => r.proname));
    const existing = new Map(skills.map((s: any) => [s.name, s]));
    const ss = (await c.query(`select value from site_settings where key='modules' limit 1`)).rows[0]?.value ?? {};

    row.total = all; row.exposed = skills.length;
    row.malformed = skills.filter((s: any) => !s.tool_definition?.function?.name).length;

    // handler resolvability (rpc + edge; db is nuanced via dedicated cases → skip)
    for (const s of skills as any[]) {
      const h = s.handler || '';
      if (h.startsWith('rpc:') && !rpcs.has(h.slice(4))) row.brokenRpc.push(s.name);
      else if (h.startsWith('edge:') || h.startsWith('function:')) {
        const base = h.replace(/^(edge|function):/, '').split('/')[0];
        if (!edgeDirs.has(base)) row.brokenEdge.push(`${s.name}→${base}`);
      }
    }

    // drift vs code artifact (enabled modules only — mirrors sync-skills)
    for (const mod of codeModules) {
      if (ss[mod.moduleId]?.enabled !== true) continue;
      for (const seed of mod.skills) {
        if (!seed?.name) continue;
        const cur: any = existing.get(seed.name);
        if (!cur) { row.drift++; continue; }
        if ((seed.description ?? '') !== (cur.description ?? '') || seed.handler !== cur.handler || norm(seed.tool_definition) !== norm(cur.tool_definition)) row.drift++;
      }
    }
  } catch (e) { row.error = (e as Error).message; }
  finally { await c.end(); }
  return row;
}

const rows = await Promise.all(fleet.map(check));

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log('\nFLEET DRIFT STATUS  (read-only)\n');
console.log(`  ${pad('instance', 12)}${pad('skills', 8)}${pad('exposed', 9)}${pad('malformed', 11)}${pad('drift', 7)}${pad('brokenRPC', 11)}${pad('brokenEdge', 11)}`);
console.log('  ' + '─'.repeat(67));
let dirty = 0;
for (const r of rows) {
  if (r.error) { console.log(`  ${pad(r.name, 12)}⚠️  ${r.error.slice(0, 50)}`); dirty++; continue; }
  const flag = (r.malformed || r.drift || r.brokenRpc.length || r.brokenEdge.length) ? ' ⚠️' : ' ✅';
  console.log(`  ${pad(r.name + (r.fork ? '*' : ''), 12)}${pad(r.total, 8)}${pad(r.exposed, 9)}${pad(r.malformed, 11)}${pad(r.drift, 7)}${pad(r.brokenRpc.length, 11)}${pad(r.brokenEdge.length, 11)}${flag}`);
  if (r.malformed || r.drift || r.brokenRpc.length || r.brokenEdge.length) dirty++;
}
console.log('\n  * = fork (does not auto-deploy from main)');
for (const r of rows) {
  if (r.brokenRpc.length) console.log(`  ${r.name} brokenRPC: ${r.brokenRpc.join(', ')}`);
  if (r.brokenEdge.length) console.log(`  ${r.name} brokenEdge: ${r.brokenEdge.join(', ')}`);
}
console.log(dirty === 0 ? '\n✅ Fleet clean — no drift or broken handlers.\n' : `\n⚠️  ${dirty} instance(s) need attention. Drift → \`npm run sync:skills -- --apply\`; broken handlers → fix the seed/migration.\n`);
