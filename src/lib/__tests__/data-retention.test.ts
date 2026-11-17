import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { megabytes, sizeHeadline, lastRunLine, normalizeRetention } from '@/lib/data-retention';

/**
 * The logs are thinned and the database says how full it is (2026-11-15).
 * Nothing thinned agent_activity: on www 92 % of its rows were scheduled sweeps
 * answering "nothing to do", kept since August. What a row proves decides how
 * long it lives — and a change is never thinned.
 */
const root = join(__dirname, '../../..');
const migration = readFileSync(join(root, 'supabase/migrations/20261115090000_loggarna-gallras.sql'), 'utf-8');
const core = readFileSync(join(root, 'supabase/functions/_shared/execute/core.ts'), 'utf-8');

describe('data retention — the card', () => {
  it('reads megabytes as a person does', () => {
    expect(megabytes(129 * 1048576)).toBe('129 MB');
    expect(megabytes(3.44 * 1048576)).toBe('3.4 MB');
    expect(megabytes(0)).toBe('0 MB');
  });

  it('says how full, and when it is time to act', () => {
    const r = (pct: number, level: 'ok' | 'watch' | 'high') => ({ db_bytes: pct * 5 * 1048576, quota_bytes: 500 * 1048576, pct, level });
    expect(sizeHeadline(r(26, 'ok'))).toBe('130 MB of 500 MB · 26 %');
    expect(sizeHeadline(r(72, 'watch'))).toMatch(/time to look at what grows/);
    expect(sizeHeadline(r(90, 'high'))).toMatch(/act before writes start failing/);
  });

  it('tells what the last night removed', () => {
    expect(lastRunLine(null)).toMatch(/has not run yet/);
    expect(lastRunLine({ status: 'off' })).toMatch(/switched off/);
    expect(lastRunLine({ status: 'ok', deleted: 5000, trimmed: 12, trace_events_deleted: 3, bootstrap_runs_deleted: 1, more: true }))
      .toBe('Last night: 5004 log rows removed, 12 answers shortened — more remains for the next night.');
  });

  it('the dial has floors: a week at least, and a row never goes before its answer', () => {
    expect(normalizeRetention({})).toEqual({ enabled: true, answers_days: 30, rows_days: 90, quota_mb: 500 });
    expect(normalizeRetention({ answers_days: 1, rows_days: 3, quota_mb: 8000, enabled: false }))
      .toEqual({ enabled: false, answers_days: 7, rows_days: 7, quota_mb: 8000 });
    expect(normalizeRetention({ answers_days: 'soon', rows_days: -4, quota_mb: 0 }))
      .toEqual({ enabled: true, answers_days: 30, rows_days: 90, quota_mb: 500 });
  });
});

describe('data retention — the rule', () => {
  const prune = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.prune_logs'), migration.indexOf('REVOKE ALL ON FUNCTION public.prune_logs'));

  it('a change is never thinned: only lookups, stopped calls and scheduled ticks', () => {
    const selectors = [...prune.matchAll(/AND \(a\.agent::text = 'cron' OR[^\n]*\)/g)].map((m) => m[0]);
    expect(selectors.length).toBeGreaterThanOrEqual(2);
    for (const s of selectors) expect(s).toBe("AND (a.agent::text = 'cron' OR a.status::text IN ('refused', 'failed') OR a.kind = 'read')");
    expect(prune).not.toMatch(/kind = 'write'/);
    expect(prune).not.toMatch(/kind IS NULL\s+AND a\.created_at < now\(\) - v_rows/);
  });

  it('evidence stays: an objective\'s row, an approval\'s row, an unacknowledged notice', () => {
    const deletes = prune.split('DELETE FROM public.agent_activity')[0] + prune.slice(prune.indexOf('WITH doomed AS'), prune.indexOf('DELETE FROM public.agent_activity'));
    expect(deletes).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.agent_objective_activities o WHERE o\.activity_id = a\.id\)/);
    expect(deletes).toMatch(/a\.approval_request_id IS NULL/);
    // `NOT (log_type = 'notify' AND …)` is NULL for every row without a log_type — and deleted nothing.
    expect(deletes).toMatch(/a\.log_type IS DISTINCT FROM 'notify' OR a\.acknowledged_at IS NOT NULL/);
    expect(prune).not.toMatch(/NOT \(a\.log_type = 'notify'/);
  });

  it('a night is bounded — a backlog is worked off over several', () => {
    expect(prune).toMatch(/v_batch int := least\(greatest\(coalesce\(p_batch, 5000\), 1\), 20000\)/);
    expect((prune.match(/LIMIT v_batch/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('only the service role thins; the report is an admin\'s', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.prune_logs\(boolean, integer\) FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/database_size_report: admin or service_role required/);
    expect(migration).toMatch(/cron\.schedule\('prune-logs', '50 3 \* \* \*'/);
  });

  it('the executor stamps lookup-or-change with the platform\'s one read rule', () => {
    expect(core).toMatch(/kind: classifyCall\(activity\.skill_name, activity\.input\) === 'read' \? 'read' : 'write'/);
    // …and an instance whose migration lags the edge deploy keeps its journal.
    expect(core).toMatch(/_withoutKind: true/);
  });
});

describe('data retention — the proof passes on an instance with history', () => {
  // 2026-11-17: the proof ran prune_logs() (bounded, oldest first) and asserted
  // on its own 45-day rows; on www they sat behind 22 169 real ones. The
  // migration failed and every later one stayed unapplied after a green sync.
  const proof = migration.slice(migration.indexOf('DO $proof$'));

  it('does not run where the log already holds history', () => {
    const guard = proof.indexOf("WHERE created_at < now() - interval '30 days'");
    expect(guard).toBeGreaterThan(0);
    expect(proof).toMatch(/IF v_history > 0 THEN\s+RAISE NOTICE [^;]+;\s+RETURN;\s+END IF;/);
    // …and the check comes before the proof writes or thins anything.
    expect(guard).toBeLessThan(proof.indexOf('INSERT INTO public.agent_activity'));
    expect(guard).toBeLessThan(proof.indexOf('public.prune_logs('));
  });
});
