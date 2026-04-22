import { useEmployees } from "@/hooks/useEmployees";
import { useAllAttendance, formatMinutes } from "@/hooks/useAttendance";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function AttendancePanel() {
  const { data: employees } = useEmployees();
  const { data: entries, isLoading } = useAllAttendance();

  const empMap = new Map(employees?.map((e) => [e.id, e.name]));
  const openCount = entries?.filter((e) => !e.clock_out).length || 0;

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <Badge variant="default" className="text-base">{openCount} currently clocked in</Badge>
          <span className="text-sm text-muted-foreground">{entries?.length || 0} entries (last 500)</span>
        </div>
        {!entries?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No attendance entries yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0 text-sm">
                <div className="flex-1">
                  <span className="font-medium">{e.employees?.name || empMap.get(e.employee_id) || "Unknown"}</span>
                  <span className="text-muted-foreground ml-2">
                    {format(new Date(e.clock_in), "MMM d HH:mm")}
                    {e.clock_out ? ` – ${format(new Date(e.clock_out), "HH:mm")}` : " – open"}
                  </span>
                </div>
                <Badge variant={e.clock_out ? "secondary" : "default"} className="tabular-nums">
                  {formatMinutes(e.total_minutes)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
