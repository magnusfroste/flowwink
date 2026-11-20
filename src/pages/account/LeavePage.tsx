import { useState, useMemo } from "react";
import { useEmployeeLeaveBalances } from "@/hooks/useLeaveBalances";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { differenceInCalendarDays } from "date-fns";
import { useCustomerFormat } from "@/hooks/useCustomerFormat";
import { LeaveBalanceCards } from "@/components/account/LeaveBalanceCards";
import { toast } from "sonner";
import {
  CalendarOff,
  CheckCircle2,
  Clock,
  XCircle,
  Pencil,
  Ban,
  Lock,
} from "lucide-react";
import { useUiText } from "@/lib/ui-text";
import { daysWord, leaveStatusWord, leaveTypeWord } from "@/lib/staff-words";

type LeaveRow = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  created_at: string;
};

const STATUS_META: Record<
  string,
  { className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Icon: Clock,
  },
  approved: {
    className: "bg-green-100 text-green-800 border-green-200",
    Icon: CheckCircle2,
  },
  denied: {
    className: "bg-red-100 text-red-800 border-red-200",
    Icon: XCircle,
  },
  rejected: {
    className: "bg-red-100 text-red-800 border-red-200",
    Icon: XCircle,
  },
  cancelled: {
    className: "bg-muted text-muted-foreground border-border",
    Icon: Ban,
  },
};

function StatusBadge({ status }: { status: string }) {
  const t = useUiText();
  const meta = STATUS_META[status] ?? {
    className: "bg-muted text-muted-foreground",
    Icon: Lock,
  };
  const { Icon } = meta;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {leaveStatusWord(status, t)}
    </Badge>
  );
}

export default function LeavePage() {
  const { formatDate } = useCustomerFormat();
  const t = useUiText();
  const { employee, isEmployee, loading } = useEmployeeSelf();
  const qc = useQueryClient();
  const [leaveType, setLeaveType] = useState("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  // Edit / cancel dialog state
  const [editing, setEditing] = useState<LeaveRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeaveRow | null>(null);

  const { data: requests, isLoading } = useQuery({
    queryKey: ["my_leave_requests", employee?.id],
    enabled: !!employee?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", employee!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeaveRow[];
    },
  });

  const { data: balances } = useEmployeeLeaveBalances(employee?.id, new Date().getFullYear());

  const requestedDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const d = differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1;
    return d > 0 ? d : 0;
  }, [startDate, endDate]);

  const currentBalance = balances?.find((b) => b.leave_type === leaveType);
  const remaining = currentBalance ? Number(currentBalance.remaining_days) : null;
  const overBalance = remaining !== null && requestedDays > remaining;

  const create = useMutation({
    mutationFn: async () => {
      if (!employee?.id) throw new Error(t('staff.common.noEmployee', 'No employee record linked'));
      if (!startDate || !endDate) throw new Error(t('staff.leave.pickDates', 'Pick dates'));
      const days = Math.max(1, differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1);
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: employee.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        days,
        reason: reason || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('staff.leave.submitted', 'Leave request submitted'));
      setStartDate("");
      setEndDate("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["my_leave_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRequest = useMutation({
    mutationFn: async (input: {
      id: string;
      leave_type: string;
      start_date: string;
      end_date: string;
      reason: string | null;
    }) => {
      const days = Math.max(
        1,
        differenceInCalendarDays(new Date(input.end_date), new Date(input.start_date)) + 1,
      );
      const { error } = await supabase
        .from("leave_requests")
        .update({
          leave_type: input.leave_type,
          start_date: input.start_date,
          end_date: input.end_date,
          reason: input.reason,
          days,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('staff.leave.updated', 'Leave request updated'));
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["my_leave_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('staff.leave.cancelled', 'Leave request cancelled'));
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ["my_leave_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (!isEmployee) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CalendarOff className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">{t('staff.common.noEmployee', 'No employee record linked')}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t('staff.common.noEmployeeHint', 'Contact your administrator to link your account to an employee profile.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = (requests ?? []).filter((r) => new Date(r.end_date) >= today);
  const past = (requests ?? []).filter((r) => new Date(r.end_date) < today);

  const renderRow = (r: LeaveRow) => {
    const startsAt = new Date(r.start_date);
    const isPending = r.status === "pending";
    // Editable only while pending AND start date is still in the future
    const canEdit = isPending && startsAt > today;
    // Cancellable if pending (any time) or approved but not yet started
    const canCancel =
      (isPending || r.status === "approved") && startsAt > today;

    return (
      <li key={r.id} className="py-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium">{leaveTypeWord(r.leave_type, t)}</p>
            <StatusBadge status={r.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(r.start_date, { month: "short", day: "numeric" })} –{" "}
            {formatDate(r.end_date, { year: "numeric", month: "short", day: "numeric" })} · {daysWord(r.days, t)}
          </p>
          {r.reason && (
            <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
          )}
          {!canEdit && !canCancel && (r.status === "pending" || r.status === "approved") && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {t('staff.leave.locked', 'Locked — leave has started')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(r)}
              aria-label={t('staff.leave.editRequest', 'Edit request')}
            >
              <Pencil className="h-4 w-4" />
              {t('staff.common.edit', 'Edit')}
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelTarget(r)}
              aria-label={t('staff.leave.cancelRequest', 'Cancel request')}
            >
              <Ban className="h-4 w-4" />
              {t('staff.leave.cancelAction', 'Cancel')}
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <LeaveBalanceCards employeeId={employee!.id} />

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.leave.request', 'Request leave')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('staff.common.type', 'Type')}</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">{leaveTypeWord('vacation', t)}</SelectItem>
                  <SelectItem value="sick">{leaveTypeWord('sick', t)}</SelectItem>
                  <SelectItem value="parental">{leaveTypeWord('parental', t)}</SelectItem>
                  <SelectItem value="other">{leaveTypeWord('other', t)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('staff.leave.reasonOptional', 'Reason (optional)')}</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('staff.leave.reasonPlaceholder', 'Short note')} />
            </div>
            <div className="space-y-2">
              <Label>{t('staff.leave.startDate', 'Start date')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('staff.leave.endDate', 'End date')}</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {requestedDays > 0 && (
            <div
              className={`text-sm rounded-md border px-3 py-2 ${
                overBalance
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              {t('staff.leave.requesting', 'Requesting')} <strong>{daysWord(requestedDays, t)}</strong>
              {remaining !== null && (
                <>
                  {" · "}
                  {t('staff.leave.available', '{type}: {days} available')
                    .replace('{type}', leaveTypeWord(leaveType, t))
                    .replace('{days}', daysWord(remaining, t))}
                  {overBalance && ` — ${t('staff.leave.exceedsBalance', 'exceeds your balance')}`}
                </>
              )}
              {remaining === null && ` · ${t('staff.leave.noAllocationForType', 'no allocation set for this type')}`}
            </div>
          )}

          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !startDate || !endDate}
          >
            {create.isPending ? t('staff.common.submitting', 'Submitting…') : t('staff.leave.submit', 'Submit request')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('staff.leave.upcoming', 'Upcoming & active')}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !upcoming.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('staff.leave.noUpcoming', 'No upcoming leave.')}</p>
          ) : (
            <ul className="divide-y">{upcoming.map(renderRow)}</ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('staff.leave.history', 'History')}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !past.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('staff.leave.noPast', 'No past leave on record.')}</p>
          ) : (
            <ul className="divide-y">{past.map(renderRow)}</ul>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('staff.leave.editTitle', 'Edit leave request')}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('staff.common.type', 'Type')}</Label>
                <Select
                  value={editing.leave_type}
                  onValueChange={(v) => setEditing({ ...editing, leave_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">{leaveTypeWord('vacation', t)}</SelectItem>
                    <SelectItem value="sick">{leaveTypeWord('sick', t)}</SelectItem>
                    <SelectItem value="parental">{leaveTypeWord('parental', t)}</SelectItem>
                    <SelectItem value="other">{leaveTypeWord('other', t)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('staff.leave.reason', 'Reason')}</Label>
                <Input
                  value={editing.reason ?? ""}
                  onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('staff.leave.startDate', 'Start date')}</Label>
                <Input
                  type="date"
                  value={editing.start_date}
                  onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('staff.leave.endDate', 'End date')}</Label>
                <Input
                  type="date"
                  value={editing.end_date}
                  onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('staff.common.cancel', 'Cancel')}</Button>
            <Button
              onClick={() =>
                editing &&
                updateRequest.mutate({
                  id: editing.id,
                  leave_type: editing.leave_type,
                  start_date: editing.start_date,
                  end_date: editing.end_date,
                  reason: editing.reason || null,
                })
              }
              disabled={updateRequest.isPending}
            >
              {updateRequest.isPending ? t('staff.common.saving', 'Saving…') : t('staff.common.saveChanges', 'Save changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('staff.leave.cancelConfirm', 'Cancel this leave request?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>
                  {leaveTypeWord(cancelTarget.leave_type, t)} ·{" "}
                  {formatDate(cancelTarget.start_date, { month: "short", day: "numeric" })} –{" "}
                  {formatDate(cancelTarget.end_date, { year: "numeric", month: "short", day: "numeric" })}.{" "}
                  {t('staff.leave.cannotUndo', 'This action cannot be undone.')}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('staff.leave.keep', 'Keep request')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelRequest.mutate(cancelTarget.id)}
              disabled={cancelRequest.isPending}
            >
              {cancelRequest.isPending ? t('staff.leave.cancelling', 'Cancelling…') : t('staff.leave.cancelYes', 'Yes, cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
