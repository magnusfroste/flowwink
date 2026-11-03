import { supabase } from '@/integrations/supabase/client';

/**
 * Approve a gated skill call and run it ONCE — the one order every surface
 * uses (Approvals, Skill Hub, the email thread's "Approve & send").
 *
 * 1. Decide the request (resolve_approval). "Already resolved" is not an
 *    error: another surface approved it first, and step 2 tells us whether
 *    the work has happened.
 * 2. Run the skill naming that ticket (`_approved`, `_approval_request_id`).
 *    agent-execute claims it atomically (claim_skill_approval) and settles the
 *    pending activity itself; a second run is refused with 409
 *    `already_executed` — the work happened once, by another executor.
 *
 * Three surfaces carried their own copy of this until 2026-10-31, and one had
 * the order backwards (ran before approving → "_approved=true is not an
 * approval", Nordbrygg). One copy, one order.
 */
export type ApproveAndRunOutcome =
  | { outcome: 'ran'; result: Record<string, unknown> | null }
  | { outcome: 'already_executed' };

export interface ApproveAndRunInput {
  requestId: string | null;
  skillName: string;
  args: Record<string, unknown>;
  comment: string;
  agentType?: string;
  conversationId?: string | null;
  /** Legacy activity rows without a request are redeemed by activity id. */
  activityId?: string;
}

/** A non-2xx from agent-execute carries a JSON body; surface its reason/message. */
export async function readRefusal(err: unknown): Promise<{ reason?: string; message?: string; error?: string } | null> {
  try {
    const ctx = (err as { context?: Response })?.context;
    if (!ctx || typeof ctx.json !== 'function') return null;
    const body = await ctx.clone().json();
    return body && typeof body === 'object' ? body as { reason?: string; message?: string; error?: string } : null;
  } catch {
    return null;
  }
}

export async function approveAndRun(input: ApproveAndRunInput): Promise<ApproveAndRunOutcome> {
  if (input.requestId) {
    const { error } = await supabase.rpc('resolve_approval', {
      p_request_id: input.requestId, p_decision: 'approve', p_comment: input.comment,
    });
    if (error && !/already resolved/i.test(error.message)) throw error;
  }
  const { data, error } = await supabase.functions.invoke('agent-execute', {
    body: {
      skill_name: input.skillName,
      arguments: {
        ...input.args,
        _approved: true,
        ...(input.requestId ? { _approval_request_id: input.requestId } : input.activityId ? { _approval_activity_id: input.activityId } : {}),
      },
      agent_type: input.agentType ?? 'flowpilot',
      conversation_id: input.conversationId ?? undefined,
    },
  });
  if (error) {
    const refusal = await readRefusal(error);
    if (refusal?.reason === 'already_executed') return { outcome: 'already_executed' };
    throw new Error(`Approved, but running ${input.skillName} failed: ${refusal?.error ?? refusal?.message ?? error.message}`);
  }
  const run = data as { result?: Record<string, unknown> & { success?: boolean; error?: string }; error?: string } | null;
  if (run?.error || run?.result?.success === false) {
    throw new Error(`Approved, but ${input.skillName} reported: ${run?.error || run?.result?.error}`);
  }
  return { outcome: 'ran', result: run?.result ?? null };
}
