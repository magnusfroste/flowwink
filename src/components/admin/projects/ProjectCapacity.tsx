import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCapacityReport } from "@/hooks/useProjectSchedule";

export function ProjectCapacity({ projectId }: { projectId: string | null }) {
  const { data, isLoading } = useCapacityReport(projectId, 4);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!data?.length)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No workload data for the selected scope.
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-2">
      {data.map((r) => (
        <Card key={r.user_id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.open_tasks} open · {r.open_estimated_hours.toFixed(1)}h backlog ·{" "}
                  {r.hours_logged_in_window.toFixed(1)}h logged · {r.weeks_of_backlog.toFixed(1)}w
                </p>
              </div>
              {r.overloaded && (
                <Badge variant="destructive">Overloaded</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Progress value={Math.min(r.utilization_pct, 100)} className="flex-1" />
              <span className="text-xs tabular-nums w-12 text-right text-muted-foreground">
                {Math.round(r.utilization_pct)}%
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
