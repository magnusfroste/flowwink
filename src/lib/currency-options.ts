import { homeCurrency } from '@/lib/platform-fallbacks';

const COMMON = ['SEK', 'EUR', 'USD', 'GBP', 'NOK', 'DKK', 'CHF', 'PLN', 'ISK'];

/**
 * The choices a currency select offers: the business's own first, the common
 * ones, and the value already on the row (so an existing JPY product does not
 * render a blank select). A fixed SEK/EUR/USD list left a Norwegian shop's own
 * currency off the list.
 */
export function currencyOptions(current?: string | null): string[] {
  return [...new Set([homeCurrency(), ...COMMON, ...(current ? [current.toUpperCase()] : [])])];
}
