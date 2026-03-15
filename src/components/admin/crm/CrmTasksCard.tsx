import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, CheckCircle2, Clock, AlertTriangle, Trash2, Calendar
} from 'lucide-react';
import { formatDistanceToNow, format, isPast, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  useCrmTasks, useCreateCrmTask, useCompleteCrmTask, useDeleteCrmTask,
  type CrmTask 
} from '@/hooks/useCrmTasks';

interface CrmTasksCardProps {
  leadId?: string;
  dealId?: string;
}

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-muted text-muted-foreground' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export function CrmTasksCard({ leadId, dealId }: CrmTasksCardProps) {
  const { data: tasks = [], isLoading } = useCrmTasks({ leadId, dealId });
  const createTask = useCreateCrmTask();
  const completeTask = useCompleteCrmTask();
  const deleteTask = useDeleteCrmTask();

  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');

  const handleCreate = () => {
    if (!title.trim()) return;
    createTask.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || undefined,
      priority,
      lead_id: leadId,
      deal_id: dealId,
    }, {
      onSuccess: () => {
        setTitle('');
        setDescription('');
        setDueDate('');
        setPriority('medium');
        setIsAdding(false);
      },
    });
  };

  const overdueTasks = tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  const todayTasks = tasks.filter(t => t.due_date && isToday(new Date(t.due_date)));
  const upcomingTasks = tasks.filter(t => !overdueTasks.includes(t) && !todayTasks.includes(t));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Tasks
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
          )}
        </CardTitle>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Add form */}
        {isAdding && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <Input
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1"
              />
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={!title.trim() || createTask.isPending}>
                {createTask.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tasks.length === 0 && !isAdding ? (
          <p className="text-sm text-muted-foreground">No tasks yet</p>
        ) : (
          <>
            {overdueTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </p>
                {overdueTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onComplete={() => completeTask.mutate(task.id)}
                    onDelete={() => deleteTask.mutate(task.id)}
                    isOverdue
                  />
                ))}
              </div>
            )}
            {todayTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-amber-500">Today</p>
                {todayTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onComplete={() => completeTask.mutate(task.id)}
                    onDelete={() => deleteTask.mutate(task.id)}
                  />
                ))}
              </div>
            )}
            {upcomingTasks.length > 0 && (
              <div className="space-y-2">
                {(overdueTasks.length > 0 || todayTasks.length > 0) && (
                  <p className="text-xs font-medium text-muted-foreground">Upcoming</p>
                )}
                {upcomingTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onComplete={() => completeTask.mutate(task.id)}
                    onDelete={() => deleteTask.mutate(task.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TaskItem({ 
  task, 
  onComplete, 
  onDelete,
  isOverdue = false,
}: { 
  task: CrmTask; 
  onComplete: () => void; 
  onDelete: () => void;
  isOverdue?: boolean;
}) {
  const priorityConfig = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium;

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50",
      isOverdue && "border-red-500/30 bg-red-500/5"
    )}>
      <Checkbox
        className="mt-0.5"
        onCheckedChange={() => onComplete()}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{task.title}</p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge variant="secondary" className={cn("text-xs", priorityConfig.color)}>
            {priorityConfig.label}
          </Badge>
          {task.due_date && (
            <span className={cn(
              "text-xs flex items-center gap-1",
              isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
            )}>
              <Clock className="h-3 w-3" />
              {format(new Date(task.due_date), 'MMM d, HH:mm')}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
