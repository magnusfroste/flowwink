/**
 * An order's invoice, priced the way the books priced the order.
 *
 * `book_order_paid` reads order lines as GROSS (the customer's price incl.
 * VAT) and the order total as what was paid; a discount or anything else
 * between them scales every line, shipping is gross at the default rate.
 * send_invoice_for_order used to read the same lines as NET and add 25 % on
 * top: LiteIT's 12,50 kr test order (10 kr + moms, paid by card) was invoiced
 * at 15,63 kr (2026-11-07).
 *
 * The invoice total is therefore always the order total. An order converted
 * from a quote carries its net lines and the accepted subtotal/tax in metadata
 * (`total_includes_tax`), and keeps them.
 */

export interface OrderLineIn {
  product_name: string;
  quantity: number;
  price_cents: number;
  /** The line's VAT in percent, already resolved (order_line_vat_rate). */
  rate_pct: number;
}

export interface InvoiceLine {
  description: string;
  qty: number;
  unit_price_cents: number;
}

export interface InvoiceAmounts {
  line_items: InvoiceLine[];
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  /** tax / subtotal — one rate per invoice, exact for a single-rate order. */
  tax_rate: number;
}

export function invoiceAmountsFromOrder(input: {
  total_cents: number;
  shipping_cost_cents?: number | null;
  metadata?: Record<string, unknown> | null;
  items: OrderLineIn[];
  /** Shipping's VAT in percent (the default rate). */
  shipping_rate_pct: number;
  /** A caller's explicit rate (fraction, e.g. 0.25) for every line. */
  override_rate?: number | null;
}): InvoiceAmounts {
  const total = Math.round(Number(input.total_cents) || 0);
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const rate6 = (n: number) => Number(n.toFixed(6));

  // A quote's order: lines are net, the accepted amounts travel in metadata.
  const metaSubtotal = Number(meta.subtotal_cents);
  const metaTax = Number(meta.tax_cents);
  if (meta.total_includes_tax === true && Number.isFinite(metaSubtotal) && Number.isFinite(metaTax)) {
    const line_items = input.items.map((it) => ({
      description: it.product_name, qty: it.quantity, unit_price_cents: it.price_cents,
    }));
    return {
      line_items,
      subtotal_cents: metaSubtotal,
      tax_cents: metaTax,
      total_cents: metaSubtotal + metaTax,
      tax_rate: metaSubtotal > 0 ? rate6(metaTax / metaSubtotal) : 0,
    };
  }

  const override = typeof input.override_rate === 'number' && input.override_rate >= 0
    ? input.override_rate * 100 : null;
  const shipping = Math.max(0, Math.round(Number(input.shipping_cost_cents) || 0));
  const gross = input.items.reduce((s, it) => s + it.price_cents * it.quantity, 0) + shipping;
  const scale = gross > 0 ? total / gross : 1;

  const lines: { description: string; qty: number; gross: number; rate: number }[] = input.items.map((it) => ({
    description: it.product_name,
    qty: it.quantity,
    gross: Math.round(it.price_cents * it.quantity * scale),
    rate: override ?? it.rate_pct,
  }));
  if (shipping > 0) {
    lines.push({ description: 'Shipping', qty: 1, gross: Math.round(shipping * scale), rate: override ?? input.shipping_rate_pct });
  }

  const line_items = lines.map((l) => {
    const net = Math.round(l.gross / (1 + l.rate / 100));
    return { description: l.description, qty: l.qty, unit_price_cents: Math.round(net / Math.max(1, l.qty)) };
  });
  const subtotal = line_items.reduce((s, l) => s + l.qty * l.unit_price_cents, 0);
  const tax = total - subtotal;
  return {
    line_items,
    subtotal_cents: subtotal,
    tax_cents: tax,
    total_cents: total,
    tax_rate: subtotal > 0 ? rate6(tax / subtotal) : 0,
  };
}

/** The order's money axis says the customer has paid. */
export function orderIsPaid(status: string | null | undefined): boolean {
  return status === 'paid' || status === 'completed';
}
