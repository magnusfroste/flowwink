import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useProjectTasks, useCreateTask, useUpdateTask, useDeleteTask, TASK_STATUSES, type TaskStatus, type TaskPriority, type ProjectTask } from '@/hooks/useProjectTasks';
import { useProjects } from '@/hooks/useTimesheets';
import { Plus, Calendar, Clock, Trash2, User } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  high: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function TaskCard({ task, onDelete }: {
  task: ProjectTask;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && task.status !== 'done';

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2 group hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-snug">{task.title}</h4>
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>
          {task.priority}
        </Badge>

        {task.due_date && (
          <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            <Calendar className="h-3 w-3" />
            {format(parseISO(task.due_date), 'MMM d')}
          </span>
        )}

        {task.estimated_hours != null && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {task.estimated_hours}h
          </span>
        )}

        {task.profiles?.full_name && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
            <User className="h-3 w-3" />
            {task.profiles.full_name.split(' ')[0]}
          </span>
        )}
      </div>
    </div>
  );
}

export function TasksTab() {
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: projects = [] } = useProjects(false);
  const { data: tasks = [], isLoading } = useProjectTasks(
    selectedProject === 'all' ? undefined : selectedProject
  );
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleStatusChange = (id: string, status: TaskStatus) => {
    updateTask.mutate({ id, status });
  };

  const handleDelete = (id: string) => {
    deleteTask.mutate(id);
  };

  const tasksByStatus = TASK_STATUSES.map(s => ({
    ...s,
    tasks: tasks.filter(t => t.status === s.value),
  }));

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={projects.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> New Task
        </Button>
      </div>

      {/* Kanban board */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {tasksByStatus.map(column => (
            <div key={column.value} className="space-y-2">
              <div className={`rounded-lg px-3 py-2 ${column.color}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{column.label}</h3>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {column.tasks.length}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 min-h-[100px]">
                {column.tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}

                {/* Quick status move buttons on each card */}
                {column.tasks.length === 0 && (
                  <div className="border border-dashed rounded-lg p-4 text-center">
                    <p className="text-xs text-muted-foreground">No tasks</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Move task buttons — contextual menu per card */}

      {/* Create task dialog */}
      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={projects}
        defaultProject={selectedProject !== 'all' ? selectedProject : undefined}
      />
    </div>
  );
}

function CreateTaskDialog({ open, onClose, projects, defaultProject }: {
  open: boolean;
  onClose: () => void;
  projects: { id: string; name: string; color: string }[];
  defaultProject?: string;
}) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProject || '');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const { data: profiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').order('full_name');
      return data || [];
    },
  });

  const handleCreate = async () => {
    if (!title.trim() || !projectId) return;
    await createTask.mutateAsync({
      project_id: projectId,
      title: title.trim(),
      description: description || undefined,
      priority,
      due_date: dueDate || undefined,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      assigned_to: assignedTo || undefined,
    });
    onClose();
    setTitle('');
    setDescription('');
    setDueDate('');
    setEstimatedHours('');
    setAssignedTo('');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Design homepage mockup" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Est. Hours</Label>
              <Input type="number" min="0" step="0.5" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={handleCreate} disabled={!title.trim() || !projectId || createTask.isPending}>
            {createTask.isPending ? 'Creating…' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
