// Cron-health enrichment — the shared brain behind layer 2 (admin card via the
// instance-health edge function) and layer 3 (heartbeat gate → Observability, and
// feedback_ping's reports upstream). Takes the raw cron_health_report() RPC result and derives the
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
  /** The module this job serves, when that module is off — the job is then never red. */
  module_off?: string;
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

/**
 * Since when the absence of a run is evidence (2026-11-10). Until
 * 20261106080000 the nightly purge dropped every run older than three days,
 * the job's last one included; since then it keeps each job's newest run. So
 * a run from before 2026-11-03 08:00 UTC may have existed and been purged,
 * and "no row" says nothing about it. Optic, 2026-11-09/10:
 * purge-stale-prospects (the 1st, 03:15) ran on 1 November, the row was gone
 * by the 4th, and every instance reported it "never ran" upstream every night
 * — it would have until 1 December.
 */
export const RUN_HISTORY_COMPLETE_SINCE = '2026-11-03T08:00:00Z';

/**
 * The longest a job can go between runs by its schedule, in days — an UPPER
 * BOUND read from which fields are restricted, never a next-run prediction
 * (no arithmetic, no dialect: the River rule stands, and pg_cron's own rows
 * remain the only evidence). A restricted month: a year. A day of month: a
 * month (`*\/n`: n days). A day of week: a week. Otherwise a day. A schedule
 * it does not recognise (pg_cron's `30 seconds`) counts as a day, which is
 * the verdict as it was. It can only WITHHOLD a "never ran" verdict, never
 * raise one: a monthly job is not judged until the run history has covered a
 * month. A daily job's bound is the newborn grace it already had.
 */
export function longestGapDays(schedule: string | null | undefined): number {
  const s = String(schedule ?? '').trim().toLowerCase();
  if (s === '@yearly' || s === '@annually') return 366;
  if (s === '@monthly') return 31;
  if (s === '@weekly') return 7;
  const f = s.split(/\s+/);
  if (f.length !== 5) return 1;
  const [, , dom, month, dow] = f;
  if (month !== '*') return 366;
  const step = /^\*\/(\d+)$/.exec(dom);
  const domGap = dom === '*' ? null : step ? Math.min(31, Math.max(1, Number(step[1]))) : 31;
  const dowGap = dow === '*' ? null : 7;
  // Day of month and day of week both restricted: pg_cron fires when EITHER matches.
  if (domGap !== null && dowGap !== null) return Math.min(domGap, dowGap);
  return domGap ?? dowGap ?? 1;
}

export interface CronHealthOptions {
  /** When the instance was born (`loadInstanceBornAt`): the grace for an instance whose pg_cron has no run on record yet. */
  bornAt?: string | Date | null;
  /**
   * Which modules are on (`loadEnabledModules`). A job that serves a module
   * that is off is never red: it is reported `module_off` and alarms nobody —
   * a module the operator chose not to run is not a fault (2026-11-08).
   * Without it, no job is judged by its module (as before).
   */
  moduleOn?: (moduleId: string) => boolean;
}

/**
 * The pg_cron jobs that exist for ONE module — by jobname, as the migrations
 * schedule them. Platform jobs (dispatchers, health, purges, the indexer) are
 * absent and always judged. A job for a module that is off still ticks (its
 * target answers MODULE_DISABLED or does nothing); its failures are that
 * module's, and the module is off.
 *
 * `flowpilot-daily-briefing` is NOT here although it carries the name (#262):
 * the briefing is the business, a platform surface that runs and speaks as
 * "FlowWink" with FlowPilot off. Its job is judged and required on every
 * instance. The heartbeat and learn are FlowPilot's and skip themselves.
 */
export const CRON_JOB_MODULE: Readonly<Record<string, string>> = Object.freeze({
  'booking-reminders': 'bookings',
  'calendar-reminders': 'calendar',
  'enqueue-contract-billing-tasks': 'contracts',
  'enqueue-subscription-billing-tasks': 'subscriptions',
  'flowpilot-heartbeat': 'flowpilot',
  'flowpilot-heartbeat-12h': 'flowpilot',
  'flowpilot-learn': 'flowpilot',
  'newsletter-dispatch-scheduled': 'newsletter',
  'service-recurring-orders': 'fieldService',
  'voice-calls-sweep-stale': 'voice',
  'weekly-knowledge-river': 'river',
});

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
  // How long the run history has held every run (the later of the complete
  // history's start and the instance's birth): a job is "stranded" only once
  // that span covers its longest gap, and an hour for the run to be recorded.
  const coveredSinceMs = Math.max(Date.parse(RUN_HISTORY_COMPLETE_SINCE), Number.isFinite(bornMs) ? bornMs : -Infinity);
  const coveredDays = Math.max(0, (now.getTime() - coveredSinceMs) / 86_400_000);
  const jobs: CronJobEnriched[] = (report.jobs || []).map((j) => {
    const owner = CRON_JOB_MODULE[j.jobname];
    if (owner && opts.moduleOn && !opts.moduleOn(owner)) {
      return { ...j, last_failed: j.last_status === 'failed', red: false, module_off: owner, reasons: [`module ${owner} is off`] };
    }
    const reasons: string[] = [];
    if (j.foreign_host) reasons.push(`targets a foreign host (${j.target_host})`);
    const gap = longestGapDays(j.schedule);
    const slotCovered = coveredDays >= gap + 1 / 24;
    const stranded = j.never_ran && j.active && !newborn && slotCovered;
    if (stranded) reasons.push('never ran (no run recorded in job_run_details)');
    else if (j.never_ran && j.active && newborn) reasons.push(`not run yet (the instance is ${Math.round(Math.min(age ?? Infinity, instanceAge ?? Infinity))} h old)`);
    else if (j.never_ran && j.active) reasons.push(`not run yet (it can go ${gap} days between runs — ${j.schedule} — and the run history covers ${Math.floor(coveredDays)})`);
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
