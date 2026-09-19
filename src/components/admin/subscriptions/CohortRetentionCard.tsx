import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface Cohort {
  cohort: string;
  started: number;
  retained: Array<{ month: number; active: number; pct: number }> | null;
}

const MONTHS = 12;

/**
 * Cohort retention: of the subscriptions that started in a month, how many are
 * still running k months later. A month that has not happened yet is left
 * empty — the future is unknown, not 100 %.
 */
export function CohortRetentionCard() {
  const { data: cohorts, isLoading } = useQuery({
    queryKey: ['subscription-cohort-retention', MONTHS],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('subscription_cohort_retention' as never, { p_months: MONTHS } as never);
      if (error) throw error;
      return ((data as { cohorts?: Cohort[] } | null)?.cohorts ?? []) as Cohort[];
    },
  });

  const columns = Array.from({ length: MONTHS + 1 }, (_, k) => k);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cohort retention</CardTitle>
        <CardDescription>Share of each start month still subscribed after k months.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !cohorts || cohorts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subscriptions started in the last {MONTHS} months.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="py-1 pr-3 text-left font-medium">Started</th>
                  <th className="py-1 pr-3 text-right font-medium">Count</th>
                  {columns.map((k) => <th key={k} className="px-1 py-1 text-center font-medium">M{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort} className="border-t border-border">
                    <td className="py-1 pr-3 font-medium">{c.cohort}</td>
                    <td className="py-1 pr-3 text-right">{c.started}</td>
                    {columns.map((k) => {
                      const cell = c.retained?.find((r) => r.month === k);
                      return (
                        <td key={k} className="px-1 py-1 text-center">
                          {cell ? (
                            <span
                              className="inline-block min-w-10 rounded bg-primary px-1 py-0.5 text-primary-foreground"
                              style={{ opacity: 0.25 + 0.75 * (cell.pct / 100) }}
                              title={`${cell.active} of ${c.started}`}
                            >
                              {Math.round(cell.pct)}%
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
