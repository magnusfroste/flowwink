import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNextTasksIndex, getNextStepState } from '@/hooks/useNextTasksIndex';

interface NextStepChipProps {
  leadId?: string;
  dealId?: string;
}

/**
 * Odoo-style next-activity indicator for pipeline kanban cards:
 * green dot = planned, amber = due today, red = overdue — plus the muted
 * "No next step" state, which for an agent-run pipeline is the important
 * signal (nobody — human or agent — has scheduled a follow-up).
 *
 * Data comes from the shared useNextTasksIndex hook (one query for the whole
 * board, no per-card fetches).
 */
export function NextStepChip({ leadId, dealId }: NextStepChipProps) {
  const { data, isLoading } = useNextTasksIndex();
  if (isLoading) return null;

  const next = dealId
    ? data?.byDeal.get(dealId)
    : leadId
      ? data?.byLead.get(leadId)
      : undefined;
  const state = getNextStepState(next);

  if (state === 'none' || !next) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />
        <span className="truncate">No next step</span>
      </div>
    );
  }

  const dot = {
    overdue: 'bg-destructive',
    today: 'bg-amber-500',
    planned: 'bg-emerald-500',
  }[state];
  const text = {
    overdue: 'text-destructive font-medium',
    today: 'text-amber-600 dark:text-amber-400',
    planned: 'text-muted-foreground',
  }[state];

  const dueLabel = next.due_date ? format(parseISO(next.due_date), 'MMM d') : null;

  return (
    <div className={cn('flex items-center gap-1.5 text-xs', text)} title={next.title}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', dot)} />
      <span className="truncate">{next.title}</span>
      {dueLabel && <span className="shrink-0 tabular-nums">{dueLabel}</span>}
    </div>
  );
}
