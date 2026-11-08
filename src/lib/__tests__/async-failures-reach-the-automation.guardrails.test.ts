import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  backgroundErrorText,
  isRunReportTo,
  runOutcomeError,
} from '../../../supabase/functions/_shared/execute/run-outcome.ts';

/**
 * Guardrail: a skill that fails in agent-execute's background (async: true)
 * run lands on the automation's last_error.
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
    expect(backgroundErrorText('boom', { automation_id: id, event_id: 'e1' })).toBe('boom (background run, event e1)');
    expect(backgroundErrorText('x'.repeat(2000), { automation_id: id }).length).toBeLessThan(1000);
  });
});

// agent-execute's own half (the async branch reads the answer with
// runOutcomeError and writes agent_automations.last_error) is pinned in
// executor-in-process.guardrails.test.ts, the wrapper's guard.
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
    expect(d).toMatch(/report_to: \{ automation_id: auto\.id, event_id: ev\.id \}/);
    expect(d).toMatch(/runOutcomeError\(resp\.ok, resp\.status, out\)/);
  });
});
