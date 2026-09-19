import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AccountingTabHeader } from './AccountingTabHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { cn } from '@/lib/utils';

interface Week {
  week_start: string;
  receivables_cents: number;
  subscriptions_cents: number;
  payables_cents: number;
  net_cents: number;
  closing_cents: number;
}

interface Forecast {
  success: boolean;
  error?: string;
  currency: string;
  opening_cents: number;
  closing_cents: number;
  lowest: { week_start: string; closing_cents: number };
  overdue_receivables_cents: number;
  overdue_payables_cents: number;
  by_week: Week[];
  largest_items: Array<{ kind: string; ref: string; counterparty: string | null; due: string; amount_cents: number; overdue: boolean }>;
  not_converted_currencies: string[];
  not_included: string[];
}

/**
 * Cash-flow forecast: the bank balance today, and what open customer invoices,
 * open supplier bills and recurring subscriptions do to it week by week. Every
 * number comes from cash_flow_forecast — the same answer an agent reads.
 */
export function CashFlowTab() {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const [withSubscriptions, setWithSubscriptions] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cash-flow-forecast', withSubscriptions],
    queryFn: async () => {
      const { data: res, error: rpcErr } = await supabase.rpc('cash_flow_forecast' as never, {
        p_weeks: 13, p_include_subscriptions: withSubscriptions,
      } as never);
      if (rpcErr) throw rpcErr;
      return res as unknown as Forecast;
    },
  });

  const money = (cents: number) => formatCurrency(cents, data?.currency);

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Cash flow"
        description="The bank balance today and the next 13 weeks of expected payments in and out."
        actions={
          <div className="flex items-center gap-2">
            <Switch id="cff-subs" checked={withSubscriptions} onCheckedChange={setWithSubscriptions} />
            <Label htmlFor="cff-subs" className="text-sm">Include subscriptions</Label>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error || !data?.success ? (
        <p className="text-sm text-destructive">{(error as Error | null)?.message ?? data?.error ?? 'The forecast could not be computed.'}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="In the bank now" value={money(data.opening_cents)} />
            <Stat label="In 13 weeks" value={money(data.closing_cents)} />
            <Stat label={`Lowest (week of ${formatDate(data.lowest.week_start)})`} value={money(data.lowest.closing_cents)} warn={data.lowest.closing_cents < 0} />
            <Stat label="Overdue in / out" value={`${money(data.overdue_receivables_cents)} / ${money(data.overdue_payables_cents)}`} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                <TableHead className="text-right">Customer invoices</TableHead>
                <TableHead className="text-right">Subscriptions</TableHead>
                <TableHead className="text-right">Supplier bills</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.by_week.map((w) => (
                <TableRow key={w.week_start}>
                  <TableCell>{formatDate(w.week_start)}</TableCell>
                  <TableCell className="text-right font-mono">{w.receivables_cents ? money(w.receivables_cents) : '—'}</TableCell>
                  <TableCell className="text-right font-mono">{w.subscriptions_cents ? money(w.subscriptions_cents) : '—'}</TableCell>
                  <TableCell className="text-right font-mono">{w.payables_cents ? money(-w.payables_cents) : '—'}</TableCell>
                  <TableCell className={cn('text-right font-mono', w.net_cents < 0 && 'text-destructive')}>{money(w.net_cents)}</TableCell>
                  <TableCell className={cn('text-right font-mono font-medium', w.closing_cents < 0 && 'text-destructive')}>{money(w.closing_cents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.largest_items.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Largest items</h3>
              <ul className="space-y-1 text-sm">
                {data.largest_items.map((i) => (
                  <li key={`${i.kind}-${i.ref}-${i.due}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {i.kind === 'payable' ? 'Bill' : i.kind === 'subscription' ? 'Subscription' : 'Invoice'} {i.kind === 'subscription' ? '' : i.ref} · {i.counterparty ?? '—'}
                      {i.overdue && <Badge variant="destructive" className="ml-2 text-[10px]">overdue</Badge>}
                    </span>
                    <span className={cn('font-mono', i.amount_cents < 0 && 'text-destructive')}>
                      {formatDate(i.due)} · {money(i.amount_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Not included: {data.not_included.join(', ')}.
            {data.not_converted_currencies.length > 0 && ` Items in ${data.not_converted_currencies.join(', ')} are left out — they have no stored exchange rate.`}
            {' '}Overdue items are placed in the first week.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-mono text-lg', warn && 'text-destructive')}>{value}</div>
    </div>
  );
}
