import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useOpenOnQueryParam } from "@/hooks/useOpenOnQueryParam";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useProjects, useCreateProject, useProjectTasks, useCreateProjectTask, useUpdateProjectTask, useUpdateProject, useDeleteProject, useDeleteProjectTask, type Project } from "@/hooks/useProjects";
import { ProjectMilestonesPanel } from "@/components/admin/projects/ProjectMilestonesPanel";
import { ProjectGantt } from "@/components/admin/projects/ProjectGantt";
import { ProjectCapacity } from "@/components/admin/projects/ProjectCapacity";
import { TaskEditDialog } from "@/components/admin/projects/TaskEditDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FolderKanban, CheckCircle2, Clock, Circle, Pencil, Trash2, X } from "lucide-react";
import { format } from "date-fns";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-primary" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-600" />,
};

const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-muted text-muted-foreground",
  on_hold: "bg-yellow-100 text-yellow-800",
};

function NewProjectDialog({ open: controlledOpen, onOpenChange }: { open?: boolean; onOpenChange?: (o: boolean) => void } = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); if (controlledOpen === undefined) setInternalOpen(v); };
  const create = useCreateProject();
  const [form, setForm] = useState({ name: "", description: "", client_name: "", deadline: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    create.mutate(
      { name: form.name, description: form.description || null, client_name: form.client_name || null, deadline: form.deadline || null },
      { onSuccess: () => { setOpen(false); setForm({ name: "", description: "", client_name: "", deadline: "" }); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Project</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><Label>Client</Label><Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
          <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProjectDialog({ project, open, onOpenChange }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateProject();
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    client_name: project.client_name ?? "",
    deadline: project.deadline ?? "",
    is_active: project.is_active ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    update.mutate(
      {
        id: project.id,
        name: form.name,
        description: form.description || null,
        client_name: form.client_name || null,
        deadline: form.deadline || null,
        is_active: form.is_active,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><Label>Client</Label><Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} /></div>
          <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><Label>Active</Label><p className="text-xs text-muted-foreground">Inactive projects are marked as completed</p></div>
            <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  projectId,
  depth,
  subtasks,
  onAddSubtask,
}: {
  task: import("@/hooks/useProjects").ProjectTask;
  projectId: string;
  depth: number;
  subtasks: import("@/hooks/useProjects").ProjectTask[];
  onAddSubtask: (parentId: string) => void;
}) {
  const updateTask = useUpdateProjectTask();
  const deleteTask = useDeleteProjectTask();
  const doneCount = subtasks.filter((s) => s.status === "done").length;

  const [editOpen, setEditOpen] = useState(false);
  return (
    <Card
      className="group hover:shadow-sm transition-shadow"
      style={depth > 0 ? { marginLeft: depth * 16 } : undefined}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <button
            onClick={() => {
              const next =
                task.status === "todo"
                  ? "in_progress"
                  : task.status === "in_progress"
                    ? "done"
                    : "todo";
              updateTask.mutate({ id: task.id, project_id: projectId, status: next });
            }}
            aria-label="Toggle status"
          >
            {STATUS_ICONS[task.status] ?? STATUS_ICONS.todo}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {task.due_date && (
                <p className="text-xs text-muted-foreground">
                  {format(new Date(task.due_date), "MMM d")}
                </p>
              )}
              {depth === 0 && subtasks.length > 0 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {doneCount}/{subtasks.length} subtasks
                </Badge>
              )}
            </div>
          </div>
          {depth === 0 && (
            <button
              onClick={() => onAddSubtask(task.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
              aria-label="Add subtask"
              title="Add subtask"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setEditOpen(true)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
            aria-label="Edit task"
            title="Edit task"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => deleteTask.mutate({ id: task.id, project_id: projectId })}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
            aria-label="Delete task"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
      {editOpen && (
        <TaskEditDialog task={task} projectId={projectId} onOpenChange={setEditOpen} />
      )}
    </Card>
  );
}

function AddSubtaskDialog({
  projectId,
  parentTaskId,
  onOpenChange,
}: {
  projectId: string;
  parentTaskId: string;
  onOpenChange: (o: boolean) => void;
}) {
  const create = useCreateProjectTask();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      {
        project_id: projectId,
        parent_task_id: parentTaskId,
        title: title.trim(),
        status: "todo",
        priority: "medium",
        due_date: dueDate || null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add subtask</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? "Adding…" : "Add subtask"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskBoard({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useProjectTasks(projectId);
  const createTask = useCreateProjectTask();
  const [newTitle, setNewTitle] = useState("");
  const [subtaskParent, setSubtaskParent] = useState<string | null>(null);

  const handleAddTask = () => {
    if (!newTitle.trim()) return;
    createTask.mutate({
      project_id: projectId,
      title: newTitle,
      status: "todo",
      priority: "medium",
      sort_order: (tasks?.length || 0) + 1,
    });
    setNewTitle("");
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const columns = ["todo", "in_progress", "done"];
  const columnLabels: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    done: "Done",
  };

  const allTasks = tasks ?? [];
  const subtasksByParent = new Map<string, typeof allTasks>();
  for (const t of allTasks) {
    if (t.parent_task_id) {
      const arr = subtasksByParent.get(t.parent_task_id) ?? [];
      arr.push(t);
      subtasksByParent.set(t.parent_task_id, arr);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
        />
        <Button onClick={handleAddTask} disabled={!newTitle.trim()}>
          Add
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((col) => {
          const topLevel = allTasks.filter(
            (t) => t.status === col && !t.parent_task_id,
          );
          return (
            <div key={col} className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {columnLabels[col]}
              </h4>
              {topLevel.map((task) => {
                const subs = subtasksByParent.get(task.id) ?? [];
                return (
                  <div key={task.id} className="space-y-2">
                    <TaskRow
                      task={task}
                      projectId={projectId}
                      depth={0}
                      subtasks={subs}
                      onAddSubtask={setSubtaskParent}
                    />
                    {subs.map((s) => (
                      <TaskRow
                        key={s.id}
                        task={s}
                        projectId={projectId}
                        depth={1}
                        subtasks={[]}
                        onAddSubtask={setSubtaskParent}
                      />
                    ))}
                  </div>
                );
              })}
              {!topLevel.length && (
                <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
              )}
            </div>
          );
        })}
      </div>
      {subtaskParent && (
        <AddSubtaskDialog
          projectId={projectId}
          parentTaskId={subtaskParent}
          onOpenChange={(o) => !o && setSubtaskParent(null)}
        />
      )}
    </div>
  );
}

function ProjectCard({ project, selected, onSelect }: { project: Project; selected: boolean; onSelect: () => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const del = useDeleteProject();

  return (
    <>
      <Card className={`group cursor-pointer transition-colors ${selected ? "ring-2 ring-primary" : "hover:bg-muted/50"}`} onClick={onSelect}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium flex-1 min-w-0 truncate">{project.name}</h3>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className={project.is_active ? PROJECT_STATUS_COLORS.active : PROJECT_STATUS_COLORS.completed}>
                {project.is_active ? "Active" : "Completed"}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
                aria-label="Edit project"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Delete project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete project?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{project.name}" and all its tasks. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => del.mutate(project.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {project.client_name && <p className="text-sm text-muted-foreground mt-1">{project.client_name}</p>}
        </CardContent>
      </Card>
      {editOpen && <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />}
    </>
  );
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  // `?new=1` and `?new=task` both open the project create dialog — there is no
  // standalone "new task" flow at this level (tasks are created inside a project).
  useOpenOnQueryParam('new', '1', () => setNewProjectOpen(true));
  useOpenOnQueryParam('new', 'task', () => setNewProjectOpen(true));

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader title="Projects" description="Manage projects, tasks, and track progress">
          <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
        </AdminPageHeader>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : !projects?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No projects yet.</p>
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              {projects.map(p => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  selected={selectedId === p.id}
                  onSelect={() => setSelectedId(p.id)}
                />
              ))}
            </div>
            <div className="lg:col-span-2 space-y-4">
              {selectedId ? (
                <>
                  <ProjectMilestonesPanel projectId={selectedId} />
                  <Tabs defaultValue="board">
                    <TabsList>
                      <TabsTrigger value="board">Board</TabsTrigger>
                      <TabsTrigger value="timeline">Timeline</TabsTrigger>
                      <TabsTrigger value="capacity">Capacity</TabsTrigger>
                    </TabsList>
                    <TabsContent value="board">
                      <Card>
                        <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
                        <CardContent><TaskBoard projectId={selectedId} /></CardContent>
                      </Card>
                    </TabsContent>
                    <TabsContent value="timeline">
                      <ProjectGantt projectId={selectedId} />
                    </TabsContent>
                    <TabsContent value="capacity">
                      <ProjectCapacity projectId={selectedId} />
                    </TabsContent>
                  </Tabs>
                </>
              ) : (
                <Tabs defaultValue="hint">
                  <TabsList>
                    <TabsTrigger value="hint">Overview</TabsTrigger>
                    <TabsTrigger value="capacity">Capacity (global)</TabsTrigger>
                  </TabsList>
                  <TabsContent value="hint">
                    <Card><CardContent className="py-12 text-center text-muted-foreground">Select a project to see tasks</CardContent></Card>
                  </TabsContent>
                  <TabsContent value="capacity">
                    <ProjectCapacity projectId={null} />
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
