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

/**
 * Where an async run's outcome is written: the automation that fired it, and
 * (run_id) its row in automation_pending_runs, deleted when the run answers.
 * Wire-only, service callers only.
 */
export type RunReportTo = { automation_id: string; event_id?: string | null; run_id?: string | null };

const UUID = /^[0-9a-f-]{36}$/i;

export function isRunReportTo(v: unknown): v is RunReportTo {
  if (!v || typeof v !== 'object') return false;
  const r = v as RunReportTo;
  return typeof r.automation_id === 'string' && UUID.test(r.automation_id)
    && (r.run_id == null || (typeof r.run_id === 'string' && UUID.test(r.run_id)));
}

/** The text that lands in agent_automations.last_error for a failed background run. */
export function backgroundErrorText(err: string, report: RunReportTo): string {
  const tail = report.event_id ? ` (background run, event ${report.event_id})` : ' (background run)';
  return (err.length > 900 ? `${err.slice(0, 900)}…` : err) + tail;
}

/**
 * A pending run older than this answered nobody: every edge invocation is cut
 * at 150 s, the handoff's and the run's alike, so twice that is past both.
 */
export const STALE_RUN_MS = 5 * 60_000;

/** The text for a run whose marker outlived every wall clock. */
export function staleRunErrorText(run: { skill_name?: string | null; event_id?: string | null; started_at: string }): string {
  return `background run never answered — the edge function was shut down before ${run.skill_name ?? 'the skill'} finished`
    + ` (started ${run.started_at}${run.event_id ? `, event ${run.event_id}` : ''}); see the activity log`;
}

type DbError = { message: string } | null;
type Filter = PromiseLike<{ error: DbError }> & { eq(column: string, value: string): PromiseLike<{ error: DbError }> };
/** The slice of a Supabase client settleRun writes through (no import, so the app's tests reach it). */
export interface RunDb {
  from(table: string): { update(values: Record<string, unknown>): Filter; delete(): Filter };
}

/**
 * Write a run's outcome: a failure to the automation's last_error, then delete
 * its pending marker. Idempotent, so the run and the handoff that awaited it may
 * both call it; never throws (a bookkeeping write must not fail the run).
 */
export async function settleRun(db: RunDb, report: RunReportTo | null, err: string | null): Promise<void> {
  if (!report) return;
  try {
    if (err) {
      const { error } = await db.from('agent_automations')
        .update({ last_error: backgroundErrorText(err, report) }).eq('id', report.automation_id);
      if (error) console.error('[run-outcome] could not record background failure:', error.message);
    }
    if (report.run_id) {
      const { error } = await db.from('automation_pending_runs').delete().eq('id', report.run_id);
      if (error) console.error('[run-outcome] could not clear pending run:', error.message);
    }
  } catch (e) {
    console.error('[run-outcome] settle failed:', e);
  }
}
