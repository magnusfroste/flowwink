import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFiscalYear } from './FiscalYearContext';
import { cn } from '@/lib/utils';

/**
 * Which years you can select comes from the LEDGER, via list_fiscal_years().
 *
 * This component used to ask `accounting_periods` — the closing register, which
 * gets a row only when a month is closed. On liteit that table was empty while
 * the ledger held 135 verifications across five years, so the selector offered
 * the current year ±1 and nothing else: three years, 83 verifications
 * unreachable, and every entry in the list badged "Upcoming" because no rows
 * meant no information and no information was rendered as a claim.
 */
type Status = 'open' | 'closed' | 'upcoming';

interface FiscalYearRow {
  fiscal_year: number;
  entry_count: number;
  months_closed: number;
  status: Status;
  is_current: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  closed: 'Closed',
  upcoming: 'Upcoming',
};

const STATUS_CLASS: Record<Status, string> = {
  open: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  closed: 'bg-muted text-muted-foreground',
  upcoming: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export function FiscalYearSelector() {
  const { year, setYear } = useFiscalYear();

  const { data: rows } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: async (): Promise<FiscalYearRow[]> => {
      const { data, error } = await supabase.rpc('list_fiscal_years' as never);
      if (error) throw error;
      return (data ?? []) as unknown as FiscalYearRow[];
    },
    staleTime: 5 * 60_000,
  });

  const { years, byYear } = useMemo(() => {
    const byYear = new Map<number, FiscalYearRow>();
    (rows ?? []).forEach((r) => byYear.set(r.fiscal_year, r));
    // The selected year is always selectable, even if it holds nothing yet —
    // otherwise a stored preference could point at an option that is not there.
    const set = new Set<number>([...byYear.keys(), year]);
    return { years: Array.from(set).sort((a, b) => b - a), byYear };
  }, [rows, year]);

  // Before the query resolves we know nothing, so we claim nothing.
  const statusOf = (y: number): Status | null => byYear.get(y)?.status ?? null;
  const currentStatus = statusOf(year);

  const badge = (s: Status | null) =>
    s && (
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', STATUS_CLASS[s])}>
        {STATUS_LABEL[s]}
      </span>
    );

  return (
    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
      <SelectTrigger className="w-[180px] h-9">
        {/* Render our own label instead of <SelectValue /> so the selected
            item's badge doesn't duplicate the trigger's status pill. */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-muted-foreground">FY</span>
          <span className="font-medium tabular-nums">{year}</span>
          <span className="ml-auto">{badge(currentStatus)}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => {
          const row = byYear.get(y);
          return (
            <SelectItem key={y} value={String(y)}>
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">{y}</span>
                {badge(statusOf(y))}
                {!!row?.entry_count && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {row.entry_count}
                  </span>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
