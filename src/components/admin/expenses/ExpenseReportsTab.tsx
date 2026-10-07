import { useState } from 'react';
import {
  useExpenseReports,
  useGenerateMonthlyReport,
  useSubmitExpenseReport,
  useApproveExpenseReport,
  useRejectExpenseReport,
  useBookExpenseReport,
  useMarkExpenseReportPaid,
  useBulkApproveReports,
  useBulkRejectReports,
  type ExpenseReport,
} from '@/hooks/useExpenses';
import { useModuleAccess } from '@/hooks/useRoleModuleAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Loader2, Send, Check, X, RefreshCw, BookOpen, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-primary/10 text-primary',
  approved: 'bg-green-500/10 text-green-700 dark:text-green-400',
  rejected: 'bg-destructive/10 text-destructive',
  booked: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

export function ExpenseReportsTab() {
  const { data: reports, isLoading } = useExpenseReports();
  // #102: approval follows the expenses module via the matrix (RLS enforces
  // the same rule server-side) — not the admin role.
  const { canAccess } = useModuleAccess();
  const canApprove = canAccess('expenses');
  const { formatCurrency } = usePlatformFormat();
  const formatCents = (cents: number, currency?: string | null) => formatCurrency(cents, currency);
  const generate = useGenerateMonthlyReport();
  const submit = useSubmitExpenseReport();
  const approve = useApproveExpenseReport();
  const reject = useRejectExpenseReport();
  const book = useBookExpenseReport();
  const pay = useMarkExpenseReportPaid();
  const bulkApprove = useBulkApproveReports();
  const bulkReject = useBulkRejectReports();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payTarget, setPayTarget] = useState<ExpenseReport | null>(null);
  const [payMethod, setPayMethod] = useState('manual');
  const [payReference, setPayReference] = useState('');

  const [rejectTarget, setRejectTarget] = useState<{ ids: string[]; single?: boolean } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const currentPeriod = new Date().toISOString().slice(0, 7);

  const submittedReports = reports?.filter((r) => r.status === 'submitted') ?? [];
  const allSubmittedSelected =
    submittedReports.length > 0 && submittedReports.every((r) => selected.has(r.id));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllSubmitted = () => {
    if (allSubmittedSelected) setSelected(new Set());
    else setSelected(new Set(submittedReports.map((r) => r.id)));
  };

  const selectedAmount = reports
    ?.filter((r) => selected.has(r.id))
    .reduce((s, r) => s + r.total_cents, 0) ?? 0;

  const handleConfirmPay = () => {
    if (!payTarget) return;
    pay.mutate(
      { reportId: payTarget.id, method: payMethod, reference: payReference || undefined },
      {
        onSuccess: () => {
          setPayTarget(null);
          setPayReference('');
          setPayMethod('manual');
        },
      },
    );
  };

  const openReject = (ids: string[], single = false) => {
    setRejectTarget({ ids, single });
    setRejectReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    if (rejectTarget.single) {
      await reject.mutateAsync({ reportId: rejectTarget.ids[0], reason: rejectReason });
    } else {
      await bulkReject.mutateAsync({ ids: rejectTarget.ids, reason: rejectReason });
      setSelected(new Set());
    }
    setRejectTarget(null);
    setRejectReason('');
  };

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

      {/* Bulk action bar (admins only, when submitted reports selected) */}
      {canApprove && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
          <div className="text-sm">
            <strong>{selected.size}</strong> selected · {formatCents(selectedAmount)}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openReject(Array.from(selected))}
              disabled={bulkReject.isPending}
            >
              <X className="h-4 w-4 mr-1.5" /> Reject selected
            </Button>
            <Button
              size="sm"
              onClick={() => {
                bulkApprove.mutate(Array.from(selected), {
                  onSuccess: () => setSelected(new Set()),
                });
              }}
              disabled={bulkApprove.isPending}
            >
              <Check className="h-4 w-4 mr-1.5" /> Approve selected
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  {canApprove && submittedReports.length > 0 && (
                    <Checkbox
                      checked={allSubmittedSelected}
                      onCheckedChange={toggleAllSubmitted}
                      aria-label="Select all submitted reports"
                    />
                  )}
                </TableHead>
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
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading reports...
                  </TableCell>
                </TableRow>
              ) : !reports?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                  <TableRow key={report.id} className={selected.has(report.id) ? 'bg-primary/5' : ''}>
                    <TableCell>
                      {canApprove && report.status === 'submitted' && (
                        <Checkbox
                          checked={selected.has(report.id)}
                          onCheckedChange={() => toggleOne(report.id)}
                          aria-label={`Select ${report.period}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{report.period}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCents(report.total_cents, report.currency)}
                      {(report.advance_settled_cents ?? 0) > 0 && (
                        <div className="text-xs font-normal text-muted-foreground">
                          advance −{formatCents(report.advance_settled_cents ?? 0, report.currency)} · to pay {formatCents(Math.max(report.total_cents - (report.advance_settled_cents ?? 0), 0), report.currency)}
                        </div>
                      )}
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
                        {canApprove && report.status === 'submitted' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openReject([report.id], true)}
                            >
                              <X className="h-3.5 w-3.5 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => approve.mutate(report.id)}
                              disabled={approve.isPending}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </Button>
                          </>
                        )}
                        {canApprove && report.status === 'approved' && (
                          <Button
                            size="sm"
                            onClick={() => book.mutate(report.id)}
                            disabled={book.isPending}
                          >
                            <BookOpen className="h-3.5 w-3.5 mr-1" />
                            Book
                          </Button>
                        )}
                        {canApprove && report.status === 'booked' && (
                          <Button
                            size="sm"
                            onClick={() => setPayTarget(report)}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1" />
                            Mark paid
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

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejectTarget?.ids.length ?? 0} report(s)
            </DialogTitle>
            <DialogDescription>
              The employee will see the reason and can resubmit after fixing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Missing receipt for the lunch on 2025-05-14…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmReject}
              disabled={reject.isPending || bulkReject.isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark report as paid</DialogTitle>
            <DialogDescription>
              {payTarget && `${payTarget.period} · ${formatCents(payTarget.total_cents, payTarget.currency)}`}
              <br />
              Posts a payment journal entry (Dt 2890 / Cr 1930).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">Payment method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="sepa">SEPA</SelectItem>
                  <SelectItem value="swish">Swish</SelectItem>
                  <SelectItem value="bankgiro">Bankgiro</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input
                id="pay-ref"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="Bank reference / payout ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={handleConfirmPay} disabled={pay.isPending}>
              {pay.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wallet className="h-4 w-4 mr-2" />}
              Confirm payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
