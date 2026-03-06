import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Activity, Target, Brain, ArrowRight, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface FlowPilotSummary {
  recentActions: Array<{ skill_name: string; status: string; created_at: string }>;
  activeObjectives: number;
  completedObjectives: number;
  lastHeartbeat: string | null;
  totalActionsThisWeek: number;
  errorRate: number;
}

function useFlowPilotSummary() {
  return useQuery({
    queryKey: ['flowpilot-summary'],
    queryFn: async (): Promise<FlowPilotSummary> => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const [activityRes, objectivesRes, heartbeatRes] = await Promise.all([
        supabase
          .from('agent_activity')
          .select('skill_name, status, created_at')
          .eq('agent', 'flowpilot')
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('agent_objectives')
          .select('status')
          .in('status', ['active', 'completed']),
        supabase
          .from('agent_activity')
          .select('created_at')
          .eq('agent', 'flowpilot')
          .eq('skill_name', 'heartbeat')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      const activities = activityRes.data || [];
      const objectives = objectivesRes.data || [];
      const errors = activities.filter(a => a.status === 'failed').length;

      return {
        recentActions: activities.slice(0, 5),
        activeObjectives: objectives.filter(o => o.status === 'active').length,
        completedObjectives: objectives.filter(o => o.status === 'completed').length,
        lastHeartbeat: heartbeatRes.data?.[0]?.created_at || null,
        totalActionsThisWeek: activities.length,
        errorRate: activities.length > 0 ? Math.round((errors / activities.length) * 100) : 0,
      };
    },
    refetchInterval: 60_000,
  });
}

export function FlowPilotDashboardWidget() {
  const { data, isLoading } = useFlowPilotSummary();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            FlowPilot
          </CardTitle>
          <Link to="/admin/copilot" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {data.lastHeartbeat && (
          <CardDescription className="text-xs">
            Last heartbeat {formatDistanceToNow(new Date(data.lastHeartbeat), { addSuffix: true })}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{data.totalActionsThisWeek}</div>
            <div className="text-[10px] text-muted-foreground">Actions (7d)</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold flex items-center justify-center gap-1">
              <Target className="h-3 w-3 text-primary" />
              {data.activeObjectives}
            </div>
            <div className="text-[10px] text-muted-foreground">Active Goals</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-lg font-bold">{data.errorRate}%</div>
            <div className="text-[10px] text-muted-foreground">Error Rate</div>
          </div>
        </div>

        {/* Recent activity */}
        {data.recentActions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Recent Activity</p>
            {data.recentActions.map((action, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1">
                {action.status === 'success' ? (
                  <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />
                ) : action.status === 'error' ? (
                  <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                ) : (
                  <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1 font-mono">
                  {action.skill_name || 'unknown'}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}

        {data.totalActionsThisWeek === 0 && (
          <div className="text-center py-4">
            <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              FlowPilot is ready. It will start taking actions once the heartbeat runs.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
