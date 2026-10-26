import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlarmClock, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { TicketSlaStatus } from '@/hooks/useTicketSla';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

const STYLES: Record<string, string> = {
  breached: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-transparent',
  due_soon: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-transparent',
  ok: 'bg-muted text-muted-foreground border-transparent',
};

export function TicketSlaBadge({ status }: { status?: TicketSlaStatus }) {
  const { formatDateTime } = usePlatformFormat();
  if (!status || status.state === 'none') {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const Icon =
    status.state === 'breached' ? TriangleAlert : status.state === 'due_soon' ? AlarmClock : ShieldCheck;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`text-[10px] gap-1 ${STYLES[status.state]}`}>
          <Icon className="h-3 w-3" />
          {status.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          {status.metric ? `${status.metric.replace('_', ' ')} target` : 'SLA'}
          {status.dueAt ? ` · due ${formatDateTime(status.dueAt)}` : ''}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
