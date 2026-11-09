import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAutomationOverdue, judgeAutomationRuns, noticesStillBroken } from '@/lib/alarm-rules';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
// A Sunday, the day the flat 48-hour rule read every weekday job as dead.
const SUNDAY = new Date('2026-11-08T10:00:00Z').getTime();
const cron = (o: Partial<Parameters<typeof isAutomationOverdue>[0]>) => ({
  enabled: true, trigger_type: 'cron', last_triggered_at: null, next_run_at: null, ...o,
});

describe('late is against the job\'s own schedule', () => {
  it('a weekday job on a Sunday is on schedule', () => {
    expect(isAutomationOverdue(cron({ last_triggered_at: '2026-11-06T06:30:00Z', next_run_at: '2026-11-09T06:30:00Z' }), SUNDAY)).toBe(false);
  });
  it('a monthly job is on schedule all month', () => {
    expect(isAutomationOverdue(cron({ last_triggered_at: '2026-11-01T05:00:00Z', next_run_at: '2026-12-01T05:00:00Z' }), SUNDAY)).toBe(false);
  });
  it('a job created yesterday that is not due has not missed anything', () => {
    expect(isAutomationOverdue(cron({ next_run_at: '2026-12-03T05:17:00Z' }), SUNDAY)).toBe(false);
  });
  it('a promised run more than 15 minutes in the past is late', () => {
    expect(isAutomationOverdue(cron({ last_triggered_at: '2026-11-07T05:00:00Z', next_run_at: '2026-11-08T09:40:00Z' }), SUNDAY)).toBe(true);
    expect(isAutomationOverdue(cron({ last_triggered_at: '2026-11-07T05:00:00Z', next_run_at: '2026-11-08T09:50:00Z' }), SUNDAY)).toBe(false);
  });
  it('a cron job with no run and no next run is late; an event job or a disabled one never is', () => {
    expect(isAutomationOverdue(cron({}), SUNDAY)).toBe(true);
    expect(isAutomationOverdue(cron({ trigger_type: 'event' }), SUNDAY)).toBe(false);
    expect(isAutomationOverdue(cron({ enabled: false }), SUNDAY)).toBe(false);
  });
  it('agrees with what manage_automations tells an agent', () => {
    expect(read('supabase/functions/_shared/execute/core.ts')).toMatch(/next < now - 15 \* 60 \* 1000 \? 'overdue'/);
    expect(read('src/lib/alarm-rules.ts')).toMatch(/OVERDUE_GRACE_MS = 15 \* 60 \* 1000/);
  });
});

describe('a failure that was followed by something else is history', () => {
  it('the newest run failing warns, and most runs failing is red', () => {
    expect(judgeAutomationRuns({ runs: 7, errors: 1, newestStatus: 'failed' })).toBe('warning');
    expect(judgeAutomationRuns({ runs: 3, errors: 2, newestStatus: 'failed' })).toBe('error');
  });
  it('a success or a refusal after failures does not', () => {
    expect(judgeAutomationRuns({ runs: 7, errors: 1, newestStatus: 'success' })).toBeNull();
    expect(judgeAutomationRuns({ runs: 3, errors: 2, newestStatus: 'refused' })).toBeNull();
  });
  it('last_error still warns: the dispatcher wrote it about the job itself', () => {
    expect(judgeAutomationRuns({ runs: 0, errors: 0, lastError: 'boom' })).toBe('warning');
  });
});

describe('a healed integration stops warning', () => {
  const failed = { at: '2026-11-04T06:30:00Z', kind: 'new_failure' as const, integrations: ['searxng'] };
  const healed = { at: '2026-11-05T06:30:00Z', kind: 'recovered' as const, integrations: ['searxng'] };
  it('a failure with a newer recovery is not broken', () => {
    expect(noticesStillBroken([healed, failed])).toEqual([]);
  });
  it('a failure after the recovery is', () => {
    const again = { at: '2026-11-06T06:30:00Z', kind: 'degraded' as const, integrations: ['searxng'] };
    expect(noticesStillBroken([again, healed, failed])).toEqual([again]);
  });
  it('one of two healed leaves the notice warning', () => {
    const two = { at: '2026-11-04T06:30:00Z', kind: 'degraded' as const, integrations: ['searxng', 'resend'] };
    expect(noticesStillBroken([healed, two])).toEqual([two]);
  });
});

describe('the surfaces use the rules', () => {
  it('the bell warns for a person needed or something still broken, not for agents working', () => {
    const bell = read('src/components/admin/NotificationsBell.tsx');
    expect(bell).toMatch(/const hasWarning = paused > 0 \|\| approvals > 0 \|\| staged > 0 \|\| integrationDegraded;/);
    expect(bell).toMatch(/noticesStillBroken\(healthNotices\)/);
  });
  it('automation health reads the job\'s own runs and schedule', () => {
    const hook = read('src/hooks/useAutomationHealth.ts');
    expect(hook).toMatch(/\.in\('agent', \[\.\.\.AUTOMATION_RUNNERS\]\)/);
    expect(hook).toMatch(/isAutomationOverdue\(auto, now\.getTime\(\)\)/);
    expect(hook).not.toMatch(/hoursSince/);
  });
});
