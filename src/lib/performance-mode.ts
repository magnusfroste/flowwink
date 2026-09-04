/**
 * Performance mode — the one dial for how often this instance pulses.
 *
 * The schedules themselves live in the database (cron_cadence, applied by
 * apply_performance_mode()). What lives here is what a person reads on the
 * dial: the three modes, what each one promises, and the two facts derived
 * from pg_cron's own evidence that tell an admin whether the instance is
 * keeping up.
 */

export type PerformanceMode = 'low' | 'balanced' | 'high';

export const PERFORMANCE_MODES: ReadonlyArray<{
  value: PerformanceMode;
  label: string;
  reacts: string;
  fit: string;
}> = [
  {
    value: 'low',
    label: 'Low',
    reacts: 'FlowPilot reacts within about five minutes; the index sweeps every quarter hour.',
    fit: 'A site with light traffic on the smallest compute. New instances start here.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    reacts: 'FlowPilot reacts within a minute; the index sweeps every five minutes.',
    fit: 'A team that works in FlowBox during the day.',
  },
  {
    value: 'high',
    label: 'High',
    reacts: 'Everything every minute; the index sweeps every two minutes; the heartbeat runs four times a day.',
    fit: 'Busy inboxes and chat. Needs a Small compute instance or larger.',
  },
];

export function isPerformanceMode(v: unknown): v is PerformanceMode {
  return v === 'low' || v === 'balanced' || v === 'high';
}

export interface PulseJob {
  jobname: string;
  schedule: string | null;
  expected: string;
  active: boolean | null;
  scheduled: boolean;
  pulsed: boolean;
  note: string | null;
}

export interface PerformanceModeStatus {
  mode: PerformanceMode;
  applied_at: string | null;
  reason: string | null;
  cron_available: boolean;
  runs_last_hour: number;
  failed_last_hour: number;
  startup_timeouts_last_hour: number;
  jobs: PulseJob[];
}

/** Share of the last hour's ticks that never started (pg_cron "job startup timeout"), 0–100. */
export function startupTimeoutShare(s: Pick<PerformanceModeStatus, 'runs_last_hour' | 'startup_timeouts_last_hour'>): number {
  if (!s.runs_last_hour) return 0;
  return Math.round((100 * s.startup_timeouts_last_hour) / s.runs_last_hour);
}

/**
 * The instance is "keeping up" when no tick timed out on startup. A quarter of
 * the ticks timing out is the autoversio signature: the pulse itself starves
 * the database. The threshold is generous on purpose — a single stray timeout
 * is weather, not a verdict.
 */
export function pulseVerdict(s: PerformanceModeStatus): 'keeping_up' | 'straining' | 'starving' | 'no_cron' {
  if (!s.cron_available) return 'no_cron';
  const share = startupTimeoutShare(s);
  if (share >= 25) return 'starving';
  if (share > 0 || s.failed_last_hour > 0) return 'straining';
  return 'keeping_up';
}

/** Jobs whose live schedule differs from what the mode says — a dial that was not applied. */
export function driftedJobs(s: PerformanceModeStatus): PulseJob[] {
  return (s.jobs ?? []).filter((j) => j.scheduled && j.schedule !== j.expected);
}
