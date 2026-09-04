import { describe, it, expect } from 'vitest';
import { startupTimeoutShare, pulseVerdict, driftedJobs, isPerformanceMode, PERFORMANCE_MODES, type PerformanceModeStatus } from '../performance-mode';

const base: PerformanceModeStatus = {
  mode: 'balanced',
  applied_at: null,
  reason: null,
  cron_available: true,
  runs_last_hour: 220,
  failed_last_hour: 0,
  startup_timeouts_last_hour: 0,
  jobs: [],
};

describe('Performance mode — what the dial reads', () => {
  it('three modes, and nothing else is a mode', () => {
    expect(PERFORMANCE_MODES.map((m) => m.value)).toEqual(['low', 'balanced', 'high']);
    expect(isPerformanceMode('turbo')).toBe(false);
    expect(isPerformanceMode('low')).toBe(true);
  });

  it('the autoversio signature reads as starving; a stray timeout as straining; silence as keeping up', () => {
    expect(startupTimeoutShare({ runs_last_hour: 220, startup_timeouts_last_hour: 117 })).toBe(53);
    expect(pulseVerdict({ ...base, startup_timeouts_last_hour: 117 })).toBe('starving');
    expect(pulseVerdict({ ...base, startup_timeouts_last_hour: 2 })).toBe('straining');
    expect(pulseVerdict(base)).toBe('keeping_up');
    expect(pulseVerdict({ ...base, cron_available: false })).toBe('no_cron');
    expect(startupTimeoutShare({ runs_last_hour: 0, startup_timeouts_last_hour: 0 })).toBe(0);
  });

  it('a scheduled job whose live schedule is not the mode\'s is drift; an unscheduled one is not', () => {
    const jobs = [
      { jobname: 'a', schedule: '* * * * *', expected: '1-59/5 * * * *', active: true, scheduled: true, pulsed: true, note: null },
      { jobname: 'b', schedule: '*/5 * * * *', expected: '*/5 * * * *', active: true, scheduled: true, pulsed: false, note: null },
      { jobname: 'c', schedule: null, expected: '* * * * *', active: null, scheduled: false, pulsed: false, note: null },
    ];
    expect(driftedJobs({ ...base, jobs }).map((j) => j.jobname)).toEqual(['a']);
  });
});
