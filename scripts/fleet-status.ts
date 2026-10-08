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
 *   SUPABASE_ACCESS_TOKEN='<management token>' PGPW=… bun run scripts/fleet-status.ts
 *     — with the token it also lists DEPLOYED edge functions per project and
 *       flags any that config.toml no longer declares (Supabase's GitHub
 *       integration deploys functions but never deletes them, so a retired
 *       function keeps answering with its old code until someone runs
 *       `supabase functions delete <name> --project-ref <ref>`).
 *
 * Also counts agent keys at rest in clear text (api_keys.key_raw while the
 * column still exists, a2a_peers.mcp_api_key) and lists them — that is the
 * rotation list: run it BEFORE pushing 20261008120000, which nulls them.
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
// What the repo says should be deployed: every `[functions.<name>]` block.
const declaredFns = new Set(
  [...readFileSync(resolve(ROOT, 'supabase', 'config.toml'), 'utf8').matchAll(/^\[functions\.([A-Za-z0-9_-]+)\]/gm)].map((m) => m[1]),
);
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

async function deployedFunctions(ref: string): Promise<string[] | null> {
  if (!accessToken) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`functions list HTTP ${res.status}`);
  const list = (await res.json()) as Array<{ slug: string; status?: string }>;
  return list.filter((f) => f.status !== 'REMOVED').map((f) => f.slug);
}

const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as any).sort().map((k) => [k, canon((v as any)[k])])) : (v ?? null);
const norm = (v: unknown) => JSON.stringify(canon(v));

interface Row {
  name: string; fork: boolean; total: number; exposed: number; malformed: number; drift: number; brokenRpc: string[]; brokenEdge: string[];
  /** Keys whose raw value sits in the database — assume exposed, rotate (revoke + reconnect). */
  plaintextKeys: string[];
  /** Active agents silent for 30+ days: name · last seen. */
  idleAgents: string[];
  /** Deployed on the project but no longer declared in config.toml (null = no access token). */
  undeclaredFns: string[] | null;
  error?: string;
}

async function check(inst: { name: string; ref: string; fork?: boolean }): Promise<Row> {
  const row: Row = { name: inst.name, fork: !!inst.fork, total: 0, exposed: 0, malformed: 0, drift: 0, brokenRpc: [], brokenEdge: [], plaintextKeys: [], idleAgents: [], undeclaredFns: null };
  try {
    const deployed = await deployedFunctions(inst.ref);
    if (deployed) row.undeclaredFns = deployed.filter((f) => !declaredFns.has(f)).sort();
  } catch (e) { row.undeclaredFns = [`⚠️ ${(e as Error).message}`]; }
  const c = new Client({ connectionString: dbUrl(inst) });
  try { await c.connect(); } catch (e) { row.error = (e as Error).message; return row; }
  try {
    // Agent keys at rest in clear text — the column may already be dropped.
    const hasKeyRaw = (await c.query(`select 1 from information_schema.columns where table_schema='public' and table_name='api_keys' and column_name='key_raw'`)).rowCount;
    if (hasKeyRaw) {
      for (const k of (await c.query(`select name, key_prefix from api_keys where key_raw is not null order by created_at`)).rows) row.plaintextKeys.push(`${k.name} (${k.key_prefix}…) [api_keys.key_raw]`);
    }
    for (const p of (await c.query(`select name from a2a_peers where mcp_api_key is not null order by created_at`)).rows) row.plaintextKeys.push(`${p.name} [a2a_peers.mcp_api_key]`);
    for (const a of (await c.query(`select p.name, coalesce(k.last_used_at, p.last_seen_at, p.created_at) as seen from a2a_peers p left join api_keys k on k.id = p.api_key_id where p.status = 'active' and coalesce(k.last_used_at, p.last_seen_at, p.created_at) < now() - interval '30 days' order by 2`)).rows) {
      row.idleAgents.push(`${a.name} · ${new Date(a.seen).toISOString().slice(0, 10)}`);
    }

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
console.log(`  ${pad('instance', 12)}${pad('skills', 8)}${pad('exposed', 9)}${pad('malformed', 11)}${pad('drift', 7)}${pad('brokenRPC', 11)}${pad('brokenEdge', 11)}${pad('clearKeys', 11)}${pad('idle', 6)}${pad('undeclFn', 9)}`);
console.log('  ' + '─'.repeat(93));
let dirty = 0;
const attention = (r: Row) => !!(r.malformed || r.drift || r.brokenRpc.length || r.brokenEdge.length || r.plaintextKeys.length || (r.undeclaredFns?.length ?? 0));
for (const r of rows) {
  if (r.error) { console.log(`  ${pad(r.name, 12)}⚠️  ${r.error.slice(0, 50)}`); dirty++; continue; }
  const flag = attention(r) ? ' ⚠️' : ' ✅';
  console.log(`  ${pad(r.name + (r.fork ? '*' : ''), 12)}${pad(r.total, 8)}${pad(r.exposed, 9)}${pad(r.malformed, 11)}${pad(r.drift, 7)}${pad(r.brokenRpc.length, 11)}${pad(r.brokenEdge.length, 11)}${pad(r.plaintextKeys.length, 11)}${pad(r.idleAgents.length, 6)}${pad(r.undeclaredFns === null ? '—' : r.undeclaredFns.length, 9)}${flag}`);
  if (attention(r)) dirty++;
}
console.log('\n  * = fork (does not auto-deploy from main)');
if (!accessToken) console.log('  undeclFn: — (set SUPABASE_ACCESS_TOKEN to compare deployed functions with config.toml)');
for (const r of rows) {
  if (r.brokenRpc.length) console.log(`  ${r.name} brokenRPC: ${r.brokenRpc.join(', ')}`);
  if (r.brokenEdge.length) console.log(`  ${r.name} brokenEdge: ${r.brokenEdge.join(', ')}`);
  if (r.plaintextKeys.length) console.log(`  ${r.name} keys in clear text — rotate (revoke + reconnect):\n    ${r.plaintextKeys.join('\n    ')}`);
  if (r.idleAgents.length) console.log(`  ${r.name} idle agents (active, silent 30+ days):\n    ${r.idleAgents.join('\n    ')}`);
  if (r.undeclaredFns?.length) console.log(`  ${r.name} deployed but not in config.toml — retire them:\n    ${r.undeclaredFns.map((f) => f.startsWith('⚠️') ? f : `supabase functions delete ${f} --project-ref <${r.name} ref>`).join('\n    ')}`);
}
console.log(dirty === 0 ? '\n✅ Fleet clean — no drift, broken handlers, clear-text keys or undeclared functions.\n' : `\n⚠️  ${dirty} instance(s) need attention. Drift → \`npm run sync:skills -- --apply\`; broken handlers → fix the seed/migration; clear-text keys → rotate, then push 20261008120000; undeclared functions → \`supabase functions delete\`.\n`);
