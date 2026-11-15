/**
 * The database's size against its quota, and the dial that thins the logs.
 *
 * The figures are the database's own (database_size_report); the thinning is
 * prune_logs, every night. This file only reads them for the Observability
 * card: how full, which tables, and what the last night removed.
 */

export interface RetentionSettings {
  enabled: boolean;
  /** A lookup's answer is cut down to its identifying fields after this many days. */
  answers_days: number;
  /** A lookup, a refused or failed call and a scheduled tick are removed after this many days. */
  rows_days: number;
  /** The plan's database size. 500 MB on Supabase Free. */
  quota_mb: number;
}

export interface SizeReport {
  db_bytes: number;
  quota_bytes: number;
  pct: number;
  level: 'ok' | 'watch' | 'high';
  tables: Array<{ name: string; bytes: number; est_rows: number }>;
  settings: RetentionSettings;
  last_run: null | {
    status: string;
    at?: string;
    deleted?: number;
    trimmed?: number;
    trace_events_deleted?: number;
    bootstrap_runs_deleted?: number;
    more?: boolean;
  };
}

export const RETENTION_DEFAULTS: RetentionSettings = { enabled: true, answers_days: 30, rows_days: 90, quota_mb: 500 };

/** Megabytes as a person reads them: whole above ten, one decimal below. */
export function megabytes(bytes: number): string {
  const mb = (Number(bytes) || 0) / 1048576;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** The card's one line. */
export function sizeHeadline(r: Pick<SizeReport, 'db_bytes' | 'quota_bytes' | 'pct' | 'level'>): string {
  const base = `${megabytes(r.db_bytes)} of ${megabytes(r.quota_bytes)} · ${Math.round(r.pct)} %`;
  if (r.level === 'high') return `${base} — act before writes start failing`;
  if (r.level === 'watch') return `${base} — time to look at what grows`;
  return base;
}

/** What the last night removed, or why nothing ran. */
export function lastRunLine(last: SizeReport['last_run']): string {
  if (!last) return 'The nightly thinning has not run yet.';
  if (last.status === 'off') return 'Thinning is switched off.';
  const removed = (last.deleted ?? 0) + (last.trace_events_deleted ?? 0) + (last.bootstrap_runs_deleted ?? 0);
  const parts = [`${removed} log rows removed`, `${last.trimmed ?? 0} answers shortened`];
  return `Last night: ${parts.join(', ')}${last.more ? ' — more remains for the next night' : ''}.`;
}

/**
 * What an admin typed, as the dial stores it. The floors are the database's
 * too (data_retention_settings): a week at least, and a row never goes before
 * its answer.
 */
export function normalizeRetention(input: Partial<Record<keyof RetentionSettings, unknown>>): RetentionSettings {
  const int = (v: unknown, fallback: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const answers = Math.max(7, int(input.answers_days, RETENTION_DEFAULTS.answers_days));
  return {
    enabled: input.enabled !== false,
    answers_days: answers,
    rows_days: Math.max(answers, int(input.rows_days, RETENTION_DEFAULTS.rows_days)),
    quota_mb: Math.max(50, int(input.quota_mb, RETENTION_DEFAULTS.quota_mb)),
  };
}
