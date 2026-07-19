import { useEffect, useState } from 'react';
import { useFiscalYear } from './FiscalYearContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { AccountingTabHeader } from './AccountingTabHeader';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';

interface VatBox { code: string; label: string; kind: string; amount_cents: number }
interface VatReturn {
  form: string; version: string;
  period: { from: string; to: string };
  boxes: VatBox[];
  net_to_pay_cents: number;
  direction: 'pay_to_skatteverket' | 'refund_from_skatteverket';
  verification: { output_vat_cents: number; input_vat_cents: number; matches_box_49: boolean };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORDER = ['05', '20', '21', '22', '35', '39', '41', '10', '11', '12', '30', '31', '32', '48', '49'];

export function MomsdeklarationTab() {
  const now = new Date();
  const { year: ctxYear } = useFiscalYear();
  const { data: prefs } = useAccountingPreferences();
  const [year, setYear] = useState<number>(ctxYear);
  useEffect(() => { setYear(ctxYear); }, [ctxYear]);
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);

  const fmt = (cents: number) => {
    const decimals = prefs?.decimals ?? 2;
    const decSep = prefs?.decimalSeparator ?? ',';
    const thouSep = prefs?.thousandsSeparator ?? ' ';
    const neg = cents < 0;
    const n = Math.abs(cents) / 100;
    const [intPart, decPart] = n.toFixed(decimals).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
    const body = decimals > 0 ? `${grouped}${decSep}${decPart}` : grouped;
    return neg ? `\u2212${body}` : body;
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['vat-return-se', year, mode, month, quarter],
    queryFn: async (): Promise<VatReturn> => {
      const body = mode === 'month' ? { year, month } : { year, quarter };
      const data = await callSkill('prepare_vat_return', body);
      return data as unknown as VatReturn;
    },
  });

  const boxByCode = (code: string) => data?.boxes.find((b) => b.code === code);

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Momsdeklaration"
        description="Sums posted transactions per BAS 2024 tax account and maps them to Skatteverket's VAT-return boxes (SKV 4700, version 2026)."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Refresh
          </Button>
        }
      />

      <div className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-24 h-9"
            aria-label="Year"
          />
          <Select value={mode} onValueChange={(v) => setMode(v as 'month' | 'quarter')}>
            <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'month' ? (
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-[3rem_1fr_auto_auto] gap-6 px-6 py-2 text-xs text-muted-foreground border-b">
          <div>Box</div>
          <div>Description</div>
          <div className="text-right w-24">Type</div>
          <div className="text-right w-32">Amount</div>
        </div>

        {!data ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            {ORDER.map((code) => {
              const b = boxByCode(code);
              if (!b) return null;
              const isNet = code === '49';
              return (
                <div
                  key={code}
                  className={`grid grid-cols-[3rem_1fr_auto_auto] items-baseline gap-6 px-6 py-2 text-sm ${
                    isNet ? 'border-t font-semibold' : 'border-b border-border/40'
                  } ${!isNet && b.amount_cents === 0 ? 'opacity-50' : ''}`}
                >
                  <div className="font-mono text-muted-foreground">{code}</div>
                  <div className="truncate">{b.label}</div>
                  <div className="text-right text-xs text-muted-foreground w-24 uppercase tracking-wide">{b.kind}</div>
                  <div className="text-right font-mono tabular-nums w-32">{fmt(b.amount_cents)}</div>
                </div>
              );
            })}
            <div className="px-6 py-2 border-t text-xs text-muted-foreground">
              {data.direction === 'pay_to_skatteverket'
                ? <>Net payable to Skatteverket: <span className="font-mono tabular-nums">{fmt(data.net_to_pay_cents)}</span></>
                : <>Refund from Skatteverket: <span className="font-mono tabular-nums">{fmt(-data.net_to_pay_cents)}</span></>}
              {!data.verification.matches_box_49 && (
                <span className="ml-2 text-destructive">· Integrity check failed: box 49 ≠ output − input.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
