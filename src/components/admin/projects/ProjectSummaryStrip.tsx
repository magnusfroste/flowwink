import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";
import type { Project, ProjectTaskStats } from "@/hooks/useProjects";

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  return (
    <div className="min-w-0 flex-1 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The five questions a project owner actually asks: how far along, what is
 * left, what is late, what lands this week, and when is the deadline.
 */
export function ProjectSummaryStrip({
  project,
  stats,
}: {
  project: Project;
  stats?: ProjectTaskStats;
}) {
  const { formatDate } = usePlatformFormat();
  const s = stats ?? { total: 0, done: 0, open: 0, inProgress: 0, overdue: 0, dueSoon: 0, progress: 0 };

  let deadlineValue = "—";
  let deadlineHint: string | undefined;
  let deadlineTone: "default" | "warning" | "danger" = "default";
  if (project.deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(project.deadline);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    deadlineValue = days < 0 ? `${Math.abs(days)}d late` : days === 0 ? "Today" : `${days}d left`;
    deadlineHint = formatDate(project.deadline, { month: "short", day: "numeric", year: "numeric" });
    deadlineTone = days < 0 ? "danger" : days <= 7 ? "warning" : "default";
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">{project.name}</h2>
            <Badge variant={project.is_active === false ? "outline" : "secondary"} className="h-5">
              {project.is_active === false ? "Completed" : "Active"}
            </Badge>
            {!!s.overdue && (
              <Badge variant="destructive" className="h-5">
                {s.overdue} overdue
              </Badge>
            )}
          </div>
          {project.client_name && (
            <p className="truncate text-xs text-muted-foreground">{project.client_name}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap divide-x divide-border">
        <Metric
          label="Progress"
          value={`${s.progress}%`}
          hint={s.total ? `${s.done} of ${s.total} tasks done` : "No tasks yet"}
          tone={s.progress === 100 && s.total > 0 ? "success" : "default"}
        />
        <Metric label="Open" value={String(s.open)} hint={`${s.inProgress} in progress`} />
        <Metric
          label="Overdue"
          value={String(s.overdue)}
          hint={s.overdue ? "Needs action" : "On track"}
          tone={s.overdue ? "danger" : "default"}
        />
        <Metric label="Due this week" value={String(s.dueSoon)} hint="Next 7 days" tone={s.dueSoon ? "warning" : "default"} />
        <Metric label="Deadline" value={deadlineValue} hint={deadlineHint} tone={deadlineTone} />
      </div>

      <div className="h-1 w-full overflow-hidden rounded-b-lg bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${s.progress}%` }} />
      </div>
    </div>
  );
}
