/**
 * "Never ran" means never ran (2026-11-06).
 *
 * The run history (cron.job_run_details) is purged to three days; the health
 * report judged a job never_ran by the absence of a row; the judge turns an
 * active never_ran job red. So a weekly job was red four days of seven and a
 * monthly job nearly always — optic reported "3 scheduled jobs unhealthy" on a
 * Friday with 0 failed runs among 19 jobs.
 *
 * The fix keeps the evidence instead of adding a parser (the River-incident
 * rule still holds: pg_cron is judged by pg_cron's own rows only): the purge
 * keeps each job's newest run, and the report reads the latest run per job
 * over the whole history rather than the 20000 newest runids.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const MIGRATION = 'supabase/migrations/20261106080000_historiken-behaller-sista-korningen.sql';

describe('the purge keeps every job\'s latest run', () => {
  const sql = read(MIGRATION);
  it('re-schedules purge-cron-run-details with the keep-the-newest clause', () => {
    expect(sql).toMatch(/cron\.schedule\(\s*'purge-cron-run-details',\s*'30 3 \* \* \*'/);
    expect(sql).toMatch(/AND d\.runid < \(SELECT max\(r\.runid\) FROM cron\.job_run_details r WHERE r\.jobid = d\.jobid\)/);
  });
  it('is the newest definition of the purge job in the ledger', () => {
    const later = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f > '20261106080000' && !MIGRATION.endsWith(f))
      .filter((f) => read(`supabase/migrations/${f}`).includes("'purge-cron-run-details'"));
    expect(later, 'a later migration re-defines purge-cron-run-details — it must keep each job\'s newest run').toEqual([]);
  });
});

describe('cron_health_report reads the latest run over the whole history', () => {
  const sql = read(MIGRATION);
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.cron_health_report'));
  it('no longer windows the history to the 20000 newest runids', () => {
    expect(fn).not.toMatch(/LIMIT 20000/);
    expect(fn).toMatch(/WITH latest AS \(\s*SELECT DISTINCT ON \(jobid\) jobid, status, start_time\s+FROM cron\.job_run_details\s+ORDER BY jobid, runid DESC\s*\)/);
    expect(fn).toMatch(/'never_ran', \(lr\.status IS NULL\)/);
  });
  it('still judges by pg_cron\'s own rows — no schedule parser', () => {
    expect(fn).not.toMatch(/next-run|cron_next|parse_cron/i);
    const judge = read('supabase/functions/_shared/cron/health.ts');
    expect(judge).not.toMatch(/from ['"]\.\/next-run/);
    // "Never ran" is still pg_cron's own row (lr.status IS NULL); since
    // 2026-11-07 it gets a day's grace measured by pg_cron's own history
    // (the pulse profile), never by a parser's prediction.
    expect(judge).toMatch(/const stranded = j\.never_ran && j\.active && !newborn;/);
    expect(judge).toMatch(/const red = j\.foreign_host \|\| stranded \|\| last_failed;/);
  });
  it('anon holds no EXECUTE on it', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.cron_health_report\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.cron_health_report\(\) TO authenticated, service_role;/);
    expect(sql).not.toMatch(/TO anon/);
  });
});
