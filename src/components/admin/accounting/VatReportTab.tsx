import { useEffect, useState } from 'react';
import { useFiscalYear } from './FiscalYearContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVatReport } from '@/hooks/useTax';
import { Download } from 'lucide-react';
import { AccountingTabHeader } from './AccountingTabHeader';
import { useAccountingPreferences } from '@/hooks/useSiteSettings';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function VatReportTab() {
  const { year: ctxYear } = useFiscalYear();
  const { data: prefs } = useAccountingPreferences();
  const [year, setYear] = useState<number>(ctxYear);
  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);
  useEffect(() => { setYear(ctxYear); setStartMonth(1); setEndMonth(12); }, [ctxYear]);
  const { data: rows = [], isLoading } = useVatReport(year, startMonth, endMonth);

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

  const totalOutput = rows.filter((r) => r.category === 'output').reduce((s, r) => s + Number(r.amount_cents), 0);
  const totalInput = rows.filter((r) => r.category === 'input').reduce((s, r) => s + Number(r.amount_cents), 0);
  const netVat = totalOutput - totalInput;

  const exportCsv = () => {
    const header = 'Box,Name,Category,Amount\n';
    const body = rows.map((r) => `${r.grid_code},"${r.grid_name}",${r.category},${(Number(r.amount_cents) / 100).toFixed(2)}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vat-report-${year}-${String(startMonth).padStart(2, '0')}-${String(endMonth).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="VAT Report"
        description="Sums posted journal-entry tax amounts per Skatteverket-ruta for the chosen period."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
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
          <Select value={String(startMonth)} onValueChange={(v) => setStartMonth(Number(v))}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>From {m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(endMonth)} onValueChange={(v) => setEndMonth(Number(v))}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>To {m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 px-6 py-2 text-xs text-muted-foreground border-b">
          <div>Box</div>
          <div className="text-right w-28">Output</div>
          <div className="text-right w-28">Input</div>
          <div className="text-right w-32">Amount</div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <h3 className="text-sm font-medium mb-1">No VAT activity for this period</h3>
            <p className="text-sm text-muted-foreground">Post entries with tax codes to see them summarised here.</p>
          </div>
        ) : (
          <>
            {rows.map((r) => {
              const cents = Number(r.amount_cents);
              const isOutput = r.category === 'output';
              const isInput = r.category === 'input';
              return (
                <div
                  key={r.grid_code}
                  className={`grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-6 px-6 py-2 text-sm border-b border-border/40 last:border-b-0 ${cents === 0 ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-baseline gap-3 min-w-0">
                    <span className="font-mono text-muted-foreground">{r.grid_code}</span>
                    <span className="truncate">{r.grid_name}</span>
                  </div>
                  <div className={`text-right font-mono tabular-nums w-28 ${!isOutput ? 'text-muted-foreground/40' : ''}`}>
                    {isOutput ? fmt(cents) : '\u2014'}
                  </div>
                  <div className={`text-right font-mono tabular-nums w-28 ${!isInput ? 'text-muted-foreground/40' : ''}`}>
                    {isInput ? fmt(cents) : '\u2014'}
                  </div>
                  <div className={`text-right font-mono tabular-nums w-32 ${!isOutput && !isInput ? '' : 'text-muted-foreground'}`}>
                    {fmt(cents)}
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-6 px-6 py-3 border-t font-semibold text-sm">
              <div>Total</div>
              <div className="text-right font-mono tabular-nums w-28">{fmt(totalOutput)}</div>
              <div className="text-right font-mono tabular-nums w-28">{fmt(totalInput)}</div>
              <div className="text-right font-mono tabular-nums w-32">{fmt(netVat)}</div>
            </div>
            <div className="px-6 py-2 border-t text-xs text-muted-foreground">
              {netVat >= 0
                ? <>Net VAT payable to the tax authority: <span className="font-mono tabular-nums">{fmt(netVat)}</span></>
                : <>Refund from the tax authority: <span className="font-mono tabular-nums">{fmt(-netVat)}</span></>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
