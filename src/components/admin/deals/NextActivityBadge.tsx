import { useCrmTasks } from '@/hooks/useCrmTasks';
import { AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface NextActivityBadgeProps {
  dealId: string;
}

/**
 * Tiny inline indicator showing the next pending task for a deal.
 * Pipedrive-style: green = scheduled, red = overdue, gray = none.
 */
export function NextActivityBadge({ dealId }: NextActivityBadgeProps) {
  const { data: tasks } = useCrmTasks({ dealId });

  // Earliest pending task with a due date
  const next = tasks
    ?.filter(t => !t.completed_at && t.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

  // No activity scheduled — Pipedrive shows this as a warning
  if (!next) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span className="truncate">No activity scheduled</span>
      </div>
    );
  }

  const due = parseISO(next.due_date!);
  const overdue = isPast(due);
  const Icon = overdue ? AlertTriangle : Clock;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs',
        overdue ? 'text-destructive' : 'text-muted-foreground'
      )}
      title={next.title}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {overdue ? 'Overdue ' : ''}
        {formatDistanceToNow(due, { addSuffix: true })}
      </span>
    </div>
  );
}
