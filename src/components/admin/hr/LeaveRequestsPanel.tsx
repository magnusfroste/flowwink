import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeaveRequest, useUpdateLeaveRequest } from "@/hooks/useEmployees";
import { format } from "date-fns";
import { Check, X } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
};

export function LeaveRequestsPanel({ requests }: { requests: LeaveRequest[] }) {
  const update = useUpdateLeaveRequest();

  if (!requests.length) {
    return <p className="text-muted-foreground text-center py-8">No leave requests.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Days</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((req) => (
          <TableRow key={req.id}>
            <TableCell className="font-medium">{req.employees?.name || "—"}</TableCell>
            <TableCell className="capitalize">{req.leave_type}</TableCell>
            <TableCell className="text-sm">
              {format(new Date(req.start_date), "MMM d")} — {format(new Date(req.end_date), "MMM d, yyyy")}
            </TableCell>
            <TableCell>{req.days}</TableCell>
            <TableCell>
              <Badge variant="outline" className={STATUS_COLORS[req.status] || ""}>
                {req.status}
              </Badge>
            </TableCell>
            <TableCell>
              {req.status === "pending" && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => update.mutate({ id: req.id, status: "approved", reviewed_at: new Date().toISOString() })}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => update.mutate({ id: req.id, status: "rejected", reviewed_at: new Date().toISOString() })}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
