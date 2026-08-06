/**
 * The agent-surface sweep's judgement, tested without an instance.
 *
 * The sweep itself needs a live gateway — that is the point of it. But the two
 * decisions that make it useful or useless are pure functions, and they are
 * what CI can hold:
 *
 *   classify()            — is this failure a defect or a fact about the instance?
 *   diffAgainstBaseline() — is this a regression, or pre-existing debt?
 *
 * Get the first wrong and the guard cries wolf on a missing Gmail connection.
 * Get the second wrong and it is red from day one with 41 known failures, which
 * means nobody reads it — the same way a noisy alert stops being an alert.
 *
 * Every error string below is verbatim from the first live sweep of 234 skills.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — bun script, consumed here for its pure helpers
import { classify, probeFor, diffAgainstBaseline } from '../../../scripts/agent-surface-sweep.ts';

describe('classify — a defect versus a fact about the instance', () => {
  it('calls a skill that cannot run at all broken', () => {
    // get_blog_rss_url: handler `builtin:site_meta`, and the string `builtin:`
    // appears nowhere in agent-execute. Registered, discoverable, unrunnable.
    expect(classify('Unknown handler type: builtin:site_meta')).toBe('broken');
    // auto_mark_invoice_paid: everything static checks out and the call fails.
    expect(classify('RPC auto_mark_invoice_paid failed: Could not find the function public.auto_mark_invoice_paid without parameters in the schema cache')).toBe('broken');
  });

  it('does NOT blame the platform for a missing integration or session', () => {
    // A fresh install legitimately has no Gmail and no portal login. Treating
    // these as defects is how a guard earns its way onto the ignore list.
    expect(classify('Gmail not connected')).toBe('environment');
    expect(classify('You must be signed in as a company contact for this.')).toBe('environment');
    expect(classify('No user_id available')).toBe('environment');
  });

  it('separates a schema that under-describes its own runtime', () => {
    // Ten skills failed this way, and every error message enumerated the legal
    // values — the information exists, just not where an agent reads it first.
    expect(classify('Unknown inventory action: list')).toBe('contract_gap');
    expect(classify('Unknown blog categories action: list')).toBe('contract_gap');
    expect(classify('RPC manage_service_sla failed: action must be set | status | list_breaches (got list)')).toBe('contract_gap');
    expect(classify("Unknown action 'list'. Supported: create, update, delete, get.")).toBe('contract_gap');
    // Required-but-undeclared, the either/or shape JSON Schema cannot express.
    expect(classify('Provide p_lead_id or p_email')).toBe('contract_gap');
    expect(classify('product_id is required for list')).toBe('contract_gap');
  });

  it('treats no error as ok', () => {
    expect(classify(null)).toBe('ok');
    expect(classify(undefined)).toBe('ok');
    expect(classify('')).toBe('ok');
  });

  it('recognises the calibration cases the first full sweep exposed', () => {
    // My first classifier called all of these broken. A live run over 262
    // skills showed otherwise — the instrument needed calibrating against
    // reality, exactly like the duplicate-title threshold.
    expect(classify('No bot_token provided or stored.')).toBe('environment');
    expect(classify('RPC mcp_revalue_open_balances failed: No base currency configured')).toBe('environment');
    expect(classify('contentBase64 and mimeType required')).toBe('contract_gap');
    // Third calibration: "requires" is not "required". These two read as
    // missing functions on one probe and as undeclared parameters on another,
    // depending on the arguments sent — the error text is the only signal, so
    // the pattern has to cover both spellings.
    expect(classify('RPC kb_article_history failed: list requires p_slug or p_article_id')).toBe('contract_gap');
    expect(classify('RPC wiki_page_history failed: list requires p_slug')).toBe('contract_gap');
  });

  it('gives a failure with no message its own name', () => {
    // Three skills answer status=failed with nothing attached. An agent
    // receiving that cannot self-correct, which is the entire reason the RPC
    // errors elsewhere were enriched. Calling it "broken" would hide it among
    // the missing-function cases; it is a different defect.
    expect(classify('None')).toBe('silent_failure');
    expect(classify('null')).toBe('silent_failure');
    expect(classify('unknown failure')).toBe('silent_failure');
  });

  it('defaults an unrecognised failure to broken, not to ok', () => {
    // Silence is the dangerous direction. An unclassifiable failure should
    // surface, not disappear.
    expect(classify('something nobody has seen before')).toBe('broken');
  });
});

describe('probeFor — never probe anything that sends, deletes or charges', () => {
  const skill = (name: string, params: Record<string, unknown> = {}) => ({
    name,
    tool_definition: { function: { parameters: params } },
  });

  it.each([
    'send_email_to_lead', 'merge_leads', 'refund_return', 'delete_page',
    'bulk_invoice_from_timesheets', 'hire_candidate', 'approve_company_quote',
    'publish_scheduled_content', 'reset_demo_data',
  ])('refuses to probe %s', (name) => {
    expect(probeFor(skill(name, { properties: {}, required: [] }))).toBeNull();
  });

  it('probes a no-argument skill with an empty object', () => {
    expect(probeFor(skill('lead_pipeline_review', { properties: {}, required: [] }))).toBe('{}');
  });

  it('probes an action-shaped skill with list, the convention across the API', () => {
    expect(probeFor(skill('manage_leads', { properties: { action: {} }, required: ['action'] })))
      .toBe('{"action":"list"}');
    expect(probeFor(skill('manage_pipeline_stage', { properties: { p_action: {} }, required: ['p_action'] })))
      .toBe('{"p_action":"list"}');
  });

  it('skips skills that need an entity we would have to invent', () => {
    // Probing these would mean fabricating a UUID, which tests nothing real.
    expect(probeFor(skill('list_quote_revisions', { properties: { quote_id: {} }, required: ['quote_id'] })))
      .toBeNull();
  });
});

describe('diffAgainstBaseline — regression, not absolute failure', () => {
  const base = { alpha: 'ok', beta: 'contract_gap', gamma: 'ok', delta: 'broken' } as Record<string, 'ok' | 'broken' | 'contract_gap' | 'environment'>;
  const r = (skill: string, outcome: string) => ({ module: 'm', skill, outcome } as never);

  it('flags a skill that worked before and does not now', () => {
    const { regressions } = diffAgainstBaseline(base, [r('alpha', 'broken')]);
    expect(regressions.map((x: never) => (x as { skill: string }).skill)).toEqual(['alpha']);
  });

  it('does NOT flag pre-existing debt — that is the whole point', () => {
    // 41 known failures on day one. A gate demanding zero would be ignored by
    // day two.
    const { regressions, newlyBroken } = diffAgainstBaseline(base, [r('beta', 'contract_gap'), r('delta', 'broken')]);
    expect(regressions).toEqual([]);
    expect(newlyBroken).toEqual([]);
  });

  it('does NOT call an instance without a connected integration a regression', () => {
    // ok → environment means someone disconnected Gmail, not that we broke it.
    const { regressions } = diffAgainstBaseline(base, [r('alpha', 'environment')]);
    expect(regressions).toEqual([]);
  });

  it('counts a new silent failure as newly broken too', () => {
    const { newlyBroken } = diffAgainstBaseline(base, [r('theta', 'silent_failure')]);
    expect(newlyBroken.map((x: never) => (x as { skill: string }).skill)).toEqual(['theta']);
  });

  it('flags a NEW skill that arrives already broken', () => {
    // Otherwise every new broken skill enters the codebase for free, and the
    // baseline only ever grows.
    const { newlyBroken } = diffAgainstBaseline(base, [r('epsilon', 'broken'), r('zeta', 'contract_gap')]);
    expect(newlyBroken.map((x: never) => (x as { skill: string }).skill)).toEqual(['epsilon', 'zeta']);
  });

  it('lets a new healthy skill in silently', () => {
    const { newlyBroken, regressions } = diffAgainstBaseline(base, [r('eta', 'ok')]);
    expect(newlyBroken).toEqual([]);
    expect(regressions).toEqual([]);
  });

  it('reports recoveries without failing the run', () => {
    const { recoveries, regressions } = diffAgainstBaseline(base, [r('beta', 'ok'), r('delta', 'ok')]);
    expect(recoveries.map((x: never) => (x as { skill: string }).skill)).toEqual(['beta', 'delta']);
    expect(regressions).toEqual([]);
  });
});

describe('the sweep is wired to be runnable, not decorative', () => {
  const src = readFileSync(join(process.cwd(), 'scripts/agent-surface-sweep.ts'), 'utf-8');

  it('refuses to run without a live instance rather than passing vacuously', () => {
    // A sweep that "succeeds" with no gateway is worse than none: it reports
    // health it never measured. This is the pg_cron lesson — `succeeded` meant
    // dispatched, not done.
    expect(src).toMatch(/if \(!url \|\| !key\)/);
    expect(src).toMatch(/process\.exit\(2\)/);
  });

  it('exits non-zero only on regressions or newly broken skills', () => {
    expect(src).toMatch(/if \(regressions\.length \|\| newlyBroken\.length\) process\.exit\(1\)/);
  });

  it('has a timeout on every probe so one hanging skill cannot stall the sweep', () => {
    expect(src).toMatch(/AbortSignal\.timeout/);
  });
});
