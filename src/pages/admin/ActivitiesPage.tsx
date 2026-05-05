import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Plus, Briefcase, User, Calendar as CalendarIcon, AlertTriangle, Phone, Users as UsersIcon, ClipboardList } from 'lucide-react';
import {
  useUnifiedPendingActivities,
  useCompleteUnifiedActivity,
  type UnifiedActivity,
} from '@/hooks/useUnifiedActivities';
import { CreateTaskDialog } from '@/components/admin/CreateTaskDialog';
import { format, isToday, isPast, isFuture, parseISO, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

type Bucket = 'overdue' | 'today' | 'upcoming' | 'no_date';

function bucketize(task: UnifiedActivity): Bucket {
  if (!task.due_date) return 'no_date';
  const d = parseISO(task.due_date);
  if (isToday(d)) return 'today';
  if (isPast(d)) return 'overdue';
  if (isFuture(d)) return 'upcoming';
  return 'no_date';
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary'> = {
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

const TYPE_ICON: Record<string, typeof ClipboardList> = {
  todo: ClipboardList,
  call: Phone,
  meeting: UsersIcon,
};

export default function ActivitiesPage() {
  const { data: tasks = [], isLoading } = useUnifiedPendingActivities();
  const complete = useCompleteUnifiedActivity();
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<Bucket>('today');

  const grouped = useMemo(() => {
    const out: Record<Bucket, UnifiedActivity[]> = { overdue: [], today: [], upcoming: [], no_date: [] };
    for (const t of tasks) out[bucketize(t)].push(t);
    return out;
  }, [tasks]);

  const counts = {
    overdue: grouped.overdue.length,
    today: grouped.today.length,
    upcoming: grouped.upcoming.length,
    no_date: grouped.no_date.length,
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Activities"
          description="Tasks and follow-ups across all deals and contacts"
        >
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New activity
          </Button>
        </AdminPageHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Bucket)}>
          <TabsList>
            <TabsTrigger value="today" className="gap-2">
              Today {counts.today > 0 && <Badge variant="secondary">{counts.today}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="overdue" className="gap-2">
              Overdue {counts.overdue > 0 && <Badge variant="destructive">{counts.overdue}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="gap-2">
              Upcoming {counts.upcoming > 0 && <Badge variant="secondary">{counts.upcoming}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="no_date" className="gap-2">
              No date {counts.no_date > 0 && <Badge variant="outline">{counts.no_date}</Badge>}
            </TabsTrigger>
          </TabsList>

          {(['today', 'overdue', 'upcoming', 'no_date'] as Bucket[]).map((b) => (
            <TabsContent key={b} value={b} className="mt-4">
              <TaskList
                tasks={grouped[b]}
                isLoading={isLoading}
                emptyText={
                  b === 'today' ? 'Nothing due today — enjoy your day.' :
                  b === 'overdue' ? 'No overdue tasks. 👏' :
                  b === 'upcoming' ? 'No upcoming activities scheduled.' :
                  'No undated tasks.'
                }
                onComplete={(id, source) => complete.mutate({ id, source })}
              />
            </TabsContent>
          ))}
        </Tabs>

        <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
      </AdminPageContainer>
    </AdminLayout>
  );
}

function TaskList({
  tasks, isLoading, emptyText, onComplete,
}: {
  tasks: UnifiedActivity[];
  isLoading: boolean;
  emptyText: string;
  onComplete: (id: string, source: UnifiedActivity['source']) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>{emptyText}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskRow key={`${t.source}:${t.id}`} task={t} onComplete={onComplete} />
      ))}
    </div>
  );
}

function TaskRow({ task, onComplete }: { task: UnifiedActivity; onComplete: (id: string, source: UnifiedActivity['source']) => void }) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due ? isPast(due) && !isToday(due) : false;

  const linkTo = task.deal_id
    ? `/admin/deals/${task.deal_id}`
    : task.lead_id
      ? `/admin/contacts/${task.lead_id}`
      : task.entity_type && task.entity_id
        ? `/admin/${task.entity_type}s/${task.entity_id}`
        : null;

  const TypeIcon = TYPE_ICON[task.activity_type ?? 'todo'] ?? ClipboardList;
  const linkIcon = task.deal_id ? Briefcase : User;
  const linkLabel = task.deal_id ? 'Deal' : task.lead_id ? 'Contact' : task.entity_type;

  return (
    <Card className={cn(overdue && 'border-destructive/30')}>
      <CardContent className="p-3 flex items-start gap-3">
        <Checkbox
          checked={false}
          onCheckedChange={() => onComplete(task.id, task.source)}
          className="mt-1"
          aria-label="Mark complete"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="font-medium text-sm">{task.title}</p>
            <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'secondary'} className="text-xs">
              {task.priority}
            </Badge>
            {overdue && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </Badge>
            )}
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {due && (
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {format(due, 'MMM d, yyyy HH:mm')}
                {' · '}
                {formatDistanceToNow(due, { addSuffix: true })}
              </span>
            )}
            {linkTo && linkLabel && (
              <Link to={linkTo} className="text-primary hover:underline flex items-center gap-1">
                {(() => {
                  const Icon = linkIcon;
                  return <Icon className="h-3 w-3" />;
                })()}
                Open {linkLabel.toLowerCase()}
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
