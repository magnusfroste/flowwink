import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A staged approval is consumed only when the call actually runs.
 *
 * Found while driving install_template through its own gates (2026-08-08):
 * install_template is DOUBLE-GATED (requires_staging AND trust_level='approve').
 * The staging gate marked the operation 'executed' the moment a valid
 * _approved_operation_id arrived — BEFORE the trust gate had decided. Passing
 * only that flag (without _approved) therefore burned the approval on a call
 * that then did nothing: status='executed', execution_result NULL, no work, and
 * the retry answered 403 'not approved' because the row was no longer
 * 'approved'. The status lied about the outcome, and the operator had to
 * re-stage a decision they had already made.
 */

const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/execute/core.ts'), 'utf-8');

const verifyAt = agentExecute.indexOf('// Verify approval before continuing');
const trustGateAt = agentExecute.indexOf("if (trustLevel === 'approve' && !bypassApproval)");
const consumeAt = agentExecute.indexOf("update({ status: 'executed', executed_at: new Date().toISOString() })");
const routeAt = agentExecute.indexOf('// 4. Route to handler');

describe('the approval survives a call the trust gate blocks', () => {
  it('verification still happens up front — an unapproved id never proceeds', () => {
    expect(verifyAt).toBeGreaterThan(-1);
    expect(agentExecute).toMatch(/op\.status !== 'approved' \|\| op\.skill_name !== skill\.name/);
  });

  it('but consumption happens AFTER the trust gate, not before it', () => {
    expect(consumeAt).toBeGreaterThan(trustGateAt);
    expect(verifyAt).toBeLessThan(trustGateAt);
  });

  it('and immediately before the handler runs', () => {
    expect(consumeAt).toBeLessThan(routeAt);
  });

  it('the old ordering is gone — nothing marks executed inside the verification block', () => {
    const verifyBlock = agentExecute.slice(verifyAt, trustGateAt);
    expect(verifyBlock).not.toMatch(/status: 'executed'/);
  });
});

describe('the operation records what actually happened', () => {
  it('writes execution_result after the handler returns', () => {
    expect(agentExecute).toMatch(/execution_result: \(result \?\? \{\}\) as never/);
  });

  it("a handler that returned an error marks the operation 'failed', not 'executed'", () => {
    // 'executed' with an { error } payload reads as a clean run in the approval
    // trail. Both values are allowed by the status CHECK constraint.
    expect(agentExecute).toMatch(/status: handlerFailed \? 'failed' : 'executed'/);
  });
});
