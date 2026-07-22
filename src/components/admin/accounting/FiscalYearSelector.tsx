import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFiscalYear } from './FiscalYearContext';
import { cn } from '@/lib/utils';

type Status = 'open' | 'closed' | 'upcoming';

interface PeriodRow {
  fiscal_year: number;
  period_number: number | null;
  status: string | null;
}

function statusFor(rows: PeriodRow[]): Status {
  if (!rows.length) return 'upcoming';
  const anyOpen = rows.some((r) => (r.status ?? '').toLowerCase() === 'open');
  if (anyOpen) return 'open';
  const monthly = rows.filter((r) => r.period_number != null);
  if (monthly.length >= 12) return 'closed';
  return 'open';
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

  const { data: periods } = useQuery({
    queryKey: ['accounting_periods', 'years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_periods' as any)
        .select('fiscal_year, period_number, status');
      if (error) throw error;
      return (data ?? []) as unknown as PeriodRow[];
    },
    staleTime: 5 * 60_000,
  });

  const { years, statusByYear } = useMemo(() => {
    const cy = new Date().getFullYear();
    const map = new Map<number, PeriodRow[]>();
    (periods ?? []).forEach((p) => {
      if (!p.fiscal_year) return;
      const arr = map.get(p.fiscal_year) ?? [];
      arr.push(p);
      map.set(p.fiscal_year, arr);
    });
    const set = new Set<number>(map.keys());
    [cy - 1, cy, cy + 1, year].forEach((y) => set.add(y));
    const years = Array.from(set).sort((a, b) => b - a);
    const statusByYear = new Map<number, Status>();
    years.forEach((y) => statusByYear.set(y, statusFor(map.get(y) ?? [])));
    return { years, statusByYear };
  }, [periods, year]);

  const currentStatus = statusByYear.get(year) ?? 'upcoming';

  return (
    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
      <SelectTrigger className="w-[180px] h-9">
        {/* Render our own label instead of <SelectValue /> so the selected
            item's badge doesn't duplicate the trigger's status pill. */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-muted-foreground">FY</span>
          <span className="font-medium tabular-nums">{year}</span>
          <span
            className={cn(
              'ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              STATUS_CLASS[currentStatus],
            )}
          >
            {STATUS_LABEL[currentStatus]}
          </span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => {
          const s = statusByYear.get(y) ?? 'upcoming';
          return (
            <SelectItem key={y} value={String(y)}>
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">{y}</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    STATUS_CLASS[s],
                  )}
                >
                  {STATUS_LABEL[s]}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
