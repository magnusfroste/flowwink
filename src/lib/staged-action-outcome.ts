/**
 * The outcome of an approved staged action — derived, never duplicated.
 *
 * A staged write lives in `pending_operations`. That row already OWNS the
 * outcome: `approve_pending_operation` moves it to 'approved', and
 * `agent-execute` closes the loop by writing `status` ('executed' | 'failed')
 * together with `execution_result`. One writer per truth.
 *
 * The chat row therefore stores only the *identity* of what was staged in that
 * turn (operation_id, skill, args) — chat provenance — and the outcome is read
 * back from `pending_operations` every time history loads. Copying the outcome
 * into `chat_messages.metadata` would create a second writer that goes stale
 * the moment the operation is retried, expires, or is approved elsewhere.
 *
 * Real incident this exists for: an admin approved a staged write in FlowWork,
 * it ran, it failed with a perfectly self-correcting error ("missing required
 * field [title]"), and the whole diagnosis lived in React state only. On reload
 * the outcome was gone and the card looked untouched — a failed action was
 * indistinguishable from one that was never run.
 */

/**
 * Lifecycle of a staged action as the chat shows it.
 *
 * 'executed' and 'approved' are deliberately separate: an operation that was
 * approved but whose execution was never recorded is NOT a success, and must
 * not be painted as one.
 */
export type StagedResolution =
  | 'executed'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'expired';

export interface StagedOutcome {
  resolution: StagedResolution;
  note?: string;
}

/** The slice of `pending_operations` the chat needs to tell the truth. */
export interface PendingOperationOutcomeRow {
  id?: string;
  status?: string | null;
  execution_result?: unknown;
  rejection_reason?: string | null;
  expires_at?: string | null;
}

/** Envelopes a failure may arrive wrapped in (agent-execute returns {status,result}). */
const ENVELOPE_KEYS = ['result', 'body', 'data'] as const;

/** Fallback keys, only consulted once `error` has been ruled out. */
const SOFT_ERROR_KEYS = ['message', 'detail', 'reason'] as const;

/** Append the actionable half agent-execute adds for the wrong-param class. */
function withHint(msg: string, r: Record<string, unknown>): string {
  const hint = typeof r.hint === 'string' ? r.hint.trim() : '';
  return hint && !msg.includes(hint) ? `${msg}\n\n${hint}` : msg;
}

/**
 * The UNAMBIGUOUS failure signal: an `error` key with something in it.
 *
 * Deliberately narrow. A successful handler may well return
 * `{ message: 'Order created' }`, and treating that as a failure would invent
 * the mirror image of the bug this file exists for.
 */
export function extractExplicitError(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;

  const e = r.error;
  if (typeof e === 'string' && e.trim()) return withHint(e.trim(), r);
  if (e && typeof e === 'object') {
    const nested = extractExecutionError(e);
    if (nested) return withHint(nested, r);
  }

  for (const key of ENVELOPE_KEYS) {
    const nested = extractExplicitError(r[key]);
    if (nested) return withHint(nested, r);
  }
  return undefined;
}

/**
 * Pull the readable error out of an execution_result already known to be one.
 *
 * Never truncates: these messages are frequently self-correcting instructions
 * ("missing required parameter(s) title for skill \"write_blog_post\"") and a
 * clipped one is worthless to the human who has to fix it.
 */
export function extractExecutionError(result: unknown): string | undefined {
  if (typeof result === 'string') return result.trim() || undefined;
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;

  const explicit = extractExplicitError(r);
  if (explicit) return explicit;

  for (const key of SOFT_ERROR_KEYS) {
    const v = r[key];
    if (typeof v === 'string' && v.trim()) return withHint(v.trim(), r);
    if (v && typeof v === 'object') {
      const nested = extractExecutionError(v);
      if (nested) return withHint(nested, r);
    }
  }
  for (const key of ENVELOPE_KEYS) {
    const nested = extractExecutionError(r[key]);
    if (nested) return nested;
  }
  return undefined;
}

/** Short "what changed" line for a successful execution. */
export function summarizeExecutionResult(result: unknown): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  const entries = Object.entries(result as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  if (entries.length === 0) return undefined;
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? '…' : String(v)}`)
    .join(' · ');
}

const NO_REASON = 'Utförandet misslyckades utan angiven orsak.';

/**
 * Derive what the chat should show from the operation row.
 *
 * Returns `null` only while the operation is genuinely still awaiting a human
 * decision — every other state resolves the card. A failure can never come
 * back as "väntar på ditt beslut".
 */
export function outcomeFromPendingOperation(
  row: PendingOperationOutcomeRow | null | undefined,
  now: number = Date.now(),
): StagedOutcome | null {
  // No row means the operation is gone from the table the approve button acts
  // on — the button would 403. Say so instead of offering a dead decision.
  if (!row) {
    return {
      resolution: 'expired',
      note: 'Operationen finns inte längre och kan inte utföras härifrån. Be om åtgärden igen.',
    };
  }

  const status = (row.status || '').toLowerCase();
  const explicitError = extractExplicitError(row.execution_result);

  // An execution_result carrying an explicit `error` IS a failure, whatever
  // the status column says. This is the silent-half-success class: status and
  // result disagreeing is exactly how a failed write got painted green before.
  if (explicitError && status !== 'rejected') {
    return { resolution: 'failed', note: explicitError };
  }

  switch (status) {
    case 'failed':
      return {
        resolution: 'failed',
        note: extractExecutionError(row.execution_result) ?? NO_REASON,
      };
    case 'executed':
      return { resolution: 'executed', note: summarizeExecutionResult(row.execution_result) };
    case 'rejected':
      return {
        resolution: 'rejected',
        note: row.rejection_reason?.trim() || undefined,
      };
    case 'expired':
      return {
        resolution: 'expired',
        note: 'Godkännandefönstret gick ut innan åtgärden utfördes. Ingenting utfördes.',
      };
    case 'approved':
      return {
        resolution: 'approved',
        note: 'Godkänd, men inget utförande har registrerats. Kontrollera /admin/approvals — åtgärden kan kräva ytterligare ett beslut.',
      };
    case 'pending':
    default:
      // Still awaiting a decision — but an approval window that has already
      // closed is not a decision anyone can still make.
      if (row.expires_at && new Date(row.expires_at).getTime() < now) {
        return {
          resolution: 'expired',
          note: 'Godkännandefönstret gick ut innan någon hann besluta. Ingenting utfördes.',
        };
      }
      return null;
  }
}

/** Resolutions that mean: the action did NOT happen. */
const NOT_DONE: ReadonlySet<StagedResolution> = new Set<StagedResolution>([
  'rejected',
  'failed',
  'expired',
]);

export function isUnfinished(resolution: StagedResolution): boolean {
  return NOT_DONE.has(resolution);
}

/**
 * Fields that belong to `pending_operations` and to nothing else.
 * Persisting them onto the chat row would make a second writer of the outcome.
 */
export const OUTCOME_ONLY_FIELDS = ['resolution', 'result_note'] as const;

/**
 * Strip the outcome before a staged action is written to
 * `chat_messages.metadata`. The chat row records WHAT was staged; the
 * operation row records WHAT HAPPENED.
 */
export function toPersistableStaged<T extends Record<string, unknown>>(
  staged: readonly T[] | undefined,
): Array<Record<string, unknown>> {
  if (!staged?.length) return [];
  return staged.map((a) => {
    const copy: Record<string, unknown> = { ...a };
    for (const f of OUTCOME_ONLY_FIELDS) delete copy[f];
    return copy;
  });
}
