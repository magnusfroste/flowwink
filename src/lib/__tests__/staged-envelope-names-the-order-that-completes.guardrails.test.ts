import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A double-gated skill (requires_staging AND trust_level=approve) passes two
 * gates in order: the operator confirms its own staged operation, then a HUMAN
 * approves the request the re-invoke creates. When the trust gate became
 * evidence-bound ("_approved=true is not an approval"), the staging envelope and
 * install_template's instructions kept telling operators to send
 * `_approved_operation_id` AND `_approved=true` straight away — a call that is
 * refused with `no_approved_request` every time (found by the process battery,
 * 2026-09-19, on a virgin install). An envelope is the agent's whole picture of
 * what to do next; it must name the order that completes.
 */

const root = join(__dirname, '../../..');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const artifact = JSON.parse(readFileSync(join(root, 'supabase/seed/module-skills.json'), 'utf8')) as {
  modules: Array<{ skills: Array<{ name: string; description?: string; instructions?: string }> }>;
};

describe('the staging envelope names the order that completes', () => {
  const start = agentExecute.indexOf('staged: true,');
  const envelope = agentExecute.slice(agentExecute.lastIndexOf('const isDoubleGated', start), agentExecute.indexOf('status: 202', start));

  it('finds the envelope', () => {
    expect(start).toBeGreaterThan(-1);
    expect(envelope.length).toBeGreaterThan(400);
  });

  it('the immediate re-invoke never carries _approved: true', () => {
    const reinvoke = envelope.match(/reinvoke_args:\s*([^\n]+)/)?.[1] ?? '';
    expect(reinvoke).toMatch(/_approved_operation_id/);
    expect(reinvoke).not.toMatch(/_approved:\s*true/);
    expect(envelope).not.toMatch(/BOTH flags/);
  });

  it('a double-gated skill is told about the human gate and the ticket it must bring back', () => {
    expect(envelope).toMatch(/pending_approval/);
    expect(envelope).toMatch(/_approval_request_id/);
    expect(envelope).toMatch(/Do NOT pass _approved=true yet/);
  });

  it('no skill text tells an operator to send both flags at once', () => {
    const lying = artifact.modules.flatMap((m) => m.skills)
      .filter((s) => /BOTH _approved_operation_id/i.test(`${s.description ?? ''} ${s.instructions ?? ''}`))
      .map((s) => s.name);
    expect(lying).toEqual([]);
  });
});
