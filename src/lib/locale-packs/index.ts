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
export const ACTIVE_PACK_STORAGE_KEY = 'accounting-locale';
export const ACTIVE_PACK_EVENT = 'flowwink:active-locale-pack-changed';

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
  if (typeof window === 'undefined') return LOCALE_PACKS[DEFAULT_LOCALE_ID];
  const id = window.localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) || DEFAULT_LOCALE_ID;
  return getPack(id);
}

/**
 * Update the active pack id and broadcast a change event so subscribers
 * (React Query cache, module instructions, UI) can refresh in lockstep.
 * Includes cross-tab sync via the storage event.
 */
export function setActivePackId(id: string) {
  if (typeof window === 'undefined') return;
  const previous = window.localStorage.getItem(ACTIVE_PACK_STORAGE_KEY);
  window.localStorage.setItem(ACTIVE_PACK_STORAGE_KEY, id);
  if (previous !== id) {
    window.dispatchEvent(
      new CustomEvent(ACTIVE_PACK_EVENT, { detail: { id, previous } }),
    );
  }
}

/**
 * Subscribe to active-pack changes (same tab + cross-tab via storage event).
 * Returns an unsubscribe function.
 */
export function onActivePackChange(cb: (id: string) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const localHandler = (e: Event) => {
    const detail = (e as CustomEvent<{ id: string }>).detail;
    if (detail?.id) cb(detail.id);
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === ACTIVE_PACK_STORAGE_KEY && e.newValue) cb(e.newValue);
  };
  window.addEventListener(ACTIVE_PACK_EVENT, localHandler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(ACTIVE_PACK_EVENT, localHandler);
    window.removeEventListener('storage', storageHandler);
  };
}

export type { AccountingLocalePack } from './types';
export * from './types';
