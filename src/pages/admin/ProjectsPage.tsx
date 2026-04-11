import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProjects, useCreateProject, useProjectTasks, useCreateProjectTask, useUpdateProjectTask } from "@/hooks/useProjects";
import { Plus, FolderKanban, CheckCircle2, Clock, Circle } from "lucide-react";
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

function NewProjectDialog() {
  const [open, setOpen] = useState(false);
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

function TaskBoard({ projectId }: { projectId: string }) {
  const { data: tasks, isLoading } = useProjectTasks(projectId);
  const updateTask = useUpdateProjectTask();
  const createTask = useCreateProjectTask();
  const [newTitle, setNewTitle] = useState("");

  const handleAddTask = () => {
    if (!newTitle.trim()) return;
    createTask.mutate({ project_id: projectId, title: newTitle, status: "todo", priority: "medium", sort_order: (tasks?.length || 0) + 1 });
    setNewTitle("");
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const columns = ["todo", "in_progress", "done"];
  const columnLabels: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Add a task…" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddTask()} />
        <Button onClick={handleAddTask} disabled={!newTitle.trim()}>Add</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {columns.map(col => (
          <div key={col} className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{columnLabels[col]}</h4>
            {tasks?.filter(t => t.status === col).map(task => (
              <Card key={task.id} className="cursor-pointer hover:shadow-sm transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <button onClick={() => {
                      const next = col === "todo" ? "in_progress" : col === "in_progress" ? "done" : "todo";
                      updateTask.mutate({ id: task.id, project_id: projectId, status: next });
                    }}>
                      {STATUS_ICONS[col]}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      {task.due_date && <p className="text-xs text-muted-foreground">{format(new Date(task.due_date), "MMM d")}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {!tasks?.filter(t => t.status === col).length && (
              <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader title="Projects" description="Manage projects, tasks, and track progress">
          <NewProjectDialog />
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
                <Card key={p.id} className={`cursor-pointer transition-colors ${selectedId === p.id ? "ring-2 ring-primary" : "hover:bg-muted/50"}`} onClick={() => setSelectedId(p.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{p.name}</h3>
                      <Badge variant="outline" className={p.is_active ? PROJECT_STATUS_COLORS.active : PROJECT_STATUS_COLORS.completed}>{p.is_active ? "Active" : "Completed"}</Badge>
                    </div>
                    {p.client_name && <p className="text-sm text-muted-foreground mt-1">{p.client_name}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="lg:col-span-2">
              {selectedId ? (
                <Card>
                  <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
                  <CardContent><TaskBoard projectId={selectedId} /></CardContent>
                </Card>
              ) : (
                <Card><CardContent className="py-12 text-center text-muted-foreground">Select a project to see tasks</CardContent></Card>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
