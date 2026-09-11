import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface PickableTask {
  id: string;
  title: string;
  project_id: string;
  status: string;
}

interface DependencyPickerProps {
  /** The task being edited — never offered to itself. */
  taskId: string;
  projectId: string;
  /** Every active project's tasks; the picker does the narrowing. */
  tasks: PickableTask[];
  projects: Array<{ id: string; name: string }>;
  /** Already-linked prerequisites — offered nowhere, not greyed out. */
  excludeIds: Set<string>;
  onPick: (taskId: string) => void;
  disabled?: boolean;
}

/**
 * Which task does this one wait for?
 *
 * A dependency may cross projects (since 2026-09-08), so the candidates are
 * every open task on the instance. A flat <select> over that was 60 rows on
 * optic with eleven projects, and cross-project links there are the
 * exception: eight dependencies, none crossing. So the list must not pay for
 * the exception every time.
 *
 * Own project is what opens. Other projects sit behind ONE row until asked
 * for — or until the person types, because typing is asking. Done tasks stay
 * hidden behind a toggle: waiting on something already finished is rarely the
 * intent. What cannot be picked (self, existing links) is absent, not greyed.
 */
export function DependencyPicker({ taskId, projectId, tasks, projects, excludeIds, onPick, disabled }: DependencyPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [othersOpen, setOthersOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const nameOf = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects]);
  const searching = query.trim().length > 0;

  const { own, others } = useMemo(() => {
    const pickable = tasks.filter((t) => t.id !== taskId && !excludeIds.has(t.id) && (showDone || t.status !== "done"));
    const own = pickable.filter((t) => t.project_id === projectId).sort((a, b) => a.title.localeCompare(b.title));
    const byProject = new Map<string, PickableTask[]>();
    for (const t of pickable) {
      if (t.project_id === projectId) continue;
      byProject.set(t.project_id, [...(byProject.get(t.project_id) ?? []), t]);
    }
    const others = [...byProject.entries()]
      .map(([pid, list]) => ({ id: pid, name: nameOf.get(pid) ?? "…", tasks: list.sort((a, b) => a.title.localeCompare(b.title)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { own, others };
  }, [tasks, taskId, excludeIds, showDone, projectId, nameOf]);

  const otherCount = others.reduce((n, p) => n + p.tasks.length, 0);
  const pick = (id: string) => { onPick(id); setOpen(false); setQuery(""); };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setQuery(""); setOthersOpen(false); } }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" role="combobox" aria-expanded={open} disabled={disabled}
          className="h-8 w-full justify-between font-normal text-muted-foreground">
          Pick a task this one waits for…
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[20rem] p-0" align="start">
        {/* Search matches task title AND project name: "kyc" finds SBB-KYC
            wherever it lives, "ekonomi" opens that whole project. The value
            string is what cmdk filters on. */}
        <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search tasks or projects…" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-72">
            <CommandEmpty>No task matches.</CommandEmpty>

            <CommandGroup heading={nameOf.get(projectId) ?? "This project"}>
              {own.length === 0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nothing else open in this project.</div>
              )}
              {own.map((t) => (
                <CommandItem key={t.id} value={`${t.title} ${nameOf.get(projectId) ?? ""}`} onSelect={() => pick(t.id)}>
                  <span className="truncate">{t.title}</span>
                  <StatusMark status={t.status} />
                </CommandItem>
              ))}
            </CommandGroup>

            {otherCount > 0 && (
              <>
                <CommandSeparator />
                {!othersOpen && !searching ? (
                  // One row stands for every other project until asked for.
                  <CommandGroup>
                    <CommandItem value="__other_projects__" onSelect={() => setOthersOpen(true)} className="text-muted-foreground">
                      <FolderOpen className="mr-2 h-3.5 w-3.5" />
                      Other projects ({others.length} projects, {otherCount} tasks)
                    </CommandItem>
                  </CommandGroup>
                ) : (
                  others.map((p) => (
                    <CommandGroup key={p.id} heading={p.name}>
                      {p.tasks.map((t) => (
                        <CommandItem key={t.id} value={`${t.title} ${p.name}`} onSelect={() => pick(t.id)}>
                          <span className="truncate">{t.title}</span>
                          <StatusMark status={t.status} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))
                )}
              </>
            )}
          </CommandList>
          <div className="flex items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
            <span>{showDone ? "Showing finished tasks" : "Finished tasks hidden"}</span>
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Hide" : "Show"}
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StatusMark({ status }: { status: string }) {
  if (status === "done") return <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="Done" />;
  if (status === "in_progress") return <Badge variant="outline" className={cn("ml-auto text-[10px]")}>in progress</Badge>;
  return null;
}
