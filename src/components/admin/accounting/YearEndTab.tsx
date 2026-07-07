import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { AccountingTabHeader } from './AccountingTabHeader';

export function YearEndTab() {
  const [year, setYear] = useState(new Date().getFullYear() - 1);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['year-end-readiness', year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('year_end_readiness', { p_year: year });
      if (error) throw error;
      return data as any;
    },
  });

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Year-End Readiness"
        description="Checklist before closing the annual books. Locale packs add country-specific year-end proposals on top."
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="w-28 h-9"
            aria-label="Fiscal year"
          />
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Run checks
          </Button>
          {data && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              {data.ready ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>{year} is ready for year-end close</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-warning" />
                  <span>{year} not yet ready</span>
                </>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !data ? (
          <div className="py-16 text-center">
            <h3 className="text-sm font-medium mb-1">No checks run yet</h3>
            <p className="text-sm text-muted-foreground">Select a fiscal year and run the readiness checklist.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr_auto] gap-4 px-6 py-2 text-xs text-muted-foreground border-b">
              <div className="w-5"></div>
              <div>Check</div>
              <div className="text-right">Status</div>
            </div>
            {data.checks?.map((c: any) => (
              <div
                key={c.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3 text-sm border-b border-border/40 last:border-b-0"
              >
                {c.pass ? (
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-warning shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-muted-foreground">{c.detail}</div>
                </div>
                <div className={`text-xs ${c.pass ? 'text-muted-foreground' : 'text-warning'}`}>
                  {c.pass ? 'OK' : 'Action needed'}
                </div>
              </div>
            ))}
            <div className="px-6 py-2 border-t text-xs text-muted-foreground">
              Generated {new Date(data.generated_at).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
