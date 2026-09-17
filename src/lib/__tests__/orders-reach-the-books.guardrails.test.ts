import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * An e-commerce order reaches the books when it is paid (decision 2026-09-17).
 *
 * The signal is orders.status → 'paid', whoever flips it — the Stripe webhook,
 * an operator, the demo cycle — so no live payment integration is needed for
 * the books to be right. The entry debits the payment-provider clearing
 * account (a ROLE, never a number in code) and credits revenue and VAT per
 * rate; the payout reconciliation later settles the clearing account. An
 * invoice raised for a paid order is a receipt; a refund reverses against the
 * order. These pin the shapes; the migration proves the arithmetic on itself.
 */

const repoRoot = resolve(__dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationSql = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(resolve(migrationsDir, f), 'utf-8')).join('\n');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrationSql))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrationSql.indexOf(e, start)).filter((x) => x > -1);
  return migrationSql.slice(start, Math.min(...ends));
}

describe('orders reach the books when paid', () => {
  it('the status flip is the signal, and a shop without a chart still takes the order', () => {
    expect(migrationSql).toMatch(/CREATE TRIGGER trg_order_paid_book[\s\S]*?AFTER INSERT OR UPDATE OF status ON public\.orders/);
    const trg = latestFunctionBody('on_order_paid_book');
    expect(trg).toMatch(/NEW\.status = 'paid' AND \(TG_OP = 'INSERT' OR OLD\.status IS DISTINCT FROM 'paid'\)/);
    expect(trg).toMatch(/EXCEPTION WHEN OTHERS THEN\s*RAISE WARNING/);
  });

  it('one entry per order, by role, revenue and VAT per rate, balanced', () => {
    const b = latestFunctionBody('book_order_paid');
    expect(b).toMatch(/source = 'order_paid' AND reference_number = p_order_id::text/);
    expect(b).toMatch(/account_for_or\('payment_clearing', 'bank'\)/);
    expect(b).toMatch(/order_line_vat_rate\(oi\.tax_rate_pct\)/);
    expect(b).toMatch(/does not balance/);
    expect(b).not.toMatch(/'[0-9]{4}'/);
  });

  it('a receipt invoice is not a second sale, and a refund reverses against the order', () => {
    expect(latestFunctionBody('book_invoice_issued')).toMatch(/order already booked at payment/);
    expect(latestFunctionBody('book_invoice_paid')).toMatch(/order already booked at payment/);
    const r = latestFunctionBody('refund_return');
    expect(r).toMatch(/v_order_booked := EXISTS \(SELECT 1 FROM journal_entries j WHERE j\.source = 'order_paid'/);
    expect(r).toMatch(/WHEN p_method IN \('stripe', 'card'\) THEN public\.account_for_or\('payment_clearing', 'bank'\)/);
  });

  it('the clearing role is seeded for the Swedish pack and left alone where it exists', () => {
    const i = migrationSql.lastIndexOf("('se-bas2024', 'payment_clearing'");
    expect(i).toBeGreaterThan(-1);
    expect(migrationSql.slice(i, i + 300)).toMatch(/ON CONFLICT \(locale, role\) DO NOTHING/);
  });
});
