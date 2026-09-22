/**
 * The process battery has a pulse.
 *
 * The battery (scripts/process-battery/) is the one thing in this repo that
 * finds bugs by running a business process to the end and reading the
 * database back — it found refunds above the order total, overtime that never
 * reached payroll and a till that never reached the books the same week the
 * scorecard had those modules at 100 %. It refuses any non-local target (it
 * writes business data), so it cannot run in CI or on the sandbox: it runs
 * when a maintainer runs it, on a local stack.
 *
 * That makes known-red.json a ratchet with no clock. At zero — where it
 * stood on 2026-09-19 after ten fix PRs — nothing red forces the next run,
 * and a ratchet nobody runs measures the maintainer's habit, not the
 * platform. So a full green run stamps last-green.json with when and on
 * which commit, and this guard turns red when the stamp is older than a week
 * or covered fewer processes than exist. "Did anyone run the battery?" becomes
 * a number CI can see instead of a memory on one laptop.
 *
 * Forks: the battery is upstream's ritual. A fork's CI is not failed for a
 * chore it never performs — the guard announces a skip there instead.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const stampPath = join(root, 'scripts/process-battery/last-green.json');
const processCount = readdirSync(join(root, 'docs/processes')).filter((f) => f.endsWith('.md') && f !== 'README.md').length;

export const MAX_AGE_DAYS = 7;

interface Stamp { ran_at?: string; head?: string; processes?: number; red?: number }

/** Every reason the pulse is not good enough, or [] when it is. Pure, so it can be negative-tested. */
export function pulseProblems(stamp: Stamp | null, now: Date, expectedProcesses: number): string[] {
  if (!stamp) return ['last-green.json is missing — run the full battery on a local stack and commit the stamp'];
  const problems: string[] = [];
  const ranAt = stamp.ran_at ? new Date(stamp.ran_at) : new Date(NaN);
  if (Number.isNaN(ranAt.getTime())) problems.push(`ran_at is not a date: ${JSON.stringify(stamp.ran_at)}`);
  else {
    const ageDays = (now.getTime() - ranAt.getTime()) / 86_400_000;
    if (ageDays > MAX_AGE_DAYS) problems.push(`last full green run was ${ageDays.toFixed(1)} days ago (${stamp.ran_at}); the limit is ${MAX_AGE_DAYS}`);
    if (ageDays < -1) problems.push(`ran_at is in the future: ${stamp.ran_at}`);
  }
  if (stamp.processes !== expectedProcesses) problems.push(`the run covered ${stamp.processes} processes but docs/processes/ has ${expectedProcesses} — a new process doc needs a full run`);
  if ((stamp.red ?? 0) !== 0) problems.push(`the stamp records ${stamp.red} red checks — a stamp is only written by a run that held, so this file was edited by hand`);
  if (!stamp.head || !/^[0-9a-f]{40}$/.test(stamp.head)) problems.push(`head is not a commit sha: ${JSON.stringify(stamp.head)}`);
  return problems;
}

const repo = process.env.GITHUB_REPOSITORY;
const upstream = !repo || repo === 'magnusfroste/flowwink';

describe('the process battery has a pulse', () => {
  it('the runner stamps only a full run that held the ratchet', () => {
    const src = readFileSync(join(root, 'scripts/process-battery/run.ts'), 'utf8');
    expect(src).toMatch(/held && !wanted\.length && !owed\.length/);
    expect(src).toMatch(/last-green\.json/);
    // A triage run rewrote the list; it exits before the stamp is ever reached.
    const triageExit = src.indexOf('known-red.json rewritten');
    const stamp = src.indexOf('last-green.json stamped');
    expect(triageExit).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(triageExit);
  });

  it.skipIf(!upstream)('a full green run happened within the last week, on every process', () => {
    const stamp = existsSync(stampPath) ? (JSON.parse(readFileSync(stampPath, 'utf8')) as Stamp) : null;
    const problems = pulseProblems(stamp, new Date(), processCount);
    expect(problems, 'run `npm run qa:processes` against the local stack and commit scripts/process-battery/last-green.json').toEqual([]);
  });

  // The guard is only worth having if it can go red. Each of these is the
  // sabotage a stale or hand-edited stamp would be, fed through the same
  // predicate the live check uses.
  it('goes red on a stamp older than a week', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const p = pulseProblems({ ran_at: eightDaysAgo, head: 'a'.repeat(40), processes: processCount, red: 0 }, new Date(), processCount);
    expect(p.some((x) => /days ago/.test(x))).toBe(true);
  });

  it('stays green on a stamp from yesterday', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(pulseProblems({ ran_at: yesterday, head: 'a'.repeat(40), processes: processCount, red: 0 }, new Date(), processCount)).toEqual([]);
  });

  it('goes red when a process doc was added after the last run', () => {
    const p = pulseProblems({ ran_at: new Date().toISOString(), head: 'a'.repeat(40), processes: processCount - 1, red: 0 }, new Date(), processCount);
    expect(p.some((x) => /new process doc/.test(x))).toBe(true);
  });

  it('goes red on a missing stamp, a hand-edited red count, and a fake head', () => {
    expect(pulseProblems(null, new Date(), processCount)).toHaveLength(1);
    const fresh = new Date().toISOString();
    expect(pulseProblems({ ran_at: fresh, head: 'a'.repeat(40), processes: processCount, red: 3 }, new Date(), processCount).some((x) => /edited by hand/.test(x))).toBe(true);
    expect(pulseProblems({ ran_at: fresh, head: 'main', processes: processCount, red: 0 }, new Date(), processCount).some((x) => /commit sha/.test(x))).toBe(true);
  });
});
