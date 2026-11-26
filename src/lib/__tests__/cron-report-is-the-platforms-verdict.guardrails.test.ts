import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { shapeCronHealth } from '../../../supabase/functions/_shared/handlers/cron-health-report.ts';
import type { CronJobEnriched } from '../../../supabase/functions/_shared/cron/health.ts';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';

/**
 * cron_health_report answers the platform's verdict, lean (2026-11-26): an
 * external agent on liteit read 12 000 characters of raw pg_cron rows seven
 * times a week, without the judgement (module off, monthly not yet due) every
 * other surface applies.
 */
const job = (name: string, extra: Partial<CronJobEnriched> = {}): CronJobEnriched => ({
  jobname: name, schedule: '0 4 * * *', active: true, target_host: null, foreign_host: false, never_ran: false,
  last_status: 'succeeded', last_run: '2026-11-26T04:00:00Z', last_run_age_seconds: 100,
  red: false, last_failed: false, reasons: [], ...extra,
} as CronJobEnriched);

describe('cron_health_report', () => {
  it('lists the jobs with something to say and counts the healthy ones', () => {
    const report = { jobs: [job('a'), job('b'), job('broken', { red: true, reasons: ['latest run FAILED'] }), job('off', { module_off: 'voice', reasons: ['module voice is off'] })] };
    const r = shapeCronHealth(report, false);
    expect(r.jobs.map((j) => j.jobname)).toEqual(['broken', 'off']);
    expect(r.healthy_jobs).toBe(2);
    expect(r.note).toMatch(/full: true/);
    expect(shapeCronHealth(report, true).jobs).toHaveLength(4);
  });
  it('the skill runs the enriched handler, not the raw rpc', () => {
    const seed = PLATFORM_SKILLS.find((s) => s.name === 'cron_health_report')!;
    expect(seed.handler).toBe('internal:cron_health_report');
    const core = readFileSync('supabase/functions/_shared/execute/core.ts', 'utf8');
    expect(core).toMatch(/'internal:cron_health_report': \(\{ supabase, args \}\) => executeCronHealthReport\(supabase, args\)/);
    const h = readFileSync('supabase/functions/_shared/handlers/cron-health-report.ts', 'utf8');
    expect(h).toMatch(/enrichCronHealth\(raw, new Date\(\), \{\n\s+bornAt: await loadInstanceBornAt\(supabase\),\n\s+moduleOn: await loadEnabledModules\(supabase\),/);
  });
});
