/**
 * Guardrail: a cron job that only a MIGRATION can schedule is unrecoverable.
 *
 * A migration runs at most once per instance, and there are three ordinary ways
 * for it to never run at all:
 *   • the ledger head is above its timestamp (managed/forked instances silently
 *     skip backdated files — the forward-dating rule in CLAUDE.md);
 *   • a squash drops it;
 *   • it RUNS but bails on a precondition, and the ledger records success.
 *
 * The third is what happened to the event lane. 20260808130000 is the only file
 * in the repository that has ever scheduled `event-dispatcher-every-minute`. It
 * reads SUPABASE_URL out of the vault and returns early when the vault is empty
 * — the state of every fresh install, because the vault is filled by
 * automation-dispatcher, which needs its own cron, which is registered when an
 * admin toggles a module. The migration's own comment says "the next run of
 * this migration will pick it up". There is no next run. Result: agent_events
 * accumulated forever on every instance born after 2026-08-08, and the seeded
 * "Notify approvers in cowork chat" automation never fired once.
 *
 * The runtime registrars (register_flowpilot_cron / register_knowledge_indexer_cron)
 * do not have this failure mode: they are functions the admin shell calls on
 * every bootstrap, they take the instance's own URL and anon key as arguments —
 * which Postgres cannot derive — and every job is guarded "create only if
 * absent". Adding a job there reaches instances already past the ledger.
 *
 * Two invariants, both aimed at the CLASS:
 *   1. every cron job that posts to an edge function present in this repo must
 *      be schedulable by a runtime registrar;
 *   2. a registrar's job set may never SHRINK — CREATE OR REPLACE from a stale
 *      dump silently drops jobs. That has already happened once: 20260717110000
 *      re-created register_flowpilot_cron from an older body and dropped
 *      `booking-reminders` and `calendar-reminders`. (Those two are exempt under
 *      invariant 1 because their targets — send-booking-reminders,
 *      send-calendar-reminders — do not exist in supabase/functions, so their
 *      removal was correct: they would have 404ed every 15 minutes.)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const FUNCTIONS = join(ROOT, 'supabase/functions');

const REGISTRARS = [
  'register_flowpilot_cron',
  'register_knowledge_indexer_cron',
  'register_retrieval_cron',
  'register_booking_cron',
];

const migrationFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const allSql = migrationFiles.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

/** Strip `--` comments so prose about a job never counts as scheduling it. */
const uncomment = (sql: string) => sql.replace(/--[^\n]*/g, '');

/**
 * Every (jobname, command) pair a `cron.schedule(...)` call sets up, anywhere in
 * the migrations. Both the single-line and the multi-line forms are used.
 */
function scheduledJobs(sql: string): { name: string; command: string }[] {
  const out: { name: string; command: string }[] = [];
  // Match AND slice the same string — offsets from the stripped text do not
  // address the original, and mixing them attributed one job's URL to another.
  const clean = uncomment(sql);
  for (const m of clean.matchAll(/cron\.schedule\(\s*'([a-z0-9_-]+)'/gi)) {
    // The command is whatever follows, up to the end of the call. Bounded window:
    // enough to catch the URL, short enough not to swallow the next job.
    out.push({ name: m[1], command: clean.slice(m.index ?? 0, (m.index ?? 0) + 600) });
  }
  return out;
}

/** The edge function a cron command posts to, if any. */
function edgeTarget(command: string): string | null {
  const m = command.match(/\/functions\/v1\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

/** The newest definition of a registrar function across the migration chain. */
function newestRegistrarBody(name: string): string | null {
  for (let i = migrationFiles.length - 1; i >= 0; i--) {
    const sql = allSql[i];
    const idx = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION\\s+"?public"?\\.\\s*"?${name}"?`, 'i'));
    if (idx >= 0) return sql.slice(idx);
  }
  return null;
}

const registrarBodies = REGISTRARS.map(newestRegistrarBody).filter(Boolean) as string[];
const registrarText = registrarBodies.join('\n');

describe('every scheduled edge-function job has a runtime registrar', () => {
  it('lists the jobs the migrations schedule (sanity: the scanner sees something)', () => {
    const names = new Set(allSql.flatMap(scheduledJobs).map((j) => j.name));
    expect(names.size).toBeGreaterThan(5);
  });

  it('a job whose target edge function exists must be registerable at runtime', () => {
    const offenders: string[] = [];
    const seen = new Set<string>();

    for (const sql of allSql) {
      for (const job of scheduledJobs(sql)) {
        if (seen.has(job.name)) continue;
        const target = edgeTarget(job.command);
        if (!target) continue; // pure-SQL jobs (publish_scheduled_pages, purges…)
        if (!existsSync(join(FUNCTIONS, target))) continue; // dead target: see header
        seen.add(job.name);
        if (!registrarText.includes(`'${job.name}'`)) {
          offenders.push(`${job.name} → ${target}`);
        }
      }
    }

    expect(
      offenders,
      'These cron jobs can only be scheduled by a migration. If that migration is ' +
        'skipped, backdated below a ledger head, or bails on a precondition, the job ' +
        'never exists and nothing reports it. Add them to register_flowpilot_cron ' +
        '(or register_knowledge_indexer_cron) so a bootstrap can re-assert them.',
    ).toEqual([]);
  });

  it('the event lane specifically — the instance that produced this rule', () => {
    const flowpilot = newestRegistrarBody('register_flowpilot_cron');
    expect(flowpilot).toBeTruthy();
    expect(
      flowpilot!.includes("'event-dispatcher-every-minute'"),
      'register_flowpilot_cron must schedule event-dispatcher-every-minute. Without it ' +
        'agent_events is written and never drained on every fresh install.',
    ).toBe(true);
    expect(flowpilot!).toMatch(/functions\/v1\/event-dispatcher/);
  });
});

describe('a registrar never forgets a job it already knew', () => {
  it('register_flowpilot_cron\'s job set has not shrunk', () => {
    // Every job any historical definition scheduled…
    const historical = new Set<string>();
    for (const sql of allSql) {
      const idx = sql.search(/CREATE OR REPLACE FUNCTION\s+"?public"?\.\s*"?register_flowpilot_cron"?/i);
      if (idx < 0) continue;
      for (const job of scheduledJobs(sql.slice(idx))) historical.add(job.name);
    }

    const newest = newestRegistrarBody('register_flowpilot_cron')!;
    const dropped = [...historical].filter((name) => !newest.includes(`'${name}'`));

    // A job may only be dropped once its target edge function is gone from the
    // repo — otherwise the removal is amnesia, not a decision. A job that MOVED
    // to another registrar is also a decision, not amnesia: booking-reminders
    // lived in an early register_flowpilot_cron, died with the standalone
    // send-booking-reminders function, and was reborn 2026-08-25 in its own
    // register_booking_cron targeting comms-send. Without this arm, reviving a
    // once-dropped jobname anywhere would retroactively indict the registrar
    // that legitimately dropped it.
    const unexplained = dropped.filter((name) => {
      if (registrarText.includes(`'${name}'`)) return false; // carried by another registrar

      for (const sql of allSql) {
        for (const job of scheduledJobs(sql)) {
          if (job.name !== name) continue;
          const target = edgeTarget(job.command);
          if (target && existsSync(join(FUNCTIONS, target))) return true;
        }
      }
      return false;
    });

    expect(
      unexplained,
      'A CREATE OR REPLACE of register_flowpilot_cron from a stale body silently drops ' +
        'jobs — nothing errors, the jobs simply stop being registered on new instances. ' +
        'Re-add these, or delete the edge function they call if the job is truly dead.',
    ).toEqual([]);
  });
});
