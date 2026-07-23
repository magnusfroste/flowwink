import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';

/**
 * Guardrail: the Trace stays a read-only, harness-level primitive.
 *
 * The Trace (agent-harness.md §4, H10 → product) turns the proof-week
 * debugging method — read the harness's own logs — into a surface. Its whole
 * safety rests on two properties that must not erode:
 *   1. It is READ-ONLY and DERIVED — it renders runs, never writes or gates.
 *   2. It is PLATFORM-level (scope 'both'), so external operators can trace
 *      their own runs through the gateway — not buried in flowpilot-module.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('agent Trace read model', () => {
  it('get_agent_trace is a platform skill, read-only, gateway-reachable', () => {
    const skill = PLATFORM_SKILLS.find((s) => s.name === 'get_agent_trace');
    expect(skill, 'get_agent_trace missing from platform seeds').toBeTruthy();
    expect(skill?.handler).toBe('internal:get_agent_trace');
    expect(skill?.trust_level).toBe('auto');
    // scope 'both' = internal FlowPilot AND external gateway operators.
    expect(skill?.scope).toBe('both');
  });

  it('the read model never writes — no insert/update/delete/upsert', () => {
    const rm = read('supabase/functions/_shared/trace/read-model.ts');
    expect(rm).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    // It groups on the trace_id column, not the jsonb path (the whole point of
    // promoting trace_id to a column).
    expect(rm).toMatch(/\.eq\('trace_id', traceId\)/);
    expect(rm).toMatch(/health: failed === 0 \? 'ok'/);
  });

  it('trace_id is a real indexed column, backfilled from input', () => {
    const mig = read('supabase/migrations/20260723160000_agent-activity-trace-id.sql');
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS trace_id text/);
    expect(mig).toMatch(/idx_agent_activity_trace_id/);
    expect(mig).toMatch(/SET trace_id = input ->> 'trace_id'/);
    // agent-execute writes the column, mirroring input.trace_id.
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toMatch(/trace_id: activity\.trace_id \|\|/);
  });

  it('the dispatch is wired', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toContain("handler === 'internal:get_agent_trace'");
    expect(ae).toContain('executeAgentTrace(supabase');
  });
});
