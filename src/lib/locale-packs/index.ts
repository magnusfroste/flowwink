/**
 * Locale Pack Registry
 * ────────────────────
 * Plugin entry point. Add new market packs here.
 *
 * The active pack is selected via site_settings.accounting_locale (or, as a
 * client-side fallback, the existing useAccountingLocale hook).
 *
 * Modules (accounting, invoicing, purchasing, payroll, reconciliation) read
 * from getActivePack() and never import country-specific data directly.
 */
import type { AccountingLocalePack } from './types';
import { sePack } from './se';
import { ifrsGenericPack } from './generic';
import { ACTIVE_PACK_STORAGE_KEY } from './active-pack-events';

// Event plumbing lives apart from the packs so the app shell can subscribe
// without loading any chart of accounts. Re-exported: importers are unchanged.
export { ACTIVE_PACK_STORAGE_KEY, ACTIVE_PACK_EVENT, setActivePackId, onActivePackChange } from './active-pack-events';

export const LOCALE_PACKS: Record<string, AccountingLocalePack> = {
  [sePack.id]: sePack,
  [ifrsGenericPack.id]: ifrsGenericPack,
};

export const DEFAULT_LOCALE_ID = 'se-bas2024';

/**
 * Resolve the pack for a business's COUNTRY — the Odoo model. Setting the
 * company country on an Odoo instance auto-installs the matching l10n_*
 * package, with l10n_generic_coa as the fallback; here, packs declare
 * `countries` and ifrs-generic declares ['*']. An exact country match beats
 * the wildcard, so SE → se-bas2024 while DE (no German pack yet) → the
 * generic IFRS chart rather than, absurdly, Swedish BAS.
 *
 * This is the top of the activation precedence (existing choice always wins):
 *   explicit choice  >  packForCountry(company country)  >  template default
 */
export function packForCountry(country: string | null | undefined): AccountingLocalePack | null {
  if (!country) return null;
  const code = country.trim().toUpperCase();
  if (!code) return null;
  const all = Object.values(LOCALE_PACKS);
  return (
    all.find((p) => p.countries.some((c) => c.toUpperCase() === code)) ??
    all.find((p) => p.countries.includes('*')) ??
    null
  );
}

export function listPacks(): AccountingLocalePack[] {
  return Object.values(LOCALE_PACKS);
}

export function getPack(id: string | null | undefined): AccountingLocalePack {
  if (!id) return LOCALE_PACKS[DEFAULT_LOCALE_ID];
  return LOCALE_PACKS[id] ?? LOCALE_PACKS[DEFAULT_LOCALE_ID];
}

/**
 * Synchronous active-pack lookup. Reads localStorage so callers (modules,
 * AI instructions) always get the latest value without prop-drilling.
 * Server/edge code should read from site_settings instead.
 */
export function getActivePack(): AccountingLocalePack {
  if (typeof window === 'undefined' || !window.localStorage) return LOCALE_PACKS[DEFAULT_LOCALE_ID];
  const id = window.localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) || DEFAULT_LOCALE_ID;
  return getPack(id);
}

export type { AccountingLocalePack } from './types';
export * from './types';
