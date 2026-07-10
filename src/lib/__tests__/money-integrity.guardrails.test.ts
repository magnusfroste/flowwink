import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoicingModule } from '@/lib/modules/invoicing-module';

/**
 * Guardrails for the money-movement edge fixes found by driving unhappy paths through the
 * MCP gateway (2026-07-10). Each pins a defect that silently corrupts the books.
 *
 * NOTE: these read the SPECIFIC fix migration (not the whole migrations/ dir) — older
 * migration files legitimately still contain the pre-fix bodies they superseded, so a
 * dir-wide scan would flag history. The current behaviour lives in the newest definition.
 */
describe('Money integrity guardrails', () => {
  const migDir = join(__dirname, '../../../supabase/migrations');
  const paymentMig = readFileSync(join(migDir, '20260710020000_record-payment-idempotency.sql'), 'utf8');

  it('record_invoice_payment is idempotent via a p_reference key (no double-counted payments)', () => {
    // A retry / double-click / Stripe webhook redelivery must not accumulate the same
    // payment twice. The migration keeps the p_reference param AND the dedupe no-op branch,
    // AND drops the old 4-arg signature so the 5th arg doesn't create a PGRST203 overload.
    expect(paymentMig).toContain('p_reference text DEFAULT NULL');
    expect(paymentMig).toMatch(/p_reference IS NOT NULL AND EXISTS/i);
    expect(paymentMig).toMatch(/DROP FUNCTION IF EXISTS public\.record_invoice_payment\(uuid, bigint, text, timestamp/i);
  });

  it('record_invoice_payment skill exposes p_reference so agents can make retries safe', () => {
    const seeds = (invoicingModule as any).skillSeeds ?? (invoicingModule as any).skills ?? [];
    const pay = seeds.find((s: any) => s.name === 'record_invoice_payment');
    expect(pay, 'record_invoice_payment seed missing').toBeTruthy();
    const props = pay.tool_definition?.function?.parameters?.properties ?? {};
    expect(props.p_reference, 'p_reference must be documented in the tool_definition').toBeTruthy();
    // The old instructions wrongly claimed there was NO p_reference param.
    expect(pay.instructions ?? '').not.toMatch(/no p_reference/i);
  });

  it('the timesheet invoice generator uses the canonical INV-YYYY-NNNNN series', () => {
    // bulk_invoice_from_timesheets was the 3rd site minting a count-based INV number.
    // Its fix migration must build the number from the year + last INV-YYYY-%, not count(*).
    const tsMig = readFileSync(join(migDir, '20260710000000_timesheet-invoice-number-series.sql'), 'utf8');
    // The active generator line: 'INV-' || v_yr || '-' || LPAD(...). And it must NOT still
    // derive the sequence from count(*) of all invoices.
    expect(tsMig).toMatch(/'INV-'\s*\|\|\s*v_yr\s*\|\|\s*'-'\s*\|\|\s*LPAD/i);
    expect(tsMig).not.toMatch(/SELECT\s+COUNT\(\*\)\s+INTO\s+v_count\s+FROM\s+public\.invoices/i);
  });
});
