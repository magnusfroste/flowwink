import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Printer, ArrowLeft, Receipt } from 'lucide-react';
import { useMyPayslips, usePayslip } from '@/hooks/usePayslip';
import { PayslipView, printPayslip, fmtSEK } from '@/components/payroll/PayslipView';

export default function MyPayslipsPage() {
  const { data: list, isLoading, error } = useMyPayslips();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: payslip, isLoading: loadingOne, error: oneErr } = usePayslip(
    selectedRunId,
    null,
    !!selectedRunId,
  );

  const isNoEmployee =
    error && /no employee record/i.test((error as Error).message);

  if (selectedRunId) {
    return (
      <>
        <Helmet><title>Payslip · My Account</title></Helmet>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedRunId(null)}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <CardTitle>Payslip</CardTitle>
            </div>
            <Button onClick={printPayslip} disabled={!payslip}>
              <Printer className="h-4 w-4 mr-2" />
              Print / Save PDF
            </Button>
          </CardHeader>
          <CardContent>
            {loadingOne && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {oneErr && (
              <div className="text-sm text-destructive py-6">{(oneErr as Error).message}</div>
            )}
            {payslip && <PayslipView payslip={payslip} />}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <Helmet><title>My payslips · My Account</title></Helmet>
      <Card>
        <CardHeader>
          <CardTitle>My payslips</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {isNoEmployee && (
            <div className="flex flex-col items-center text-center py-12 gap-3">
              <div className="rounded-full bg-muted p-4">
                <Receipt className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold">No payslips yet</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Your payslips will appear here once HR links your employee record
                to your account.
              </p>
            </div>
          )}

          {error && !isNoEmployee && (
            <div className="text-sm text-destructive py-6">{(error as Error).message}</div>
          )}

          {list && list.payslips.length === 0 && (
            <div className="flex flex-col items-center text-center py-12 gap-3">
              <div className="rounded-full bg-muted p-4">
                <Receipt className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold">No payslips yet</h3>
              <p className="text-sm text-muted-foreground">
                Approved payroll runs will show up here.
              </p>
            </div>
          )}

          {list && list.payslips.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.payslips.map((p) => (
                  <TableRow key={p.run_id}>
                    <TableCell className="font-medium">{p.period}</TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === 'paid' ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtSEK(p.gross_cents)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtSEK(p.net_cents)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedRunId(p.run_id)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
