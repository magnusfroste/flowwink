import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CalendarRange, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';
import { fiscalYearOf, fiscalYearRange, type ExplicitFiscalYear } from '@/lib/fiscal-year';

interface ListedYear extends ExplicitFiscalYear { notes?: string | null; explicit: boolean }

/**
 * The fiscal years as the ledger sees them: the one today belongs to (derived
 * from the start month), and the explicit rows — a short first year, a year
 * the business changed its start month. Everything else follows the start
 * month, so most businesses never add a row here.
 */
export function FiscalYearsCard({ startMonth }: { startMonth: number }) {
  const qc = useQueryClient();
  const { formatDate } = usePlatformFormat();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [label, setLabel] = useState('');

  const { data: rows = [] } = useQuery({
    queryKey: ['fiscal-years', 'explicit', 'managed'],
    queryFn: async (): Promise<ListedYear[]> => {
      const { data, error } = await supabase.rpc('manage_fiscal_year' as never, { p_action: 'list' } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ListedYear[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fiscal-years'] });
  };
  const set = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('manage_fiscal_year' as never, {
        p_action: 'set', p_date_from: from, p_date_to: to, p_label: label || null,
      } as never);
      if (error) throw error;
      const res = data as { success?: boolean; error?: string } | null;
      if (res && res.success === false) throw new Error(res.error ?? 'Could not save the fiscal year');
      return res;
    },
    onSuccess: () => { toast.success('Fiscal year saved'); setFrom(''); setTo(''); setLabel(''); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (key: number) => {
      const { data, error } = await supabase.rpc('manage_fiscal_year' as never, { p_action: 'delete', p_key: key } as never);
      if (error) throw error;
      const res = data as { success?: boolean; error?: string } | null;
      if (res && res.success === false) throw new Error(res.error ?? 'Could not remove the fiscal year');
    },
    onSuccess: () => { toast.success('Fiscal year removed — it follows the start month again'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = businessToday();
  const current = fiscalYearRange(fiscalYearOf(today, startMonth, rows), startMonth, rows);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Fiscal years
        </CardTitle>
        <CardDescription>
          Reports, period locks, opening balances and voucher numbering all run on the fiscal year.
          Most years follow the start month above; add a row only for a year that differs — a short
          first year, or the year the start month changed. A year is named by the calendar year it ends in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <span className="text-muted-foreground">Today is in </span>
          <span className="font-medium">{current.label}</span>
          <span className="text-muted-foreground"> — {formatDate(current.fromDate)} to {formatDate(current.toDate)} ({current.months} months)</span>
        </div>

        {rows.length > 0 && (
          <div className="divide-y rounded-md border">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium tabular-nums w-24">{r.label || r.key}</span>
                <span className="text-muted-foreground">{formatDate(r.date_from)} – {formatDate(r.date_to)}</span>
                <Badge variant="outline" className="ml-auto">explicit</Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove fiscal year ${r.label || r.key}`} onClick={() => remove.mutate(r.key)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <div className="space-y-1">
            <Label htmlFor="fy-from" className="text-xs">First day</Label>
            <Input id="fy-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fy-to" className="text-xs">Last day</Label>
            <Input id="fy-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fy-label" className="text-xs">Label (optional)</Label>
            <Input id="fy-label" value={label} placeholder="e.g. 2025/26" onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button size="sm" disabled={!from || !to || set.isPending} onClick={() => set.mutate()}>Add year</Button>
        </div>
      </CardContent>
    </Card>
  );
}
