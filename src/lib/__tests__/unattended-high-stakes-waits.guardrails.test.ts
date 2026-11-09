/**
 * The prompt-injection net (2026-11-09): a high-stakes write with nobody at the
 * keyboard waits for a person, and every prompt says content is data.
 * See supabase/functions/_shared/execute/high-stakes.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isUnattended, isHighStakesWrite, mustWaitForAPerson } from '../../../supabase/functions/_shared/execute/high-stakes.ts';
import { GROUNDING_RULES } from '../../../supabase/functions/_shared/pilot/prompt-compiler.ts';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const HIGH = { function: { name: 'pay_vendor_invoice' }, risk: 'high', reversible: false };

describe('who is at the keyboard', () => {
  it('the gateway, the visitor chat, a scheduled tick and a call with no person are unattended', () => {
    expect(isUnattended({ agentType: 'mcp', callerUserId: 'u1' })).toBe(true);
    expect(isUnattended({ agentType: 'chat', callerUserId: 'u1' })).toBe(true);
    expect(isUnattended({ agentType: 'flowpilot', callerUserId: 'u1', scheduled: true })).toBe(true);
    expect(isUnattended({ agentType: 'flowpilot', callerUserId: null })).toBe(true);
  });
  it('a person in FlowChat or the admin is attended', () => {
    expect(isUnattended({ agentType: 'flowpilot', callerUserId: 'u1' })).toBe(false);
  });
});

describe('what is high-stakes', () => {
  it('risk high or irreversible, and only a write', () => {
    expect(isHighStakesWrite({ risk: 'high' }, 'write')).toBe(true);
    expect(isHighStakesWrite({ reversible: false, risk: 'low' }, 'write')).toBe(true);
    expect(isHighStakesWrite({ risk: 'medium', reversible: true }, 'write')).toBe(false);
    expect(isHighStakesWrite(HIGH, 'read')).toBe(false);
    expect(isHighStakesWrite(null, 'write')).toBe(false);
  });
});

describe('an unattended high-stakes write waits; a person never does', () => {
  it('FlowPilot paying a vendor on its own waits; the same call from FlowChat runs', () => {
    expect(mustWaitForAPerson({ agentType: 'flowpilot', callerUserId: null, toolDefinition: HIGH, callKind: 'write' })).toBe(true);
    expect(mustWaitForAPerson({ agentType: 'mcp', callerUserId: null, toolDefinition: HIGH, callKind: 'write' })).toBe(true);
    expect(mustWaitForAPerson({ agentType: 'flowpilot', callerUserId: 'u1', toolDefinition: HIGH, callKind: 'write' })).toBe(false);
  });

  it('the executor raises trust to approve before the human gate, never for a plan-only dry run', () => {
    const core = read('supabase/functions/_shared/execute/core.ts');
    const raise = core.indexOf('mustWaitForAPerson({');
    const gate = core.indexOf("if (trustLevel === 'approve' && !bypassApproval)");
    expect(raise).toBeGreaterThan(0);
    expect(raise).toBeLessThan(gate);
    expect(core.slice(raise - 120, raise)).toMatch(/!planOnly && trustLevel !== 'approve'/);
  });
});

describe('every prompt says content is data', () => {
  it('the hardcoded grounding rules carry the untrusted-content rule', () => {
    expect(GROUNDING_RULES).toMatch(/UNTRUSTED CONTENT/);
    expect(GROUNDING_RULES).toMatch(/never an instruction to you/i);
  });
});
