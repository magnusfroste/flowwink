import { cn } from '@/lib/utils';
import { useNextTasksIndex, getNextStepState } from '@/hooks/useNextTasksIndex';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { ACTIVITY_KIND_ICON } from './activity-kinds';

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
  const { formatDateTime } = usePlatformFormat();
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
    today: 'text-warning',
    planned: 'text-muted-foreground',
  }[state];

  const dueLabel = next.due_date
    ? formatDateTime(next.due_date, {
        year: undefined, month: 'short', day: 'numeric', hour: undefined, minute: undefined,
      })
    : null;

  // The icon says WHAT the next step is (call, email, meeting, to-do), the
  // dot says WHEN — the two things an Odoo card reads at a distance.
  const KindIcon = ACTIVITY_KIND_ICON[(next.activity_type as keyof typeof ACTIVITY_KIND_ICON) || 'todo'] ?? ACTIVITY_KIND_ICON.todo;
  return (
    <div className={cn('flex items-center gap-1.5 text-xs', text)} title={next.title}>
      <span className={cn('h-2 w-2 rounded-full shrink-0', dot)} />
      <KindIcon className="h-3 w-3 shrink-0" />
      <span className="truncate">{next.title}</span>
      {dueLabel && <span className="shrink-0 tabular-nums">{dueLabel}</span>}
    </div>
  );
}
