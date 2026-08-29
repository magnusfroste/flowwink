import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnershipLens } from "@/hooks/useOwnershipLens";
import { LensToggle } from "@/components/admin/LensToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, CalendarDays } from "lucide-react";
import type { Project } from "@/hooks/useProjects";

/**
 * Aktiviteter över ALLA projekt — projektledarens dagliga ingång.
 *
 * Projektvyn svarar på "hur mår projekt X?"; den här svarar på "vad ska
 * göras nu, av vem, och vad brinner?" — utan N klick genom N projekt.
 * RLS filtrerar privata projekts aktiviteter åt oss (tasks ärver
 * projektets synlighet), så frågan här är medvetet oskyddad bred.
 */
type Row = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
};

const DONE = new Set(["done", "completed", "cancelled"]);

export function ActivitiesView({
  projects,
  onOpenProject,
}: {
  projects: Project[];
  onOpenProject: (projectId: string) => void;
}) {
  // The shared CRM lens, not a toggle of its own: narrowing contacts and
  // narrowing activities is the same act of focus, and two toggles that mean
  // the same thing are two truths waiting to disagree.
  const { lens, uid, coveredUids } = useOwnershipLens();
  const [showDone, setShowDone] = useState(false);
  const mineUids = useMemo(() => new Set([uid, ...coveredUids].filter(Boolean) as string[]), [uid, coveredUids]);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["project_tasks", "cross-project"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("id, project_id, title, status, priority, assigned_to, due_date")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const byProject = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );
  const today = new Date().toISOString().slice(0, 10);

  // "Mine" means what Magnus decided it should mean (2026-08-29): assigned to
  // me, PLUS unassigned work in projects I own. The strict reading — only what
  // is assigned — hides exactly the tasks nobody has picked up, which is the
  // work most likely to be dropped. An owner sees their project's loose ends.
  const isMine = (t: Row) => {
    if (t.assigned_to) return mineUids.has(t.assigned_to);
    const owner = byProject.get(t.project_id)?.owner_id;
    return !!owner && mineUids.has(owner);
  };

  const rows = useMemo(() => {
    return (tasks ?? [])
      .filter((t) => (showDone ? true : !DONE.has(t.status)))
      .filter((t) => (lens === "mine" ? isMine(t) : true))
      .filter((t) => byProject.has(t.project_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, showDone, lens, mineUids, byProject]);

  const overdueCount = rows.filter(
    (t) => t.due_date && t.due_date < today && !DONE.has(t.status)
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* The CRM's own lens — the same switch as on Contacts and Projects,
            so "Mine" means one thing across the product. */}
        <LensToggle />
        <Button
          size="sm"
          variant={showDone ? "secondary" : "outline"}
          onClick={() => setShowDone((v) => !v)}
        >
          {showDone ? "Hiding nothing" : "Open only"}
        </Button>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> {overdueCount} overdue
          </Badge>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading activities…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No activities match — switch filters or create tasks inside a project.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((t) => {
            const p = byProject.get(t.project_id)!;
            const overdue = !!t.due_date && t.due_date < today && !DONE.has(t.status);
            return (
              <button
                key={t.id}
                onClick={() => onOpenProject(t.project_id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: p.color || "hsl(var(--primary))" }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-medium", DONE.has(t.status) && "line-through text-muted-foreground")}>
                    {t.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{p.name}</span>
                </span>
                <Badge variant="outline" className="hidden sm:inline-flex capitalize">{t.status.replace(/_/g, " ")}</Badge>
                {t.priority === "high" && <Badge variant="secondary" className="hidden sm:inline-flex">high</Badge>}
                {t.due_date && (
                  <span className={cn("flex shrink-0 items-center gap-1 text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                    {overdue && <AlertTriangle className="h-3 w-3" />}
                    <CalendarDays className="h-3 w-3" />
                    {t.due_date}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
