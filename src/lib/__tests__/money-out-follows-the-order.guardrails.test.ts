import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Money out follows the order (process sweep 2026-09-17).
 *
 * Three surfaces paid out, put back or credited more than was sold:
 *  - a return line of 10 × 900 kr on an order line of 3 × 500 kr: refund_return's
 *    ceiling came from the RMA's OWN lines, never the order;
 *  - the POS sale-level discount was subtracted AFTER tax and after the lines,
 *    so tax was overstated, a full refund of a discounted sale hit the ceiling,
 *    and the day-end drawer count ignored refunds and change;
 *  - a partial credit note carried tax = 0, so the VAT on a fully credited
 *    invoice was never reversed.
 *
 * The migration proves the arithmetic on itself; this pins the shapes so a
 * later rewrite cannot quietly drop one of them.
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
  const end = migrationSql.indexOf('$function$;', start);
  const alt = migrationSql.indexOf('$fn$;', start);
  const stop = [end, alt].filter((x) => x > -1).sort((a, b) => a - b)[0];
  return migrationSql.slice(start, stop ?? start + 12000);
}

describe('returns follow the order', () => {
  it('every return line is matched to an order line and capped by it', () => {
    const body = latestFunctionBody('return_items_follow_the_order');
    expect(body).toMatch(/does not belong to order/);
    expect(body).toMatch(/was not sold on order/);
    expect(body).toMatch(/exceeds what is left to return on this order line/);
    expect(body).toMatch(/exceeds the unit price .* the customer paid/);
    expect(body).toMatch(/NEW\.unit_refund_cents := v_oi\.price_cents/);
    expect(migrationSql).toMatch(/CREATE TRIGGER trg_return_items_follow_the_order[\s\S]*?ON public\.return_items/);
  });

  it('refund_return is capped by the order total less other RMAs', () => {
    const body = latestFunctionBody('refund_return');
    expect(body).toMatch(/v_expected := LEAST\(v_expected, GREATEST\(v_order_total - v_order_refunded, 0\)\)/);
  });

  it('restock = false is never restocked, whatever the condition says', () => {
    const body = latestFunctionBody('compute_return_item_action');
    expect(body).toMatch(/NOT COALESCE\(NEW\.restock, true\) AND NEW\.suggested_action = 'restock'/);
  });
});

describe('POS: the discount sits on the lines before tax, the drawer is every payment row', () => {
  it('both sale paths spread the sale discount over the lines before tax', () => {
    const v2 = latestFunctionBody('record_pos_sale_v2');
    expect(v2).toMatch(/pos_spread_discount\(v_lines, COALESCE\(p_discount_cents, 0\)\)/);
    expect(v2).not.toMatch(/v_total := v_total - COALESCE\(p_discount_cents, 0\)/);
    const v1 = latestFunctionBody('record_pos_sale');
    expect(v1).toMatch(/RETURN public\.record_pos_sale_v2\(/);
  });

  it('change leaves the drawer as a negative cash payment and the close reads every payment row', () => {
    const v2 = latestFunctionBody('record_pos_sale_v2');
    expect(v2).toMatch(/VALUES \(v_sale_id, 'cash', -v_change, 'change'\)/);
    const drawer = latestFunctionBody('pos_session_drawer');
    expect(drawer).toMatch(/status <> 'voided'/);
    expect(drawer).not.toMatch(/status = 'completed'/);
    const close = latestFunctionBody('close_pos_session_v2');
    expect(close).toMatch(/pos_session_drawer\(p_session_id\)/);
    expect(latestFunctionBody('close_pos_session')).toMatch(/close_pos_session_v2\(p_session_id, p_closing_cash_cents, NULL\)/);
  });

  it('receipt, refund and POS-invoice numbers come from a sequence, not the clock', () => {
    for (const fn of ['record_pos_sale_v2', 'refund_pos_sale', 'pos_sale_to_invoice']) {
      const body = latestFunctionBody(fn);
      expect(body, fn).toMatch(/nextval\('public\.pos_receipt_seq'\)/);
      expect(body, fn).not.toMatch(/EXTRACT\(EPOCH FROM now\(\)\)/);
      expect(body, fn).not.toMatch(/random\(\)/);
    }
  });
});

describe('a partial credit note carries its share of the VAT', () => {
  it('tax is the invoice ratio, and the last part reverses what remains', () => {
    const body = latestFunctionBody('create_credit_note');
    expect(body).toMatch(/-round\(v_amount::numeric \* COALESCE\(v_inv\.tax_cents, 0\) \/ v_inv\.total_cents\)/);
    expect(body).toMatch(/COALESCE\(v_inv\.tax_cents, 0\) - COALESCE\(SUM\(ABS\(tax_cents\)\), 0\)/);
    expect(body).not.toMatch(/v_tax := 0;/);
  });
});
