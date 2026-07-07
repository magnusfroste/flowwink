import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dual-axis drift guardrails (system sweep 2026-07-07).
 *
 * Bug class: one user-facing fact stored on two axes (columns/stores), where
 * a display/writer surface uses axis A while the runtime enforces axis B —
 * so they silently disagree. Confirmed instances: trust_level vs
 * requires_staging, bank_transactions.status vs journal_entry_id,
 * approval_requests vs pending_operations.
 *
 * These are source-level tripwires: cheap, DB-free, and they fire the moment
 * a refactor reintroduces a known seam. If you trip one deliberately, update
 * BOTH sides of the seam and this test in the same commit.
 */

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('dual-axis guardrails', () => {
  it('#B1: the events-to-book queue only offers UNCLAIMED bank events (status=unmatched)', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    const caseStart = src.indexOf("case 'propose_bookkeeping'");
    expect(caseStart, 'propose_bookkeeping case must exist in agent-execute').toBeGreaterThan(-1);
    const caseBody = src.slice(caseStart, caseStart + 4000);
    // Must filter to unmatched only — status matched/partial means the
    // reconciliation pipeline claimed the event (double-booking risk).
    expect(caseBody).toContain(".eq('status', 'unmatched')");
    expect(caseBody).not.toContain(".neq('status', 'ignored')");
  });

  it('#A1: every frontend writer of trust_level also writes requires_staging (one dial)', () => {
    const offenders: string[] = [];
    const scanDir = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = join(dir, entry.name);
        if (entry.isDirectory()) { scanDir(rel); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue;
        const src = readFileSync(join(ROOT, rel), 'utf8');
        // Find .update({...trust_level...}) payloads
        const updateCalls = src.match(/\.update\(\s*\{[^}]*\btrust_level\b[^}]*\}/g) ?? [];
        for (const call of updateCalls) {
          if (!call.includes('requires_staging')) offenders.push(`${rel}: ${call.slice(0, 100)}`);
        }
      }
    };
    scanDir('src');
    expect(
      offenders,
      `These update() calls write trust_level WITHOUT requires_staging — the runtime gates on requires_staging, so the dial silently stops working:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('#A3/#A4: skill enable/expose mutations preserve the MCP invariant', () => {
    const src = read('src/hooks/useSkillHub.ts');
    // Disabling must also unexpose (no orphan MCP tools)
    expect(src).toContain("enabled ? { enabled } : { enabled, mcp_exposed: false }");
    // Exposing must also enable
    expect(src).toContain("mcp_exposed ? { mcp_exposed, enabled: true } : { mcp_exposed }");
  });

  it('#A2: the Gated Skills read model includes requires_staging-gated skills', () => {
    const src = read('src/hooks/useGatedSkills.ts');
    expect(src).toContain('requires_staging.eq.true');
    expect(src).toContain('requires_staging');
  });

  it('#B2: invoice_status enum is completed with the values code filters on', () => {
    const migrations = readdirSync(join(ROOT, 'supabase/migrations'));
    const enumMigration = migrations.find((f) => f.includes('invoice-status-enum-complete'));
    expect(enumMigration, 'invoice-status enum completion migration must exist').toBeTruthy();
    const sql = read(`supabase/migrations/${enumMigration}`);
    for (const v of ['void', 'booked', 'posted']) {
      expect(sql).toContain(`ADD VALUE IF NOT EXISTS '${v}'`);
    }
  });

  it('#B5: approved pending operations are rejected past expires_at', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('expires_at');
    expect(src).toMatch(/expires_at.*expired|expired.*expires_at/s);
  });

  it('#C1: automation runs do not count a staged envelope as an executed run', () => {
    const src = read('src/hooks/useAutomations.ts');
    expect(src).toContain('staged === true');
  });

  it('litmus: booking a bank event defaults entry_date to the EVENT date and refuses stale references', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('bankTxDate');
    expect(src).toContain("entry_date || bankTxDate");
    expect(src).toMatch(/not found — the event list is stale/);
  });

  it('matching: proposals are direction-filtered (outflow never matches revenue templates)', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('acctTemplateBankDirection');
    expect(src).toContain('directionCompatible');
  });

  it('matching: vendor defaults win over keyword scoring in proposals', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('vendorDefaults');
    expect(src).toContain("'vendor-default'");
  });

  it('learning loop: confirmed bookings teach the counterparty its template (graduated trust ramp)', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('confirmedByCounterparty');
    expect(src).toContain('Math.min(98, 88 + 5 * confirmed)');
    expect(src).toContain('Auto-learned from agentic bookkeeping');
  });

  it('provenance: booked entries record their originating template + match source', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('template_id: explicitTemplateId || null');
    expect(src).toContain('match_source');
    const migs = readdirSync(join(ROOT, 'supabase/migrations'));
    expect(migs.some((f) => f.includes('journal-entry-template-provenance'))).toBe(true);
  });

  it('IB: opening balances live in opening_balances (state) and are merged into balance reports', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain('fiscalYearForIB');
    expect(src).toContain('opening_cents');
    expect(src).toContain('movement_cents');
  });

  it('IB: UI balance hooks are fiscal-year-aware (no hardcoded current year)', () => {
    const src = read('src/hooks/useAccounting.ts');
    expect(src).toContain('useAccountBalances(fiscalYear?: number)');
    expect(src).toContain("queryKey: ['account-balances', year]");
    // movements must be filtered to the fiscal year
    expect(src).toMatch(/gte\('journal_entries\.entry_date'/);
  });
});
