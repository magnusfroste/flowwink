import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onActivePackChange } from '@/lib/locale-packs';

/**
 * Query keys that depend on the active accounting locale pack.
 * When the pack changes, these are invalidated so every consuming hook
 * (charts, templates, VAT, invoices, payroll, reconciliation, tax) refetches.
 *
 * Add new keys here when introducing a pack-aware query.
 */
const PACK_DEPENDENT_KEYS: string[][] = [
  ['chart-of-accounts'],
  ['accounting-templates'],
  ['journal-entries'],
  ['accounting-periods'],
  ['vat_report'],
  ['tax_codes'],
  ['tax_grids'],
  ['invoices'],
  ['payroll-preview'],
  ['payroll-exports'],
  ['payroll-export-lines'],
  ['bank_transactions'],
  ['reconciliation_matches'],
  ['purchase-orders'],
  ['vendors'],
  ['site-settings', 'accounting_locale'],
];

/**
 * Wires the active locale pack to the React Query cache. Mount once near the
 * app root. Listens for both same-tab CustomEvent and cross-tab storage events
 * so a change in /admin/accounting/locale-packs immediately refreshes data
 * everywhere — without a full reload.
 */
export function LocalePackProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  useEffect(() => {
    const unsubscribe = onActivePackChange(() => {
      for (const key of PACK_DEPENDENT_KEYS) {
        qc.invalidateQueries({ queryKey: key });
      }
    });
    return unsubscribe;
  }, [qc]);

  return <>{children}</>;
}
