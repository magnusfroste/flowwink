/**
 * The work queue — durable tasks instead of a sweep per feature.
 * Design: docs/architecture/work-queue.md
 *
 * These are structural guards, not behaviour tests. The behaviour was verified
 * against a live database (claim / retry / attempt cap / reaper / idempotent
 * enqueue), which SQL-shaped logic deserves and a mock cannot give. What a mock
 * *can* do is stop the properties that make the queue safe from being edited
 * away later — every one below corresponds to a failure mode we have already
 * shipped at least once elsewhere:
 *
 *  - no lease           → two ticks execute the same row (today's automation lane)
 *  - no attempt cap     → a permanently failing job retries forever, silently
 *  - business logic in the dispatcher → 25 cron jobs, each its own special case
 *  - a nullable reason  → "why is the agent doing this on Thursday" is unanswerable
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

const MIGRATION = 'supabase/migrations/20260806000000_agent-tasks-work-queue.sql';
const DISPATCHER = 'supabase/functions/automation-dispatcher/index.ts';

const migration = read(MIGRATION);
const dispatcher = read(DISPATCHER);

describe('claim_due_tasks — the concurrency story', () => {
  it('claims with FOR UPDATE SKIP LOCKED', () => {
    // Without this, two overlapping dispatcher ticks select the same due row and
    // both execute it. A slow run plus the next minute's tick is enough — which
    // is exactly what the automation lane does today.
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED/i);
  });

  it('takes a lease and burns an attempt at claim time, not at completion', () => {
    // Incrementing on completion means a run that dies never burns an attempt,
    // so it retries forever — the infinite-retry loop next_run_at-after-success
    // already creates in the automation lane.
    const claim = migration.slice(migration.indexOf('FUNCTION public.claim_due_tasks'));
    const body = claim.slice(0, claim.indexOf('$function$;'));
    expect(body).toMatch(/leased_until\s*=\s*now\(\)/);
    expect(body).toMatch(/attempts\s*=\s*t\.attempts\s*\+\s*1/);
  });

  it('never claims work that is not due, or that is out of attempts', () => {
    const claim = migration.slice(migration.indexOf('FUNCTION public.claim_due_tasks'));
    const body = claim.slice(0, claim.indexOf('$function$;'));
    expect(body).toMatch(/status\s*=\s*'pending'/);
    expect(body).toMatch(/due_at\s*<=\s*now\(\)/);
    expect(body).toMatch(/attempts\s*<\s*c\.max_attempts/);
  });
});

describe('durability properties', () => {
  it('the attempt cap terminates with a sentence, not silence', () => {
    // "Gave up after 3 attempts" is the whole point: today a job that dies is
    // indistinguishable from a job that never had work.
    expect(migration).toMatch(/Gave up after/);
    expect(migration).toMatch(/never reported back/);
  });

  it('a reaper exists and returns expired leases to pending', () => {
    expect(migration).toMatch(/FUNCTION public\.reap_stale_task_leases/);
    const reaper = migration.slice(migration.indexOf('FUNCTION public.reap_stale_task_leases'));
    expect(reaper).toMatch(/leased_until\s*<\s*now\(\)/);
    expect(reaper).toMatch(/status\s*=\s*'pending'/);
  });

  it('reason is NOT NULL and cannot be blank', () => {
    expect(migration).toMatch(/reason\s+text NOT NULL/);
    expect(migration).toMatch(/length\(btrim\(reason\)\)\s*>\s*0/);
  });

  it('an open task per (subject, skill) is unique — a double-enqueue cannot double-send', () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*?agent_tasks[\s\S]*?subject_type, subject_id, skill_name/);
    expect(migration).toMatch(/WHERE status IN \('pending', 'running'\)/);
  });

  it('agent-callable functions carry the service_role escape', () => {
    // The dispatcher and the MCP gateway run as service_role, where auth.uid()
    // is NULL and has_role() is false. 44 admin functions once had this patch
    // stranded in skipped migrations.
    for (const fn of ['claim_due_tasks', 'complete_task', 'fail_task', 'reap_stale_task_leases', 'enqueue_task']) {
      const start = migration.indexOf(`FUNCTION public.${fn}`);
      expect(start, `${fn} not found`).toBeGreaterThan(-1);
      const body = migration.slice(start, migration.indexOf('$function$;', start));
      expect(body, `${fn} lacks the service_role escape`).toMatch(/auth\.role\(\)\s*=\s*'service_role'/);
    }
  });

  it('revokes from PUBLIC as well as anon — anon inherits EXECUTE via PUBLIC', () => {
    // Revoking from anon alone is insufficient: EXECUTE is granted to PUBLIC at
    // function creation, and anon inherits it. Learned the hard way in #134.
    const revokes = migration.match(/REVOKE EXECUTE ON FUNCTION[^;]+;/g) || [];
    expect(revokes.length).toBeGreaterThanOrEqual(5);
    for (const r of revokes) expect(r).toMatch(/FROM PUBLIC, anon/);
  });
});

describe('the dispatcher lane decides nothing', () => {
  it('drains the queue and hands each task to agent-execute', () => {
    expect(dispatcher).toMatch(/claim_due_tasks/);
    expect(dispatcher).toMatch(/reap_stale_task_leases/);
    expect(dispatcher).toMatch(/complete_task/);
    expect(dispatcher).toMatch(/fail_task/);
  });

  it('carries no per-feature branching in the task lane', () => {
    // The moment the dispatcher knows a skill's name, we are back to 25 special
    // cases. What to do belongs in the skill; when, in due_at.
    const lane = dispatcher.slice(dispatcher.indexOf('6. Drain the work queue'));
    const businessNames = [
      'subscription', 'invoice', 'booking', 'dunning', 'contract',
      'quote', 'webinar', 'newsletter', 'lead',
    ];
    for (const name of businessNames) {
      expect(
        new RegExp(`["'\`]${name}`, 'i').test(lane),
        `the task lane mentions "${name}" — business logic belongs in the skill, not the dispatcher`,
      ).toBe(false);
    }
  });

  it('reports every claimed task as done or failed — a claimed row is never abandoned', () => {
    const lane = dispatcher.slice(dispatcher.indexOf('6. Drain the work queue'));
    expect(lane).toMatch(/if \(taskError\)/);
    expect(lane).toMatch(/fail_task/);
    expect(lane).toMatch(/complete_task/);
  });

  it('cannot take the automation lane down with it', () => {
    // The queue is new; the automations are load-bearing. A throw in the new
    // lane must not cost the tick its existing work.
    const lane = dispatcher.slice(dispatcher.indexOf('6. Drain the work queue'));
    expect(lane).toMatch(/catch \(err\)/);
    expect(lane).toMatch(/task lane error/);
  });

  it('runs last, after automations and workflows', () => {
    expect(dispatcher.indexOf('6. Drain the work queue')).toBeGreaterThan(
      dispatcher.indexOf('Execute due cron workflows'),
    );
  });
});

describe('the queue ships empty', () => {
  it('no migration enqueues anything yet', () => {
    // Step 1 is machinery only: zero behaviour change, fully reversible. The
    // first family moves in its own migration, with its own verification.
    const dir = join(root, 'supabase/migrations');
    const callers = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => /enqueue_task\s*\(/.test(readFileSync(join(dir, f), 'utf-8')))
      .filter((f) => !f.includes('agent-tasks-work-queue')); // the definition itself
    expect(
      callers,
      `these migrations enqueue work — the queue is meant to ship empty:\n${callers.join('\n')}`,
    ).toEqual([]);
  });

  it('no cron job or automation was removed in the same change', () => {
    // Coexistence is the migration path: the queue lands next to the existing
    // jobs and they move one at a time, each with before/after verification.
    expect(migration).not.toMatch(/cron\.unschedule/);
    expect(migration).not.toMatch(/DELETE FROM (public\.)?agent_automations/i);
  });
});
