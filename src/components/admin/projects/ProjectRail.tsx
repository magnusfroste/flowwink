import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, AlertTriangle, Plus, Lock, GripVertical } from "lucide-react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useReorderProjects, type Project, type ProjectTaskStats } from "@/hooks/useProjects";
import {
  PROJECT_SORT_LABELS, attentionLabel, readSortMode, sortProjects, writeSortMode, type ProjectSortMode,
} from "@/lib/project-order";

type Filter = "active" | "all" | "attention";

/**
 * Narrow, scannable project rail. Answers "which project needs me?" at a glance.
 *
 * "Needs attention" is the database's verdict (project_attention) — urgent,
 * overdue, blocked by something unfinished, stalled, or past its deadline — the
 * same rule the agent's portfolio brief carries. It used to be computed here from
 * overdue dates alone, and on a team that does not set due dates it was always empty.
 *
 * The team order is shared (the agenda) and is changed by dragging, only while
 * the rail shows the team order unfiltered. The sort choice is the viewer's own.
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
  const [sortMode, setSortMode] = useState<ProjectSortMode>(() => readSortMode());
  const reorder = useReorderProjects();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const attentionCount = useMemo(
    () => projects.filter((p) => p.is_active !== false && stats?.get(p.id)?.needsAttention).length,
    [projects, stats],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (filter === "active" && p.is_active === false) return false;
      if (filter === "attention" && !stats?.get(p.id)?.needsAttention) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.client_name ?? "").toLowerCase().includes(q)
      );
    });
    return sortProjects(filtered, stats, sortMode);
  }, [projects, query, filter, stats, sortMode]);

  // Dragging rewrites the shared agenda, so it is only offered where the list
  // on screen IS that agenda: team order, no search, no attention filter.
  const canDrag = sortMode === "team" && !query.trim() && filter !== "attention";

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = visible.map((p) => p.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(ids, from, to));
  };

  const chooseSort = (mode: ProjectSortMode) => {
    setSortMode(mode);
    writeSortMode(mode);
  };

  const filters: { key: Filter; label: string; count?: number }[] = [
    { key: "active", label: "Active" },
    { key: "attention", label: "Needs attention", count: attentionCount },
    { key: "all", label: "All" },
  ];

  const rows = visible.map((p) => (
    <ProjectRow
      key={p.id}
      project={p}
      stats={stats?.get(p.id)}
      selected={selectedId === p.id}
      draggable={canDrag}
      onSelect={onSelect}
    />
  ));

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

      <Select value={sortMode} onValueChange={(v) => chooseSort(v as ProjectSortMode)}>
        <SelectTrigger className="h-8 text-xs" aria-label="Sort projects">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PROJECT_SORT_LABELS) as ProjectSortMode[]).map((m) => (
            <SelectItem key={m} value={m} className="text-xs">{PROJECT_SORT_LABELS[m]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Radix lays the viewport's child out as display:table, so it takes its
          content's max width (a long project name) rather than the rail's — the
          rows grew to 328 px inside a 256 px rail and were clipped on the right
          (nordbrygg, 2026-09-22). Block it, and truncate can do its job. */}
      <ScrollArea className="w-full flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
        <div className="w-full space-y-1">
          {canDrag ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={visible.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {rows}
              </SortableContext>
            </DndContext>
          ) : (
            rows
          )}
          {!visible.length && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {filter === "attention" ? "Nothing needs attention right now." : "No projects match."}
            </p>
          )}
        </div>
      </ScrollArea>

      {sortMode === "team" && !canDrag && (
        <p className="text-[11px] text-muted-foreground">Clear the search to rearrange the team order.</p>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={onNewProject}>
        <Plus className="mr-2 h-3.5 w-3.5" /> New project
      </Button>
    </div>
  );
}

function ProjectRow({
  project: p,
  stats: s,
  selected,
  draggable,
  onSelect,
}: {
  project: Project;
  stats?: ProjectTaskStats;
  selected: boolean;
  draggable: boolean;
  onSelect: (id: string) => void;
}) {
  const sortable = useSortable({ id: p.id, disabled: !draggable });
  const style = draggable
    ? { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
    : undefined;
  const why = attentionLabel(s?.reasons);

  return (
    <div
      ref={draggable ? sortable.setNodeRef : undefined}
      style={style}
      className={cn("group relative", sortable.isDragging && "z-10 opacity-80")}
    >
      <button
        onClick={() => onSelect(p.id)}
        className={cn(
          "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
          selected ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted/60",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color || "hsl(var(--primary))" }} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
          {p.visibility === "private" && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Private project" />}
          {s?.needsAttention && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label={`Needs attention: ${why}`} />
          )}
          {draggable && <span className="w-3.5 shrink-0" />}
        </div>
        <div className="mt-1 flex items-center gap-2 pl-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${s?.progress ?? 0}%` }} />
          </div>
          <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
            {s?.total ? `${s.done}/${s.total}` : "no tasks"}
          </span>
        </div>
        {why && <div className="mt-1 truncate pl-4 text-[11px] text-destructive">{why}</div>}
        {(p.client_name || p.is_active === false) && (
          <div className="mt-1 flex items-center gap-1.5 pl-4">
            {p.client_name && <span className="truncate text-[11px] text-muted-foreground">{p.client_name}</span>}
            {p.is_active === false && (
              <Badge variant="outline" className="h-4 px-1 text-[10px]">Completed</Badge>
            )}
          </div>
        )}
      </button>
      {draggable && (
        <span
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label={`Drag to reorder ${p.name}`}
          className="absolute right-1.5 top-2 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}
