/**
 * The one reader of "did this agent-execute run fail?" — for a dispatcher that
 * awaited the answer and for agent-execute's own async handoff, which awaits it
 * in the background and writes it back to the automation.
 *
 * agent-execute answers 200 `{ status: 'failed', result: { error } }` when the
 * SKILL failed; only a transport or gate failure sets a top-level `error` or a
 * non-2xx status. A refusal (`status: 'refused'`) and a staged approval
 * (`pending_approval`) are answers, not failures. No imports: the app's tests
 * reach this file.
 */
export function runOutcomeError(httpOk: boolean, httpStatus: number, body: unknown): string | null {
  const out = (body && typeof body === 'object' ? body : {}) as { error?: unknown; status?: unknown; result?: { error?: unknown } | null };
  if (!httpOk) return String(out.error || `HTTP ${httpStatus}`);
  if (out.error) return String(out.error);
  if (out.status === 'failed') return String(out.result?.error || 'skill failed');
  return null;
}

/** Where an async run's failure is written: the automation that fired it. Wire-only, service callers only. */
export type RunReportTo = { automation_id: string; event_id?: string | null };

export function isRunReportTo(v: unknown): v is RunReportTo {
  return !!v && typeof v === 'object' && typeof (v as RunReportTo).automation_id === 'string'
    && /^[0-9a-f-]{36}$/i.test((v as RunReportTo).automation_id);
}

/** The text that lands in agent_automations.last_error for a failed background run. */
export function backgroundErrorText(err: string, report: RunReportTo): string {
  const tail = report.event_id ? ` (background run, event ${report.event_id})` : ' (background run)';
  return (err.length > 900 ? `${err.slice(0, 900)}…` : err) + tail;
}
