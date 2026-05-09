/**
 * FlowPilotStatusBar
 *
 * The "agent server" status header shown above the FlowPilot cockpit tabs.
 * Inspired by Hermes Operator's gateway-status footer — but at the top, where
 * the operator's pulse belongs.
 *
 * Layer 2 (FlowPilot) only. Other executors live in /admin/automations and
 * /admin/developer.
 */

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Activity, Target, ShieldAlert, Cpu, MessageSquare, ExternalLink, Zap, CircleDot,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useIsModuleEnabled } from '@/hooks/useModules';

interface StatusData {
  lastHeartbeat: string | null;
  activeObjectives: number;
  totalObjectives: number;
  pendingHil: number;
  todayActions: number;
  todaySuccess: number;
  todayFailed: number;
  modeAge: number | null;
}

function useFlowPilotStatus() {
  return useQuery({
    queryKey: ['flowpilot-status-bar'],
    queryFn: async (): Promise<StatusData> => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const sinceIso = since.toISOString();

      const [hbRes, objRes, hilRes, todayRes] = await Promise.all([
        supabase
          .from('agent_activity')
          .select('created_at')
          .eq('agent', 'flowpilot')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('agent_objectives')
          .select('status'),
        supabase
          .from('agent_activity')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_approval'),
        supabase
          .from('agent_activity')
          .select('status')
          .eq('agent', 'flowpilot')
          .gte('created_at', sinceIso),
      ]);

      const objs = objRes.data ?? [];
      const today = todayRes.data ?? [];
      const lastHb = hbRes.data?.[0]?.created_at ?? null;

      return {
        lastHeartbeat: lastHb,
        activeObjectives: objs.filter(o => o.status === 'active').length,
        totalObjectives: objs.length,
        pendingHil: hilRes.count ?? 0,
        todayActions: today.length,
        todaySuccess: today.filter(a => a.status === 'success').length,
        todayFailed: today.filter(a => a.status === 'failed').length,
        modeAge: lastHb ? Date.now() - new Date(lastHb).getTime() : null,
      };
    },
    refetchInterval: 30_000,
  });
}

export function FlowPilotStatusBar() {
  const { data } = useFlowPilotStatus();
  const flowpilotEnabled = useIsModuleEnabled('flowpilot');

  const engineState: 'running' | 'idle' | 'disabled' = !flowpilotEnabled
    ? 'disabled'
    : data?.modeAge != null && data.modeAge < 120_000
    ? 'running'
    : 'idle';

  const ENGINE_CFG = {
    running: { label: 'Running', dot: 'bg-emerald-500', text: 'text-emerald-600', pulse: true },
    idle: { label: 'Idle', dot: 'bg-muted-foreground', text: 'text-muted-foreground', pulse: false },
    disabled: { label: 'Disabled', dot: 'bg-destructive/60', text: 'text-destructive', pulse: false },
  } as const;
  const ec = ENGINE_CFG[engineState];

  const successRate = data && data.todayActions > 0
    ? Math.round((data.todaySuccess / data.todayActions) * 100)
    : null;

  return (
    <div className="border-b bg-card/40">
      <div className="flex items-center gap-x-4 gap-y-2 px-4 py-2.5 flex-wrap text-xs">
        {/* Engine */}
        <div className="flex items-center gap-1.5">
          <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Engine</span>
          <span className={cn('h-2 w-2 rounded-full', ec.dot, ec.pulse && 'animate-pulse')} />
          <span className={cn('font-medium', ec.text)}>{ec.label}</span>
        </div>

        <Divider />

        {/* Heartbeat */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          <span>Heartbeat</span>
          <span className="font-medium text-foreground">
            {data?.lastHeartbeat
              ? formatDistanceToNow(new Date(data.lastHeartbeat), { addSuffix: true })
              : '—'}
          </span>
        </div>

        <Divider />

        {/* Objectives */}
        <Link
          to="/admin/flowpilot?tab=objectives"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Target className="h-3.5 w-3.5" />
          <span>Objectives</span>
          <span className="font-medium text-foreground">
            {data?.activeObjectives ?? 0}/{data?.totalObjectives ?? 0}
          </span>
        </Link>

        <Divider />

        {/* HIL */}
        <Link
          to="/admin/approvals"
          className={cn(
            'flex items-center gap-1.5 transition-colors',
            (data?.pendingHil ?? 0) > 0
              ? 'text-amber-600 hover:text-amber-700 font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>HIL</span>
          <span>{data?.pendingHil ?? 0}</span>
        </Link>

        <Divider />

        {/* Today */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Zap className="h-3.5 w-3.5" />
          <span>Today</span>
          <span className="font-medium text-foreground">{data?.todayActions ?? 0}</span>
          {successRate !== null && (
            <span className={cn(
              'tabular-nums',
              successRate >= 90 ? 'text-emerald-600' : successRate >= 70 ? 'text-amber-600' : 'text-destructive',
            )}>
              · {successRate}% ok
            </span>
          )}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/admin/flowpilot?tab=memory"
            className="hidden md:flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Persona</span>
          </Link>

          <Badge variant="outline" className="text-[10px] gap-1">
            <Activity className="h-3 w-3" />
            FlowPilot
          </Badge>

          <Button asChild variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
            <Link to="/chat">
              <MessageSquare className="h-3.5 w-3.5" />
              Open chat
              <ExternalLink className="h-3 w-3 opacity-60" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="h-3 w-px bg-border hidden sm:block" />;
}
