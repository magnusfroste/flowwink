/**
 * A net-priced shop charges the VAT on top (_shared/checkout-vat.ts).
 *
 * Found 2026-11-01 before a B2B shop's first sale: 25 % with prices EXCLUDING
 * VAT, the product page said "1 000 kr exkl. moms (25%)" — and create-checkout
 * called its VAT handling "display-only", so Stripe charged 1 000 kr where the
 * buyer owed 1 250 kr, and the seller paid the VAT out of the margin. The
 * ledger (book_order_paid) also read the net order rows as gross and booked
 * 80 % of the net price as revenue.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkoutVat, grossCents, vatMetadata, vatOnTop,
} from '../../../supabase/functions/_shared/checkout-vat';

const checkout = readFileSync(join(__dirname, '../../../supabase/functions/create-checkout/index.ts'), 'utf8');

describe('checkout VAT — the setting', () => {
  it('declares no VAT without a rate', () => {
    expect(checkoutVat({})).toBeNull();
    expect(checkoutVat({ vatRatePct: 0, pricesIncludeVat: false })).toBeNull();
    expect(vatOnTop(checkoutVat({}))).toBe(false);
  });

  it('treats prices as VAT-inclusive unless the shop says otherwise', () => {
    expect(checkoutVat({ vatRatePct: 25 })).toEqual({ ratePct: 25, pricesIncludeVat: true });
    expect(vatOnTop(checkoutVat({ vatRatePct: 25 }))).toBe(false);
  });

  it('adds the VAT on top when prices exclude it', () => {
    const vat = checkoutVat({ vatRatePct: 25, pricesIncludeVat: false });
    expect(vatOnTop(vat)).toBe(true);
    expect(grossCents(100_000, 25)).toBe(125_000); // 1 000 kr → 1 250 kr
    expect(grossCents(1_999, 25)).toBe(2_499);     // 19,99 → 24,99 (rounded to the öre)
    expect(grossCents(1_000, 12)).toBe(1_120);
  });
});

describe('checkout VAT — the order metadata', () => {
  it('splits the paid total into net and VAT for a net-priced shop', () => {
    const meta = vatMetadata({ ratePct: 25, pricesIncludeVat: false }, 125_000);
    expect(meta).toEqual({
      rate_pct: 25, prices_include_vat: false, vat_cents: 25_000, net_cents: 100_000, vat_added_at_checkout: true,
    });
  });

  it('keeps the VAT portion of a gross total for an inclusive shop', () => {
    expect(vatMetadata({ ratePct: 25, pricesIncludeVat: true }, 12_500)).toEqual({
      rate_pct: 25, prices_include_vat: true, vat_cents: 2_500,
    });
    expect(vatMetadata(null, 12_500)).toBeNull();
  });
});

describe('create-checkout charges what the label promises', () => {
  it('puts the exclusive tax rate on every Stripe line, shipping included', () => {
    expect(checkout).toMatch(/if \(addVat\) \{[\s\S]{0,300}exclusiveTaxRateId\([\s\S]{0,200}for \(const line of lineItems\) line\.tax_rates = \[taxRateId\]/);
    // Shipping is pushed before the loop, so it carries the rate too.
    expect(checkout.indexOf('flowwink_shipping_rate_id')).toBeLessThan(checkout.indexOf('line.tax_rates = [taxRateId]'));
  });

  it('writes the order rows gross — the ledger splits them by rate', () => {
    expect(checkout.match(/price_cents: customerPrice\(item\.priceCents\)/g)).toHaveLength(2);
    expect(checkout.match(/tax_rate_pct: vat\.ratePct/g)).toHaveLength(2);
    expect(checkout.match(/totalCents = customerPrice\(/g)).toHaveLength(2);
  });

  it('keeps the total Stripe actually charges', () => {
    expect(checkout).toMatch(/addVat && typeof session\.amount_total === "number"[\s\S]{0,200}fromStripeAmount\(session\.amount_total/);
  });

  it('no longer calls VAT display-only', () => {
    expect(checkout).not.toMatch(/computeVatMetadata/);
    expect(checkout).not.toMatch(/Display-only: totals are never recalculated/);
  });
});
