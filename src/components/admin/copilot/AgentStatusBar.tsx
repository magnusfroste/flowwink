/**
 * AgentStatusBar
 * 
 * Compact status widget for the FlowPilot cockpit.
 * Shows heartbeat, current mode, active skills count, and error rate.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Zap, AlertTriangle, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface AgentStatus {
  lastActivity: string | null;
  activeSkills: number;
  recentErrors: number;
  recentTotal: number;
  mode: 'idle' | 'executing' | 'sleeping';
}

function useAgentStatus() {
  return useQuery({
    queryKey: ['agent-status'],
    queryFn: async () => {
      // Fetch last activity, active skill count, and error rate in parallel
      const [activityRes, skillsRes, errorsRes] = await Promise.all([
        supabase
          .from('agent_activity')
          .select('created_at, status')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('agent_skills')
          .select('id', { count: 'exact', head: true })
          .eq('enabled', true),
        supabase
          .from('agent_activity')
          .select('status')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const lastRow = activityRes.data?.[0];
      const recentActivities = errorsRes.data ?? [];
      const recentErrors = recentActivities.filter(a => a.status === 'failed').length;

      // Determine mode: if last activity was < 2 min ago and not done, "executing"
      let mode: AgentStatus['mode'] = 'idle';
      if (lastRow) {
        const age = Date.now() - new Date(lastRow.created_at).getTime();
        if (age < 120_000) mode = 'executing';
        else if (age > 3_600_000) mode = 'sleeping';
      }

      return {
        lastActivity: lastRow?.created_at ?? null,
        activeSkills: skillsRes.count ?? 0,
        recentErrors,
        recentTotal: recentActivities.length,
        mode,
      } as AgentStatus;
    },
    refetchInterval: 30_000,
  });
}

const MODE_CONFIG = {
  idle: { label: 'Idle', color: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  executing: { label: 'Active', color: 'text-emerald-600', dot: 'bg-emerald-500' },
  sleeping: { label: 'Sleeping', color: 'text-muted-foreground/50', dot: 'bg-muted-foreground/50' },
} as const;

export function AgentStatusBar() {
  const { data: status } = useAgentStatus();

  if (!status) return null;

  const modeCfg = MODE_CONFIG[status.mode];
  const errorRate = status.recentTotal > 0
    ? ((status.recentErrors / status.recentTotal) * 100).toFixed(0)
    : '0';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 rounded-lg bg-card border text-xs">
      {/* Mode indicator */}
      <div className="flex items-center gap-1.5">
        <span className={cn('h-2 w-2 rounded-full shrink-0', modeCfg.dot, status.mode === 'executing' && 'animate-pulse')} />
        <span className={cn('font-medium whitespace-nowrap', modeCfg.color)}>{modeCfg.label}</span>
      </div>

      <span className="h-3 w-px bg-border hidden sm:block" />

      {/* Active skills */}
      <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
        <Zap className="h-3 w-3 shrink-0" />
        <span>{status.activeSkills} skills</span>
      </div>

      <span className="h-3 w-px bg-border hidden sm:block" />

      {/* Error rate */}
      <div className={cn(
        'flex items-center gap-1 whitespace-nowrap',
        Number(errorRate) > 10 ? 'text-destructive' : 'text-muted-foreground'
      )}>
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span>{errorRate}%</span>
      </div>

      <span className="h-3 w-px bg-border hidden sm:block" />

      {/* Last heartbeat */}
      <div className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
        <Activity className="h-3 w-3 shrink-0" />
        <span className="truncate max-w-[8rem]">
          {status.lastActivity
            ? formatDistanceToNow(new Date(status.lastActivity), { addSuffix: true })
            : 'No activity'}
        </span>
      </div>
    </div>
  );
}
