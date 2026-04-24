import { useEffect, useState } from 'react';
import {
  listPacks,
  getPack,
  DEFAULT_LOCALE_ID,
  ACTIVE_PACK_STORAGE_KEY,
  setActivePackId,
  onActivePackChange,
} from '@/lib/locale-packs';

export interface AccountingLocaleOption {
  value: string;
  label: string;
  description: string;
}

/**
 * Locale options are derived from the locale-pack registry so adding a new
 * pack (DE/UK/US/...) automatically surfaces it in Settings — no UI change
 * required. See src/lib/locale-packs/index.ts.
 */
export const ACCOUNTING_LOCALES: AccountingLocaleOption[] = listPacks().map((p) => ({
  value: p.id,
  label: p.label,
  description: p.description,
}));

export function useAccountingLocale() {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(ACTIVE_PACK_STORAGE_KEY) || DEFAULT_LOCALE_ID;
    }
    return DEFAULT_LOCALE_ID;
  });

  // Stay in sync when another component (or another tab) switches the pack.
  useEffect(() => {
    return onActivePackChange((id) => setLocaleState(id));
  }, []);

  const setLocale = (value: string) => {
    setLocaleState(value);
    setActivePackId(value);
  };

  return { locale, setLocale, locales: ACCOUNTING_LOCALES, pack: getPack(locale) };
}
