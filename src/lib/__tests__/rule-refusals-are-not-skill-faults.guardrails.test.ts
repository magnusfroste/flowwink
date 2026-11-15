import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyAgentError,
  classifyRuleRefusal,
  RAISE_EXCEPTION_SQLSTATE,
} from '../../../supabase/functions/_shared/agent-errors';
import { NOT_A_SKILL_FAULT, selfHealCandidates } from '../../../supabase/functions/_shared/skills/skill-visibility';
import { machineRoomReports } from '../../../supabase/functions/_shared/feedback/machine-room-reports';

/**
 * Guardrail: a rule the database keeps is not a broken skill.
 *
 * 2026-11-14: book_appointment_slot, register_webinar and pay_vendor_invoice
 * answered their own rules — a taken slot, a full webinar, a bill not yet
 * approved — with RAISE EXCEPTION, and the message classifier called every one
 * HANDLER_ERROR. Three visitors in a row on a taken slot were a self-healing
 * streak that switches the public booking off, and the process battery's
 * deliberate refusals reached www's board as "Skill failing" 51 times. The
 * shape, not the wording, says which it is: SQLSTATE P0001 (or an RPC's own
 * { success: false, error }) is a rule kept; another SQLSTATE is a crash.
 */

// The messages exactly as the database raises them (book_appointment_slot's
// booking_rules trigger, webinar_registration_gate, the vendor invoice
// state machine, pay_vendor_invoice's own answer).
const RULE_MESSAGES = [
  'slot_unavailable: 2026-11-17 10:00 overlaps an existing booking',
  'slot_unavailable: 03:00 – 04:00 (Europe/Stockholm) is outside opening hours',
  'slot_unavailable: 2026-11-24 is blocked (closed that day)',
  'slot_unavailable: 2020-01-07 10:00 is in the past',
  'webinar not open for registration',
  'webinar is full (2 of 2 seats taken)',
  'Vendor invoice LF-1: status received -> paid is not a legal step. Paid is reachable only from approved.',
  'Invoice LF-3 is under dispute — paying it now is the mistake the dispute exists to prevent.',
];

describe('a rule the database keeps is not a broken skill', () => {
  it('the message classifier alone cannot name these — which is why the shape decides', () => {
    for (const m of RULE_MESSAGES) expect(classifyAgentError(m).code, m).toBe('HANDLER_ERROR');
  });

  it('a refusal the database answered on purpose is RULE_REFUSED, not retried as is', () => {
    for (const m of RULE_MESSAGES) {
      const c = classifyRuleRefusal(m);
      expect(c.code, m).toBe('RULE_REFUSED');
      expect(c.retryable).toBe(false);
      expect(c.hint).toMatch(/rules/);
    }
  });

  it('the message rules still win where they know more', () => {
    expect(classifyRuleRefusal('Vendor invoice already paid').code).toBe('ALREADY_EXISTS');
    expect(classifyRuleRefusal('Only admins can approve payroll').code).toBe('FORBIDDEN');
    expect(classifyRuleRefusal('Period 2026-10 is closed').code).toBe('PERIOD_LOCKED');
  });

  it('RULE_REFUSED never counts toward self-healing', () => {
    expect(NOT_A_SKILL_FAULT.has('RULE_REFUSED')).toBe(true);
    const taken = { skill_name: 'book_appointment_slot', status: 'failed', code: 'RULE_REFUSED' };
    expect(selfHealCandidates([taken, taken, taken, taken], 3)).toEqual([]);
    const crash = { skill_name: 'book_appointment_slot', status: 'failed', code: 'HANDLER_ERROR' };
    expect(selfHealCandidates([crash, taken, crash, crash], 3)).toEqual([{ name: 'book_appointment_slot', streak: 3 }]);
  });

  it('the machine room reads the stored code before re-reading the message', () => {
    const none = { jobs: [], pulse: { starving: false } };
    const refused = RULE_MESSAGES.slice(0, 4).map((m) => ({ skill_name: 'book_appointment_slot', error_message: m, code: 'RULE_REFUSED' }));
    expect(machineRoomReports({ ...none, failures: refused })).toEqual([]);
    // A row journaled before the code existed falls back to the message.
    const legacy = [1, 2, 3].map(() => ({ skill_name: 'x', error_message: 'column "foo" does not exist', code: null }));
    expect(machineRoomReports({ ...none, failures: legacy })).toEqual([]); // NOT_FOUND by the message
    const crashed = [1, 2, 3].map(() => ({ skill_name: 'x', error_message: 'null value in column "id" violates not-null constraint', code: null }));
    expect(machineRoomReports({ ...none, failures: crashed }).map((r) => r.title)).toEqual(['Skill failing: x']);
  });

  it('the machine room selects the stored code', () => {
    const src = readFileSync('supabase/functions/_shared/feedback/machine-room-reports.ts', 'utf8');
    expect(src).toMatch(/select\('skill_name, error_message, code:output->>code'\)/);
  });

  it('the rpc executor classifies by SQLSTATE and by the function\'s own "no"', () => {
    expect(RAISE_EXCEPTION_SQLSTATE).toBe('P0001');
    const core = readFileSync('supabase/functions/_shared/execute/core.ts', 'utf8');
    const at = core.indexOf('await supabase.rpc(fnName, rpcArgs)');
    expect(at).toBeGreaterThan(0);
    const rpc = core.slice(at, core.indexOf('Unknown handler type: ${handler}', at));
    expect(rpc).toMatch(/code\s*===\s*RAISE_EXCEPTION_SQLSTATE[\s\S]*classifyRuleRefusal\(rpcErr\.message\)/);
    expect(rpc).toMatch(/success\s*===\s*false[\s\S]*typeof answered\.code !== 'string'[\s\S]*classifyRuleRefusal\(answered\.error\)/);
  });
});
