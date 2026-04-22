import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployeeLeaveBalances } from "@/hooks/useLeaveBalances";
import { CalendarCheck, Hourglass, Wallet } from "lucide-react";

const LABELS: Record<string, string> = {
  vacation: "Vacation",
  sick: "Sick leave",
  parental: "Parental",
  other: "Other",
};

export function LeaveBalanceCards({ employeeId }: { employeeId: string }) {
  const year = new Date().getFullYear();
  const { data, isLoading } = useEmployeeLeaveBalances(employeeId, year);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const rows = (data ?? []).filter(
    (b) => Number(b.allocated_days) + Number(b.carried_over_days) + Number(b.used_days) + Number(b.pending_days) > 0,
  );

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground text-center">
          No leave allocation set for {year}. Contact HR to get your annual quota.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((b) => {
        const total = Number(b.allocated_days) + Number(b.carried_over_days);
        const remaining = Number(b.remaining_days);
        const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
        const lowBalance = total > 0 && remaining < total * 0.2;

        return (
          <Card key={b.leave_type}>
            <CardContent className="pt-5 pb-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground capitalize">
                    {LABELS[b.leave_type] ?? b.leave_type}
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    {remaining}
                    <span className="text-sm font-normal text-muted-foreground"> / {total} days</span>
                  </p>
                </div>
                <Wallet className={`h-5 w-5 ${lowBalance ? "text-orange-500" : "text-muted-foreground"}`} />
              </div>

              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${lowBalance ? "bg-orange-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  Used {Number(b.used_days)}
                </span>
                {Number(b.pending_days) > 0 && (
                  <span className="flex items-center gap-1">
                    <Hourglass className="h-3 w-3" />
                    {Number(b.pending_days)} pending
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
