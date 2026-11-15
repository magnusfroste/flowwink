import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { megabytes, sizeHeadline, lastRunLine, normalizeRetention, RETENTION_DEFAULTS, type SizeReport, type RetentionSettings } from '@/lib/data-retention';

/**
 * Database size — how full the instance is, what fills it, and the dial that
 * thins the logs every night (prune_logs). The figures are the database's own.
 * A change an agent or a person made is never thinned; what goes is lookups,
 * refused and failed calls and scheduled ticks, after the days set here.
 */
export function DatabaseSizeCard() {
  const { toast } = useToast();
  const { formatNumber } = usePlatformFormat();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['database-size'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('database_size_report' as never);
      if (error) throw error;
      return data as unknown as SizeReport;
    },
  });

  const [form, setForm] = useState<RetentionSettings>(RETENTION_DEFAULTS);
  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data?.settings]);

  const save = useMutation({
    mutationFn: async () => {
      const value = normalizeRetention(form);
      const { error } = await supabase.from('site_settings').upsert({ key: 'data_retention', value: value as never }, { onConflict: 'key' });
      if (error) throw error;
      return value;
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'The next nightly run uses these days.' });
      qc.invalidateQueries({ queryKey: ['database-size'] });
    },
    onError: (e: Error) => toast({ title: 'Not saved', description: e.message, variant: 'destructive' }),
  });

  const dirty = !!data && JSON.stringify(normalizeRetention(form)) !== JSON.stringify(data.settings);
  const number = (key: 'answers_days' | 'rows_days' | 'quota_mb') => ({
    type: 'number' as const,
    min: 1,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: Number(e.target.value) })),
    className: 'h-8',
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-sky-500" />
            Database size
          </CardTitle>
          <CardDescription>{isLoading ? '…' : error || !data ? 'size unavailable' : sizeHeadline(data)}</CardDescription>
        </div>
        {data &&
          (data.level === 'ok' ? (
            <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Room to grow</Badge>
          ) : (
            <Badge variant={data.level === 'high' ? 'destructive' : 'secondary'} className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {data.level === 'high' ? 'Nearly full' : 'Filling up'}
            </Badge>
          ))}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data ? null : (
          <>
            <Progress value={Math.min(100, data.pct)} aria-label="Share of the database quota in use" />
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Largest tables</p>
              <ul className="space-y-0.5 text-sm">
                {data.tables.slice(0, 5).map((t) => (
                  <li key={t.name} className="flex justify-between gap-3">
                    <span className="truncate font-mono text-xs">{t.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {megabytes(t.bytes)} · {formatNumber(t.est_rows)} rows
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Thin the logs every night</p>
                  <p className="text-xs text-muted-foreground">
                    Changes are kept. Lookups, refused and failed calls and scheduled ticks are shortened, then removed.
                  </p>
                </div>
                <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))} aria-label="Thin the logs every night" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="retention-answers" className="text-xs">Shorten answers after (days)</Label>
                  <Input id="retention-answers" {...number('answers_days')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="retention-rows" className="text-xs">Remove rows after (days)</Label>
                  <Input id="retention-rows" {...number('rows_days')} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="retention-quota" className="text-xs">Database quota (MB)</Label>
                  <Input id="retention-quota" {...number('quota_mb')} />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{lastRunLine(data.last_run)}</p>
                <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                  Save
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
