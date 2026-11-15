import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { scheduleState, OVERDUE_GRACE_MS } from '../../../supabase/functions/_shared/automations/schedule-state';
import { isAutomationOverdue } from '@/lib/alarm-rules';

/**
 * Guardrail: a sweep with no work is idle, not late.
 *
 * 2026-11-15: check_operations answered "N scheduled automations overdue"
 * (high) on www (2), optic (5) and liteit (4). Every one carried a work_probe
 * (qualify_new_leads, Score visitor intent, Social Post Scheduler, Webinar
 * Reminders, SLA Sweep). An idle probed row keeps its due next_run_at on
 * purpose and note_idle_automations() stamps last_triggered_at each tick; the
 * judge read next_run_at alone. One rule now, three readers.
 */

const NOW = Date.parse('2026-11-15T22:10:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const min = 60_000;
const probe = { work_probe: 'leads_to_qualify' };
// The optic row, as manage_automations listed it.
const opticIdle = { enabled: true, trigger_type: 'cron', next_run_at: '2026-11-15T18:16:00Z', last_triggered_at: '2026-11-15T22:10:00Z', trigger_config: probe };

describe('a sweep with no work is idle, not late', () => {
  it('the optic row is idle — and the admin health view does not warn', () => {
    expect(scheduleState(opticIdle, NOW)).toBe('idle');
    expect(isAutomationOverdue(opticIdle, NOW)).toBe(false);
  });

  it('when the idle note stops (the dispatcher is down), it is overdue again', () => {
    const stopped = { ...opticIdle, last_triggered_at: iso(OVERDUE_GRACE_MS + min) };
    expect(scheduleState(stopped, NOW)).toBe('overdue');
    expect(isAutomationOverdue(stopped, NOW)).toBe(true);
  });

  it('a row without a probe is judged by next_run_at alone, as before', () => {
    const plain = { ...opticIdle, trigger_config: { cron: '*/15 * * * *' } };
    expect(scheduleState(plain, NOW)).toBe('overdue');
  });

  it('a probed row that last ran before its due slot is late, not idle', () => {
    const late = { ...opticIdle, next_run_at: iso(30 * min), last_triggered_at: iso(45 * min) };
    expect(scheduleState(late, NOW)).toBe('overdue');
  });

  it('the old states are unchanged', () => {
    expect(scheduleState({ ...opticIdle, enabled: false }, NOW)).toBe('disabled');
    expect(scheduleState({ ...opticIdle, trigger_type: 'event' }, NOW)).toBe('waiting');
    expect(scheduleState({ ...opticIdle, last_triggered_at: null, next_run_at: null }, NOW)).toBe('never_ran');
    expect(scheduleState({ ...opticIdle, next_run_at: iso(-10 * min) }, NOW)).toBe('on_schedule');
    expect(isAutomationOverdue({ ...opticIdle, last_triggered_at: null, next_run_at: null }, NOW)).toBe(true);
  });

  it('check_operations counts through the SQL twin of the same rule', () => {
    const dir = 'supabase/migrations';
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const latest = [...files].reverse().find((f) => readFileSync(`${dir}/${f}`, 'utf8').includes('FUNCTION public.check_operations('))!;
    const sql = readFileSync(`${dir}/${latest}`, 'utf8');
    expect(sql).toMatch(/WHERE public\.automation_is_overdue\(enabled, trigger_type, trigger_config, last_triggered_at, next_run_at\)/);
    const twin = sql.slice(sql.indexOf('FUNCTION public.automation_is_overdue('));
    expect(twin).toMatch(/jsonb_typeof\(p_trigger_config -> 'work_probe'\) = 'string'/);
    expect(twin).toMatch(/p_last_triggered_at >= p_next_run_at/);
    expect(twin).toMatch(/p_last_triggered_at > now\(\) - interval '15 minutes'/);
    expect(twin).toMatch(/p_next_run_at < now\(\) - interval '15 minutes'/);
  });

  it('the admin health view reads trigger_config, or it could never see a probe', () => {
    expect(readFileSync('src/hooks/useAutomationHealth.ts', 'utf8')).toMatch(/\.select\('id, name, skill_name, trigger_type, trigger_config,/);
  });
});
