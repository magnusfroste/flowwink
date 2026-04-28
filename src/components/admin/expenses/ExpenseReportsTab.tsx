import {
  useExpenseReports,
  useGenerateMonthlyReport,
  useSubmitExpenseReport,
  useApproveExpenseReport,
} from '@/hooks/useExpenses';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Loader2, Send, Check, RefreshCw } from 'lucide-react';
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
  const { isAdmin } = useAuth();
  const generate = useGenerateMonthlyReport();
  const submit = useSubmitExpenseReport();
  const approve = useApproveExpenseReport();

  const currentPeriod = new Date().toISOString().slice(0, 7);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Monthly reports</h3>
          <p className="text-xs text-muted-foreground">
            Bundle this month's draft receipts into one submittable report.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => generate.mutate(undefined)}
          disabled={generate.isPending}
        >
          {generate.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Generate {currentPeriod}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                      <p>No reports yet</p>
                      <p className="text-xs">
                        Click "Generate {currentPeriod}" to bundle this month's receipts.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.period}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(report.total_cents, report.currency)}
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(report.status === 'draft' || report.status === 'rejected') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => submit.mutate(report.id)}
                            disabled={submit.isPending}
                          >
                            <Send className="h-3.5 w-3.5 mr-1" />
                            Submit
                          </Button>
                        )}
                        {isAdmin && report.status === 'submitted' && (
                          <Button
                            size="sm"
                            onClick={() => approve.mutate(report.id)}
                            disabled={approve.isPending}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Approve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
