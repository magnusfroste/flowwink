import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';
import { businessToday } from '@/lib/platform-fallbacks';
import { fiscalYearOf, fiscalYearRange, type ExplicitFiscalYear } from '@/lib/fiscal-year';

/**
 * The fiscal year the accounting pages show.
 *
 * `year` is the KEY — the calendar year the fiscal year ends in — and the
 * dates come from the same model the database uses (fiscal_year_of /
 * fiscal_year_range, 20261026120000): the start month in Accounting →
 * Settings, with explicit rows in `fiscal_years` (a short first year)
 * winning. `${year}-01-01` was the whole model before; a July–June business
 * reported the wrong half of two years.
 */
interface FiscalYearContextValue {
  year: number;
  setYear: (y: number) => void;
  /** First day of the fiscal year. */
  fromDate: string;
  /** Last day of the fiscal year. */
  toDate: string;
  /** "2026", or "2025/26" for a year that starts earlier; the row's own label when set. */
  label: string;
  /** Calendar months the year spans — 12, or fewer for a short year. */
  months: number;
  /** The fiscal year today belongs to. */
  currentKey: number;
  startMonth: number;
  explicitYears: ExplicitFiscalYear[];
}

const STORAGE_KEY = 'accounting.fiscalYear';

const FiscalYearContext = createContext<FiscalYearContextValue | null>(null);

function useFiscalModel() {
  const { data: prefs, isLoading: prefsLoading } = useAccountingPreferences();
  const { data: explicitYears = [], isLoading: yearsLoading } = useQuery({
    queryKey: ['fiscal-years', 'explicit'],
    queryFn: async (): Promise<ExplicitFiscalYear[]> => {
      const { data, error } = await supabase
        .from('fiscal_years' as never)
        .select('key, label, date_from, date_to')
        .order('date_from');
      if (error) throw error;
      return (data ?? []) as unknown as ExplicitFiscalYear[];
    },
    staleTime: 5 * 60_000,
  });
  const startMonth = Number(prefs?.fiscalYearStartMonth ?? 1) || 1;
  return { startMonth, explicitYears, loaded: !prefsLoading && !yearsLoading };
}

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const { startMonth, explicitYears, loaded } = useFiscalModel();
  const stored = useRef<number | null>(null);
  const [year, setYearState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > 1900 && n < 3000) { stored.current = n; return n; }
      }
    } catch { /* localStorage unavailable (private mode / SSR) — fall back to the current year. */ }
    return new Date().getFullYear();
  });

  // No remembered choice: the year today belongs to, once the model is known
  // (for a July–June business in August that is next year's key, not this one).
  const settled = useRef(false);
  useEffect(() => {
    if (!loaded || settled.current) return;
    settled.current = true;
    if (stored.current === null) setYearState(fiscalYearOf(businessToday(), startMonth, explicitYears));
  }, [loaded, startMonth, explicitYears]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(year)); } catch { /* localStorage unavailable — the year simply does not persist across reloads. */ }
  }, [year]);

  const value = useMemo<FiscalYearContextValue>(() => {
    const range = fiscalYearRange(year, startMonth, explicitYears);
    return {
      year,
      setYear: setYearState,
      fromDate: range.fromDate,
      toDate: range.toDate,
      label: range.label,
      months: range.months,
      currentKey: fiscalYearOf(businessToday(), startMonth, explicitYears),
      startMonth,
      explicitYears,
    };
  }, [year, startMonth, explicitYears]);

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
      label: String(y),
      months: 12,
      currentKey: y,
      startMonth: 1,
      explicitYears: [],
    };
  }
  return ctx;
}
