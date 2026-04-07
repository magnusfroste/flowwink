import { useState, useEffect } from 'react';

export interface AccountingLocaleOption {
  value: string;
  label: string;
  description: string;
}

export const ACCOUNTING_LOCALES: AccountingLocaleOption[] = [
  { value: 'se-bas2024', label: 'BAS 2024 (Sweden)', description: 'Swedish BAS standard — full VAT support, SIE-compatible' },
  { value: 'ifrs-generic', label: 'IFRS (Generic)', description: 'International Financial Reporting Standards — works globally' },
  { value: 'us-gaap', label: 'US GAAP (Basic)', description: 'Generally Accepted Accounting Principles — US market' },
];

const STORAGE_KEY = 'accounting-locale';

export function useAccountingLocale() {
  const [locale, setLocaleState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || 'se-bas2024';
    }
    return 'se-bas2024';
  });

  const setLocale = (value: string) => {
    setLocaleState(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  return { locale, setLocale, locales: ACCOUNTING_LOCALES };
}
