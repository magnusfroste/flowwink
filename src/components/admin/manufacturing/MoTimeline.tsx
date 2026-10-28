import { Check, Circle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MoStatus } from '@/hooks/useManufacturing';
import { liveFormat } from '@/lib/live-format';

interface Stage {
  key: 'draft' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
  label: string;
}

const FORWARD_STAGES: Stage[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

const STATUS_ORDER: Record<MoStatus, number> = {
  draft: 0,
  planned: 0,
  confirmed: 1,
  in_progress: 2,
  done: 3,
  cancelled: -1,
};

interface Props {
  status: MoStatus;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  className?: string;
}

function fmt(ts?: string | null): string {
  if (!ts) return '';
  try {
    return liveFormat().formatDateTime(ts, { year: undefined, month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function MoTimeline({
  status,
  createdAt,
  startedAt,
  completedAt,
  cancelledAt,
  className,
}: Props) {
  const cancelled = status === 'cancelled';

  // For a cancelled MO, show a 2-stage timeline: where it started (draft)
  // and where it ended (cancelled), so operators can still see progression.
  if (cancelled) {
    const stages: Stage[] = [
      { key: 'draft', label: 'Draft' },
      { key: 'cancelled', label: 'Cancelled' },
    ];
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {stages.map((stage, idx) => {
          const isCancelStage = stage.key === 'cancelled';
          const stamp = isCancelStage ? fmt(cancelledAt) : fmt(createdAt);
          return (
            <div key={stage.key} className="flex flex-1 items-center gap-1">
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors',
                    isCancelStage
                      ? 'border-destructive bg-destructive text-destructive-foreground ring-2 ring-destructive/30 ring-offset-2 ring-offset-background'
                      : 'border-primary bg-primary text-primary-foreground',
                  )}
                  aria-current={isCancelStage ? 'step' : undefined}
                >
                  {isCancelStage ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="text-center">
                  <div
                    className={cn(
                      'text-[11px] font-medium leading-tight',
                      isCancelStage ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    {stage.label}
                  </div>
                  {stamp && (
                    <div className="text-[10px] leading-tight text-muted-foreground">
                      {stamp}
                    </div>
                  )}
                </div>
              </div>
              {idx < stages.length - 1 && (
                <div className="h-0.5 flex-1 rounded-full bg-destructive/40" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const currentIdx = STATUS_ORDER[status] ?? 0;

  // Best-effort timestamps per stage. confirmed_at not stored — fall back to created_at
  // if we've moved past draft, since confirm is the first explicit transition after draft.
  const stampForStage = (key: Stage['key']): string => {
    if (key === 'draft') return fmt(createdAt);
    if (key === 'confirmed') return currentIdx >= 1 ? fmt(createdAt) : '';
    if (key === 'in_progress') return fmt(startedAt);
    if (key === 'done') return fmt(completedAt);
    return '';
  };

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {FORWARD_STAGES.map((stage, idx) => {
        const reached = currentIdx >= idx;
        const isCurrent = currentIdx === idx;
        const stamp = stampForStage(stage.key);

        return (
          <div key={stage.key} className="flex flex-1 items-center gap-1">
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors',
                  reached
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground',
                  isCurrent && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {reached ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    'text-[11px] font-medium leading-tight',
                    reached ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {stage.label}
                </div>
                {stamp && (
                  <div className="text-[10px] leading-tight text-muted-foreground">{stamp}</div>
                )}
              </div>
            </div>
            {idx < FORWARD_STAGES.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-colors',
                  currentIdx > idx ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
