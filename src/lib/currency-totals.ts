import { homeCurrency } from '@/lib/platform-fallbacks';

/**
 * A total over rows that may carry different currencies. Adding 1 000 kr and
 * €300 into "1 300 kr" is a wrong number; Odoo and Stripe both keep one sum
 * per currency, and so do we — "1 000 kr + 300 €". A row without a currency is
 * the business's (that is what its column default wrote).
 */
export type CurrencyTotals = Map<string, number>;

export function sumByCurrency<T>(
  rows: readonly T[] | null | undefined,
  amount: (row: T) => number | null | undefined,
  currency: (row: T) => string | null | undefined,
): CurrencyTotals {
  const totals: CurrencyTotals = new Map();
  for (const row of rows ?? []) {
    const code = (currency(row) || homeCurrency()).toUpperCase();
    totals.set(code, (totals.get(code) ?? 0) + (Number(amount(row)) || 0));
  }
  return totals;
}

/** Merge several totals (e.g. per-customer sums into a page total). */
export function mergeTotals(all: Iterable<CurrencyTotals>): CurrencyTotals {
  const out: CurrencyTotals = new Map();
  for (const t of all) for (const [code, v] of t) out.set(code, (out.get(code) ?? 0) + v);
  return out;
}

/**
 * "1 000 kr + 300 €" — the home currency first, then the rest by size. An empty
 * total prints zero in the home currency.
 */
export function formatTotals(
  totals: CurrencyTotals,
  formatCurrency: (minor: number, currency?: string | null, options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>) => string,
  options?: Omit<Intl.NumberFormatOptions, 'style' | 'currency'>,
): string {
  const home = homeCurrency();
  const entries = [...totals.entries()].filter(([, v]) => v !== 0);
  if (entries.length === 0) return formatCurrency(0, home, options);
  entries.sort(([a, av], [b, bv]) => (a === home ? -1 : b === home ? 1 : Math.abs(bv) - Math.abs(av)));
  return entries.map(([code, v]) => formatCurrency(v, code, options)).join(' + ');
}
