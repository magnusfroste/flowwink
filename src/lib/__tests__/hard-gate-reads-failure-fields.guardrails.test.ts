import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * Guardrail: the outcome hard gate reads the fields that say how a run went,
 * never the whole output as a string.
 *
 * Live finding (optic, 2026-10-13 → 10-19): project_portfolio_brief returns the
 * portfolio — task titles and UUIDs. Every UUID is hex, so most outputs
 * "contain 403" or "429" somewhere, and the gate searched the serialized output
 * for those substrings. The brief was scored NEGATIVE on every run; three in a
 * row tripped the consecutive-failure escalation, which sets
 * agent_skills.enabled = false. FlowPilot switched off Peter's portfolio sensor
 * every night (and sync_skills_from_code with it), an admin page load switched
 * them back on, and in between the gateway hid the disabled skill from Hermes.
 *
 * Locked here: the gate is a function of status/code and error/message/reason
 * fields; a bare number in prose or an id never trips it; a real 403 does.
 */
const H = await import('../../../supabase/functions/_shared/pilot/handlers.ts');
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/portfolio-brief-output-optic-2026-10-18.json'), 'utf8'));

describe('outcome hard gate', () => {
  it("the optic portfolio brief that was scored negative for a week is not a failure", () => {
    expect(JSON.stringify(fixture)).toMatch(/403|429/); // the trap is still in the data
    expect(H.isHardGateFailure(fixture)).toBe(false);
  });

  it('ids, counts and prose numbers never trip it', () => {
    expect(H.isHardGateFailure({ tasks: [{ id: '94f23d49-5015-4f3e-95cb-6ceabf14037f' }] })).toBe(false);
    expect(H.isHardGateFailure({ message: 'Imported 401 contacts, 403 skipped' })).toBe(false);
    expect(H.isHardGateFailure({ summary: 'timeout handling improved', count: 429 })).toBe(false);
    expect(H.isHardGateFailure({ status: 'success', result: { note: 'rate_limited is a word in a note', id: '0429' } })).toBe(false);
    expect(H.isHardGateFailure(null)).toBe(false);
  });

  it('a real failure, said in a status or error field, does', () => {
    expect(H.isHardGateFailure({ status: 403 })).toBe(true);
    expect(H.isHardGateFailure({ status_code: '429' })).toBe(true);
    expect(H.isHardGateFailure({ error: 'HTTP 403 from provider' })).toBe(true);
    expect(H.isHardGateFailure({ error: '429 Too Many Requests' })).toBe(true);
    expect(H.isHardGateFailure({ error: 'Unauthorized' })).toBe(true);
    expect(H.isHardGateFailure({ result: { error: { code: 401 } } })).toBe(true);
    expect(H.isHardGateFailure({ status: 'rate_limited' })).toBe(true);
    expect(H.isHardGateFailure({ message: 'request timed out after 30s' })).toBe(true);
  });

  it('the source carries no whole-output substring search any more', () => {
    const src = readFileSync(join(__dirname, '../../../supabase/functions/_shared/pilot/handlers.ts'), 'utf8');
    expect(src).not.toMatch(/HARD_GATE_PATTERNS/);
    expect(src).not.toMatch(/outputStr\.includes/);
    // and the escalation reads FlowPilot's own history, like the evaluation does
    const esc = src.slice(src.indexOf('Consecutive Failure Escalation'), src.indexOf('Auto-pause the skill'));
    expect(esc.match(/\.eq\('agent', 'flowpilot'\)/g)?.length).toBe(2);
  });
});
