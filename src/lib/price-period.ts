/**
 * The period a recurring price is quoted in — read from the product, never
 * assumed.
 *
 * `products.billing_interval` ('month' | 'year') is the one fact that says
 * what a recurring price buys (docs/architecture/recurring-value-model.md).
 * Until 2026-11-07 every visitor surface and Stripe checkout ignored it and
 * printed or charged per month: a service contract at 14 900 kr per year
 * read "14 900 kr/mo" on the site and, bought online, was charged 14 900 kr
 * every month. Every reader of a recurring price goes through here.
 */
export type BillingPeriod = 'month' | 'year';

/** The period of a product's price, or null for a one-time product. A recurring product without an interval is monthly (the column's default). */
export function pricePeriod(product: { type?: string | null; billing_interval?: string | null }): BillingPeriod | null {
  if (product.type !== 'recurring') return null;
  return product.billing_interval === 'year' ? 'year' : 'month';
}
