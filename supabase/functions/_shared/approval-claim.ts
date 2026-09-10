/**
 * approval-claim.ts — the executor's side of "one approval, one run".
 *
 * A trust_level='approve' skill call is a TICKET, not a state: whichever
 * executor runs it (admin UI Approve, an MCP client re-invoking with
 * `_approved=true`, the follow-through sweep) must first consume the
 * approval_requests row through `claim_skill_approval` — an atomic
 * `UPDATE … WHERE status='approved' RETURNING`. The first caller gets the row;
 * every later one gets `{ claimed: false, reason: 'already_executed' }` and is
 * refused. nordbrygg 2026-09-08: create_purchase_order ran twice on one
 * approval (PO-00018 by the client, PO-00019 by the sweep four minutes later)
 * because nothing consumed the row.
 *
 * This module is pure (no Deno, no Supabase) so the unit tests can exercise
 * the decision table directly.
 */

export type ClaimRefusalReason =
  | 'already_executed' | 'not_approved' | 'skill_mismatch' | 'not_found' | 'no_approved_request' | 'ambiguous';

/** The jsonb `claim_skill_approval` returns. Flat on purpose: the repo compiles without strictNullChecks, so a discriminated union would not narrow. */
export interface ClaimResult {
  claimed: boolean;
  reason?: ClaimRefusalReason;
  request_id?: string;
  activity_id?: string | null;
  skill_name?: string;
  approved_at?: string | null;
  executed_at?: string | null;
  executed_by?: string | null;
  status?: string;
  expected?: string;
  candidates?: string[];
  detail?: string;
}

export interface ClaimVerdict {
  ok: boolean;
  /** Set when ok=false. 409 = the ticket was already spent; 403 = there is no valid ticket. */
  httpStatus?: 403 | 409;
  reason?: string;
  message?: string;
  requestId: string | null;
  activityId: string | null;
}

/**
 * Does a `_approved=true` call have to consume an approval before it may run?
 *
 * - trust 'approve': always — the flag alone is a claim any caller can type.
 * - explicit ids passed: always — the caller named a ticket, honour or refuse it
 *   (an already-spent ticket must never fall through to "no gate, just run").
 * - otherwise (trust auto/notify, no ids): the flag is redundant; a matching
 *   approved request is consumed if one exists so the ledger stays truthful,
 *   but its absence is not a refusal.
 */
export function claimIsRequired(trustLevel: string, hasExplicitIds: boolean): boolean {
  return trustLevel === 'approve' || hasExplicitIds;
}

const refuse = (httpStatus: 403 | 409, reason: string, message: string, requestId?: string): ClaimVerdict =>
  ({ ok: false, httpStatus, reason, message, requestId: requestId ?? null, activityId: null });

/** Turn the RPC's jsonb into an execute/refuse decision with a message a human or an agent can act on. */
export function interpretApprovalClaim(
  result: ClaimResult | null | undefined,
  skillName: string,
  required: boolean,
): ClaimVerdict {
  if (!result) {
    // The RPC did not answer (missing on an un-migrated instance, or errored).
    // Required → refuse: an approval that cannot be consumed cannot be trusted.
    if (required) {
      return refuse(403, 'claim_unavailable',
        `Cannot verify the approval for "${skillName}" (claim_skill_approval unavailable) — not executing. Apply the latest migrations, then approve again.`);
    }
    return { ok: true, requestId: null, activityId: null };
  }

  if (result.claimed === true) {
    return { ok: true, requestId: result.request_id ?? null, activityId: result.activity_id ?? null };
  }

  const id = result.request_id ?? '';
  switch (result.reason) {
    case 'already_executed': {
      const when = result.executed_at ? ` at ${result.executed_at}` : '';
      const who = result.executed_by ? ` by ${result.executed_by}` : '';
      return refuse(409, 'already_executed',
        `Approval ${id} for "${skillName}" was already executed${when}${who} — an approval is consumable exactly once, so this call is refused (nothing ran). If the action is genuinely needed again, call "${skillName}" WITHOUT _approved to request a fresh approval.`,
        result.request_id);
    }
    case 'not_approved':
      return refuse(403, 'not_approved',
        `Approval ${id} for "${skillName}" is '${result.status ?? 'unknown'}', not approved — nothing ran. Approve it in /admin/approvals${id ? `?request=${id}` : ''} first.`,
        result.request_id);
    case 'skill_mismatch':
      return refuse(403, 'skill_mismatch',
        `Approval ${id} was granted for "${result.expected ?? '?'}", not "${skillName}" — an approval cannot be redeemed for a different skill.`,
        result.request_id);
    case 'ambiguous':
      return refuse(403, 'ambiguous',
        `Several approved requests exist for "${skillName}" and none matches these arguments exactly — re-call with _approval_request_id=<uuid> (candidates: ${(result.candidates ?? []).join(', ')}).`);
    case 'not_found':
      return refuse(403, 'not_found', `Approval ${id} does not exist — nothing ran.`, result.request_id);
    case 'no_approved_request':
    default:
      if (!required) return { ok: true, requestId: null, activityId: null };
      return refuse(403, 'no_approved_request',
        `No approved request exists for "${skillName}" with these arguments — _approved=true is not an approval. Call "${skillName}" without _approved to stage the request, have it approved in /admin/approvals, then re-call with _approved=true and the returned _approval_request_id.`);
  }
}
