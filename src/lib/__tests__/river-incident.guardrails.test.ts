/**
 * River-incident guardrails (optic, 2026-08-23→28).
 *
 * The heartbeat posted four near-identical ⚠️ drift warnings on River — the
 * team's SOCIAL feed — and the alarms were false: the checker had run the
 * agent-automation cron parser (_shared/cron/next-run.ts) against PG_CRON's
 * job schedules (wrong domain — pg_cron ran them flawlessly: 0 of 5508 runs
 * failed in the 24h window behind the alarm's claimed "36 HTTP errors").
 *
 * Three rulings, all locked here:
 *  1. Domain separation: pg_cron jobs are judged by pg_cron's own semantics
 *     (job_run_details evidence), agent_automations by the next-run parser —
 *     never crosswise. Alarm claims are verified against evidence BEFORE
 *     alarming.
 *  2. Channel hierarchy (Magnus, 2026-08-28): ops findings → Daily Briefing +
 *     /admin/system Observability. NEVER post_to_river — River is reserved
 *     for positive/informative team posts.
 *  3. System-post dedup: same fingerprint within N days updates the existing
 *     post instead of creating a new one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  enrichCronHealth,
  formatCronHealthSummary,
  type CronHealthReport,
} from '../../../supabase/functions/_shared/cron/health.ts';
import {
  riverPostFingerprint,
  isSameRiverPost,
} from '../../../supabase/functions/_shared/river/fingerprint.ts';
import { DEFAULT_HEARTBEAT_PROTOCOL } from '../../../supabase/functions/_shared/pilot/prompt-compiler.ts';
import { riverModule } from '@/lib/modules/river-module';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

const healthSrc = read('supabase/functions/_shared/cron/health.ts');
const heartbeatSrc = read('supabase/functions/flowpilot-heartbeat/index.ts');
const briefingSrc = read('supabase/functions/flowpilot-lifecycle/briefing.ts');
const agentExecuteSrc = read('supabase/functions/agent-execute/index.ts');

function makeReport(jobs: Partial<CronHealthReport['jobs'][number]>[], httpErrors = 0): CronHealthReport {
  return {
    checked_at: new Date().toISOString(),
    cron_available: true,
    self_host: 'https://self.supabase.co',
    jobs: jobs.map((j) => ({
      jobname: 'job',
      schedule: '0 * * * *',
      active: true,
      target_host: 'https://self.supabase.co',
      foreign_host: false,
      never_ran: false,
      last_status: 'succeeded',
      last_run: new Date(Date.now() - 60_000).toISOString(),
      last_run_age_seconds: 60,
      ...j,
    })),
    http_errors_recent: Array.from({ length: httpErrors }, (_, i) => ({
      id: i, status_code: 500, created: new Date().toISOString(), url: 'https://x', error: null,
    })),
    flags: { jobs_total: jobs.length, jobs_never_ran: 0, jobs_foreign_host: 0, http_errors_24h: httpErrors },
  };
}

describe('1. pg_cron is judged by its own evidence — never the automation parser', () => {
  it('the incident replayed: parser-unsupported schedules + healthy runs + 36 HTTP errors → NO alarm', () => {
    // Schedules the next-run.ts parser has no branch for (DOM lists, day
    // names) — pg_cron understands them natively and ran every job fine.
    const report = makeReport([
      { jobname: 'invoice-sweep', schedule: '0 3 1,15 * *' },
      { jobname: 'weekend-digest', schedule: '30 2 * * sat' },
      { jobname: 'quarterly-close', schedule: '0 6 1 1,4,7,10 *' },
      { jobname: 'heartbeat', schedule: '17 * * * *', last_run_age_seconds: 3600 * 5 },
    ], 36);

    const enriched = enrichCronHealth(report);
    expect(enriched.jobs.filter((j) => j.red)).toHaveLength(0);
    expect(enriched.red_count).toBe(0);
    // No red jobs → total silence, even with pg_net-wide HTTP errors present.
    expect(formatCronHealthSummary(enriched)).toBeNull();
  });

  it('a genuinely failed job goes red WITH job_run_details evidence in the reason', () => {
    const failedAt = '2026-08-27T04:00:00.000Z';
    const enriched = enrichCronHealth(makeReport([
      { jobname: 'daily-briefing', last_status: 'failed', last_run: failedAt },
      { jobname: 'healthy-job' },
    ]));
    const red = enriched.jobs.filter((j) => j.red);
    expect(red).toHaveLength(1);
    expect(red[0].jobname).toBe('daily-briefing');
    expect(red[0].reasons.join(' ')).toMatch(/job_run_details/);
    expect(red[0].reasons.join(' ')).toContain(failedAt);

    const summary = formatCronHealthSummary(enriched)!;
    expect(summary).toContain('daily-briefing');
    expect(summary).toMatch(/job_run_details/);
  });

  it('never_ran and foreign_host stay red — they are pg_cron-native evidence', () => {
    const enriched = enrichCronHealth(makeReport([
      { jobname: 'stranded', never_ran: true, last_status: null, last_run: null },
      { jobname: 'hijacked', foreign_host: true, target_host: 'https://other.supabase.co' },
    ]));
    expect(enriched.jobs.every((j) => j.red)).toBe(true);
  });

  it('the health brain no longer touches the agent-automation cron parser', () => {
    // The domain-rule comment may NAME next-run.ts; importing or calling it is
    // what reintroduces the incident.
    expect(healthSrc).not.toMatch(/import[^;]*next-run/);
    expect(healthSrc).not.toMatch(/calculateNextRun|isSupportedCron/);
  });
});

describe('2. channel hierarchy: ops findings → briefing + Observability, never River', () => {
  it('the heartbeat gate forbids River instead of instructing a post there', () => {
    expect(heartbeatSrc).toMatch(/Do NOT post it to River/);
    expect(heartbeatSrc).not.toMatch(/post the alert above to the team via post_to_river/);
    // The old River-side dedup query is gone with the posting itself.
    expect(heartbeatSrc).not.toMatch(/ilike\('body', '%Scheduled-job health%'\)/);
  });

  it('a real failed job reaches the Daily Briefing with job_run_details evidence', () => {
    expect(briefingSrc).toMatch(/cron_health_report/);
    expect(briefingSrc).toMatch(/enrichCronHealth/);
    expect(briefingSrc).toMatch(/job_run_details/);
    // ...and lands as a high-priority action item pointing at Observability.
    expect(briefingSrc).toMatch(/\/admin\/system/);
  });

  it('the heartbeat protocol carries the hierarchy as a hard rule', () => {
    expect(DEFAULT_HEARTBEAT_PROTOCOL).toMatch(/CHANNEL HIERARCHY/);
    expect(DEFAULT_HEARTBEAT_PROTOCOL).toMatch(/NEVER post them to River/);
    expect(DEFAULT_HEARTBEAT_PROTOCOL).toMatch(/job_run_details/);
  });

  it('post_to_river is self-describing about the rule (Law 2 — behaviour in the description)', () => {
    const skill = riverModule.skillSeeds!.find((s) => s.name === 'post_to_river')!;
    expect(skill.description).toMatch(/NOT for: operational alerts/);
    expect(skill.description).toMatch(/Daily Briefing/);
    expect(skill.instructions).toMatch(/Channel hierarchy/);
  });
});

describe('3. system-post dedup: same fingerprint within the window updates in place', () => {
  const alertA = `⚠️ **Scheduled-job health** — issues found:
• \`daily-briefing\` — overdue (missed a scheduled slot)
• 36 HTTP error(s) from cron calls in 24h (500 https://x.supabase.co/functions/v1/foo)`;
  const alertB = `⚠️ **Scheduled-job health** — issues found:
• \`daily-briefing\` — overdue (missed a scheduled slot)
• 38 HTTP error(s) from cron calls in 24h (500 https://x.supabase.co/functions/v1/foo)`;

  it('the four near-identical incident posts share one fingerprint', () => {
    expect(riverPostFingerprint(alertA)).toBe(riverPostFingerprint(alertB));
    expect(isSameRiverPost(alertA, alertB)).toBe(true);
  });

  it('genuinely different posts keep different fingerprints', () => {
    expect(isSameRiverPost(alertA, '🎉 First booking came in — welcome aboard, Acme AB!')).toBe(false);
    expect(isSameRiverPost('New blog post published: Autumn roadmap', 'Template "Launchpad" shipped to production')).toBe(false);
  });

  it('empty bodies never dedupe against each other', () => {
    expect(isSameRiverPost('', '')).toBe(false);
    expect(isSameRiverPost('123 456', '789')).toBe(false); // digits-only normalizes to empty
  });

  it('the agent create path runs the dedup before inserting', () => {
    expect(agentExecuteSrc).toMatch(/isSameRiverPost/);
    expect(agentExecuteSrc).toMatch(/updated_existing/);
  });
});
