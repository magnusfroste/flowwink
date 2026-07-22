import { useTenantLocalePack } from '@/hooks/useTenantLocalePack';

/**
 * Hook that returns a currency formatter honouring the tenant's active locale
 * pack. Falls back to the pack's own currency when the record has none.
 *
 * Usage:
 *   const formatAmount = useFormatAmount();
 *   formatAmount(12345, 'EUR'); // "€123.45" in de-DE, "123,45 €" in fr-FR
 */
export function useFormatAmount() {
  const { activePack } = useTenantLocalePack();
  const locale = activePack.currency.intl_locale;
  const fallbackCurrency = activePack.currency.code;
  return (cents: number | null | undefined, currency?: string | null) => {
    if (cents == null) return '—';
    const cur = (currency || fallbackCurrency).toUpperCase();
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(cents / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${cur}`;
    }
  };
}
