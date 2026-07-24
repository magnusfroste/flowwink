import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: run checkpointing is durable, safe, and surfaced — and can never
 * break a run.
 *
 * Resumption Phase 1 (agent-resumption.md §2). agent_runs makes a harness run's
 * lifecycle durable (running → completed/failed/paused), keyed by the same
 * trace_id as the Trace. The reason loop writes it at start and in finally. The
 * one inviolable rule: bookkeeping must not break the loop — a run's success
 * cannot depend on recording that it succeeded.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('agent_runs checkpoint', () => {
  it('the table is keyed on trace_id and RLS-guarded', () => {
    const mig = read('supabase/migrations/20260723180000_agent-runs.sql');
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS public\.agent_runs/);
    expect(mig).toMatch(/trace_id text PRIMARY KEY/);
    expect(mig).toMatch(/status text NOT NULL DEFAULT 'running'/);
    expect(mig).toMatch(/ENABLE ROW LEVEL SECURITY/);
    // Paused runs are indexed for the resumer (Phase 2).
    expect(mig).toMatch(/WHERE status = 'paused'/);
  });

  it('the checkpoint helper never throws — bookkeeping cannot break a run', () => {
    const cp = read('supabase/functions/_shared/trace/checkpoint.ts');
    // Upsert keyed on trace_id; errors are logged, not thrown.
    expect(cp).toMatch(/onConflict: 'trace_id'/);
    // No throw statement in code (strip comments first — the file explains the
    // no-throw contract in prose).
    const code = cp.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
    expect(code).not.toMatch(/\bthrow\b/);
    expect(cp).toMatch(/Never throw/);
  });

  it('the reason loop checkpoints running at start and terminal in finally, wrapped', () => {
    const r = read('supabase/functions/_shared/pilot/reason.ts');
    expect(r).toMatch(/checkpointRun\(supabase, \{[\s\S]*status: 'running'/);
    // Terminal write lives in finally, defaults to 'failed', set to 'completed'
    // only on the clean path — a thrown error records 'failed'.
    expect(r).toMatch(/let runOutcome: 'completed' \| 'failed' = 'failed'/);
    expect(r).toMatch(/runOutcome = 'completed'/);
    const finallyBlock = r.slice(r.lastIndexOf('} finally {'));
    expect(finallyBlock).toMatch(/checkpointRun\(supabase, \{ traceId, status: runOutcome \}\)/);
    // Both calls are .catch()-guarded so they can't break the loop.
    expect(r).toMatch(/status: 'running',\s*\}\)\.catch\(\(\) => \{\}\)/);
  });

  it('the Trace read model overlays durable lifecycle, deriving for old runs', () => {
    const rm = read('supabase/functions/_shared/trace/read-model.ts');
    expect(rm).toMatch(/from\('agent_runs'\)/);
    expect(rm).toMatch(/lifecycle: string/);
    // Derived default for runs without a checkpoint (older than Phase 1).
    expect(rm).toMatch(/Default lifecycle derived from the steps/);
  });
});
