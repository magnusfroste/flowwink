import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FlowPilot 2.0 Phase 2 — pipeline-collapse guardrails (2026-07-12).
 *
 * liteit's real flows collapsed into deterministic composite skills the loop
 * (or a platform cron automation) invokes as ONE step, instead of hand-walking
 * 4+ skills across heartbeats (Hermes "zero-context-cost turns"):
 *
 *   run_bookkeeping_sweep    = rules → match → propose → auto-book (≥95 only)
 *   run_month_end_invoicing  = timesheets→invoice drafts + lapsed sub renewals
 *
 * Live-proven on the local stack: balanced JE booked + linked, INV-2026-NNNNN
 * series minted, idempotent re-runs (0 on second pass), per-leg honest errors.
 *
 * The invariant that must never regress: DIAL INHERITANCE. A composite is
 * never a way around a stricter gate on an inner money skill — if the admin
 * approve-gates the inner skill, the composite queues/skips and says so
 * (proven live: manage_journal_entry=approve → auto_booked 0, queued 1,
 * auto_book_disabled note).
 */

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('flowpilot pipeline-collapse guardrails', () => {
  const agentExecute = read('supabase/functions/_shared/execute/core.ts');
  const reconModule = read('src/lib/modules/reconciliation-module.ts');
  const invoicingModule = read('src/lib/modules/invoicing-module.ts');
  const linter = read('scripts/skill-linter.ts');

  it('both composite cases exist in executeDbAction', () => {
    expect(agentExecute).toContain("case 'run_bookkeeping_sweep'");
    expect(agentExecute).toContain("case 'run_month_end_invoicing'");
  });

  it('bookkeeping sweep inherits the inner money skill dial (never bypasses approve)', () => {
    const sweep = agentExecute.slice(
      agentExecute.indexOf("case 'run_bookkeeping_sweep'"),
      agentExecute.indexOf("case 'run_month_end_invoicing'"),
    );
    expect(sweep).toMatch(/manage_journal_entry/);
    expect(sweep).toMatch(/trust_level.*===.*'approve'|'approve'.*===.*trust_level/s);
    // only the sanctioned tier books, and never an already-booked event
    expect(sweep).toMatch(/status !== 'auto' \|\| p\.already_booked/);
  });

  it('month-end run skips approve-gated legs and reports it', () => {
    const me = agentExecute.slice(
      agentExecute.indexOf("case 'run_month_end_invoicing'"),
      agentExecute.indexOf("case 'propose_bookkeeping'"),
    );
    expect(me).toContain('bulk_invoice_from_timesheets');
    expect(me).toContain('generate_subscription_invoice');
    expect(me).toContain('skipped_due_to_trust');
    // real column names (regression: billable/date do not exist)
    expect(me).toContain("eq('is_billable', true)");
    expect(me).toContain("gte('entry_date'");
  });

  it('composite skills are seeded in their owning domain modules with automations', () => {
    expect(reconModule).toContain("name: 'run_bookkeeping_sweep'");
    expect(reconModule).toContain("handler: 'db:run_bookkeeping_sweep'");
    expect(reconModule).toContain('RECONCILIATION_AUTOMATIONS');
    expect(invoicingModule).toContain("name: 'run_month_end_invoicing'");
    expect(invoicingModule).toContain("handler: 'db:run_month_end_invoicing'");
    expect(invoicingModule).toContain('Month-End Billing Run');
  });

  it('virtual db: handler allowlists stay in sync (linter script + embedded)', () => {
    for (const src of [linter, agentExecute]) {
      const m = src.match(/VIRTUAL_DB_HANDLERS = new Set\(\[?[\s\S]*?\]\)?/);
      expect(m, 'VIRTUAL_DB_HANDLERS set missing').toBeTruthy();
      for (const name of ['propose_bookkeeping', 'run_bookkeeping_sweep', 'run_month_end_invoicing']) {
        expect(m![0]).toContain(name);
      }
    }
  });

  it('composite instructions tell agents NOT to hand-walk the chain', () => {
    expect(reconModule).toMatch(/do NOT hand-walk/);
    expect(invoicingModule).toMatch(/do NOT hand-walk/);
  });
});
