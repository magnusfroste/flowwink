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

export const LOCALE_PACKS: Record<string, AccountingLocalePack> = {
  [sePack.id]: sePack,
  [ifrsGenericPack.id]: ifrsGenericPack,
};

export const DEFAULT_LOCALE_ID = 'se-bas2024';

export function listPacks(): AccountingLocalePack[] {
  return Object.values(LOCALE_PACKS);
}

export function getPack(id: string | null | undefined): AccountingLocalePack {
  if (!id) return LOCALE_PACKS[DEFAULT_LOCALE_ID];
  return LOCALE_PACKS[id] ?? LOCALE_PACKS[DEFAULT_LOCALE_ID];
}

/**
 * Synchronous active-pack lookup using the same localStorage key as
 * useAccountingLocale. Server/edge code should read from site_settings.
 */
export function getActivePack(): AccountingLocalePack {
  if (typeof window === 'undefined') return LOCALE_PACKS[DEFAULT_LOCALE_ID];
  const id = window.localStorage.getItem('accounting-locale') || DEFAULT_LOCALE_ID;
  return getPack(id);
}

export type { AccountingLocalePack } from './types';
export * from './types';
