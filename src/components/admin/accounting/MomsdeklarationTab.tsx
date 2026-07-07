import { useEffect, useState } from 'react';
import { useFiscalYear } from './FiscalYearContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileCheck2, Loader2 } from 'lucide-react';

interface VatBox { code: string; label: string; kind: string; amount_cents: number }
interface VatReturn {
  form: string; version: string;
  period: { from: string; to: string };
  boxes: VatBox[];
  net_to_pay_cents: number;
  direction: 'pay_to_skatteverket' | 'refund_from_skatteverket';
  verification: { output_vat_cents: number; input_vat_cents: number; matches_box_49: boolean };
}

const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];

function fmtSek(cents: number) {
  return (cents / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MomsdeklarationTab() {
  const now = new Date();
  const { year: ctxYear } = useFiscalYear();
  const [year, setYear] = useState<number>(ctxYear);
  useEffect(() => { setYear(ctxYear); }, [ctxYear]);
  const [mode, setMode] = useState<'month' | 'quarter'>('month');
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [quarter, setQuarter] = useState<number>(Math.floor(now.getMonth() / 3) + 1);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['vat-return-se', year, mode, month, quarter],
    queryFn: async (): Promise<VatReturn> => {
      const body = mode === 'month' ? { year, month } : { year, quarter };
      const { data, error } = await supabase.functions.invoke('accounting-vat-return-se', { body });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as VatReturn;
    },
  });

  const boxByCode = (code: string) => data?.boxes.find((b) => b.code === code);
  const netCents = data?.net_to_pay_cents ?? 0;

  const renderRow = (code: string) => {
    const b = boxByCode(code);
    if (!b) return null;
    const isNet = code === '49';
    return (
      <TableRow key={code} className={isNet ? 'font-semibold border-t-2 border-border' : (b.amount_cents === 0 ? 'opacity-60' : '')}>
        <TableCell className="font-mono text-xs">{code}</TableCell>
        <TableCell>{b.label}</TableCell>
        <TableCell><Badge variant="outline" className="text-[10px]">{b.kind}</Badge></TableCell>
        <TableCell className={`text-right font-mono ${isNet ? (b.amount_cents >= 0 ? 'text-destructive' : 'text-success') : ''}`}>
          {fmtSek(b.amount_cents)}
        </TableCell>
      </TableRow>
    );
  };

  const ORDER = ['05','20','21','22','35','39','41','10','11','12','30','31','32','48','49'];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5" />
            Momsdeklaration (SKV 4700)
          </CardTitle>
          <CardDescription>
            Summerar bokförda transaktioner per BAS 2024-momskonto → rutorna på Skatteverkets blankett.
            Mappning: SE-locale-pack, version 2026.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Year</label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Period</label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'month' | 'quarter')}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode === 'month' ? (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Month</label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Quarter</label>
                <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4].map((q) => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardDescription>Utgående moms (10+11+12+30+31+32)</CardDescription></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{fmtSek(data.verification.output_vat_cents)} kr</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Ingående moms (ruta 48)</CardDescription></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{fmtSek(data.verification.input_vat_cents)} kr</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Ruta 49 — {netCents >= 0 ? 'Att betala' : 'Återbetalning'}</CardDescription></CardHeader>
              <CardContent>
                <div className={`text-2xl font-semibold ${netCents >= 0 ? 'text-destructive' : 'text-success'}`}>
                  {fmtSek(netCents)} kr
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.direction === 'pay_to_skatteverket' ? 'Till Skatteverket' : 'Från Skatteverket'}
                  {!data.verification.matches_box_49 && (
                    <span className="text-destructive"> · Integritetsfel: ruta 49 stämmer ej med utgående − ingående</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead className="text-right">Belopp (kr)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ORDER.map(renderRow)}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
