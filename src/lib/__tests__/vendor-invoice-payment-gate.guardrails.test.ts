import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrails for the vendor-invoice payment gate.
 *
 * Measured on Nordbrygg 2026-08-23, with the rows left in the instance:
 *
 *   PO-00004 had ONE goods receipt — 60 kg à 224,00 = 13 440,00 received value.
 *   SR-2026-0518 (13 440,00) matched at 0 % variance, was auto-approved and paid.
 *   SR-2026-0518-KOPIA, the SAME delivery registered a second time, was told
 *   "matched, 0 % variance" as well and auto-approved: 30 105,60 approved
 *   against a delivery of 13 440,00. The match compared every invoice against
 *   the PO's WHOLE received value and never subtracted what had already been
 *   claimed — Odoo carries qty_invoiced per order line for exactly this.
 *
 *   NPD-2026-11907 was PAID at match_status=over_invoiced, 60 % above received
 *   value, with approved_at = NULL. Its status went received → paid, skipping
 *   approved entirely, because pay_vendor_invoice only looked at paid_at and a
 *   positive amount.
 *
 * The tests below pin the shape of the fix, not the wording of it: the claim
 * ledger is derived, the gate lives on the table (path-independent) and the
 * override is the house approvals rail rather than a new force flag.
 */
describe('vendor invoice payment gate', () => {
  const migDir = join(__dirname, '../../../supabase/migrations');
  // The baseline is a frozen historical dump — it still holds pre-fix bodies and
  // is superseded at runtime by the forward-dated migrations. Guard the new ones.
  const sqlFiles = readdirSync(migDir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('00000000000000'))
    .sort();

  /**
   * The LAST migration that defines `name`, i.e. the body a fresh replay ends up
   * with. Testing the last definer is the whole point: a gate that only exists
   * in an earlier migration is a gate that a later re-emission silently removed.
   */
  function lastDefinitionOf(name: string): { file: string; sql: string; body: string } {
    const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(public\\.)?"?${name}"?\\s*\\(`, 'i');
    const hits = sqlFiles.filter((f) => re.test(readFileSync(join(migDir, f), 'utf8')));
    expect(hits.length, `no migration defines ${name}`).toBeGreaterThan(0);
    const file = hits[hits.length - 1];
    const sql = readFileSync(join(migDir, file), 'utf8');
    // The function itself, so prose in the migration's docstring can never
    // satisfy (or violate) an assertion about the code.
    const start = sql.search(re);
    const end = sql.indexOf('$function$;', start);
    const body = end > start ? sql.slice(start, end + '$function$;'.length) : sql.slice(start);
    return { file, sql, body };
  }

  it('the already-invoiced value is derived from the invoice ledger, not stored on the order line', () => {
    // vendor_invoices has no line table, so an invoiced_quantity column on
    // purchase_order_lines could only be filled by inventing an allocation of a
    // header amount across lines — a second writer of a truth that already
    // exists. If someone later adds the column, this test should be revisited
    // deliberately, not drifted past.
    const { body } = lastDefinitionOf('po_invoiced_value_cents');
    expect(body).toMatch(/FROM\s+public\.vendor_invoices/i);
    const allSql = sqlFiles.map((f) => readFileSync(join(migDir, f), 'utf8')).join('\n');
    expect(
      /ALTER TABLE[^;]*purchase_order_lines[^;]*ADD COLUMN[^;]*invoiced/i.test(allSql),
      'purchase_order_lines gained an invoiced_* column — the claim ledger is meant to stay derived',
    ).toBe(false);
  });

  it('the three-way match subtracts what other invoices already claimed', () => {
    // Without this subtraction every invoice against the same receipt scores
    // 0 % variance, which is how the duplicate got auto-approved.
    const { body } = lastDefinitionOf('vendor_invoice_match_eval');
    expect(body).toMatch(/po_invoiced_value_cents\s*\(/);
    expect(body, 'the billable baseline must be reduced by the claimed amount').toMatch(
      /v_billable\s*:=\s*v_baseline\s*-\s*v_claimed/,
    );
    // Odoo's "fully billed": nothing left to invoice is over-invoiced, not matched.
    expect(body).toMatch(/v_billable\s*<=\s*0/);
  });

  it('the match calculation has one owner — the writer and the gate share it', () => {
    // Two copies of the same arithmetic drift apart, and the copy the payment
    // reads is the one that matters.
    const { body } = lastDefinitionOf('match_invoice_to_receipt');
    expect(body).toMatch(/vendor_invoice_match_eval\s*\(/);
    const guard = lastDefinitionOf('guard_vendor_invoice_status_flow');
    expect(guard.body).toMatch(/vendor_invoice_match_eval\s*\(/);
  });

  it('the gate is a trigger on vendor_invoices, so no payment path can go around it', () => {
    // pay_vendor_invoice is re-emitted by other work in the purchase chain; a
    // gate living in that function body disappears with the next rewrite. The
    // status row is the only door the money leaves through.
    const { sql } = lastDefinitionOf('guard_vendor_invoice_status_flow');
    expect(sql).toMatch(
      /CREATE TRIGGER\s+trg_guard_vendor_invoice_status_flow\s+BEFORE UPDATE OF status ON public\.vendor_invoices/i,
    );
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS\s+trg_guard_vendor_invoice_status_flow/i);
  });

  it('received → paid is impossible, and paid requires an approval stamp', () => {
    const { body } = lastDefinitionOf('guard_vendor_invoice_status_flow');
    const received = body.match(/WHEN 'received' THEN ARRAY\[([^\]]*)\]/);
    expect(received, "the transition map must name 'received'").toBeTruthy();
    expect(received![1], "received must not reach 'paid' in one step").not.toContain("'paid'");
    // paid is reachable only from approved…
    const approved = body.match(/WHEN 'approved' THEN ARRAY\[([^\]]*)\]/);
    expect(approved![1]).toContain("'paid'");
    // …and paid is terminal.
    expect(body).toMatch(/WHEN 'paid'\s+THEN ARRAY\[\]::text\[\]/);
    // An approved label without an approval stamp is not an approval.
    expect(body).toMatch(/NEW\.approved_at IS NULL/);
  });

  it('the refusal names the remedy, not just the mistake', () => {
    // Same reasoning as _shared/suggest-names.ts and the block field guard: a
    // guard that names the mistake without naming the door sends the model
    // looking for a weaker skill instead of correcting the one it holds.
    const { body } = lastDefinitionOf('guard_vendor_invoice_status_flow');
    for (const skill of [
      'auto_approve_vendor_invoice',
      'match_invoice_to_receipt',
      'receive_purchase_order',
      'request_entity_approval',
      'advance_approval_step',
    ]) {
      expect(body, `the refusal must name ${skill} as a way forward`).toContain(skill);
    }
  });

  it('the override is the house approvals rail, not a new force flag', () => {
    const { body } = lastDefinitionOf('guard_vendor_invoice_status_flow');
    expect(body).toMatch(/FROM public\.approval_requests/i);
    expect(body).toMatch(/entity_type\s*=\s*'vendor_invoice'/);
    // Fail closed: an EXISTING approved request is required. chain_approval_satisfied()
    // answers the opposite-polarity question and returns true when no chain is
    // configured — using it here would open the gate on every fresh instance.
    expect(body).not.toMatch(/chain_approval_satisfied/);
    expect(body).toMatch(/ar\.status\s*=\s*'approved'/);
    for (const invented of ['p_force', 'p_override', 'p_skip_match', 'p_bypass']) {
      expect(body, `${invented} invents an override the house does not have`).not.toContain(invented);
    }
  });

  it('no payment path disables triggers to get past the gate', () => {
    const { body } = lastDefinitionOf('pay_vendor_invoice');
    expect(body).not.toMatch(/DISABLE TRIGGER/i);
    expect(body).not.toMatch(/session_replication_role/i);
    // It must still move the status on the table, where the guard sits.
    expect(body).toMatch(/UPDATE public\.vendor_invoices SET status = 'paid'/);
  });
});
