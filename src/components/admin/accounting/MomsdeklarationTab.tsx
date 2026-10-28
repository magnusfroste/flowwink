import { useEffect, useState } from 'react';
import { useFiscalYear } from './FiscalYearContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { FILINGS_QUERY_KEY } from '@/hooks/useStatutoryFilings';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { AccountingTabHeader } from './AccountingTabHeader';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
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
  // The business's own number format and decimals — one setting for every amount.
  const { formatAmount, formatDate: formatDateShort } = usePlatformFormat();
  const [year, setYear] = useState<number>(ctxYear);
  useEffect(() => { setYear(ctxYear); }, [ctxYear]);
  // The declared VAT return period (Accounting → Settings) picks the default
  // view; a yearly filer still prepares by quarter or month here.
  const { data: prefs } = useAccountingPreferences();
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  useEffect(() => {
    if (prefs?.vatReturnPeriod === 'quarterly') setMode('quarter');
  }, [prefs?.vatReturnPeriod]);
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);

  const fmt = (cents: number) => formatAmount(cents);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['vat-return-se', year, mode, month, quarter],
    queryFn: async (): Promise<VatReturn> => {
      const body = mode === 'month' ? { year, month } : { year, quarter };
      const data = await callSkill('prepare_vat_return', body);
      return data as unknown as VatReturn;
    },
  });

  const boxByCode = (code: string) => data?.boxes.find((b) => b.code === code);

  // The register: was THIS period's return filed? Recording it here, where
  // the return was prepared, is what lets the calendar stop asking.
  const qc = useQueryClient();
  const periodTo = data?.period.to ?? null;
  const { data: filing } = useQuery({
    queryKey: [...FILINGS_QUERY_KEY, 'vat', periodTo],
    enabled: !!periodTo,
    queryFn: async (): Promise<{ id: string; filed_at: string; reference: string | null } | null> => {
      const { data: res, error } = await supabase.rpc('manage_statutory_filing' as never, {
        p_action: 'list', p_kind: 'vat_return', p_from: periodTo, p_to: periodTo,
      } as never);
      if (error) throw error;
      const rows = ((res as { filings?: Array<{ id: string; period_to: string; filed_at: string; reference: string | null }> } | null)?.filings ?? [])
        .filter((f) => f.period_to === periodTo);
      return rows[0] ?? null;
    },
  });
  const markFiled = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const ref = window.prompt('Agency reference (Skatteverket confirmation), optional:') ?? '';
      const signed = data.direction === 'refund_from_skatteverket' ? -Math.abs(data.net_to_pay_cents) : Math.abs(data.net_to_pay_cents);
      const { error } = await supabase.rpc('manage_statutory_filing' as never, {
        p_action: 'record', p_kind: 'vat_return', p_period_from: data.period.from, p_period_to: data.period.to,
        p_reference: ref.trim() || null, p_amount_cents: signed,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('VAT return recorded as filed'); qc.invalidateQueries({ queryKey: FILINGS_QUERY_KEY }); qc.invalidateQueries({ queryKey: ['dash'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Momsdeklaration"
        description="Sums posted transactions per BAS 2024 tax account and maps them to Skatteverket's VAT-return boxes (SKV 4700, version 2026)."
        actions={
          <div className="flex items-center gap-2">
            {filing ? (
              <Badge variant="outline" className="font-normal">Filed {formatDateShort(filing.filed_at)}{filing.reference ? ` · ${filing.reference}` : ''}</Badge>
            ) : data ? (
              <Button size="sm" onClick={() => markFiled.mutate()} disabled={markFiled.isPending}>
                {markFiled.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Mark as filed
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh
            </Button>
          </div>
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
