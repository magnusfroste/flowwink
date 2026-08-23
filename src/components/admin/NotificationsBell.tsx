import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { usePendingApprovalCount } from './PendingApprovalsBadge';
import { usePausedAgentRunCount } from '@/hooks/useAgentRuns';
import { useOpenTicketCount } from '@/hooks/useTickets';
import { useAuth } from '@/hooks/useAuth';
import { useModuleAccess } from '@/hooks/useRoleModuleAccess';
import {
  useAcknowledgeIntegrationHealth,
  useUnacknowledgedIntegrationNotices,
} from '@/hooks/useIntegrationHealth';

/**
 * NotificationsBell — aggregates admin-facing "needs attention" signals
 * into a single header dropdown. Complements the sidebar badges by giving
 * a global summary regardless of which section is open.
 *
 * Current signals:
 *   - Pending approvals
 *   - Paused FlowPilot runs (need human input)
 *   - Open tickets (SLA risk)
 *   - Integration health changes (a transition, not a status)
 *
 * The first three are DERIVED counts over live queues — the bell has never had
 * a store of its own, and acknowledging them means resolving the underlying row
 * (approve the approval, resume the run, close the ticket). Integration health
 * follows the same shape: the count is the transitions nobody has closed yet,
 * and clicking closes them.
 *
 * Why that row is here at all: the daily integration sweep used to write its
 * result into admin FlowChat as a `role: 'assistant'` message. Nine of those
 * accumulated on optic, four word-for-word identical, none of them
 * acknowledgeable — a state parked inside something permanent can only be
 * buried, never resolved, and the alarm became wallpaper. The STATE now lives
 * on Observability; only a CHANGE reaches this bell, exactly once.
 */
export function NotificationsBell() {
  // Every signal follows the viewer's reach (Svante-fynd 2026-08-18): the
  // approvals count is actionability-filtered in its hook, paused runs are a
  // FlowChat/admin concern, and tickets follow the tickets module. A bell
  // that announces queues you cannot open is noise, not transparency.
  const { isAdmin } = useAuth();
  const { canAccess } = useModuleAccess();
  const { data: approvals = 0 } = usePendingApprovalCount();
  const { data: pausedRaw = 0 } = usePausedAgentRunCount();
  const { data: ticketsRaw = 0 } = useOpenTicketCount();
  // Same rule for integration health: it is platform config, so admin is the
  // dimension — the state row is is_staff-gated and the acknowledge RPC is
  // admin-guarded. Don't fetch it for someone who could not act on it.
  const { data: healthNotices = [] } = useUnacknowledgedIntegrationNotices(isAdmin);
  const acknowledgeHealth = useAcknowledgeIntegrationHealth();
  const paused = isAdmin ? pausedRaw : 0;
  const tickets = canAccess('tickets') ? ticketsRaw : 0;
  const integrationChanges = isAdmin ? healthNotices.length : 0;

  // A recovery is news too, and it is the nicer kind — it must not paint the
  // badge red. Only an open notice about something BREAKING warns.
  const integrationDegraded = healthNotices.some((n) => n.kind !== 'recovered');

  const total = approvals + paused + tickets + integrationChanges;
  const hasWarning = paused > 0 || approvals > 0 || integrationDegraded;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold',
                hasWarning
                  ? 'bg-warning text-warning-foreground'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {total > 99 ? '99+' : total}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Needs attention</span>
          {total === 0 && (
            <span className="text-[10px] font-normal text-muted-foreground">All clear</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <NotificationRow
          href="/admin/approvals"
          label="Pending approvals"
          count={approvals}
          hint="Awaiting review"
        />
        <NotificationRow
          href="/admin/flowpilot?tab=trace"
          label="Paused FlowPilot runs"
          count={paused}
          hint="Waiting for human input"
          warning
        />
        <NotificationRow
          href="/admin/tickets"
          label="Open tickets"
          count={tickets}
          hint="Customer support queue"
        />
        {/* Acknowledged by opening it — the one thing the chat message it
            replaced could never be. Nothing repeats here: the state may still
            be "failing" tomorrow, but the change is closed. */}
        <NotificationRow
          href="/admin/system#observability"
          label="Integration health changed"
          count={integrationChanges}
          hint={healthNotices[0]?.headline ?? 'Since you last looked'}
          warning={integrationDegraded}
          onSelect={() => acknowledgeHealth.mutate(undefined)}
        />

        {total === 0 && (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            Nothing needs your attention right now.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RowProps {
  href: string;
  label: string;
  count: number;
  hint?: string;
  warning?: boolean;
  /**
   * Fires when the row is opened. For a derived count this is unnecessary —
   * the queue empties when the work is done. For a NOTICE it is the whole
   * point: seeing it is what closes it.
   */
  onSelect?: () => void;
}

function NotificationRow({ href, label, count, hint, warning, onSelect }: RowProps) {
  if (count <= 0) return null;
  return (
    <DropdownMenuItem asChild>
      <Link to={href} onClick={onSelect} className="cursor-pointer flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          {hint && <div className="text-[11px] text-muted-foreground truncate">{hint}</div>}
        </div>
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full text-[10px] font-medium h-5 min-w-5 px-1.5',
            warning
              ? 'bg-warning text-warning-foreground'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
