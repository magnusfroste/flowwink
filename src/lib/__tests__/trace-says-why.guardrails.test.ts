import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FlowPilot review step 2b: a run's trace says WHY, not only what.
 * The loop's decisions went to console.log and were lost; now every decision
 * point writes one plain sentence to agent_trace_events, the read model returns
 * them with the run, and the Trace tab shows them above the steps.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the loop records its decisions', () => {
  const r = read('supabase/functions/_shared/pilot/reason.ts');
  it('creates a recorder per run and flushes it on every exit path', () => {
    expect(r).toMatch(/const why = createTraceRecorder\(supabase, traceId\)/);
    const fin = r.lastIndexOf('} finally {');
    expect(r.slice(fin)).toMatch(/await why\.flush\(\)/);
  });
  it('every guard that writes a console line also writes a decision', () => {
    for (const kind of ['tool_refused', 'circuit_broken', 'cadence_refused', 'loop_detected', 'not_retried', 'retried', 'error_loop_stopped', 'budget_stop', 'skill_search', 'final_answer', 'run_started']) {
      expect(r, kind).toMatch(new RegExp(`why\\.add\\('${kind}'`));
    }
  });
  it('the recorder never throws and writes once', () => {
    const e = read('supabase/functions/_shared/trace/events.ts');
    expect(e).toMatch(/if \(flushed \|\| !supabase \|\| !traceId \|\| buffer\.length === 0\) return;/);
    expect(e).toMatch(/console\.error\(`\[trace-events\]/);
  });
});

describe('the trace returns and shows them', () => {
  it('the table exists, admin-readable, service-written', () => {
    const f = readdirSync(join(root, 'supabase/migrations')).find((n) => n.includes('trace-events-say-why'));
    expect(f).toBeTruthy();
    const sql = read(`supabase/migrations/${f}`);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.agent_trace_events/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/);
    expect(sql).toMatch(/REVOKE ALL ON public\.agent_trace_events FROM anon/);
  });
  it('getRun returns the events next to the steps', () => {
    expect(read('supabase/functions/_shared/trace/read-model.ts')).toMatch(/from\('agent_trace_events'\)[\s\S]{0,200}\.eq\('trace_id', traceId\)/);
  });
  it('the Trace tab renders the Why list above the steps', () => {
    const tab = read('src/components/admin/copilot/FlowPilotTraceTab.tsx');
    expect(tab).toMatch(/<WhyList events=\{run\.events \?\? \[\]\} \/>\s*\{run\.steps\.map/);
    expect(tab).toMatch(/'flowwork'/);
  });
  it('a FlowChat turn is one run in the Trace', () => {
    const op = read('supabase/functions/agent-operate/index.ts');
    expect(op).toMatch(/const operateTraceId = generateTraceId\('flowchat'\)/);
    expect(op).not.toMatch(/executeBuiltInTool\([^)]*, undefined, \{ callerUserId/);
  });
});
