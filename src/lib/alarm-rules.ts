/**
 * When a health surface may warn a person.
 *
 * An alarm that fires on a healthy platform teaches its reader that either the
 * alarm or the platform cannot be trusted. Each rule here answers "is something
 * wrong NOW", which the surfaces used to answer with a proxy: hours since the
 * last run, any failure in the past week, any notice nobody had closed.
 */

export interface ScheduledAutomation {
  enabled: boolean;
  trigger_type: string;
  last_triggered_at: string | null;
  next_run_at: string | null;
}

/** Who runs an automation. A person's or a connected agent's call of the same skill says nothing about it. */
export const AUTOMATION_RUNNERS = ['cron', 'automation'] as const;

const OVERDUE_GRACE_MS = 15 * 60 * 1000;

/**
 * Late against its OWN schedule: the run the dispatcher promised is more than
 * 15 minutes in the past, or a cron job has neither run nor been given a next
 * run. Hours since the last run is not the question: a monthly job read that
 * way is dead 29 days of 30, a weekday job every Sunday. The same rule as the
 * `state` manage_automations answers an agent.
 */
export function isAutomationOverdue(row: ScheduledAutomation, nowMs: number): boolean {
  if (!row.enabled || row.trigger_type !== 'cron') return false;
  const next = row.next_run_at ? new Date(row.next_run_at).getTime() : null;
  if (!row.last_triggered_at && next === null) return true;
  return next !== null && next < nowMs - OVERDUE_GRACE_MS;
}

export interface AutomationRunSummary {
  runs: number;
  errors: number;
  /** Status of the newest logged run in the window, if there is one. */
  newestStatus?: string | null;
  lastError?: string | null;
}

/**
 * A failure followed by anything but another failure is history, and history
 * belongs on the sparkline. The automation warns while its newest run failed,
 * and goes red when most of its runs did.
 */
export function judgeAutomationRuns(s: AutomationRunSummary): 'error' | 'warning' | null {
  if (s.newestStatus === 'failed') return s.runs > 0 && s.errors / s.runs > 0.5 ? 'error' : 'warning';
  return s.lastError ? 'warning' : null;
}

export interface HealthNoticeLike {
  at: string;
  kind: 'degraded' | 'new_failure' | 'recovered';
  integrations: string[];
}

/**
 * The open notices about something still broken. A failure whose every
 * integration has a newer recovery has healed: its row may wait to be read,
 * but it no longer warns.
 */
export function noticesStillBroken<T extends HealthNoticeLike>(notices: T[]): T[] {
  const recoveredAt = new Map<string, number>();
  for (const n of notices) {
    if (n.kind !== 'recovered') continue;
    const at = new Date(n.at).getTime();
    for (const name of n.integrations) recoveredAt.set(name, Math.max(recoveredAt.get(name) ?? 0, at));
  }
  return notices.filter((n) => {
    if (n.kind === 'recovered') return false;
    const at = new Date(n.at).getTime();
    return n.integrations.length === 0 || n.integrations.some((name) => (recoveredAt.get(name) ?? 0) <= at);
  });
}
