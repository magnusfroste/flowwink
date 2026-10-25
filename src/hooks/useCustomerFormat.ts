import { useMemo } from 'react';
import { useBusinessHome } from '@/hooks/useSiteSettings';
import { makePlatformFormat, type PlatformFormat } from '@/hooks/usePlatformFormat';
import { useUiTextLanguage } from '@/lib/ui-text';
import { FALLBACK_HOME, formatLocale } from '../../supabase/functions/_shared/locale/home';

/**
 * How a CUSTOMER (or an employee in the self-service portal) reads an amount
 * or a date — the webshop, the public quote, invoice and contract pages, the
 * portal. The rule every e-mail and PDF follows (homeFormat): the reader's
 * language in the business's region (an English page of a Swedish shop says
 * "1 234,50 kr"), the business's clock, and the exact amount — the admin's
 * "whole units" is a reading aid for the admin and never rounds a price a
 * customer pays. A call site's own options (a whole-unit KPI) still apply.
 *
 * Same shape as usePlatformFormat, plus `formatPrice`; admin surfaces use
 * usePlatformFormat. docs/architecture/locale-and-formatting.md.
 */
export function useCustomerFormat(): PlatformFormat & {
  /** The BCP-47 tag this reader's numbers and dates are written in. */
  locale: string;
  formatPrice: (cents: number | null | undefined, currency?: string | null) => string;
} {
  const home = useBusinessHome().data ?? FALLBACK_HOME;
  const { lang } = useUiTextLanguage();
  return useMemo(() => {
    const locale = formatLocale(home, lang);
    const f = makePlatformFormat({
      default_locale: locale,
      default_currency: home.currency,
      default_timezone: home.timeZone,
      amount_decimals: 'auto',
    });
    return { ...f, locale, formatPrice: (cents, currency) => f.formatCurrency(cents, currency) };
  }, [home, lang]);
}
