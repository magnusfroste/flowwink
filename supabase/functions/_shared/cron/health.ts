// Cron-health enrichment — the shared brain behind layer 2 (admin card via the
// cron-health edge function) and layer 3 (heartbeat → River). Takes the raw
// cron_health_report() RPC result and adds the one signal the SQL function
// deliberately left out (staleness needs a cron parser), computed with the SAME
// calculateNextRun the dispatcher schedules from — one parser, no drift.

import { calculateNextRun, isSupportedCron } from './next-run.ts';

export interface CronJobRaw {
  jobname: string;
  schedule: string | null;
  active: boolean;
  target_host: string | null;
  foreign_host: boolean;
  never_ran: boolean;
  last_status: string | null;
  last_run: string | null;
  last_run_age_seconds: number | null;
}

export interface CronHealthReport {
  checked_at: string;
  cron_available: boolean;
  self_host: string | null;
  jobs: CronJobRaw[];
  http_errors_recent: Array<{ id: unknown; status_code: number | null; created: string; url: string | null; error: string | null }>;
  flags: { jobs_total: number; jobs_never_ran: number; jobs_foreign_host: number; http_errors_24h: number };
}

export interface CronJobEnriched extends CronJobRaw {
  stale: boolean;         // active job that should have run by now but hasn't
  unparsed_schedule: boolean; // parser has no branch → dispatcher would +1h-drift it
  red: boolean;           // any actionable problem
  reasons: string[];
}

export interface CronHealthEnriched extends Omit<CronHealthReport, 'jobs'> {
  jobs: CronJobEnriched[];
  flags: CronHealthReport['flags'] & { jobs_stale: number; jobs_red: number };
  red_count: number;
}

// A run is "stale" when: the job is active, it has run before, and the next run
// AFTER its last run is already comfortably in the past (grace = one extra
// interval, floored at 10 min) — i.e. it missed at least one scheduled slot.
function isStale(job: CronJobRaw, now: Date): boolean {
  if (!job.active || job.never_ran || !job.schedule || !job.last_run) return false;
  if (!isSupportedCron(job.schedule)) return false; // don't guess on unparsed exprs
  const last = new Date(job.last_run);
  const expectedNext = new Date(calculateNextRun(job.schedule, last));
  const interval = expectedNext.getTime() - last.getTime();
  const grace = Math.max(interval, 10 * 60 * 1000);
  return now.getTime() > expectedNext.getTime() + grace;
}

export function enrichCronHealth(report: CronHealthReport, now: Date = new Date()): CronHealthEnriched {
  const jobs: CronJobEnriched[] = (report.jobs || []).map((j) => {
    const reasons: string[] = [];
    if (j.foreign_host) reasons.push(`targets a foreign host (${j.target_host})`);
    if (j.never_ran) reasons.push('never ran');
    if (!j.active) reasons.push('disabled');
    const stale = isStale(j, now);
    if (stale) reasons.push('overdue (missed a scheduled slot)');
    const unparsed = !!j.schedule && !isSupportedCron(j.schedule);
    if (unparsed) reasons.push(`schedule not understood by the parser ("${j.schedule}") — would drift to +1h`);
    // `disabled` alone is a config state, not necessarily a fault; only flag it
    // red alongside another signal or leave it informational. foreign_host,
    // never_ran, stale, unparsed are always red.
    const red = j.foreign_host || j.never_ran || stale || unparsed;
    return { ...j, stale, unparsed_schedule: unparsed, red, reasons };
  });

  const jobs_stale = jobs.filter((j) => j.stale).length;
  const jobs_red = jobs.filter((j) => j.red).length;
  const httpErr = report.http_errors_recent?.length || 0;
  return {
    ...report,
    jobs,
    flags: { ...report.flags, jobs_stale, jobs_red },
    red_count: jobs_red + (httpErr > 0 ? 1 : 0),
  };
}

// Format a concise River alert — or null when everything is healthy (silence by
// default: the Fas 0 discipline — only speak when a human colleague would).
export function formatCronHealthAlert(r: CronHealthEnriched): string | null {
  if (!r.cron_available) return null;
  const redJobs = r.jobs.filter((j) => j.red);
  const httpErr = r.http_errors_recent || [];
  if (redJobs.length === 0 && httpErr.length === 0) return null;

  const lines: string[] = ['⚠️ **Scheduled-job health** — issues found:'];
  for (const j of redJobs.slice(0, 8)) {
    lines.push(`• \`${j.jobname}\` — ${j.reasons.join('; ')}`);
  }
  if (redJobs.length > 8) lines.push(`• …and ${redJobs.length - 8} more`);
  if (httpErr.length > 0) {
    const sample = httpErr.slice(0, 3)
      .map((e) => `${e.status_code ?? 'ERR'}${e.url ? ' ' + e.url : ''}`)
      .join(', ');
    lines.push(`• ${httpErr.length} HTTP error(s) from cron calls in 24h (${sample})`);
  }
  lines.push('\nJob status "succeeded" only means pg_cron dispatched the command — check /admin/system → Observability.');
  return lines.join('\n');
}
