import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, AlertTriangle, Plus , Lock } from "lucide-react";
import type { Project, ProjectTaskStats } from "@/hooks/useProjects";

type Filter = "active" | "all" | "attention";

/**
 * Narrow, scannable project rail. Answers "which project needs me?" at a
 * glance (progress + overdue) without eating the workspace width.
 */
export function ProjectRail({
  projects,
  stats,
  selectedId,
  onSelect,
  onNewProject,
}: {
  projects: Project[];
  stats?: Map<string, ProjectTaskStats>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewProject: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");

  const attentionCount = useMemo(
    () => projects.filter((p) => (stats?.get(p.id)?.overdue ?? 0) > 0).length,
    [projects, stats],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter === "active" && p.is_active === false) return false;
      if (filter === "attention" && (stats?.get(p.id)?.overdue ?? 0) === 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.client_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [projects, query, filter, stats]);

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "active", label: "Active" },
    { key: "attention", label: "Needs attention", count: attentionCount },
    { key: "all", label: "All" },
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              filter === f.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
            {f.count ? ` (${f.count})` : ""}
          </button>
        ))}
      </div>

      <ScrollArea className="w-full flex-1">
        <div className="w-full space-y-1">
          {visible.map((p) => {
            const s = stats?.get(p.id);
            const selected = selectedId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={cn(
                  "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/5"
                    : "border-transparent hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.color || "hsl(var(--primary))" }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  {p.visibility === "private" && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Private project" />}
                  {!!s?.overdue && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 pl-4">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${s?.progress ?? 0}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                    {s?.total ? `${s.done}/${s.total}` : "no tasks"}
                  </span>
                </div>
                {(p.client_name || p.is_active === false) && (
                  <div className="mt-1 flex items-center gap-1.5 pl-4">
                    {p.client_name && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {p.client_name}
                      </span>
                    )}
                    {p.is_active === false && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        Completed
                      </Badge>
                    )}
                  </div>
                )}
              </button>
            );
          })}
          {!visible.length && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No projects match.
            </p>
          )}
        </div>
      </ScrollArea>

      <Button variant="outline" size="sm" className="w-full" onClick={onNewProject}>
        <Plus className="mr-2 h-3.5 w-3.5" /> New project
      </Button>
    </div>
  );
}
