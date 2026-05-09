/**
 * FlowPilotOverviewTab
 *
 * The cockpit "Overview" tab — what an operator wants on landing:
 *  - Morning briefing (when present)
 *  - Next priorities from last heartbeat
 *  - Pending HIL approvals (inline approve/reject)
 *  - Live activity feed with executor pill
 *
 * No chat surface here. Chat lives at /chat.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Sparkles, Target, ShieldAlert, ListChecks, RefreshCw, Bot, Cpu, Workflow, Timer, User2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type { AgentActivity } from '@/types/agent';

type ExecutorKind = 'flowpilot' | 'chat' | 'mcp' | 'cron' | 'automation' | 'system' | 'unknown';

interface FeedRow extends AgentActivity {
  _executor: ExecutorKind;
  _executorLabel: string;
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-500',
  failed: 'bg-destructive',
  pending_approval: 'bg-amber-500',
  approved: 'bg-primary',
  rejected: 'bg-muted-foreground',
};

const EXECUTOR_PILL: Record<ExecutorKind, { label: string; cls: string; icon: typeof Bot }> = {
  flowpilot: { label: 'FlowPilot', cls: 'bg-primary/10 text-primary border-primary/20', icon: Bot },
  chat: { label: 'Chat', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: User2 },
  mcp: { label: 'MCP', cls: 'bg-purple-500/10 text-purple-600 border-purple-500/20', icon: Cpu },
  cron: { label: 'Cron', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Timer },
  automation: { label: 'Automation', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: Workflow },
  system: { label: 'System', cls: 'bg-muted text-muted-foreground border-border', icon: Cpu },
  unknown: { label: 'Other', cls: 'bg-muted text-muted-foreground border-border', icon: Cpu },
};

function classifyExecutor(a: AgentActivity): { kind: ExecutorKind; label: string } {
  const agent = (a.agent || '').toString();
  if (agent === 'flowpilot') return { kind: 'flowpilot', label: 'FlowPilot' };
  if (agent === 'chat') return { kind: 'chat', label: 'Chat' };
  if (agent.startsWith('mcp')) {
    const peer = agent.includes(':') ? agent.split(':').slice(1).join(':') : null;
    return { kind: 'mcp', label: peer ? `MCP · ${peer}` : 'MCP' };
  }
  if (agent === 'cron') return { kind: 'cron', label: 'Cron' };
  if (agent === 'automation') return { kind: 'automation', label: 'Automation' };
  if (agent === 'system') return { kind: 'system', label: 'System' };
  return { kind: 'unknown', label: agent || 'Other' };
}

// ─── Last heartbeat / priorities ─────────────────────────────────────────────

interface HeartbeatRow {
  created_at: string;
  output: Record<string, unknown> | null;
}

function useLastHeartbeat() {
  return useQuery({
    queryKey: ['flowpilot-last-heartbeat'],
    queryFn: async (): Promise<HeartbeatRow | null> => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('created_at, output')
        .eq('agent', 'flowpilot')
        .eq('skill_name', 'heartbeat')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as unknown as HeartbeatRow) ?? null;
    },
    refetchInterval: 60_000,
  });
}

// ─── Briefing ────────────────────────────────────────────────────────────────

function useLatestBriefing() {
  return useQuery({
    queryKey: ['flowpilot-latest-briefing'],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('agent_activity')
        .select('created_at, output')
        .eq('agent', 'flowpilot')
        .eq('skill_name', 'morning_briefing')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    refetchInterval: 5 * 60_000,
  });
}

// ─── Pending HIL ─────────────────────────────────────────────────────────────

function usePendingHil() {
  return useQuery({
    queryKey: ['flowpilot-pending-hil'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('id, skill_name, input, created_at, agent')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });
}

// ─── Activity feed ───────────────────────────────────────────────────────────

function useActivityFeed(filter: ExecutorKind | 'all') {
  return useQuery({
    queryKey: ['flowpilot-overview-feed', filter],
    queryFn: async () => {
      let q = supabase
        .from('agent_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (filter === 'mcp') q = q.like('agent', 'mcp%');
      else if (filter === 'flowpilot' || filter === 'chat') q = q.eq('agent', filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AgentActivity[];
    },
    refetchInterval: 30_000,
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FlowPilotOverviewTab() {
  const briefing = useLatestBriefing();
  const heartbeat = useLastHeartbeat();
  const hil = usePendingHil();
  const [executorFilter, setExecutorFilter] = useState<ExecutorKind | 'all'>('all');
  const feed = useActivityFeed(executorFilter);

  // Realtime: refetch on inserts
  useEffect(() => {
    const channel = supabase
      .channel('flowpilot-overview-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_activity' },
        () => { feed.refetch(); hil.refetch(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priorities = useMemo<string[]>(() => {
    const out = heartbeat.data?.output;
    if (!out || typeof out !== 'object') return [];
    const p = (out as Record<string, unknown>).next_priorities;
    if (Array.isArray(p)) return (p as unknown[]).slice(0, 3).map(String);
    return [];
  }, [heartbeat.data]);

  const rows: FeedRow[] = useMemo(() => {
    return (feed.data ?? []).map(a => {
      const c = classifyExecutor(a);
      return { ...a, _executor: c.kind, _executorLabel: c.label };
    });
  }, [feed.data]);

  return (
    <div className="grid gap-4 lg:grid-cols-3 p-4 max-w-7xl mx-auto">
      {/* LEFT — briefing + priorities */}
      <div className="lg:col-span-2 space-y-4">
        {/* Morning briefing */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Morning briefing
              </CardTitle>
              {briefing.data && (
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(briefing.data.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {briefing.data ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {(typeof briefing.data.output === 'object' && briefing.data.output
                  ? (briefing.data.output as Record<string, unknown>).summary?.toString() ?? 'Briefing generated.'
                  : 'Briefing generated.')}
              </p>
            ) : (
              <div className="text-sm text-muted-foreground">
                No briefing in the last 24h. FlowPilot will generate one on its next heartbeat.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Next priorities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Next priorities
            </CardTitle>
            <CardDescription className="text-xs">
              Derived from FlowPilot's last heartbeat reflection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {priorities.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No priorities yet — heartbeat hasn't reflected on objectives.
              </div>
            ) : (
              <ol className="space-y-2">
                {priorities.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{p}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Activity feed with executor filter */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                Live activity
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => feed.refetch()}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {(['all', 'flowpilot', 'chat', 'mcp', 'automation', 'cron'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setExecutorFilter(f)}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                    executorFilter === f
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {f === 'all' ? 'All' : EXECUTOR_PILL[f as ExecutorKind].label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[320px]">
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No activity</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {rows.map(r => {
                    const cfg = EXECUTOR_PILL[r._executor];
                    const PillIcon = cfg.icon;
                    return (
                      <div key={r.id} className="flex items-start gap-2 py-2 group">
                        <span className={cn(
                          'h-2 w-2 rounded-full mt-1.5 shrink-0',
                          STATUS_DOT[r.status] ?? 'bg-muted-foreground',
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium truncate">
                              {(r.skill_name || 'Unknown').toString().replace(/_/g, ' ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn(
                              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0 rounded border',
                              cfg.cls,
                            )}>
                              <PillIcon className="h-2.5 w-2.5" />
                              {r._executorLabel}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                              {r.duration_ms ? ` · ${r.duration_ms}ms` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* RIGHT — HIL queue + jump links */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Pending approvals
              {hil.data && hil.data.length > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {hil.data.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hil.data && hil.data.length > 0 ? (
              <>
                {hil.data.slice(0, 3).map(h => (
                  <div key={h.id} className="p-2 rounded-md border bg-muted/30">
                    <div className="text-xs font-medium truncate">
                      {(h.skill_name || 'Action').replace(/_/g, ' ')}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
                <Button asChild size="sm" variant="outline" className="w-full text-xs">
                  <Link to="/admin/approvals">Open approvals queue</Link>
                </Button>
              </>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No pending approvals.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Jump to
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <JumpLink to="/admin/flowpilot?tab=objectives" icon={Target} label="Objectives" />
            <JumpLink to="/admin/automations" icon={Workflow} label="Automations & Workflows" />
            <JumpLink to="/admin/developer?tab=mcp-skills" icon={Cpu} label="Skills & MCP" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JumpLink({ to, icon: Icon, label }: { to: string; icon: typeof Bot; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2 h-8 text-xs">
      <Link to={to}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Link>
    </Button>
  );
}
