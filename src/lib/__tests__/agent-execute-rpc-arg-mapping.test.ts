/**
 * Guardrail: RPC argument mapping in agent-execute.
 *
 * The `rpc:` handler branch must:
 *   1. Strip underscore-prefixed agent-internal fields (_caller_user_id,
 *      _approved, _bypass_approval, _objective_context, etc.) — never
 *      forward them as `p__caller_user_id` (double-underscore breaks
 *      Postgres function-signature lookup).
 *   2. Strip top-level meta fields `trace_id` and `objective_context`.
 *   3. Prefix all remaining args with `p_`, unless they already start with `p_`.
 *
 * If this contract changes, mirror the change in
 * supabase/functions/agent-execute/index.ts (lines ~214-225).
 */
import { describe, expect, it } from 'vitest';

/** Mirror of the rpc-arg mapping logic in agent-execute/index.ts */
function mapRpcArgs(args: Record<string, unknown>): Record<string, unknown> {
  const rpcArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (k.startsWith('_')) continue;
    if (k === 'trace_id' || k === 'objective_context') continue;
    rpcArgs[k.startsWith('p_') ? k : `p_${k}`] = v;
  }
  return rpcArgs;
}

describe('rpc arg mapping', () => {
  it('prefixes plain arg names with p_', () => {
    const out = mapRpcArgs({
      project_id: 'abc',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
    });
    expect(out).toEqual({
      p_project_id: 'abc',
      p_start_date: '2026-04-01',
      p_end_date: '2026-04-30',
    });
  });

  it('does NOT double-prefix args already starting with p_', () => {
    const out = mapRpcArgs({ p_project_id: 'abc', p_due_days: 30 });
    expect(out).toEqual({ p_project_id: 'abc', p_due_days: 30 });
    expect(Object.keys(out)).not.toContain('p_p_project_id');
  });

  it('strips _caller_user_id (the original bug — never produce p__caller_user_id)', () => {
    const out = mapRpcArgs({
      project_id: 'abc',
      _caller_user_id: 'user-123',
    });
    expect(out).toEqual({ p_project_id: 'abc' });
    expect(Object.keys(out)).not.toContain('p__caller_user_id');
    expect(Object.keys(out)).not.toContain('_caller_user_id');
  });

  it('strips all underscore-prefixed agent-internal fields', () => {
    const out = mapRpcArgs({
      project_id: 'abc',
      _caller_user_id: 'u1',
      _approved: true,
      _bypass_approval: false,
      _objective_context: { goal: 'x' },
      _anything_else: 'leak?',
    });
    expect(out).toEqual({ p_project_id: 'abc' });
    for (const key of Object.keys(out)) {
      expect(key.startsWith('p__')).toBe(false);
    }
  });

  it('strips trace_id and objective_context (top-level meta, no underscore)', () => {
    const out = mapRpcArgs({
      project_id: 'abc',
      trace_id: 'trace-xyz',
      objective_context: { goal: 'g', step: 's', why: 'w' },
    });
    expect(out).toEqual({ p_project_id: 'abc' });
    expect(Object.keys(out)).not.toContain('p_trace_id');
    expect(Object.keys(out)).not.toContain('p_objective_context');
  });

  it('handles bulk_invoice_from_timesheets signature end-to-end', () => {
    // Real-world payload that previously failed with "p__caller_user_id"
    const out = mapRpcArgs({
      project_id: 'c8b04c1b-357f-459f-bf52-de9ac465c853',
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      group_by: 'entry',
      due_days: 30,
      _caller_user_id: 'dc6f06cf-2b29-4b11-8cd1-59ef811c1a47',
      trace_id: 't-1',
    });
    expect(out).toEqual({
      p_project_id: 'c8b04c1b-357f-459f-bf52-de9ac465c853',
      p_start_date: '2026-04-01',
      p_end_date: '2026-04-30',
      p_group_by: 'entry',
      p_due_days: 30,
    });
  });

  it('preserves falsy and complex values', () => {
    const out = mapRpcArgs({
      flag: false,
      count: 0,
      empty: '',
      nothing: null,
      payload: { nested: true },
      _caller_user_id: 'u',
    });
    expect(out).toEqual({
      p_flag: false,
      p_count: 0,
      p_empty: '',
      p_nothing: null,
      p_payload: { nested: true },
    });
  });

  it('returns empty object for empty/missing args', () => {
    expect(mapRpcArgs({})).toEqual({});
    expect(mapRpcArgs({ _only: 'internal', trace_id: 't' })).toEqual({});
  });

  it('never produces a key starting with p__', () => {
    const inputs = [
      { _caller_user_id: 'x' },
      { _approved: true, _bypass_approval: false },
      { project_id: 'p', _caller_user_id: 'u' },
    ];
    for (const input of inputs) {
      const out = mapRpcArgs(input);
      for (const key of Object.keys(out)) {
        expect(key).not.toMatch(/^p__/);
      }
    }
  });
});
