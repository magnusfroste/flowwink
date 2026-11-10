import { useQuery } from '@tanstack/react-query';
import { Bot, Ban, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { WidgetShell, MetricTile } from '@/components/admin/DashboardWidgetShell';
import { useActiveModules, skillShown } from '@/lib/module-visibility';
import { useBusinessClock } from '@/hooks/useBusinessClock';
import { summarizeAgentWork, type AgentActivityRow, type TaskCommentRow } from '@/lib/agent-work';

/**
 * Agent work, in plain words (#869): what the agents did today, what waits on
 * a person, and where an agent was stopped — for an owner, not a developer.
 * The reading is src/lib/agent-work.ts; this only fetches and draws.
 *
 * Admin-only by the data's own policy (agent_activity is readable by admins):
 * for anyone else the queries come back empty and the panel says nothing is
 * waiting, which is true of what they can see.
 */
const WINDOW_DAYS = 7;

export function AgentWorkDashboardWidget() {
  const active = useActiveModules();
  const { today, toInstant } = useBusinessClock();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'agent-work', [...active].sort().join(',')],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const todayStart = toInstant(`${today()}T00:00`) ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const [activity, comments, staged] = await Promise.all([
        supabase
          .from('agent_activity')
          .select('id, agent, skill_name, status, error_message, output, created_at')
          .gte('created_at', since)
          .in('status', ['success', 'refused', 'failed'])
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('project_task_comments' as never)
          .select('task_id, project_id, kind, author_type, author_name, created_at')
          .gte('created_at', since)
          .limit(2000),
        supabase.from('pending_operations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      return summarizeAgentWork({
        activity: (activity.data ?? []) as AgentActivityRow[],
        comments: (comments.data ?? []) as unknown as TaskCommentRow[],
        stagedCount: staged.count ?? 0,
        todayStart,
        shown: (skill) => skillShown(skill, active),
      });
    },
  });

  const waiting = (data?.staged ?? 0) + (data?.openQuestions ?? 0);

  return (
    <WidgetShell title="Agent work" icon={Bot} href="/admin/agents" linkLabel="Agents" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Actions today" value={data?.actionsToday ?? 0} href="/admin/agents" />
        <MetricTile
          label="Waiting for you"
          value={waiting}
          tone={waiting > 0 ? 'warning' : 'default'}
          href={(data?.staged ?? 0) > 0 ? '/admin/approvals' : '/admin/projects'}
        />
        <MetricTile label="Refused (7 days)" value={data?.refused ?? 0} tone={(data?.refused ?? 0) > 0 ? 'warning' : 'default'} href="/admin/agents" />
        <MetricTile label="Failed (7 days)" value={data?.failed ?? 0} tone={(data?.failed ?? 0) > 0 ? 'destructive' : 'default'} href="/admin/agents" />
      </div>

      {data && (data.agentsToday.length > 0 || waiting > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {data.agentsToday.length > 0 && <>Today: {data.agentsToday.join(', ')}. </>}
          {data.staged > 0 && <>{data.staged} staged {data.staged === 1 ? 'operation' : 'operations'} to approve. </>}
          {data.openQuestions > 0 && (
            <>{data.openQuestions} {data.openQuestions === 1 ? 'question' : 'questions'} from an agent without an answer.</>
          )}
        </p>
      )}

      {data && data.stopped.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Stopped</p>
          {data.stopped.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs py-1">
              {s.outcome === 'failed' ? (
                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
              ) : (
                <Ban className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1">
                <span className="font-mono">{s.skill}</span>
                <span className="text-muted-foreground"> · {s.agent} · {s.outcome}: {s.reason}</span>
              </span>
              <span className="text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(s.at), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
