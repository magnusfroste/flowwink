import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { invoiceAmountsFromOrder, orderIsPaid } from '../../../supabase/functions/_shared/invoice-from-order';

/**
 * 2026-11-07, LiteIT: a 12,50 kr shop order (10 kr + 25 % moms), paid by card
 * and booked 1580 D 12,50 / 3001 K 10,00 / 2611 K 2,50, was invoiced at
 * 15,63 kr — the gross line read as net, 25 % added again — as an unpaid
 * invoice with a Pay button. The invoice now prices the order the way
 * book_order_paid does and a paid order's invoice is born paid.
 */
describe('an order is invoiced at what the customer paid', () => {
  it('the LiteIT test order: 12,50 kr gross → 10,00 + 2,50, total 12,50', () => {
    const a = invoiceAmountsFromOrder({
      total_cents: 1250,
      items: [{ product_name: 'Privat AI – 1M tokens', quantity: 1, price_cents: 1250, rate_pct: 25 }],
      shipping_rate_pct: 25,
    });
    expect(a).toMatchObject({ subtotal_cents: 1000, tax_cents: 250, total_cents: 1250, tax_rate: 0.25 });
    expect(a.line_items).toEqual([{ description: 'Privat AI – 1M tokens', qty: 1, unit_price_cents: 1000 }]);
  });

  it('mixed rates and gross shipping split per line; the total is the order total', () => {
    const a = invoiceAmountsFromOrder({
      total_cents: 11200 + 12500 + 4900,
      shipping_cost_cents: 4900,
      items: [
        { product_name: 'Book', quantity: 1, price_cents: 11200, rate_pct: 12 },
        { product_name: 'Cable', quantity: 1, price_cents: 12500, rate_pct: 25 },
      ],
      shipping_rate_pct: 25,
    });
    expect(a.line_items.map((l) => l.unit_price_cents)).toEqual([10000, 10000, 3920]);
    expect(a.total_cents).toBe(28600);
    expect(a.subtotal_cents + a.tax_cents).toBe(28600);
  });

  it('a discount between lines and total scales every line, as the books do', () => {
    const a = invoiceAmountsFromOrder({
      total_cents: 10000, // 20 % off a 12 500 gross line
      items: [{ product_name: 'Cable', quantity: 2, price_cents: 6250, rate_pct: 25 }],
      shipping_rate_pct: 25,
    });
    expect(a).toMatchObject({ subtotal_cents: 8000, tax_cents: 2000, total_cents: 10000 });
    expect(a.line_items[0]).toEqual({ description: 'Cable', qty: 2, unit_price_cents: 4000 });
  });

  it("a quote's order keeps the accepted net lines and amounts", () => {
    const a = invoiceAmountsFromOrder({
      total_cents: 12500,
      metadata: { total_includes_tax: true, subtotal_cents: 10000, tax_cents: 2500, tax_rate: 0.25 },
      items: [{ product_name: 'Workshop', quantity: 1, price_cents: 10000, rate_pct: 25 }],
      shipping_rate_pct: 25,
    });
    expect(a).toMatchObject({ subtotal_cents: 10000, tax_cents: 2500, total_cents: 12500, tax_rate: 0.25 });
    expect(a.line_items[0].unit_price_cents).toBe(10000);
  });

  it('paid and completed orders are paid; pending is not', () => {
    expect(orderIsPaid('paid')).toBe(true);
    expect(orderIsPaid('completed')).toBe(true);
    expect(orderIsPaid('pending')).toBe(false);
    expect(orderIsPaid(null)).toBe(false);
  });

  it('send_invoice_for_order prices through the shared rule and issues paid orders as paid', () => {
    const core = readFileSync('supabase/functions/_shared/execute/core.ts', 'utf8');
    const fn = core.slice(core.indexOf('async function executeSendInvoiceForOrder'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('invoiceAmountsFromOrder(');
    expect(body).not.toMatch(/subtotal \* effectiveTaxRate/);
    expect(body).toMatch(/status: orderPaid \? 'paid' : 'sent'/);
  });

  // The cancelled 15,63 kr invoice was still found through its legacy
  // `order:<id>` note and reused, so the order could never be invoiced again.
  it('a cancelled invoice is never the order\'s invoice — neither lookup reuses it', () => {
    const core = readFileSync('supabase/functions/_shared/execute/core.ts', 'utf8');
    const fn = core.slice(core.indexOf('async function executeSendInvoiceForOrder'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const lookups = body.split(".from('invoices')").slice(1)
      .map((q) => q.slice(0, q.indexOf(';')))
      .filter((q) => /order_id|order:\$\{order_id\}/.test(q) && q.includes('.select('));
    expect(lookups.length).toBeGreaterThanOrEqual(2);
    for (const q of lookups) expect(q).toContain(".neq('status', 'cancelled')");

    const view = readFileSync('src/pages/admin/OrdersPage.tsx', 'utf8');
    const q = view.slice(view.indexOf(".select('id, invoice_number, notes, order_id')"));
    expect(q.slice(0, q.indexOf(';'))).toContain(".neq('status', 'cancelled')");
  });
});
