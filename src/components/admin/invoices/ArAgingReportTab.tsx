import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useArAgingReport } from '@/hooks/useInvoices';

const BUCKETS: { key: 'current_cents' | 'overdue_1_30_cents' | 'overdue_31_60_cents' | 'overdue_61_90_cents' | 'overdue_90_plus_cents'; label: string }[] = [
  { key: 'current_cents', label: 'Current' },
  { key: 'overdue_1_30_cents', label: '1-30 days' },
  { key: 'overdue_31_60_cents', label: '31-60 days' },
  { key: 'overdue_61_90_cents', label: '61-90 days' },
  { key: 'overdue_90_plus_cents', label: '90+ days' },
];

export function ArAgingReportTab() {
  const { data: report, isLoading } = useArAgingReport();

  const formatAmount = (cents: number, currency = 'SEK') =>
    new Intl.NumberFormat('sv-SE', { style: 'currency', currency }).format(cents / 100);

  if (isLoading) {
    return <p className="text-center text-muted-foreground py-8">Loading…</p>;
  }

  if (!report) {
    return <p className="text-center text-muted-foreground py-8">Could not load the aging report</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {BUCKETS.map((b) => (
          <Card key={b.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-normal">{b.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-mono font-medium">{formatAmount(report.buckets[b.key])}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>As of {report.as_of}</span>
        <span>
          Total outstanding: <span className="font-mono font-medium text-foreground">{formatAmount(report.buckets.total_outstanding_cents)}</span>
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">1-30</TableHead>
              <TableHead className="text-right">31-60</TableHead>
              <TableHead className="text-right">61-90</TableHead>
              <TableHead className="text-right">90+</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No open invoices — nothing outstanding
                </TableCell>
              </TableRow>
            ) : (
              report.customers.map((c) => (
                <TableRow key={`${c.lead_id ?? 'none'}-${c.customer_email}`}>
                  <TableCell>
                    <div>{c.customer_name}</div>
                    <div className="text-xs text-muted-foreground">{c.customer_email}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(c.current_cents, c.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(c.overdue_1_30_cents, c.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(c.overdue_31_60_cents, c.currency)}</TableCell>
                  <TableCell className="text-right font-mono">{formatAmount(c.overdue_61_90_cents, c.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{formatAmount(c.overdue_90_plus_cents, c.currency)}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{formatAmount(c.total_outstanding_cents, c.currency)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
