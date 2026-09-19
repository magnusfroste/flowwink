import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AccountingTabHeader } from './AccountingTabHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

interface Account { account_code: string; account_name: string | null; net_local_cents: number; net_translated_cents: number }
interface Entity { code: string; name: string; currency: string; closing_rate: number | null; accounts: Account[]; net_local_cents: number; net_translated_cents: number }
interface Report {
  success: boolean;
  error?: string;
  as_of: string;
  method: string;
  presentation_currency: string;
  entities: Entity[];
  missing_rates: string[];
  consolidated_net_cents: number;
}

/**
 * Group consolidation: every entity's trial balance — the base ledger and each
 * subsidiary — translated into one presentation currency at the closing rate.
 * The numbers are consolidation_report's, the same answer an agent reads.
 */
export function ConsolidationTab() {
  const { formatCurrency, formatNumber } = usePlatformFormat();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['consolidation-report', asOf, currency],
    queryFn: async () => {
      const { data: res, error: rpcErr } = await supabase.rpc('consolidation_report' as never, {
        p_presentation_currency: currency.trim() || null, p_as_of: asOf,
      } as never);
      if (rpcErr) throw rpcErr;
      return res as unknown as Report;
    },
  });

  const pres = data?.presentation_currency;
  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Consolidation"
        description="Each entity's trial balance translated into one presentation currency at the closing rate."
        actions={
          <div className="flex items-end gap-2">
            <div>
              <Label htmlFor="cons-date" className="text-xs">Closing date</Label>
              <Input id="cons-date" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-8" />
            </div>
            <div>
              <Label htmlFor="cons-cur" className="text-xs">Currency</Label>
              <Input id="cons-cur" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))} placeholder="Base" className="h-8 w-20" />
            </div>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error || !data?.success ? (
        <p className="text-sm text-destructive">{(error as Error | null)?.message ?? data?.error ?? 'The report could not be computed.'}</p>
      ) : (
        <>
          {data.missing_rates.length > 0 && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              No exchange rate on or before {data.as_of} for: {data.missing_rates.join(', ')}. Those entities are shown untranslated — import rates first.
            </p>
          )}
          {data.entities.map((e) => {
            return (
              <div key={e.code} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{e.name} <span className="text-muted-foreground">({e.code}{` · ${e.currency}`}{e.closing_rate != null ? ` · rate ${formatNumber(e.closing_rate, { maximumFractionDigits: 6 })}` : ' · no rate'})</span></h3>
                  <span className="font-mono text-sm">{formatCurrency(e.net_translated_cents, pres)}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Local</TableHead>
                      <TableHead className="text-right">{pres}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {e.accounts.map((a) => (
                      <TableRow key={a.account_code}>
                        <TableCell><span className="font-mono">{a.account_code}</span> {a.account_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(a.net_local_cents, e.currency)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(a.net_translated_cents, pres)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm font-medium">Consolidated net ({data.method})</span>
            <span className="font-mono">{formatCurrency(data.consolidated_net_cents, pres)}</span>
          </div>
        </>
      )}
    </div>
  );
}
