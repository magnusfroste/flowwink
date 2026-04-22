import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { differenceInCalendarDays, format } from "date-fns";
import { toast } from "sonner";
import { CalendarOff } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  denied: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
};

export default function LeavePage() {
  const { employee, isEmployee, loading } = useEmployeeSelf();
  const qc = useQueryClient();
  const [leaveType, setLeaveType] = useState("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

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
      return data;
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
        <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !requests?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No leave requests yet.</p>
          ) : (
            <ul className="divide-y">
              {requests.map((r: any) => (
                <li key={r.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium capitalize">{r.leave_type}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")} · {r.days} day{r.days === 1 ? "" : "s"}
                    </p>
                    {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                  </div>
                  <Badge variant="outline" className={STATUS_COLORS[r.status] || ""}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
