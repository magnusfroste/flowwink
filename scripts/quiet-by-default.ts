/**
 * Quiet by default — a fresh instance tells nobody anything.
 *
 * Run against a LOCAL stack right after the migrations, before any template,
 * module or data is seeded (the nightly fresh install runs it before
 * `qa:prep`; locally: `npm run qa:quiet` after `supabase db reset`). It fires
 * the two things that run on their own on every instance and requires both
 * to keep still:
 *
 *   1. the heartbeat answers `skipped: true` (no AI provider, no objective,
 *      or the module off — any of them, never a model call) and writes no
 *      failed activity;
 *   2. the briefing answers `quiet: true`: its row is written, but no report
 *      version is published, no chat message is posted and no mail is sent.
 *
 * Until 2026-11-06 a fresh instance was mailed a yellow 50/100 every morning,
 * and the heartbeat paid a model call per tick for a starter objective nobody
 * asked for. This script is the rule that keeps that from coming back, in the
 * one place a virgin instance exists every night.
 */
import { Client } from 'pg';

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const FN = 'http://127.0.0.1:54321/functions/v1';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!KEY) {
  console.error('qa:quiet: set SUPABASE_SERVICE_ROLE_KEY to the local stack\'s service key (supabase status -o env).');
  process.exit(2);
}

type Counts = { briefings: number; chat: number; mail: number; failed: number; reports: number };

async function counts(c: Client): Promise<Counts> {
  const one = async (sql: string): Promise<number> => {
    try {
      const r = await c.query(sql);
      return Number(r.rows[0]?.n ?? 0);
    } catch {
      return 0; // a table that does not exist yet holds nothing
    }
  };
  return {
    briefings: await one(`select count(*)::int as n from flowpilot_briefings where type = 'daily_digest'`),
    chat: await one(`select count(*)::int as n from chat_messages where source = 'system'`),
    mail: await one(`select count(*)::int as n from outbound_communications where source = 'daily_briefing'`),
    failed: await one(`select count(*)::int as n from agent_activity where status = 'failed'`),
    reports: await one(`select count(*)::int as n from reports where slug = 'daily-briefing'`),
  };
}

// A worker that fails to BOOT is retried: the edge runtime builds the module
// graph on the first request and fetches every remote import (esm.sh types
// included) then — on 2026-11-08 the night's run went red because esm.sh
// refused one stream mid-graph. A boot error in the code itself fails every
// attempt and stays red; a refused download does not repeat.
async function call(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  for (let attempt = 1; ; attempt++) {
    const res = await callOnce(path, body);
    if (res.json.code !== 'BOOT_ERROR' || attempt >= 4) return res;
    notes.push(`${path}: worker failed to boot (attempt ${attempt}), retrying`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function callOnce(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${FN}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try { json = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, json };
}

const c = new Client({ connectionString: LOCAL_DB });
await c.connect();
const failures: string[] = [];
const notes: string[] = [];

const before = await counts(c);
const modules = await c.query(`select count(*)::int as n from site_settings where key = 'modules'`).then((r) => Number(r.rows[0]?.n ?? 0));
const enabled = await c.query(`select coalesce(sum(case when (e.value->>'enabled')::bool then 1 else 0 end), 0)::int as n from site_settings s, jsonb_each(s.value) e where s.key = 'modules'`).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);
notes.push(`modules row: ${modules ? `present, ${enabled} enabled` : 'absent'}`);

// 1. The heartbeat keeps still.
const hb = await call('flowpilot-heartbeat', {});
if (hb.json.skipped === true) notes.push(`heartbeat: skipped (${String(hb.json.reason)})`);
else failures.push(`heartbeat did not skip: HTTP ${hb.status} ${JSON.stringify(hb.json).slice(0, 200)}`);

// 2. The briefing has nothing to tell.
const br = await call('flowpilot-lifecycle', { task: 'briefing', force: true });
if (br.json.quiet === true) notes.push('briefing: quiet (row written, nothing sent)');
else failures.push(`briefing was not quiet: HTTP ${br.status} ${JSON.stringify(br.json).slice(0, 300)}`);

const after = await counts(c);
const latest = await c.query(`select metrics ->> 'quiet' as quiet, metrics ->> 'health_score' as score, summary from flowpilot_briefings where type = 'daily_digest' order by created_at desc limit 1`).then((r) => r.rows[0] as { quiet: string | null; score: string | null; summary: string } | undefined).catch(() => undefined);

if (after.briefings !== before.briefings + 1) failures.push(`briefing row: expected ${before.briefings + 1}, found ${after.briefings} (the row is the log; it must be written)`);
if (latest && latest.quiet !== '1') failures.push(`the briefing row is not marked quiet (metrics.quiet=${latest.quiet}, summary "${latest.summary}")`);
if (latest && latest.score !== null && latest.score !== '') failures.push(`the briefing carries a health score (${latest.score}) on an instance with no signal`);
if (after.chat !== before.chat) failures.push(`a system chat message was posted (${after.chat - before.chat})`);
if (after.mail !== before.mail) failures.push(`a daily_briefing mail was sent (${after.mail - before.mail})`);
if (after.reports !== before.reports) failures.push(`the daily-briefing report was published`);
if (after.failed !== before.failed) failures.push(`${after.failed - before.failed} failed activity row(s) were written`);

await c.end();

console.log('\nquiet-by-default — a fresh instance tells nobody anything');
for (const n of notes) console.log(`   ${n}`);
if (failures.length) {
  console.error('\n✗ not quiet:');
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log('\n✓ quiet: the heartbeat kept still and the briefing sent nothing.');
process.exit(0);
