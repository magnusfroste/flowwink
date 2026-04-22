import { useState } from "react";
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
import { differenceInCalendarDays, format } from "date-fns";
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
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  pending: {
    label: "Pending review",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Icon: Clock,
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800 border-green-200",
    Icon: CheckCircle2,
  },
  denied: {
    label: "Denied",
    className: "bg-red-100 text-red-800 border-red-200",
    Icon: XCircle,
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 border-red-200",
    Icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground border-border",
    Icon: Ban,
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
    Icon: Lock,
  };
  const { Icon } = meta;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </Badge>
  );
}

export default function LeavePage() {
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

  const create = useMutation({
    mutationFn: async () => {
      if (!employee?.id) throw new Error("No linked employee record");
      if (!startDate || !endDate) throw new Error("Pick dates");
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
      toast.success("Leave request submitted");
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
      toast.success("Leave request updated");
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
      toast.success("Leave request cancelled");
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
          <p className="font-medium">No employee record linked</p>
          <p className="text-sm text-muted-foreground mt-1">
            Contact your administrator to link your account to an employee profile.
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
            <p className="font-medium capitalize">{r.leave_type}</p>
            <StatusBadge status={r.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(new Date(r.start_date), "MMM d")} –{" "}
            {format(new Date(r.end_date), "MMM d, yyyy")} · {r.days} day
            {r.days === 1 ? "" : "s"}
          </p>
          {r.reason && (
            <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>
          )}
          {!canEdit && !canCancel && (r.status === "pending" || r.status === "approved") && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Locked — leave has started
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(r)}
              aria-label="Edit request"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelTarget(r)}
              aria-label="Cancel request"
            >
              <Ban className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request leave</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacation</SelectItem>
                  <SelectItem value="sick">Sick leave</SelectItem>
                  <SelectItem value="parental">Parental</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short note" />
            </div>
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Upcoming & active</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !upcoming.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No upcoming leave.</p>
          ) : (
            <ul className="divide-y">{upcoming.map(renderRow)}</ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !past.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No past leave on record.</p>
          ) : (
            <ul className="divide-y">{past.map(renderRow)}</ul>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit leave request</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={editing.leave_type}
                  onValueChange={(v) => setEditing({ ...editing, leave_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacation</SelectItem>
                    <SelectItem value="sick">Sick leave</SelectItem>
                    <SelectItem value="parental">Parental</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  value={editing.reason ?? ""}
                  onChange={(e) => setEditing({ ...editing, reason: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={editing.start_date}
                  onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={editing.end_date}
                  onChange={(e) => setEditing({ ...editing, end_date: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
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
              {updateRequest.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this leave request?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>
                  {cancelTarget.leave_type} ·{" "}
                  {format(new Date(cancelTarget.start_date), "MMM d")} –{" "}
                  {format(new Date(cancelTarget.end_date), "MMM d, yyyy")}.
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep request</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && cancelRequest.mutate(cancelTarget.id)}
              disabled={cancelRequest.isPending}
            >
              {cancelRequest.isPending ? "Cancelling…" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
