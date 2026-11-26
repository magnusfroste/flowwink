// cron_health_report — the platform's verdict on its scheduled jobs (2026-11-26).
//
// The skill was `rpc:cron_health_report`: pg_cron's raw rows, every job, the
// healthy ones too — 12 000 characters an external agent on liteit read seven
// times in a week — and none of the judgement the platform's own surfaces apply
// (enrichCronHealth: a job of a module that is off is never red, a monthly job
// is not "never ran" before the history covers a month, a newborn instance is
// not stranded). An agent reported what the instance itself would not.
//
// Now: the same report the heartbeat and instance-health read, enriched, with
// the jobs that have something to say listed and the healthy ones counted.
// `full: true` lists every job.

import { enrichCronHealth, loadInstanceBornAt, type CronHealthReport, type CronJobEnriched } from '../cron/health.ts';
import { loadEnabledModules } from '../modules.ts';

export interface CronHealthAnswer {
  [k: string]: unknown;
  jobs: CronJobEnriched[];
  healthy_jobs?: number;
  note?: string;
}

/** Pure: the jobs with a reason (red, failed, disabled, not run yet, module off) listed; the rest counted. */
export function shapeCronHealth<T extends { jobs: CronJobEnriched[] }>(report: T, full: boolean): T & { healthy_jobs?: number; note?: string } {
  if (full) return report;
  const listed = report.jobs.filter((j) => j.red || j.last_failed || j.reasons.length > 0);
  const healthy = report.jobs.length - listed.length;
  return healthy > 0
    ? { ...report, jobs: listed, healthy_jobs: healthy, note: `${healthy} job(s) ran on schedule with nothing to report and are counted, not listed. Every job: full: true.` }
    : { ...report, jobs: listed };
}

// deno-lint-ignore no-explicit-any -- the service client's generics differ between callers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeCronHealthReport(supabase: any, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc('cron_health_report');
  if (error) return { error: error.message };
  const raw = (data ?? {}) as CronHealthReport & { cron_available?: boolean };
  if (raw.cron_available === false || !Array.isArray(raw.jobs)) return raw;
  const enriched = enrichCronHealth(raw, new Date(), {
    bornAt: await loadInstanceBornAt(supabase),
    moduleOn: await loadEnabledModules(supabase),
  });
  return shapeCronHealth(enriched, args.full === true);
}
