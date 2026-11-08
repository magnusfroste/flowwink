/**
 * The Daily Briefing says how the business is doing (2026-11-08). Synclair's
 * admins were told "3 scheduled jobs unhealthy (per job_run_details)" and
 * "1 skill execution failed" every morning, in high priority, with nothing
 * they could do about either — and one red job was enough to send the mail.
 * The finding stays in the machine room (/admin/system → Observability), and
 * what is the platform's fault goes upstream with the daily feedback_ping.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fileMachineRoomReports,
  machineRoomReports,
  SKILL_FAILURES_TO_REPORT,
} from '../../../supabase/functions/_shared/feedback/machine-room-reports';

const read = (p: string) => readFileSync(p, 'utf8');
const briefing = read('supabase/functions/flowpilot-lifecycle/briefing.ts');
const core = read('supabase/functions/_shared/execute/core.ts');

const job = (jobname: string, reasons = ['failed']) => ({ jobname, reasons, last_status: 'failed', last_run: '2026-11-08T03:00:00Z' });
const calm = { jobs: [], pulse: { starving: false }, failures: [] };

describe('the briefing', () => {
  it('reads no platform health and raises no action item about it', () => {
    expect(briefing).not.toMatch(/cron_health_report|cronRedJobs|failedActions/);
    expect(briefing).not.toMatch(/AI Success/);
    expect(briefing).not.toMatch(/scheduled job|skill execution/);
  });

  it('does not score how busy the machinery was', () => {
    const signal = briefing.match(/const hasSignal = [^;]+;/)![0];
    expect(signal).not.toMatch(/actions\.length/);
  });

  it('is not sent because the operator ran', () => {
    const worth = briefing.indexOf('const worthTelling =');
    const agentLine = briefing.indexOf('FlowPilot completed ${fpAutonomousActions} action');
    expect(worth).toBeGreaterThan(-1);
    expect(agentLine).toBeGreaterThan(worth);
  });
});

describe('the machine room reports upstream', () => {
  it('runs inside feedback_ping, behind share_usage', () => {
    const ping = core.slice(core.indexOf("case 'feedback_ping': {"));
    expect(ping.indexOf('share_usage === false')).toBeLessThan(ping.indexOf('fileMachineRoomReports('));
    expect(ping.indexOf('FEEDBACK_SHARE_USAGE')).toBeLessThan(ping.indexOf('fileMachineRoomReports('));
  });

  it('names the defect, not the instance, and does not leak a host', () => {
    const [r] = machineRoomReports({
      ...calm,
      jobs: [job('daily-briefing', ['targets a foreign host (abc.supabase.co)'])],
    });
    expect(r.title).toBe('Scheduled job unhealthy: daily-briefing');
    expect(r.body).toContain('foreign host');
    expect(r.body).not.toContain('abc.supabase.co');
  });

  it('files the throttled database alone: the jobs are its symptoms', () => {
    const reports = machineRoomReports({ ...calm, jobs: [job('a'), job('b')], pulse: { starving: true, starved_hours_24h: 9 } });
    expect(reports.map((r) => r.title)).toEqual(['Database pulse starving on an instance']);
  });

  it('files a skill only when it fails by itself, repeatedly, and never its error text', () => {
    const secret = 'boom for anna@example.com';
    const failures = [
      ...Array(SKILL_FAILURES_TO_REPORT).fill({ skill_name: 'broken', error_message: secret }),
      ...Array(SKILL_FAILURES_TO_REPORT - 1).fill({ skill_name: 'once_or_twice', error_message: secret }),
      ...Array(9).fill({ skill_name: 'bad_args', error_message: 'title is required' }),
      ...Array(9).fill({ skill_name: 'closed', error_message: 'period 2026-01 is closed' }),
    ];
    const reports = machineRoomReports({ ...calm, failures });
    expect(reports.map((r) => r.title)).toEqual(['Skill failing: broken']);
    expect(reports[0].body).not.toContain('anna@example.com');
  });
});

describe('filing', () => {
  const supabaseWith = (jobs: unknown[]) => ({
    rpc: async () => ({ data: { cron_available: true, jobs, pulse_profile: [], flags: {} }, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({ limit: async () => ({ data: [], error: null }) }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
  });
  const failed = (jobname: string) => ({ jobname, active: true, last_status: 'failed', last_run: new Date().toISOString(), never_ran: false });

  it('a report already on the board does not use up the turn of the next one', async () => {
    const submit = vi.fn()
      .mockResolvedValueOnce({ status: 'refused', code: 'ALREADY_REPORTED' })
      .mockResolvedValueOnce({ status: 'refused', code: 'ALREADY_REPORTED' })
      .mockResolvedValueOnce({ status: 'refused', code: 'ALREADY_REPORTED' })
      .mockResolvedValueOnce({ post_id: 'p' });
    const out = await fileMachineRoomReports(supabaseWith(['a', 'b', 'c', 'd'].map(failed)), submit);
    expect(out).toEqual({ filed: 1, already_reported: 3 });
  });

  it('stops at the daily cap', async () => {
    const submit = vi.fn().mockResolvedValue({ status: 'refused', code: 'FEEDBACK_DAILY_CAP' });
    const out = await fileMachineRoomReports(supabaseWith(['a', 'b'].map(failed)), submit);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ filed: 0, already_reported: 0 });
  });

  it('never costs the ping', async () => {
    const out = await fileMachineRoomReports({ rpc: async () => { throw new Error('down'); } }, vi.fn());
    expect(out).toEqual({ filed: 0, already_reported: 0 });
  });
});
