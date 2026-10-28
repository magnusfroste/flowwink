import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CalendarCheck, CheckCircle } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';

interface MyDayItem {
  id: string;
  kind: 'CRM task' | 'Project task' | 'Ticket' | 'Approval';
  title: string;
  due: string | null;
  href: string;
}

/**
 * Cross-module "what is on me today" queue. Reads only records assigned to the
 * signed-in user (plus approvals awaiting a decision), so it complements
 * Needs Attention — which is org-wide.
 */
function useMyDay(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-day', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<MyDayItem[]> => {
      const [crm, tasks, tickets, approvals] = await Promise.all([
        supabase
          .from('crm_tasks')
          .select('id,title,due_date,lead_id,deal_id')
          .eq('assigned_to', userId!)
          .is('completed_at', null)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(10),
        supabase
          .from('project_tasks')
          .select('id,title,due_date,project_id,status')
          .eq('assigned_to', userId!)
          .neq('status', 'done')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(10),
        supabase
          .from('tickets')
          .select('id,subject,sla_deadline,status')
          .eq('assigned_to', userId!)
          .not('status', 'in', '(resolved,closed)')
          .limit(10),
        supabase
          .from('approval_requests')
          .select('id,entity_type,entity_id,reason,created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(10),
      ]);

      const items: MyDayItem[] = [];
      for (const r of crm.data ?? []) {
        items.push({
          id: `crm-${r.id}`,
          kind: 'CRM task',
          title: r.title,
          due: r.due_date,
          href: r.deal_id ? `/admin/deals?id=${r.deal_id}` : r.lead_id ? `/admin/contacts?id=${r.lead_id}` : '/admin/activities',
        });
      }
      for (const r of tasks.data ?? []) {
        items.push({
          id: `pt-${r.id}`,
          kind: 'Project task',
          title: r.title,
          due: r.due_date,
          href: `/admin/projects?project=${r.project_id}`,
        });
      }
      for (const r of (tickets.data ?? []) as { id: string; subject: string; sla_deadline: string | null }[]) {
        items.push({
          id: `tk-${r.id}`,
          kind: 'Ticket',
          title: r.subject,
          due: r.sla_deadline,
          href: `/admin/tickets?id=${r.id}`,
        });
      }
      for (const r of (approvals.data ?? []) as { id: string; entity_type: string; reason: string | null; created_at: string }[]) {
        items.push({
          id: `ap-${r.id}`,
          kind: 'Approval',
          title: r.reason || `${r.entity_type} awaiting approval`,
          due: null,
          href: `/admin/approvals?id=${r.id}`,
        });
      }

      items.sort((a, b) => {
        if (a.due && b.due) return a.due.localeCompare(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return 0;
      });
      return items.slice(0, 8);
    },
  });
}

export function MyDayWidget() {
  const { profile } = useAuth();
  const { data, isLoading } = useMyDay(profile?.id);

  const { formatDate, formatDateTime } = usePlatformFormat();
  // A date-only due (YYYY-MM-DD) is overdue the day AFTER it, on the business's
  // calendar; a timestamp (an SLA deadline) the instant it passes.
  const isDateOnly = (due: string) => /^\d{4}-\d{2}-\d{2}$/.test(due);
  const isOverdue = (due: string | null) => !!due && (isDateOnly(due) ? due < businessToday() : new Date(due) < new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          My Day
          {!!data?.length && (
            <span className="text-xs font-normal text-muted-foreground">({data.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-sm">Nothing assigned to you right now</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.map((item) => (
              <Link
                key={item.id}
                to={item.href}
                className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Badge variant="outline" className="text-[10px] shrink-0">{item.kind}</Badge>
                <span className="text-sm flex-1 truncate">{item.title}</span>
                {item.due && (
                  <span className={`text-xs shrink-0 ${isOverdue(item.due) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {isDateOnly(item.due) ? formatDate(item.due) : formatDateTime(item.due)}
                  </span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
