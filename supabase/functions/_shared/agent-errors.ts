/**
 * Stable error codes for skill failures — the self-correction component of
 * the Agent Harness (H7), generalised.
 *
 * A handler that fails answers `{ error: "<message>" }`. The message is for a
 * person; an agent needs something it can branch on: is this my input (fix
 * and retry), a rule of the books (do not retry — route around it), a
 * missing fact (supply it, then retry) or the platform (retry later)? Accounted
 * gives every error a `code`, a `recovery_hint` and a non-retryable
 * `PERIOD_LOCKED`; this maps our own messages the same way. Classification
 * is by message text because the messages are the contract the database
 * already speaks (RAISE EXCEPTION '...'); a handler that sets `code` itself
 * wins.
 */
export type AgentErrorCode =
  | 'PERIOD_LOCKED'
  | 'RETENTION_LOCKED'
  | 'MISSING_EXCHANGE_RATE'
  | 'MISSING_REQUIRED_PARAMETER'
  | 'UNKNOWN_PARAMETERS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_INPUT'
  | 'APPROVAL_REQUIRED'
  // Refusals, not failures: answered as { status: 'refused', code, retryable: false, hint }
  // with no `error`, so the harness neither retries nor counts them (comment_on_task).
  | 'ALREADY_NUDGED_TODAY'
  | 'QUESTION_STILL_OPEN'
  // The content floor (_shared/content-quality.ts): a post under the word
  // floor, in the wrong language, a re-word of an earlier title, or carrying a
  // claim the company ruled out. Refused, never retried as is.
  | 'CONTENT_TOO_THIN'
  | 'LANGUAGE_MISMATCH'
  | 'DUPLICATE_CONTENT'
  | 'FORBIDDEN_CLAIM'
  | 'TRANSIENT'
  | 'HANDLER_ERROR';

export interface ClassifiedError {
  code: AgentErrorCode;
  /** true = the same call can succeed after the agent changes something it controls (args, a rate, a date). */
  retryable: boolean;
  hint?: string;
}

interface Rule { code: AgentErrorCode; retryable: boolean; test: RegExp; hint?: string }

const RULES: Rule[] = [
  {
    code: 'PERIOD_LOCKED', retryable: false,
    test: /period\s+\S+\s+is\s+(closed|locked)|is locked and cannot|cannot modify .*period .* is closed|period_locked|closed period|locked period/i,
    hint: 'The period is closed: a declared period stays as declared. Date the entry in an open period (a correction is a mirror entry dated today), or ask an admin to reopen_accounting_period if the close itself was premature.',
  },
  {
    code: 'RETENTION_LOCKED', retryable: false,
    test: /is kept until|its documentation stays with it|cannot be deleted before then/i,
    hint: 'The archive keeps a posted voucher\'s documentation for the statutory retention period (BFL 7 kap). Nothing to retry: correct the voucher with a mirror entry if needed, and leave the document in place.',
  },
  {
    code: 'MISSING_EXCHANGE_RATE', retryable: true,
    test: /no exchange rate/i,
    hint: 'Run fetch_ecb_rates (or set_exchange_rate for the pair and date), then repeat the same call — nothing is booked at a rate of 1.',
  },
  {
    code: 'MISSING_REQUIRED_PARAMETER', retryable: true,
    test: /missing required parameter|is required\b|are required\b|required argument/i,
    hint: 'Supply the named parameter explicitly with the exact name the skill declares; do not rely on a default.',
  },
  {
    code: 'UNKNOWN_PARAMETERS', retryable: true,
    test: /parameter names likely don't match|unknown parameter|unrecognized (parameter|argument)|schema cache|PGRST202/i,
    hint: 'Use the exact parameter names from the skill\'s input schema (read_skill shows them); RPC params are p_-prefixed.',
  },
  {
    code: 'APPROVAL_REQUIRED', retryable: false,
    test: /pending_approval|requires (human )?approval|no_approved_request|must be approved/i,
    hint: 'A person decides in /admin/approvals; re-invoke only after the request is approved, with the ids the answer gave you.',
  },
  {
    code: 'FORBIDDEN', retryable: false,
    test: /only admins|only accounting staff|permission denied|not allowed|forbidden|42501|insufficient_privilege|not authori[sz]ed|unauthorized/i,
    hint: 'This caller may not run that — the owner of the API key lacks the module or role. Report it; do not retry with other arguments.',
  },
  {
    code: 'ALREADY_EXISTS', retryable: false,
    test: /duplicate key|already exists|already booked|already closed|already paid|already invoiced/i,
    hint: 'The record is already there: read it (list/get) and update instead of creating it again.',
  },
  {
    code: 'NOT_FOUND', retryable: false,
    test: /\bnot found\b|\bno (such|skill|row|record|page|invoice|order|vendor|customer|template)\b|does not exist|could not find/i,
    hint: 'Look the record up first (a list or search skill) and use the id or slug it returns.',
  },
  {
    code: 'TRANSIENT', retryable: true,
    test: /timeout|timed out|57014|fetch failed|temporarily|rate limit|429|503|connection (reset|refused)|ECONNRESET/i,
    hint: 'Nothing about the call was wrong; wait a moment and repeat it unchanged.',
  },
  {
    code: 'INVALID_INPUT', retryable: true,
    test: /violates check constraint|invalid input|must be (one of|between|a |an |positive|non-negative|1-12)|out of range|invalid (date|amount|email|slug|uuid)|cannot be (empty|negative)|got \S+\)/i,
    hint: 'The value, not the name, was refused: read the message for the accepted range or form and send a corrected value.',
  },
];

/** Map a failure message to a stable code. Unknown messages are HANDLER_ERROR, not retryable. */
export function classifyAgentError(message: string | null | undefined): ClassifiedError {
  const m = String(message ?? '');
  for (const r of RULES) {
    if (r.test.test(m)) return { code: r.code, retryable: r.retryable, hint: r.hint };
  }
  return { code: 'HANDLER_ERROR', retryable: false };
}

/**
 * Stamp `code`, `retryable` and `hint` onto a failed result. A code or hint
 * the handler already set is kept — it knows more than a regex does.
 */
export function stampAgentError<T extends Record<string, unknown>>(result: T): T {
  const err = (result as { error?: unknown }).error;
  if (typeof err !== 'string' || !err) return result;
  const c = classifyAgentError(err);
  const out: Record<string, unknown> = { ...result };
  if (typeof out.code !== 'string') out.code = c.code;
  if (typeof out.retryable !== 'boolean') out.retryable = c.retryable;
  if (typeof out.hint !== 'string' && c.hint) out.hint = c.hint;
  return out as T;
}
