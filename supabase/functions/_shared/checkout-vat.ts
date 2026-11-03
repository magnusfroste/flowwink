/**
 * The storefront's VAT setting, turned into money at checkout.
 *
 * The setting lives on the ecommerce module (site_settings "modules" →
 * ecommerce.vatRatePct / pricesIncludeVat). With prices INCLUDING VAT the
 * shown price is what the customer pays. With prices EXCLUDING VAT (a B2B
 * shop) the VAT goes on top — and until 2026-11-01 nothing put it there:
 * the label said "exkl. moms (25%)" while Stripe charged the net price, so
 * the seller paid the VAT out of the margin (a 1 000 kr item was charged
 * 1 000 kr instead of 1 250 kr).
 *
 * Orders carry the customer price INCLUDING VAT — book_order_paid splits
 * order lines into revenue and output VAT by their rate — so a net shop's
 * order rows are written gross.
 */

export interface CheckoutVat {
  ratePct: number;
  pricesIncludeVat: boolean;
}

/** The VAT the checkout applies, or null when the shop declares no rate. */
export function checkoutVat(ecomConfig: { vatRatePct?: unknown; pricesIncludeVat?: unknown } | null | undefined): CheckoutVat | null {
  const ratePct = typeof ecomConfig?.vatRatePct === 'number' ? ecomConfig.vatRatePct : 0;
  if (!ratePct || ratePct <= 0) return null;
  return { ratePct, pricesIncludeVat: ecomConfig?.pricesIncludeVat !== false };
}

/** True when the shown prices are net and the checkout must add the VAT. */
export function vatOnTop(vat: CheckoutVat | null): vat is CheckoutVat {
  return vat !== null && !vat.pricesIncludeVat;
}

/** A net amount with its VAT added, rounded to the minor unit. */
export function grossCents(netCents: number, ratePct: number): number {
  return netCents + Math.round(netCents * ratePct / 100);
}

/**
 * VAT provenance stamp for the order's metadata. `totalCents` is what the
 * customer pays: VAT included either way, because a net shop's total has
 * already had the VAT added.
 */
export function vatMetadata(vat: CheckoutVat | null, totalCents: number): Record<string, unknown> | null {
  if (!vat) return null;
  const vatCents = Math.round(totalCents * vat.ratePct / (100 + vat.ratePct));
  return {
    rate_pct: vat.ratePct,
    prices_include_vat: vat.pricesIncludeVat,
    vat_cents: vatCents,
    ...(vat.pricesIncludeVat ? {} : { net_cents: totalCents - vatCents, vat_added_at_checkout: true }),
  };
}
