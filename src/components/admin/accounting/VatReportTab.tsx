import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useVatReport } from '@/hooks/useTax';
import { FileText, Download } from 'lucide-react';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

function formatSek(cents: number) {
  return (cents / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VatReportTab() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [startMonth, setStartMonth] = useState<number>(now.getMonth() + 1);
  const [endMonth, setEndMonth] = useState<number>(now.getMonth() + 1);
  const { data: rows = [], isLoading } = useVatReport(year, startMonth, endMonth);

  const totalOutput = rows.filter(r => r.category === 'output').reduce((s, r) => s + Number(r.amount_cents), 0);
  const totalInput = rows.filter(r => r.category === 'input').reduce((s, r) => s + Number(r.amount_cents), 0);
  const netVat = totalOutput - totalInput;

  const exportCsv = () => {
    const header = 'Ruta,Namn,Kategori,Belopp\n';
    const body = rows.map(r => `${r.grid_code},"${r.grid_name}",${r.category},${(Number(r.amount_cents)/100).toFixed(2)}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vat-report-${year}-${String(startMonth).padStart(2,'0')}-${String(endMonth).padStart(2,'0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            VAT Report (Momsdeklaration)
          </CardTitle>
          <CardDescription>
            Sums posted journal-entry tax amounts per Skatteverket-ruta for the chosen period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Year</label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">From month</label>
              <Select value={String(startMonth)} onValueChange={(v) => setStartMonth(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">To month</label>
              <Select value={String(endMonth)} onValueChange={(v) => setEndMonth(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Utgående moms</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{formatSek(totalOutput)} kr</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Ingående moms</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{formatSek(totalInput)} kr</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Att betala / få tillbaka</CardDescription></CardHeader>
          <CardContent>
            <div className={`text-2xl font-semibold ${netVat >= 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {formatSek(netVat)} kr
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {netVat >= 0 ? 'Att betala till Skatteverket' : 'Återbetalning'}
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
                <TableHead>Namn</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Belopp (kr)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.grid_code} className={Number(r.amount_cents) === 0 ? 'opacity-50' : ''}>
                  <TableCell className="font-mono text-xs">{r.grid_code}</TableCell>
                  <TableCell>{r.grid_name}</TableCell>
                  <TableCell><Badge variant="outline">{r.category}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{formatSek(Number(r.amount_cents))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Local Input import (avoid circular)
import { Input } from '@/components/ui/input';
