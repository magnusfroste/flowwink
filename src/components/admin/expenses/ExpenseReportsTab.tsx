import { useExpenseReports } from '@/hooks/useExpenses';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText } from 'lucide-react';
import { format } from 'date-fns';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary/10 text-primary',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  booked: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
};

function formatCents(cents: number, currency = 'SEK'): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function ExpenseReportsTab() {
  const { data: reports, isLoading } = useExpenseReports();

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading reports...
                </TableCell>
              </TableRow>
            ) : !reports?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground/50" />
                    <p>No monthly reports yet</p>
                    <p className="text-xs">FlowPilot creates monthly reports automatically on the 1st</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="font-medium">{report.period}</TableCell>
                  <TableCell className="text-right">{report.expense_count}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCents(report.total_cents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.submitted_at
                      ? format(new Date(report.submitted_at), 'yyyy-MM-dd')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {report.approved_at
                      ? format(new Date(report.approved_at), 'yyyy-MM-dd')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_COLORS[report.status] || ''}>
                      {report.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
