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
  /** Runs per UTC hour from job_run_details (absent on instances before 20260916200000). */
  pulse_profile?: PulseHour[];
  performance_mode?: string | null;
}

export interface PulseHour {
  hour: string;            // ISO, start of the UTC hour
  runs: number;
  failed: number;
  startup_timeouts: number;
}

export interface CronJobEnriched extends CronJobRaw {
  last_failed: boolean;   // pg_cron's own verdict: latest run in job_run_details ended 'failed'
  red: boolean;           // any actionable problem, evidence-backed
  reasons: string[];
}

export interface PulseStarvation {
  /** Hours in the last 24 h where at least half of the jobs never got to start. */
  starved_hours_24h: number;
  /** Starved hours per 24 h window, oldest first — the trend is the early warning. */
  starved_hours_per_day: number[];
  /** Days (24 h windows) in the history that had any starved hour. */
  days_with_starvation: number;
  starving: boolean;
  reason: string | null;
}

export interface CronHealthEnriched extends Omit<CronHealthReport, 'jobs'> {
  jobs: CronJobEnriched[];
  flags: CronHealthReport['flags'] & { jobs_failed: number; jobs_red: number; pulse_starved_hours_24h: number };
  pulse: PulseStarvation;
  red_count: number;
}

// PULSE STARVATION (old liteit, 2026-09-10→16). A small compute's disk-IO budget
// runs out in a DAILY cycle: healthy by day, then from the evening most pg_cron
// jobs die with "job startup timeout" until the budget refills, and the onset
// creeps earlier every day (04:34 → 00:01 → 20:00) until the instance stops
// answering. Every job's LATEST run can be green at noon while the night was
// 90 % dead — so this reads the hourly profile, not the latest run. Evidence is
// still pg_cron's own (job_run_details), per the domain rule above.
const STARVED_SHARE = 0.5;   // at least half of the hour's runs never started
const MIN_RUNS_PER_HOUR = 10; // below this an hour says nothing either way
const STARVING_HOURS_24H = 2; // one bad hour is a restart blip, two is a pattern

export function assessPulseStarvation(
  profile: PulseHour[] | undefined,
  performanceMode: string | null | undefined,
  now: Date = new Date(),
): PulseStarvation {
  const hours = profile ?? [];
  const DAY = 24 * 3600_000;
  const starvedAt = hours
    .filter((h) => h.runs >= MIN_RUNS_PER_HOUR && h.startup_timeouts >= h.runs * STARVED_SHARE)
    .map((h) => Date.parse(h.hour))
    .filter((t) => Number.isFinite(t));

  // Windows back from now; only as many as the history actually covers, so a
  // 3-day history (the purge default) is not reported as 4 clean days.
  const oldest = hours.reduce((m, h) => Math.min(m, Date.parse(h.hour)), Infinity);
  const windows = Number.isFinite(oldest) ? Math.min(7, Math.max(1, Math.ceil((now.getTime() - oldest) / DAY))) : 0;
  const perDay: number[] = [];
  for (let k = windows - 1; k >= 0; k--) {
    const end = now.getTime() - k * DAY;
    // An hour bucket belongs to the window its end falls in.
    perDay.push(starvedAt.filter((t) => t + 3600_000 > end - DAY && t + 3600_000 <= end).length);
  }
  const starved24 = perDay.length ? perDay[perDay.length - 1] : 0;
  const daysWith = perDay.filter((n) => n > 0).length;
  const starving = starved24 >= STARVING_HOURS_24H;

  let reason: string | null = null;
  if (starving) {
    const dial = performanceMode === 'low'
      ? 'Performance mode is already low — the remaining lever is a larger compute size.'
      : `Performance mode is ${performanceMode ?? 'unknown'} — lower it (set_performance_mode low) or raise the compute size.`;
    reason =
      `database is throttled: in ${starved24} of the last 24 hours at least half of the scheduled jobs timed out at startup` +
      ` — the pattern of an exhausted disk-IO budget. Starved hours per day, oldest first: ${perDay.join(' · ')}.` +
      (daysWith >= 3 ? ' It recurs daily; left alone it spreads until the database stops answering.' : '') +
      ` ${dial}`;
  }
  return { starved_hours_24h: starved24, starved_hours_per_day: perDay, days_with_starvation: daysWith, starving, reason };
}

/**
 * How long pg_cron has been ticking on this instance, by its own history: the
 * span from the earliest hour in the pulse profile (job_run_details, 7 days)
 * to the report's `checked_at`. Null when the report carries no profile (an
 * instance before 20260916200000) or no run at all.
 */
export function schedulerAgeHours(report: CronHealthReport): number | null {
  const hours = (report.pulse_profile ?? []).map((h) => Date.parse(h.hour)).filter((t) => Number.isFinite(t));
  if (!hours.length) return null;
  const checked = Date.parse(report.checked_at);
  if (!Number.isFinite(checked)) return null;
  return Math.max(0, (checked - Math.min(...hours)) / 3600_000);
}

/** "Never ran" is a verdict only once the scheduler has had a day to run the job. */
export const NEVER_RAN_GRACE_HOURS = 24;

export interface CronHealthOptions {
  /** When the instance was born (`loadInstanceBornAt`): the grace for an instance whose pg_cron has no run on record yet. */
  bornAt?: string | Date | null;
}

/** The instance's birth by its own first row: site_settings is written by the first migration. */
// deno-lint-ignore no-explicit-any -- the query builder's generics differ between the browser and Deno clients
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadInstanceBornAt(db: { from(table: string): any }): Promise<string | null> {
  try {
    const { data } = await db.from('site_settings').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle();
    return (data as { created_at?: string } | null)?.created_at ?? null;
  } catch {
    return null;
  }
}

export function enrichCronHealth(report: CronHealthReport, now: Date = new Date(), opts: CronHealthOptions = {}): CronHealthEnriched {
  // A newborn instance (2026-11-07): on its first day every daily job has
  // "never run" — not because it is stranded but because its hour has not
  // come. pg_cron's own history says how long it has been ticking; while
  // that is under a day, a run that has not happened yet is not evidence.
  // Minutes after birth there is no history at all (the nightly fresh
  // install's first briefing), so the instance's own age counts too. An
  // instance older than a day whose pg_cron has run NOTHING is red, as it
  // should be. Without a profile or a birth (an older instance) the verdict
  // is as before.
  const age = schedulerAgeHours(report);
  const bornMs = opts.bornAt ? Date.parse(String(opts.bornAt instanceof Date ? opts.bornAt.toISOString() : opts.bornAt)) : NaN;
  const instanceAge = Number.isFinite(bornMs) ? Math.max(0, (now.getTime() - bornMs) / 3600_000) : null;
  const newborn = (age !== null && age < NEVER_RAN_GRACE_HOURS) || (instanceAge !== null && instanceAge < NEVER_RAN_GRACE_HOURS);
  const jobs: CronJobEnriched[] = (report.jobs || []).map((j) => {
    const reasons: string[] = [];
    if (j.foreign_host) reasons.push(`targets a foreign host (${j.target_host})`);
    const stranded = j.never_ran && j.active && !newborn;
    if (stranded) reasons.push('never ran (no run recorded in job_run_details)');
    else if (j.never_ran && j.active) reasons.push(`not run yet (the instance is ${Math.round(Math.min(age ?? Infinity, instanceAge ?? Infinity))} h old)`);
    if (!j.active) reasons.push('disabled');
    const last_failed = j.last_status === 'failed';
    if (last_failed) {
      reasons.push(`latest run FAILED per job_run_details${j.last_run ? ` (at ${j.last_run})` : ''}`);
    }
    // Red only on evidence pg_cron itself provides: a foreign target in the
    // command, an active job with no run on record once the scheduler has had
    // a day, or a run pg_cron marked failed. `disabled` alone is a config
    // state, not a fault.
    const red = j.foreign_host || stranded || last_failed;
    return { ...j, last_failed, red, reasons };
  });

  const jobs_failed = jobs.filter((j) => j.last_failed).length;
  const jobs_red = jobs.filter((j) => j.red).length;
  const pulse = assessPulseStarvation(report.pulse_profile, report.performance_mode, now);
  return {
    ...report,
    jobs,
    flags: { ...report.flags, jobs_failed, jobs_red, pulse_starved_hours_24h: pulse.starved_hours_24h },
    pulse,
    // HTTP errors from net._http_response are pg_net-wide and not attributable
    // to a specific job — informational context, never an alarm on their own.
    // A starving pulse is an alarm of its own, even when every job's latest run
    // happens to be green.
    red_count: jobs_red + (pulse.starving ? 1 : 0),
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
  const pulse = r.pulse;
  if (redJobs.length === 0 && !pulse?.starving) return null;

  const lines: string[] = ['⚠️ **Scheduled-job health** — issues found (evidence: cron.job_run_details):'];
  if (pulse?.starving && pulse.reason) lines.push(`• Pulse — ${pulse.reason}`);
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
