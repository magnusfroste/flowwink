import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashCard, Subline, QuietEmpty } from './_shared';
import { useFiscalYear } from '../FiscalYearContext';
import { cn } from '@/lib/utils';

interface Result {
  closed: number;
  total: number;
  pending: number;
}

export function PeriodStatusCard({ onNavigate }: { onNavigate?: (tabId: string) => void }) {
  const { year } = useFiscalYear();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dash', 'period-status', year],
    queryFn: async (): Promise<Result> => {
      const [periods, pending] = await Promise.all([
        supabase
          .from('accounting_periods')
          .select('status')
          .eq('fiscal_year', year),
        supabase
          .from('pending_operations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);
      if (periods.error) throw periods.error;
      if (pending.error) throw pending.error;
      const rows = periods.data ?? [];
      const closed = rows.filter((r: any) => r.status === 'closed' || r.status === 'locked').length;
      return {
        closed,
        // A fiscal year has twelve months. The denominator is NOT the number of
        // rows in accounting_periods — that table only gets a row when a month
        // is closed, so counting rows made the card read "3 of 3 periods
        // closed" when nine months were still open.
        total: 12,
        pending: pending.count ?? 0,
      };
    },
    staleTime: 60_000,
  });

  const hasPending = (data?.pending ?? 0) > 0;

  return (
    <DashCard label="Period status">
      {isLoading ? (
        <QuietEmpty>Loading…</QuietEmpty>
      ) : isError || !data ? (
        <QuietEmpty>No data yet.</QuietEmpty>
      ) : (
        <>
          <div className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {data.closed} <span className="text-muted-foreground font-normal text-xl">of {data.total}</span>
          </div>
          <Subline>periods closed · fiscal year {year}</Subline>
          {hasPending && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate?.('pending');
              }}
              className={cn(
                'mt-1 text-left text-xs text-amber-700 dark:text-amber-400 hover:underline',
              )}
            >
              {data.pending} operation{data.pending === 1 ? '' : 's'} awaiting approval →
            </button>
          )}
        </>
      )}
    </DashCard>
  );
}
