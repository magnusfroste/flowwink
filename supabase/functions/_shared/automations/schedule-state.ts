/**
 * Is a scheduled automation where its schedule says it should be?
 *
 * One rule, three readers: manage_automations list (the `state` an agent
 * branches on), the admin's automation health (useAutomationHealth → the bell,
 * Observability) and check_operations in SQL (public.automation_is_overdue).
 *
 * Read against the job's OWN schedule, never the calendar: a weekday sweep
 * looked at on a Sunday is on_schedule (Hermes on Nordbrygg, 2026-10-25).
 *
 * An idle sweep is not late (2026-11-16). A row with
 * `trigger_config.work_probe` is not woken while its probe says there is no
 * work, and keeps its due next_run_at on purpose — the minute work appears it
 * runs. note_idle_automations() stamps last_triggered_at on every tick
 * instead. So a probed row whose last_triggered_at is at or after its
 * next_run_at, and fresh, was noted idle on the last tick. When the
 * dispatcher stops, the note stops, and the row is overdue again. Before this
 * rule check_operations called 2–5 such sweeps per instance "overdue" (high)
 * on www, optic and liteit every hour of 2026-11-15.
 */

export const OVERDUE_GRACE_MS = 15 * 60 * 1000;

export interface ScheduledAutomation {
  enabled: boolean;
  trigger_type: string;
  last_triggered_at: string | null;
  next_run_at: string | null;
  trigger_config?: unknown;
}

export type ScheduleState = 'disabled' | 'waiting' | 'never_ran' | 'idle' | 'overdue' | 'on_schedule';

export function hasWorkProbe(config: unknown): boolean {
  return !!config && typeof config === 'object' && typeof (config as { work_probe?: unknown }).work_probe === 'string';
}

export function scheduleState(row: ScheduledAutomation, nowMs: number): ScheduleState {
  if (!row.enabled) return 'disabled';
  if (row.trigger_type !== 'cron') return 'waiting';
  const next = row.next_run_at ? new Date(row.next_run_at).getTime() : null;
  const last = row.last_triggered_at ? new Date(row.last_triggered_at).getTime() : null;
  if (last === null && next === null) return 'never_ran';
  if (next === null || next >= nowMs - OVERDUE_GRACE_MS) return 'on_schedule';
  const notedIdle = hasWorkProbe(row.trigger_config) && last !== null && last >= next && last > nowMs - OVERDUE_GRACE_MS;
  return notedIdle ? 'idle' : 'overdue';
}

export const SCHEDULE_STATE_LEGEND =
  'on_schedule = last run matches the schedule and the next run is ahead; idle = a sweep with a work_probe that found no work on the last tick (it runs the minute work appears — not late); overdue = the promised next_run_at is more than 15 min in the past and nothing noted it idle (the dispatcher is not firing it); never_ran; waiting = event/signal/manual trigger; disabled. Judge by state, not by how old last_triggered_at looks.';
