import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface FiscalYearContextValue {
  year: number;
  setYear: (y: number) => void;
  fromDate: string; // YYYY-01-01
  toDate: string;   // YYYY-12-31
}

const STORAGE_KEY = 'accounting.fiscalYear';

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const currentYear = new Date().getFullYear();
  const [year, setYearState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 1900 && n < 3000) return n;
      }
    } catch { /* localStorage unavailable (private mode / SSR) — fall back to the current year. */ }
    return currentYear;
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(year)); } catch { /* localStorage unavailable — the year simply does not persist across reloads. */ }
  }, [year]);

  const value: FiscalYearContextValue = {
    year,
    setYear: setYearState,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  };

  return (
    <FiscalYearContext.Provider value={value}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear(): FiscalYearContextValue {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) {
    // Safe fallback so components used outside provider still work.
    const y = new Date().getFullYear();
    return {
      year: y,
      setYear: () => {},
      fromDate: `${y}-01-01`,
      toDate: `${y}-12-31`,
    };
  }
  return ctx;
}
