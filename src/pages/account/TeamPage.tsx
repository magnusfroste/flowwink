import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Check, X, Users, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { useMyTeam, useTeamLeaveRequests, TeamLeaveRequest } from "@/hooks/useTeam";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  denied: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function TeamPage() {
  const { data: team, isLoading: teamLoading } = useMyTeam();
  const { data: requests, isLoading: reqLoading } = useTeamLeaveRequests();
  const qc = useQueryClient();

  const [decision, setDecision] = useState<{
    request: TeamLeaveRequest;
    action: "approved" | "rejected";
  } | null>(null);
  const [note, setNote] = useState("");

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; status: string; notes: string | null }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: input.status,
          reviewed_at: new Date().toISOString(),
          notes: input.notes,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Decision saved");
      setDecision(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["team_leave_requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const recent = (requests ?? []).filter((r) => r.status !== "pending").slice(0, 20);

  const renderRequest = (r: TeamLeaveRequest, showActions: boolean) => (
    <TableRow key={r.id}>
      <TableCell className="font-medium">
        <div>
          <p>{r.employees?.name ?? "—"}</p>
          {r.employees?.title && (
            <p className="text-xs text-muted-foreground">{r.employees.title}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="capitalize">{r.leave_type}</TableCell>
      <TableCell className="text-sm">
        {format(new Date(r.start_date), "MMM d")} – {format(new Date(r.end_date), "MMM d, yyyy")}
      </TableCell>
      <TableCell className="tabular-nums">{r.days}</TableCell>
      <TableCell>
        <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>
          {r.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {showActions && (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-green-700"
              onClick={() => setDecision({ request: r, action: "approved" })}
            >
              <Check className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setDecision({ request: r, action: "rejected" })}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      {/* Pending approvals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5" />
            Pending approvals
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {pending.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reqLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !pending.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No requests waiting for your decision.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{pending.map((r) => renderRequest(r, true))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* My team */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            My team
            {team && team.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {team.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !team?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No direct reports yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p>{m.name}</p>
                        {m.email && (
                          <p className="text-xs text-muted-foreground">{m.email}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{m.title ?? "—"}</TableCell>
                    <TableCell>{m.department ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {m.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent decisions */}
      {!!recent.length && (
        <Card>
          <CardHeader>
            <CardTitle>Recent decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{recent.map((r) => renderRequest(r, false))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Decision dialog */}
      <AlertDialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {decision?.action === "approved" ? "Approve" : "Reject"} leave request
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {decision && (
                  <p>
                    {decision.request.employees?.name} · {decision.request.leave_type} ·{" "}
                    {format(new Date(decision.request.start_date), "MMM d")} –{" "}
                    {format(new Date(decision.request.end_date), "MMM d, yyyy")} (
                    {decision.request.days} day{decision.request.days === 1 ? "" : "s"})
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="decision-note" className="text-xs">
                    Note (optional)
                  </Label>
                  <Textarea
                    id="decision-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      decision?.action === "approved"
                        ? "e.g. Enjoy your time off!"
                        : "Reason for rejection…"
                    }
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                decision &&
                updateStatus.mutate({
                  id: decision.request.id,
                  status: decision.action,
                  notes: note || null,
                })
              }
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending
                ? "Saving…"
                : decision?.action === "approved"
                ? "Approve"
                : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
