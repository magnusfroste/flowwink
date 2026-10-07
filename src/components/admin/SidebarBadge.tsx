import { useOpenTicketCount } from '@/hooks/useTickets';
import { useNewLeadCount } from '@/hooks/useLeads';
import { useActiveDealCount } from '@/hooks/useDeals';
import { useNewApplicationCount } from '@/hooks/useRecruitment';
import { usePendingExpenseReportCount } from '@/hooks/useExpenses';
import { usePausedAgentRunCount } from '@/hooks/useAgentRuns';
import { useRiverUnreadCount } from '@/hooks/useRiver';
import { PendingApprovalsBadge } from './PendingApprovalsBadge';

const BADGE_HREFS = [
  '/admin/approvals',
  '/admin/tickets',
  '/admin/leads',
  '/admin/deals',
  '/admin/recruitment',
  '/admin/expenses',
  '/admin/flowpilot',
  '/admin/river',
] as const;

type BadgeHref = (typeof BADGE_HREFS)[number];

function isBadgeHref(href: string): href is BadgeHref {
  return BADGE_HREFS.includes(href as BadgeHref);
}

function CountBadge({ count, tone = 'primary' }: { count: number; tone?: 'primary' | 'warning' }) {
  if (count <= 0) return null;
  const styles =
    tone === 'warning'
      ? 'bg-warning text-warning-foreground'
      : 'bg-primary text-primary-foreground';
  return (
    <span
      className={`ml-auto inline-flex items-center justify-center rounded-full ${styles} text-[10px] font-medium h-4 min-w-4 px-1`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface SidebarBadgeProps {
  href: string;
}

export function SidebarBadge({ href }: SidebarBadgeProps) {
  if (!isBadgeHref(href)) return null;

  if (href === '/admin/approvals') return <PendingApprovalsBadge />;
  if (href === '/admin/tickets') return <TicketOpenBadge />;
  if (href === '/admin/leads') return <NewLeadBadge />;
  if (href === '/admin/deals') return <ActiveDealBadge />;
  if (href === '/admin/recruitment') return <NewApplicationBadge />;
  if (href === '/admin/expenses') return <PendingExpenseBadge />;
  if (href === '/admin/flowpilot') return <PausedRunBadge />;
  if (href === '/admin/river') return <RiverUnreadBadge />;

  return null;
}

function TicketOpenBadge() {
  const { data: count = 0 } = useOpenTicketCount();
  return <CountBadge count={count} />;
}

function NewLeadBadge() {
  const { data: count = 0 } = useNewLeadCount();
  return <CountBadge count={count} />;
}

function ActiveDealBadge() {
  const { data: count = 0 } = useActiveDealCount();
  return <CountBadge count={count} />;
}

function NewApplicationBadge() {
  const { data: count = 0 } = useNewApplicationCount();
  return <CountBadge count={count} />;
}

function PendingExpenseBadge() {
  const { data: count = 0 } = usePendingExpenseReportCount();
  return <CountBadge count={count} />;
}

function PausedRunBadge() {
  const { data: count = 0 } = usePausedAgentRunCount();
  return <CountBadge count={count} tone="warning" />;
}

function RiverUnreadBadge() {
  const { data: count = 0 } = useRiverUnreadCount();
  return <CountBadge count={count} />;
}
