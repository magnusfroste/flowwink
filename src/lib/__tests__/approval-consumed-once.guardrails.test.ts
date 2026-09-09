import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claimIsRequired,
  interpretApprovalClaim,
  type ClaimResult,
} from '../../../supabase/functions/_shared/approval-claim.ts';

/**
 * Guardrail: an approval is consumable exactly once.
 *
 * nordbrygg 2026-09-08: create_purchase_order (trust_level='approve') executed
 * TWICE from ONE approval. 11:56:11 the admin approved; 11:56:13 the approver's
 * path re-invoked with _approved=true → PO-00018; 12:00:08 the follow-through
 * sweep found the approval_requests row still 'approved' (no executor had
 * touched it) and re-invoked → PO-00019, identical. Three executors (admin
 * UI, MCP client, sweep) read the same STATE; none consumed a TICKET.
 *
 * The fix has one door: agent-execute claims the request through
 * claim_skill_approval — an atomic UPDATE … WHERE status='approved' RETURNING —
 * before anything runs. The first executor wins; every later one is refused
 * with a clear 'already executed'. The selector only offers unconsumed rows.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const enumMig = read('supabase/migrations/20260910110000_ett-godkannande-en-korning.sql');
const claimMig = read('supabase/migrations/20260910110001_godkannandet-forbrukas-en-gang.sql');
const agentExecute = read('supabase/functions/agent-execute/index.ts');
const followthrough = read('supabase/functions/flowpilot-lifecycle/followthrough.ts');
const useApprovals = read('src/hooks/useApprovals.ts');
const useSkillHub = read('src/hooks/useSkillHub.ts');

describe('a second execution attempt of an executed approval is refused', () => {
  const spent: ClaimResult = {
    claimed: false, reason: 'already_executed',
    request_id: '6f2d4300-8019-5e13-9046-68f41951b720',
    executed_at: '2026-09-08T11:56:13Z', executed_by: 'mcp',
  };

  it('with a 409 and a message that says what happened and what not to do', () => {
    const v = interpretApprovalClaim(spent, 'create_purchase_order', true);
    expect(v.ok).toBe(false);
    expect(v.httpStatus).toBe(409);
    expect(v.reason).toBe('already_executed');
    expect(v.message).toMatch(/already executed/);
    expect(v.message).toMatch(/exactly once/);
    expect(v.message).toMatch(/nothing ran/);
    expect(v.message).toContain('2026-09-08T11:56:13Z');
    expect(v.message).toContain('create_purchase_order');
  });

  it('even when the skill is no longer trust=approve — a named ticket is honoured or refused, never ignored', () => {
    // The sweep names the ticket explicitly; if the trust dial moved to 'auto'
    // meanwhile, the spent ticket must still refuse rather than "no gate, run".
    expect(claimIsRequired('auto', true)).toBe(true);
    const v = interpretApprovalClaim(spent, 'create_purchase_order', claimIsRequired('auto', true));
    expect(v.ok).toBe(false);
  });

  it('the first claim runs, and carries the pending activity to settle', () => {
    const v = interpretApprovalClaim(
      { claimed: true, request_id: 'r1', activity_id: 'a1', skill_name: 'create_purchase_order' },
      'create_purchase_order', true,
    );
    expect(v.ok).toBe(true);
    expect(v.requestId).toBe('r1');
    expect(v.activityId).toBe('a1');
  });

  it('_approved=true without any approved request is not an approval on a trust=approve skill', () => {
    const v = interpretApprovalClaim({ claimed: false, reason: 'no_approved_request' }, 'create_purchase_order', true);
    expect(v.ok).toBe(false);
    expect(v.httpStatus).toBe(403);
    expect(v.message).toMatch(/_approved=true is not an approval/);
  });

  it('but on an auto/notify skill the redundant flag just runs (nothing to consume)', () => {
    expect(claimIsRequired('auto', false)).toBe(false);
    expect(claimIsRequired('notify', false)).toBe(false);
    expect(interpretApprovalClaim({ claimed: false, reason: 'no_approved_request' }, 'x', false).ok).toBe(true);
    expect(interpretApprovalClaim(null, 'x', false).ok).toBe(true);
  });

  it('a ticket granted for another skill, a pending one, or an ambiguous match never executes', () => {
    for (const r of [
      { claimed: false, reason: 'skill_mismatch', request_id: 'r', expected: 'other' },
      { claimed: false, reason: 'not_approved', request_id: 'r', status: 'pending' },
      { claimed: false, reason: 'ambiguous', candidates: ['a', 'b'] },
      { claimed: false, reason: 'not_found', request_id: 'r' },
    ] as ClaimResult[]) {
      const v = interpretApprovalClaim(r, 'x', false);
      expect(v.ok, r.reason).toBe(false);
    }
  });

  it('an unanswered claim on a gated skill refuses rather than falling open', () => {
    const v = interpretApprovalClaim(null, 'create_purchase_order', true);
    expect(v.ok).toBe(false);
  });
});

describe('the ticket is consumed atomically, in the database', () => {
  it("the 'executed' enum value lives in its own migration (55P04: cannot be used where added)", () => {
    expect(enumMig).toMatch(/ALTER TYPE public\.approval_status ADD VALUE IF NOT EXISTS 'executed'/);
    expect(enumMig).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(enumMig).toMatch(/ADD COLUMN IF NOT EXISTS executed_at timestamptz/);
  });

  it('claim_skill_approval is an UPDATE … WHERE status=approved RETURNING', () => {
    const fn = claimMig.slice(claimMig.indexOf('FUNCTION public.claim_skill_approval'));
    expect(fn).toMatch(/UPDATE public\.approval_requests\s+SET status\s+= 'executed'/);
    expect(fn).toMatch(/AND status = 'approved'\s+RETURNING/);
    expect(fn).toMatch(/'reason', 'already_executed'/);
    // A ticket for X must not redeem Y.
    expect(fn).toMatch(/'reason', 'skill_mismatch'/);
    // Service-role (agent-execute) or admin only — never anon.
    expect(fn).toMatch(/auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'\)/);
    expect(claimMig).toMatch(/REVOKE ALL ON FUNCTION public\.claim_skill_approval[^;]*FROM PUBLIC, anon/);
  });

  it('the follow-through selector offers only UNCONSUMED approvals', () => {
    const sel = claimMig.slice(claimMig.indexOf('FUNCTION public.flowpilot_approved_pending'));
    expect(sel).toMatch(/JOIN public\.approval_requests ar ON ar\.id = a\.approval_request_id/);
    expect(sel).toMatch(/AND ar\.status = 'approved'/);
  });
});

describe('every executor goes through the one door', () => {
  const trustGateAt = agentExecute.indexOf("if (trustLevel === 'approve' && !bypassApproval)");
  const claimAt = agentExecute.indexOf("rpc('claim_skill_approval'");
  const stagedConsumeAt = agentExecute.indexOf("update({ status: 'executed', executed_at: new Date().toISOString() })");
  const routeAt = agentExecute.indexOf('// 4. Route to handler');

  it('agent-execute claims after the trust gate and before anything is consumed or run', () => {
    expect(trustGateAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(trustGateAt);
    expect(claimAt).toBeLessThan(stagedConsumeAt);
    expect(claimAt).toBeLessThan(routeAt);
  });

  it('a refused claim returns the verdict status and leaves a failed activity row (a visible trail)', () => {
    const block = agentExecute.slice(claimAt, stagedConsumeAt);
    expect(block).toMatch(/status: verdict\.httpStatus/);
    expect(block).toMatch(/status: 'refused'/);
    expect(block).toMatch(/status: 'failed'/);
  });

  it('the consumed ticket is settled by agent-execute after the handler ran', () => {
    const settleAt = agentExecute.indexOf('.eq(\'id\', claimedApprovalActivityId)');
    expect(settleAt).toBeGreaterThan(routeAt);
    expect(agentExecute.slice(settleAt - 400, settleAt)).toMatch(/status: handlerFailed \? 'failed' : 'success'/);
  });

  it('the 202 tells the caller the ticket id and that a re-call may be refused', () => {
    expect(agentExecute).toMatch(/_approval_request_id="\$\{approvalRequestId\}"/);
    expect(agentExecute).toMatch(/refused with 409 already_executed/);
  });

  it('the follow-through names the ticket and treats a 409 as a skip, not a failure', () => {
    expect(followthrough).toMatch(/_approval_request_id: row\.approval_request_id/);
    expect(followthrough).toMatch(/resp\.status === 409/);
    expect(followthrough).toMatch(/skipped: true/);
    expect(followthrough).toMatch(/skipped,\s*\n\s*failed,/);
  });

  it('the admin Approve names the ticket and no longer races the sync trigger', () => {
    expect(useApprovals).toMatch(/_approved: true, _approval_request_id: input\.request_id/);
    // The old line never matched (trigger had already moved the row to 'approved') —
    // that silence is what let the sweep run the action a second time.
    expect(useApprovals).not.toMatch(/\.eq\('status', 'pending_approval'\)/);
    expect(useApprovals).toMatch(/already_executed/);
  });

  it('the Skill Hub Approve decides on the request first, then redeems it once', () => {
    expect(useSkillHub).toMatch(/rpc\('resolve_approval'/);
    expect(useSkillHub).toMatch(/_approval_request_id: requestId/);
    expect(useSkillHub).not.toMatch(/Mark original pending row as approved/);
  });
});
