// Cron-health enrichment — the shared brain behind layer 2 (admin card via the
// instance-health edge function) and layer 3 (heartbeat gate → Daily Briefing /
// Observability). Takes the raw cron_health_report() RPC result and derives the
// red/green verdict per job.
//
// DOMAIN RULE (River incident, 2026-08-23→28): pg_cron jobs are judged by
// pg_cron's OWN semantics only — the evidence in cron.job_run_details that the
// RPC already carries (last_status, last_run, never_ran). The agent-automation
// cron parser (_shared/cron/next-run.ts) exists to SCHEDULE agent_automations;
// it understands a narrower cron dialect than pg_cron and must NEVER be used to
// second-guess pg_cron's scheduling. Doing exactly that produced four false
// ⚠️ alarms on River ("schedule not understood", "overdue") for jobs pg_cron
// was running flawlessly — 0 of 5508 runs failed in the window the alarm
// covered. Every claim this module makes is backed by job_run_details;
// judgments requiring a parser (staleness prediction) are out of scope here.

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
  last_failed: boolean;   // pg_cron's own verdict: latest run in job_run_details ended 'failed'
  red: boolean;           // any actionable problem, evidence-backed
  reasons: string[];
}

export interface CronHealthEnriched extends Omit<CronHealthReport, 'jobs'> {
  jobs: CronJobEnriched[];
  flags: CronHealthReport['flags'] & { jobs_failed: number; jobs_red: number };
  red_count: number;
}

export function enrichCronHealth(report: CronHealthReport): CronHealthEnriched {
  const jobs: CronJobEnriched[] = (report.jobs || []).map((j) => {
    const reasons: string[] = [];
    if (j.foreign_host) reasons.push(`targets a foreign host (${j.target_host})`);
    if (j.never_ran && j.active) reasons.push('never ran (no run recorded in job_run_details)');
    if (!j.active) reasons.push('disabled');
    const last_failed = j.last_status === 'failed';
    if (last_failed) {
      reasons.push(`latest run FAILED per job_run_details${j.last_run ? ` (at ${j.last_run})` : ''}`);
    }
    // Red only on evidence pg_cron itself provides: a foreign target in the
    // command, an active job with no run on record, or a run pg_cron marked
    // failed. `disabled` alone is a config state, not a fault.
    const red = j.foreign_host || (j.never_ran && j.active) || last_failed;
    return { ...j, last_failed, red, reasons };
  });

  const jobs_failed = jobs.filter((j) => j.last_failed).length;
  const jobs_red = jobs.filter((j) => j.red).length;
  return {
    ...report,
    jobs,
    flags: { ...report.flags, jobs_failed, jobs_red },
    // HTTP errors from net._http_response are pg_net-wide and not attributable
    // to a specific job — informational context, never an alarm on their own.
    red_count: jobs_red,
  };
}

// Format a concise ops summary for the Daily Briefing / Observability — or null
// when everything is healthy (silence by default: the Fas 0 discipline).
//
// CHANNEL RULE (Magnus, 2026-08-28): this text is OPS telemetry. It goes to the
// Daily Briefing and /admin/system → Observability — NEVER to River
// (post_to_river). River is the team's social feed, reserved for positive and
// informative posts.
export function formatCronHealthSummary(r: CronHealthEnriched): string | null {
  if (!r.cron_available) return null;
  const redJobs = r.jobs.filter((j) => j.red);
  if (redJobs.length === 0) return null;

  const lines: string[] = ['⚠️ **Scheduled-job health** — issues found (evidence: cron.job_run_details):'];
  for (const j of redJobs.slice(0, 8)) {
    lines.push(`• \`${j.jobname}\` — ${j.reasons.join('; ')}`);
  }
  if (redJobs.length > 8) lines.push(`• …and ${redJobs.length - 8} more`);
  const httpErr = r.http_errors_recent || [];
  if (httpErr.length > 0) {
    lines.push(`• Context: ${httpErr.length} recent HTTP error(s) across ALL pg_net calls (not attributable to a specific job).`);
  }
  lines.push('\nJob status "succeeded" only means pg_cron dispatched the command — check /admin/system → Observability.');
  return lines.join('\n');
}
