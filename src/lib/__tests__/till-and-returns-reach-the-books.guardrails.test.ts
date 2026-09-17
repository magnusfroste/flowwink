import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The till and the returns reach the books (process sweep 2026-09-17).
 *
 * close_pos_session_v2 promised "batch journal posting" and emitted an event
 * nobody consumed; refund_return paid out without a journal line; a credit
 * note was refused by book_invoice_issued ("total is zero"); goods back on the
 * shelf raised inventory with no entry; and a receipt invoice for a cash sale
 * booked the revenue a second time. Magnus: the till is booked per day-end.
 *
 * The migration proves the arithmetic on itself; this pins the shapes.
 */

const repoRoot = resolve(__dirname, '../../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(migrationsDir, f), 'utf-8'))
  .join('\n');

function latestFunctionBody(fnName: string): string {
  const marker = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(migrationSql))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  const ends = ['$function$;', '$fn$;'].map((e) => migrationSql.indexOf(e, start)).filter((x) => x > -1);
  return migrationSql.slice(start, Math.min(...ends));
}

describe('the till is booked per day-end', () => {
  it('closing a session books one entry from every payment row, by role, never by account number', () => {
    const body = latestFunctionBody('pos_session_journal');
    expect(body).toMatch(/source = 'pos_session' AND reference_number = p_session_id::text/); // idempotent
    expect(body).toMatch(/payment_method <> 'invoice'/);                                     // invoiced sales are the invoice's
    expect(body).toMatch(/account_for\('cash_difference'\)/);
    expect(body).toMatch(/account_for\('rounding_variance'\)/);
    expect(body).toMatch(/GROUP BY p\.method/);
    expect(body).not.toMatch(/'[0-9]{4}'/);                                                   // no BAS numbers in code
    expect(latestFunctionBody('close_pos_session_v2')).toMatch(/pos_session_journal\(p_session_id\)/);
  });

  it('a receipt invoice for a sale settled at the till is never booked again', () => {
    expect(latestFunctionBody('pos_sale_to_invoice')).toMatch(/THEN 'pos_receipt' ELSE 'pos_invoice' END/);
    expect(latestFunctionBody('book_invoice_issued')).toMatch(/origin = 'pos_receipt'/);
    expect(latestFunctionBody('on_invoice_status_book')).toMatch(/NEW\.origin = 'pos_receipt' THEN RETURN NEW/);
  });
});

describe('credit notes and returns reverse what the sale booked', () => {
  it('a credit note mirrors the invoice and is picked up by the sweep', () => {
    const body = latestFunctionBody('book_invoice_issued');
    expect(body).toMatch(/'credit_note_issued'/);
    expect(body).toMatch(/v_total := abs\(COALESCE\(v_inv\.total_cents, 0\)\)/);
    expect(latestFunctionBody('book_unbooked_invoices')).toMatch(/coalesce\(i\.total_cents, 0\) <> 0/);
  });

  it('a refund reverses revenue and VAT against the invoiced order, and says so when there is none', () => {
    const body = latestFunctionBody('refund_return');
    expect(body).toMatch(/'return_refund'/);
    expect(body).toMatch(/order has no booked sale/);
    expect(body).toMatch(/tax_rate_pct/);
    expect(body).toMatch(/'store_credit' THEN public\.account_for_or\('customer_credit'/);
  });

  it('goods back on the shelf book the cost of goods sold back', () => {
    const body = latestFunctionBody('process_stock_move_valuation');
    expect(body).toMatch(/\^\(rma_restock\|pos_refund\)/);
    expect(body).toMatch(/'inventory_return'/);
    expect(body).toMatch(/NEW\.reference_id,\s*'inventory_cogs'/); // the COGS entry on the way out stays
  });

  it('new roles are seeded for the Swedish pack and left alone where they exist', () => {
    const i = migrationSql.lastIndexOf("('se-bas2024', 'cash_register'");
    expect(i).toBeGreaterThan(-1);
    expect(migrationSql.slice(i, i + 900)).toMatch(/ON CONFLICT \(locale, role\) DO NOTHING/);
  });
});
