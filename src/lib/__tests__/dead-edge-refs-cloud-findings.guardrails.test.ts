import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: two edge-surface-refactor dead references in agent-execute,
 * verified by the 2026-07-23 cloud architecture review, stay fixed.
 *
 * 1. The bank-sweep called the DELETED `reconciliation` edge fn; the 404 was
 *    swallowed into summary.auto_matched="HTTP 404", so bank transactions
 *    silently never auto-matched. Now a direct executeReconciliation() call.
 * 2. The order-invoice email linked generate-invoice-pdf?invoice_id= — a GET
 *    the handler never read, admin-gated after #137 → 403 for the customer.
 *    Now the public /invoice/<public_token> page (working Download PDF).
 */

const aeRaw = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf8');
// Strip line comments — both fixes are explained in prose that quotes the old
// broken calls, and that prose must not trip the checks.
const ae = aeRaw.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

describe('cloud-review dead-edge-ref fixes', () => {
  it('the bank sweep auto-matches via the internal handler, not a dead edge fn', () => {
    expect(ae, 'the deleted reconciliation edge fn is referenced again')
      .not.toMatch(/functions\/v1\/reconciliation\/auto-match/);
    expect(ae).toMatch(/executeReconciliation\('auto-match', \{\}\)/);
  });

  it('the invoice email links the public invoice page, not the broken PDF GET', () => {
    expect(ae, 'the broken generate-invoice-pdf?invoice_id GET link is back')
      .not.toMatch(/generate-invoice-pdf\?invoice_id=/);
    expect(ae).toMatch(/\/invoice\/\$\{publicToken\}/);
  });
});
