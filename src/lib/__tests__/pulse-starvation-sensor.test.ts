import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assessPulseStarvation,
  enrichCronHealth,
  formatCronHealthSummary,
  type CronHealthReport,
  type PulseHour,
} from '../../../supabase/functions/_shared/cron/health.ts';

/**
 * The database pulse sensor, replayed on the instance it was built from.
 *
 * Old liteit (Nano, performance mode never applied) starved in a daily cycle
 * 2026-09-10→16: healthy by day, 80–100 % "job startup timeout" from the evening
 * until the IO budget refilled around 08 UTC, the onset creeping earlier every
 * day. The project was deleted the same evening, so OLD below is the hourly
 * failure share as read out of its job_run_details on 09-16 (the readout is in
 * the session that built this), at its measured ~178 runs an hour. NEW is the
 * real hourly profile of the new liteit — same compute, mode low — over the
 * same days: 0 startup timeouts in 4 681 runs.
 */

// day → the failure share (%) per UTC hour, "-" = no runs recorded.
const OLD: Record<string, string> = {
  '09-10': '0 0 0 0 34 75 - 86 5 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
  '09-11': '85 95 100 97 98 100 89 78 32 0 0 0 0 0 0 0 0 0 0 0 82 96 97 96',
  '09-12': '92 94 61 100 95 91 89 91 14 0 0 0 0 0 0 0 1 0 0 0 0 0 0 0',
  '09-13': '0 0 46 88 85 93 92 100 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0',
  '09-14': '75 97 98 100 93 98 96 91 13 0 0 0 0 0 0 0 0 0 0 0 0 46 95 99',
  '09-15': '96 100 98 95 73 84 91 95 8 0 0 0 0 0 0 0 0 0 0 0 75 94 98 93',
  '09-16': '98 97 80 96 93 93 100 92 7 0 0 0 0 0 0 0 0 0 0',
};

function oldProfile(): PulseHour[] {
  const out: PulseHour[] = [];
  for (const [day, row] of Object.entries(OLD)) {
    row.split(' ').forEach((pct, h) => {
      if (pct === '-') return;
      const runs = 178;
      const st = Math.round((runs * Number(pct)) / 100);
      out.push({ hour: `2026-${day}T${String(h).padStart(2, '0')}:00:00Z`, runs, failed: st, startup_timeouts: st });
    });
  }
  return out;
}

const NEW: PulseHour[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/pulse-profile-liteit-low-2026-09.json'), 'utf-8'),
);

function report(profile: PulseHour[], mode: string | null): CronHealthReport {
  return {
    checked_at: '2026-09-16T19:30:00Z',
    cron_available: true,
    self_host: 'https://self.supabase.co',
    jobs: [{
      jobname: 'automation-dispatcher', schedule: '* * * * *', active: true,
      target_host: 'https://self.supabase.co', foreign_host: false, never_ran: false,
      // The trap: at 19:30 the latest run is green.
      last_status: 'succeeded', last_run: '2026-09-16T19:29:00Z', last_run_age_seconds: 60,
    }],
    http_errors_recent: [],
    flags: { jobs_total: 1, jobs_never_ran: 0, jobs_foreign_host: 0, http_errors_24h: 0 },
    pulse_profile: profile,
    performance_mode: mode,
  };
}

const EVENING = new Date('2026-09-16T19:30:00Z');

describe('database pulse sensor', () => {
  it('old liteit: every latest run green, yet the sensor raises the alarm', () => {
    const r = enrichCronHealth(report(oldProfile(), null), EVENING);
    expect(r.jobs.every((j) => !j.red)).toBe(true);
    expect(r.pulse.starving).toBe(true);
    expect(r.pulse.starved_hours_24h).toBeGreaterThanOrEqual(8);
    expect(r.pulse.days_with_starvation).toBe(r.pulse.starved_hours_per_day.length);
    expect(r.red_count).toBe(1);
    const summary = formatCronHealthSummary(r);
    expect(summary).toMatch(/Pulse — database is throttled/);
    expect(summary).toMatch(/set_performance_mode low/);
    expect(summary).toMatch(/recurs daily/);
  });

  it('would have warned on the FIRST bad night, six days before the end', () => {
    const firstMorning = new Date('2026-09-10T09:00:00Z');
    const upToThen = oldProfile().filter((h) => Date.parse(h.hour) + 3600_000 <= firstMorning.getTime());
    const p = assessPulseStarvation(upToThen, 'balanced', firstMorning);
    expect(p.starving).toBe(true);
    expect(p.reason).toMatch(/Performance mode is balanced/);
  });

  it('new liteit, same compute in mode low: silent', () => {
    const r = enrichCronHealth(report(NEW, 'low'), EVENING);
    expect(NEW.reduce((s, h) => s + h.runs, 0)).toBeGreaterThan(4000);
    expect(r.pulse.starving).toBe(false);
    expect(r.pulse.starved_hours_per_day.every((n) => n === 0)).toBe(true);
    expect(r.red_count).toBe(0);
    expect(formatCronHealthSummary(r)).toBeNull();
  });

  it('one bad hour (a restart) is not a pattern; hours with too few runs say nothing', () => {
    const base = NEW.map((h) => ({ ...h }));
    const last = base[base.length - 1];
    last.startup_timeouts = last.runs; last.failed = last.runs;
    expect(assessPulseStarvation(base, 'low', EVENING).starving).toBe(false);
    const thin: PulseHour[] = ['17', '18'].map((h) => ({ hour: `2026-09-16T${h}:00:00Z`, runs: 5, failed: 5, startup_timeouts: 5 }));
    expect(assessPulseStarvation(thin, 'low', EVENING).starving).toBe(false);
  });

  it('already in mode low: points at compute size, not the dial', () => {
    expect(assessPulseStarvation(oldProfile(), 'low', EVENING).reason).toMatch(/already low — the remaining lever is a larger compute size/);
  });

  it('an instance that has not migrated yet (no profile) is simply silent', () => {
    const r = report([], null);
    delete r.pulse_profile;
    const e = enrichCronHealth(r, EVENING);
    expect(e.pulse).toMatchObject({ starving: false, starved_hours_per_day: [] });
  });

  it('the history only reports the days it covers', () => {
    expect(assessPulseStarvation(NEW, 'low', EVENING).starved_hours_per_day).toHaveLength(4);
  });
});
