import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  backgroundErrorText,
  isRunReportTo,
  runOutcomeError,
  settleRun,
  STALE_RUN_MS,
  staleRunErrorText,
  type RunDb,
} from '../../../supabase/functions/_shared/execute/run-outcome.ts';

/**
 * Guardrail: a skill that fails in agent-execute's background (async: true)
 * run lands on the automation's last_error — also when the edge isolate is
 * shut down before anything could report (2026-10-29: the reply skill died
 * mid-run, no draft, no reply, no error anywhere). The dispatcher writes an
 * automation_pending_runs marker before the handoff, the run deletes it when
 * it answers, and a marker older than every wall clock is swept into
 * last_error.
 *
 * Live finding (2026-11-02): 'Auto-allocate picking on order paid' failed on
 * every paid order (an unresolved template reached a uuid parameter), but the
 * event-dispatcher hands event automations to agent-execute with async: true,
 * got 202, and wrote last_error: null — the failure lived only in the activity
 * log, so the automation read as healthy.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('runOutcomeError — one reader of a failed run', () => {
  it('reads a skill failure, a gate failure and a transport failure', () => {
    expect(runOutcomeError(true, 200, { status: 'failed', result: { error: 'invalid input syntax for type uuid' } }))
      .toBe('invalid input syntax for type uuid');
    expect(runOutcomeError(true, 200, { status: 'failed', result: {} })).toBe('skill failed');
    expect(runOutcomeError(false, 403, { error: 'Forbidden' })).toBe('Forbidden');
    expect(runOutcomeError(false, 502, {})).toBe('HTTP 502');
    expect(runOutcomeError(true, 200, { error: 'Skill not found' })).toBe('Skill not found');
  });

  it('a success, a refusal, a staged approval and the 202 handoff are not failures', () => {
    expect(runOutcomeError(true, 200, { status: 'success', result: {} })).toBeNull();
    expect(runOutcomeError(true, 200, { status: 'refused', code: 'MODULE_DISABLED', result: {} })).toBeNull();
    expect(runOutcomeError(true, 200, { status: 'pending_approval' })).toBeNull();
    expect(runOutcomeError(true, 202, { accepted: true, async: true })).toBeNull();
  });

  it('report_to names an automation by uuid, and the written text says it was a background run', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(isRunReportTo({ automation_id: id, event_id: id })).toBe(true);
    expect(isRunReportTo({ automation_id: 'x; drop' })).toBe(false);
    expect(isRunReportTo(null)).toBe(false);
    expect(isRunReportTo({ automation_id: id, run_id: id })).toBe(true);
    expect(isRunReportTo({ automation_id: id, run_id: null })).toBe(true);
    expect(isRunReportTo({ automation_id: id, run_id: "'; delete" })).toBe(false);
    expect(backgroundErrorText('boom', { automation_id: id, event_id: 'e1' })).toBe('boom (background run, event e1)');
    expect(backgroundErrorText('x'.repeat(2000), { automation_id: id }).length).toBeLessThan(1000);
  });
});

// agent-execute's own half (the async branch reads the answer with
// runOutcomeError and writes agent_automations.last_error) is pinned in
// executor-in-process.guardrails.test.ts, the wrapper's guard.
describe('settleRun — the outcome and the marker, idempotent', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const fakeDb = () => {
    const writes: Array<[string, string, Record<string, unknown> | null, string]> = [];
    const db: RunDb = {
      from: (table) => {
        const filter = (op: string, values: Record<string, unknown> | null) => {
          const p = Promise.resolve({ error: null });
          return Object.assign(p, { eq: (_c: string, v: string) => { writes.push([table, op, values, v]); return p; } });
        };
        return { update: (values) => filter('update', values), delete: () => filter('delete', null) };
      },
    };
    return { db, writes };
  };

  it('a failure writes last_error, then clears the marker; a success only clears it', async () => {
    const f = fakeDb();
    await settleRun(f.db, { automation_id: id, event_id: 'e1', run_id: id }, 'boom');
    expect(f.writes).toEqual([
      ['agent_automations', 'update', { last_error: 'boom (background run, event e1)' }, id],
      ['automation_pending_runs', 'delete', null, id],
    ]);
    const ok = fakeDb();
    await settleRun(ok.db, { automation_id: id, run_id: id }, null);
    expect(ok.writes).toEqual([['automation_pending_runs', 'delete', null, id]]);
  });

  it('no report_to writes nothing, and a broken client never throws into the run', async () => {
    const f = fakeDb();
    await settleRun(f.db, null, 'boom');
    expect(f.writes).toEqual([]);
    const broken: RunDb = { from: () => { throw new Error('down'); } };
    await expect(settleRun(broken, { automation_id: id }, 'boom')).resolves.toBeUndefined();
  });

  it('a stale marker is past both wall clocks (the handoff and the run, 150 s each) and says so', () => {
    expect(STALE_RUN_MS).toBeGreaterThanOrEqual(2 * 150_000);
    expect(staleRunErrorText({ skill_name: 'allocate_picking', event_id: 'e1', started_at: '2026-11-08T22:00:00Z' }))
      .toMatch(/never answered[\s\S]*allocate_picking[\s\S]*event e1/);
  });
});

describe('the dispatcher keeps the marker rail', () => {
  const d = read('supabase/functions/event-dispatcher/index.ts');

  it('writes the marker before the handoff and hands its id over', () => {
    const insertAt = d.indexOf('.from("automation_pending_runs")\n            .insert(');
    const fetchAt = d.indexOf('functions/v1/agent-execute');
    expect(insertAt, 'no marker insert').toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(fetchAt);
    expect(d).toMatch(/report_to: \{ automation_id: auto\.id, event_id: ev\.id, run_id: runId \}/);
  });

  it('sweeps markers older than STALE_RUN_MS into last_error, claiming by delete, on every run', () => {
    const sweepAt = d.indexOf('STALE_RUN_MS');
    expect(sweepAt).toBeGreaterThan(-1);
    // Before the early return for an empty batch: a quiet minute still sweeps.
    expect(sweepAt).toBeLessThan(d.indexOf('if (!events || events.length === 0)'));
    expect(d).toMatch(/\.from\("automation_pending_runs"\)\s*\.delete\(\)\s*\.lt\("started_at"/);
    expect(d).toMatch(/last_error: staleRunErrorText\(run\)/);
  });

  it('the marker table exists, service role only', () => {
    const dir = join(root, 'supabase/migrations');
    const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.automation_pending_runs \([\s\S]*automation_id uuid NOT NULL REFERENCES public\.agent_automations\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/ALTER TABLE public\.automation_pending_runs ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/REVOKE ALL ON public\.automation_pending_runs FROM anon, authenticated;/);
  });
});

describe('every async run names the automation its failure belongs to', () => {
  // Discover, don't enumerate: every edge function that hands agent-execute an
  // async run must say which automation the failure belongs to.
  it('every async caller of agent-execute sends report_to', () => {
    const walk = (dir: string): string[] => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith('.ts') ? [`${dir}/${d.name}`] : []);
    const callers: string[] = [];
    const missing: string[] = [];
    for (const file of walk('supabase/functions')) {
      if (file.startsWith('supabase/functions/agent-execute/')) continue;
      const src = read(file);
      for (const m of src.matchAll(/functions\/v1\/agent-execute/g)) {
        const win = src.slice(m.index!, m.index! + 2500);
        const bodyEnd = win.search(/\n\s*\}\);/);
        const call = bodyEnd > -1 ? win.slice(0, bodyEnd) : win;
        if (!/\basync:\s*(?!false)[^,\n]+/.test(call)) continue;
        callers.push(file);
        if (!/report_to/.test(call)) missing.push(file);
      }
    }
    expect(callers, 'the scanner found no async caller — the shape changed').toContain('supabase/functions/event-dispatcher/index.ts');
    expect(missing, `async agent-execute calls without report_to:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the event-dispatcher reads the outcome with the same reader', () => {
    const d = read('supabase/functions/event-dispatcher/index.ts');
    expect(d).toMatch(/runOutcomeError\(resp\.ok, resp\.status, out\)/);
  });
});
