import { useUiText } from '@/lib/ui-text';
import { pricePeriod } from '@/lib/price-period';

/**
 * The visitor-facing suffix of a recurring price ("/month", "/year", or the
 * short "/mo", "/yr"), in the visitor's language. Null for a one-time product.
 * The one place a public surface gets a price period from — see price-period.ts.
 */
export function usePricePeriodText() {
  const t = useUiText();
  return (product: { type?: string | null; billing_interval?: string | null }, opts: { short?: boolean } = {}): string | null => {
    const period = pricePeriod(product);
    if (!period) return null;
    if (period === 'year') return opts.short ? t('shop.perYearShort', '/yr') : t('shop.perYear', '/year');
    return opts.short ? t('shop.perMonthShort', '/mo') : t('shop.perMonth', '/month');
  };
}
