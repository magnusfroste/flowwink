import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectSchedule, type GanttTask } from "@/hooks/useProjectSchedule";
import { format, differenceInCalendarDays, parseISO, addDays, min, max } from "date-fns";

const STATUS_BAR: Record<string, string> = {
  todo: "bg-muted",
  in_progress: "bg-primary",
  review: "bg-amber-500",
  done: "bg-green-600",
};

const DAY_PX = 20;
const ROW_H = 32;

export function ProjectGantt({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectSchedule(projectId);

  const range = useMemo(() => {
    if (!data) return null;
    const dates: Date[] = [];
    data.tasks.forEach((t) => {
      if (t.start_date) dates.push(parseISO(t.start_date));
      if (t.due_date) dates.push(parseISO(t.due_date));
    });
    data.milestones.forEach((m) => m.due_date && dates.push(parseISO(m.due_date)));
    if (!dates.length) return null;
    const start = min(dates);
    const end = max(dates);
    const days = Math.max(differenceInCalendarDays(end, start) + 3, 14);
    return { start, days };
  }, [data]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!data || !data.tasks.length)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No scheduled tasks yet. Add start / due dates to see the timeline.
        </CardContent>
      </Card>
    );
  if (!range)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tasks have no dates. Add start / due dates to see bars.
        </CardContent>
      </Card>
    );

  const totalWidth = range.days * DAY_PX;
  const titleById = new Map(data.tasks.map((t) => [t.id, t.title] as const));
  const statusById = new Map(data.tasks.map((t) => [t.id, t.status] as const));

  const barFor = (t: GanttTask) => {
    if (!t.start_date && !t.due_date) return null;
    const s = t.start_date ? parseISO(t.start_date) : parseISO(t.due_date!);
    const e = t.due_date ? parseISO(t.due_date) : addDays(s, 2);
    const offset = differenceInCalendarDays(s, range.start);
    const len = Math.max(differenceInCalendarDays(e, s) + 1, 1);
    return { left: offset * DAY_PX, width: len * DAY_PX };
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex">
          {/* Task titles column */}
          <div className="w-56 shrink-0 border-r">
            <div className="h-8 border-b bg-muted/40 px-3 flex items-center text-xs font-medium text-muted-foreground">
              Task
            </div>
            {data.tasks.map((t) => (
              <div
                key={t.id}
                className="border-b px-3 flex items-center text-sm truncate"
                style={{ height: ROW_H, paddingLeft: 12 + (t.depth ?? 0) * 12 }}
                title={t.title}
              >
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
          {/* Timeline */}
          <div className="flex-1 overflow-x-auto">
            <div style={{ width: totalWidth, position: "relative" }}>
              {/* Header days */}
              <div className="h-8 border-b bg-muted/40 flex">
                {Array.from({ length: range.days }).map((_, i) => {
                  const d = addDays(range.start, i);
                  const isMonthStart = d.getDate() === 1 || i === 0;
                  return (
                    <div
                      key={i}
                      className="border-r text-[10px] text-muted-foreground flex items-center justify-center"
                      style={{ width: DAY_PX }}
                    >
                      {isMonthStart ? format(d, "MMM d") : d.getDate()}
                    </div>
                  );
                })}
              </div>
              {/* Rows */}
              {data.tasks.map((t) => {
                const bar = barFor(t);
                const blockedBy = (t.depends_on ?? [])
                  .filter((id) => statusById.get(id) !== "done")
                  .map((id) => titleById.get(id))
                  .filter(Boolean) as string[];
                return (
                  <div
                    key={t.id}
                    className="border-b relative"
                    style={{ height: ROW_H }}
                  >
                    {bar && (
                      <div
                        className={`absolute top-1.5 h-5 rounded ${STATUS_BAR[t.status] ?? "bg-muted"} flex items-center px-2 text-[10px] text-primary-foreground overflow-hidden`}
                        style={{ left: bar.left, width: bar.width }}
                        title={`${t.title} (${t.status})`}
                      >
                        {blockedBy.length > 0 && (
                          <span
                            className="truncate"
                            title={`Blocked by: ${blockedBy.join(", ")}`}
                          >
                            🔒 {blockedBy[0]}
                            {blockedBy.length > 1 ? ` +${blockedBy.length - 1}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Milestones */}
              {data.milestones.map((m) => {
                if (!m.due_date) return null;
                const offset = differenceInCalendarDays(parseISO(m.due_date), range.start);
                const left = offset * DAY_PX + DAY_PX / 2;
                return (
                  <div
                    key={m.id}
                    className="absolute top-8 bottom-0 pointer-events-none"
                    style={{ left }}
                  >
                    <div className="w-px h-full bg-primary/40" />
                    <div
                      className={`absolute -top-1 -left-1.5 w-3 h-3 rotate-45 ${m.is_reached ? "bg-green-600" : "bg-primary"}`}
                      title={`${m.name}${m.is_reached ? " (reached)" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 px-3 py-2 border-t text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-muted" /> To do</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary" /> In progress</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500" /> Review</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-600" /> Done</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rotate-45 bg-primary" /> Milestone</span>
          <span className="ml-auto"><Badge variant="outline">{data.tasks.length} tasks</Badge></span>
        </div>
      </CardContent>
    </Card>
  );
}
