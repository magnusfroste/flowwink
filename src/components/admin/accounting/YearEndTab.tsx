import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Calendar, RefreshCw } from 'lucide-react';

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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Year-End Readiness
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Checklist before closing the annual books. Locale packs add country-specific year-end proposals on top.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div>
              <Label>Fiscal year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-32"
              />
            </div>
            <Button onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} /> Run checks
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data ? (
            <>
              <div className={`p-4 rounded-md flex items-center gap-3 ${data.ready ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                {data.ready ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-amber-600" />
                )}
                <div>
                  <p className="font-semibold">
                    {data.ready ? `${year} is ready for year-end close` : `${year} not yet ready`}
                  </p>
                  <p className="text-xs text-muted-foreground">Generated {new Date(data.generated_at).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-2">
                {data.checks?.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-md border">
                    {c.pass ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-amber-600 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                    <Badge variant={c.pass ? 'secondary' : 'destructive'}>
                      {c.pass ? 'OK' : 'Action needed'}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
