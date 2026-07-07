import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  useProjectTasks,
  useUpdateProjectTask,
  type ProjectTask,
} from "@/hooks/useProjects";
import {
  useTaskDependencies,
  useManageDependency,
} from "@/hooks/useProjectSchedule";

export function TaskEditDialog({
  task,
  projectId,
  onOpenChange,
}: {
  task: ProjectTask;
  projectId: string;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateProjectTask();
  const { data: allTasks } = useProjectTasks(projectId);
  const { data: deps } = useTaskDependencies(task.id, projectId);
  const depMut = useManageDependency();

  const [title, setTitle] = useState(task.title);
  const [startDate, setStartDate] = useState<string>((task as any).start_date ?? "");
  const [dueDate, setDueDate] = useState<string>(task.due_date ?? "");
  const [estHours, setEstHours] = useState<string>(
    task.estimated_hours != null ? String(task.estimated_hours) : "",
  );
  const [pickDep, setPickDep] = useState<string>("");

  const depSet = new Set(deps ?? []);
  const candidates = (allTasks ?? []).filter(
    (t) => t.id !== task.id && !depSet.has(t.id),
  );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        id: task.id,
        project_id: projectId,
        title,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_hours: estHours ? Number(estHours) : null,
      } as any,
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const addDep = () => {
    if (!pickDep) return;
    depMut.mutate(
      {
        action: "add",
        task_id: task.id,
        depends_on_task_id: pickDep,
        project_id: projectId,
      },
      { onSuccess: () => setPickDep("") },
    );
  };

  const titleById = new Map((allTasks ?? []).map((t) => [t.id, t.title] as const));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Estimated hours</Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              value={estHours}
              onChange={(e) => setEstHours(e.target.value)}
            />
          </div>
          <div>
            <Label>Depends on</Label>
            <div className="flex flex-wrap gap-1 mt-1 mb-2">
              {(deps ?? []).length === 0 && (
                <span className="text-xs text-muted-foreground">No dependencies</span>
              )}
              {(deps ?? []).map((id) => (
                <Badge key={id} variant="secondary" className="gap-1">
                  {titleById.get(id) ?? id.slice(0, 6)}
                  <button
                    type="button"
                    onClick={() =>
                      depMut.mutate({
                        action: "remove",
                        task_id: task.id,
                        depends_on_task_id: id,
                        project_id: projectId,
                      })
                    }
                    aria-label="Remove dependency"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={pickDep}
                onChange={(e) => setPickDep(e.target.value)}
              >
                <option value="">Add dependency…</option>
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                onClick={addDep}
                disabled={!pickDep || depMut.isPending}
              >
                Add
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
