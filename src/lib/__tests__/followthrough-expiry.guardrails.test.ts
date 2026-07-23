import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: an approved action never strands silently.
 *
 * Resumption Phase 0 (agent-resumption.md §0.A). The approval follow-through
 * re-executes human-approved actions before the operator reasons — but only
 * within a window (48h). Approvals that age out of that window used to sit in
 * status='approved' forever: a silent graveyard (liteit 1, www 2, for weeks).
 *
 * Re-running an aged-out approval is UNSAFE — it is either stale (a 6-week-old
 * social_post_batch would post old content now) or superseded (a Curator
 * instruction fix a newer ship already replaced). So the window correctly
 * refuses to re-run them; the fix is that each sweep now terminal-states the
 * aged-out ones as 'expired' — safe, and visible instead of invisible.
 */

const root = process.cwd();
const ft = readFileSync(join(root, 'supabase/functions/flowpilot-lifecycle/followthrough.ts'), 'utf8');

describe('follow-through expiry of aged-out approvals', () => {
  it('the sweep terminal-states approvals older than the window as expired', () => {
    expect(ft).toMatch(/\.update\(\{[\s\S]*status: "expired"/);
    // Only aged-out ones — inside-window approvals still get re-executed.
    expect(ft).toMatch(/\.eq\("status", "approved"\)/);
    expect(ft).toMatch(/\.lt\("created_at", expiredBefore\)/);
  });

  it('expiry does NOT re-execute — it is a status change only', () => {
    // The expiry block must not call agent-execute; re-running a stale/superseded
    // approval is the exact thing it prevents.
    const block = ft.slice(ft.indexOf('Expire approvals that aged out'), ft.indexOf('flowpilot_approved_pending'));
    expect(block).not.toMatch(/agent-execute/);
  });

  it('the expired count is surfaced in the pulse and response (never silent)', () => {
    expect(ft).toMatch(/expired: expiredCount/);
  });
});
