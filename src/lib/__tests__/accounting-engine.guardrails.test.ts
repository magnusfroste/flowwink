import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Accounting-engine guardrails (robustness review 2026-07-08).
 *
 * Bug class: the propose (read) and book (write) surfaces drifting apart, and
 * money-math that balances but no longer ties to the real bank amount.
 * Confirmed instances fixed that day:
 *   C1 — manage_journal_entry create kept an OLD substring template scorer
 *        after propose_bookkeeping got the word-boundary one → the surface
 *        that BOOKS could auto-book to the wrong account.
 *   H1 — gross→net→gross rounding drifted the 19xx bank leg 1 öre off the
 *        actual bank transaction (entry balanced, reconciliation didn't).
 *   H2 — read-then-write idempotency guard allowed concurrent double-booking.
 *   H4 — counterparty trust-ramp counts pulled every booked row client-side
 *        and silently truncated at PostgREST's row cap.
 *
 * Source-level tripwires: cheap, DB-free, fire the moment a refactor
 * reintroduces the seam. If you trip one deliberately, fix BOTH surfaces and
 * this test in the same commit.
 */

const ROOT = join(__dirname, '..', '..', '..');
const engine = readFileSync(join(ROOT, 'supabase/functions/agent-execute/index.ts'), 'utf8');

describe('accounting-engine guardrails', () => {
  it('C1: exactly ONE template scorer exists — the shared word-boundary acctScoreTemplates', () => {
    // The old inline scorer's signature move was raw infix keyword matching
    // ('el' ∈ 'webbhotell'). Its tell-tale expressions must not reappear.
    expect(engine).not.toContain('kwLower.includes(sw) || sw.includes(kwLower)');
    expect(engine).not.toContain('nw.includes(sw) || sw.includes(nw)');
    // Both surfaces call the shared scorer: definition + ≥2 call sites.
    const calls = engine.split('acctScoreTemplates(').length - 1;
    expect(calls, 'expected the shared scorer to be defined and called from BOTH propose and book surfaces').toBeGreaterThanOrEqual(3);
  });

  it('C1b: the book surface derives confidence from the scorer, not an ad-hoc normalization', () => {
    // The old path normalized score/maxPossibleScore*100 — a second,
    // disagreeing confidence calibration. It must stay gone.
    expect(engine).not.toContain('maxPossibleScore');
  });

  it('H1: template expansion pins the 19xx bank leg to the actual gross', () => {
    // acctExpandTemplateLines must accept the known gross and pin the bank
    // line to it, absorbing rounding on a NON-bank line.
    // Match the PARAMETERS, not their types: this guard is about the known
    // gross reaching the expander, and pinning `tplLines` to a real row type
    // must not have to come back through here to do it.
    expect(engine).toMatch(
      /function acctExpandTemplateLines\(\s*tplLines:[^,]+,\s*baseCents: number,\s*grossCents\?: number,?\s*\)/,
    );
    const fnStart = engine.indexOf('function acctExpandTemplateLines');
    const fnBody = engine.slice(fnStart, fnStart + 2500);
    expect(fnBody, 'bank-leg pinning: the 19xx line must be set to grossCents when known').toContain("startsWith('19')");
    expect(fnBody, 'rounding must be absorbed by a non-bank line').toContain('candidates.length > 0 ? candidates : out');
  });

  it('H1b: the create path passes the bank gross into expansion', () => {
    // Both expansion call sites in manage_journal_entry create must forward
    // bankTxGrossCents so a bank-event booking ties to the statement.
    const createCalls = engine.match(/acctExpandTemplateLines\([^)]*bankTxGrossCents\)/g) ?? [];
    expect(createCalls.length, 'both create-path expansions (explicit template + auto-book) must pass bankTxGrossCents').toBeGreaterThanOrEqual(2);
  });

  it('H2: the bank-event link is an atomic conditional claim, not a blind update', () => {
    // The link update must carry the null-predicate so a concurrent booking
    // loses the claim instead of double-booking, and the loser must compensate.
    const linkIdx = engine.indexOf("journal_entry_id: entry.id, status: 'matched'");
    expect(linkIdx, 'bank-tx link update must exist').toBeGreaterThan(-1);
    const linkBlock = engine.slice(linkIdx, linkIdx + 1200);
    expect(linkBlock).toContain(".is('journal_entry_id', null)");
    expect(linkBlock, 'race loser must delete its own entry (compensation)').toContain("from('journal_entries').delete()");
  });

  it('H4: counterparty trust-ramp counts come from a SQL aggregate, not a row pull', () => {
    expect(engine).toContain("rpc('booked_counterparty_counts')");
    // The fallback row-pull may remain for fail-forward, but the aggregate
    // must be attempted first (rpc call appears before the fallback select).
    const rpcIdx = engine.indexOf("rpc('booked_counterparty_counts')");
    const fallbackIdx = engine.indexOf(".select('counterparty')");
    expect(rpcIdx).toBeGreaterThan(-1);
    if (fallbackIdx > -1) expect(rpcIdx).toBeLessThan(fallbackIdx);
  });

  it('M4: template usage_count increments go through the atomic RPC first', () => {
    const atomicCalls = engine.split("rpc('increment_template_usage'").length - 1;
    expect(atomicCalls, 'both create-path usage increments must try the atomic RPC').toBeGreaterThanOrEqual(2);
  });

  it('H3: the MCP gateway enforces API-key scopes on the REST execute paths', () => {
    const gateway = readFileSync(join(ROOT, 'supabase/functions/mcp-server/index.ts'), 'utf8');
    expect(gateway).toContain('function scopeAllowsSkill(');
    const enforcements = gateway.split('scopeAllowsSkill(').length - 1;
    expect(enforcements, 'scope check must guard both the dispatcher and direct execute paths (definition + ≥2 call sites)').toBeGreaterThanOrEqual(3);
    // Fail-forward semantics must stay: wildcard keys keep full access.
    expect(gateway).toContain('"mcp:*"');
  });
});
