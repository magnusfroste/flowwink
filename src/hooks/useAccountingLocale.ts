import { useState } from 'react';
import { listPacks, getPack, DEFAULT_LOCALE_ID } from '@/lib/locale-packs';

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

const STORAGE_KEY = 'accounting-locale';

export function useAccountingLocale() {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE_ID;
    }
    return DEFAULT_LOCALE_ID;
  });

  const setLocale = (value: string) => {
    setLocaleState(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  return { locale, setLocale, locales: ACCOUNTING_LOCALES, pack: getPack(locale) };
}
