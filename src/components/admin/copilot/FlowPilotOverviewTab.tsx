/**
 * FlowPilotOverviewTab
 *
 * The cockpit "Today" tab — what an operator wants on landing:
 *  - Morning briefing (when present)
 *  - What it did on its own (notify-level runs nobody has looked at)
 *  - The last heartbeat, in FlowPilot's own words
 *
 * One "needs you" number lives in the status bar (approvals + staged
 * operations), one activity feed in the Log tab and Observability → MCP
 * activity — this tab repeats neither.
 *
 * No chat surface here. Chat lives at /chat.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, ShieldAlert, ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useLatestBriefing } from '@/hooks/useFlowPilotBriefings';
import { useNotifiedActions, useAcknowledgeNotifiedActions, useStagedOperationCount } from '@/hooks/useAgentAttention';

// ─── Last heartbeat ──────────────────────────────────────────────────────────

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

// ─── Briefing ──────────────────────────────────────────────
// The briefing lives in flowpilot_briefings (flowpilot-lifecycle writes it).
// This card used to read agent_activity rows under a skill name that
// nothing writes, so it said "no briefing" every day while the cockpit marked
// the real one read on open (2026-10-29 review). useLatestBriefing is the same
// hook the dashboard's Business Pulse uses.

// ─── Component ───────────────────────────────────────────────────────────────

export function FlowPilotOverviewTab() {
  const briefing = useLatestBriefing();
  const heartbeat = useLastHeartbeat();
  const notified = useNotifiedActions(8);
  const acknowledge = useAcknowledgeNotifiedActions();
  const staged = useStagedOperationCount();

  // The heartbeat writes output.summary — its account of the run. The card
  // used to read next_priorities, which the heartbeat hard-codes to [].
  const heartbeatSummary = useMemo<string>(() => {
    const out = heartbeat.data?.output;
    if (!out || typeof out !== 'object') return '';
    const s = (out as Record<string, unknown>).summary;
    return typeof s === 'string' ? s.trim() : '';
  }, [heartbeat.data]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
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
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium">{briefing.data.title}</div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">{briefing.data.summary}</p>
                </div>
                {Array.isArray(briefing.data.action_items) && briefing.data.action_items.length > 0 && (
                  <ol className="space-y-1.5">
                    {briefing.data.action_items.slice(0, 5).map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5', item.priority === 'high' && 'border-destructive/40 text-destructive')}>
                          {item.priority}
                        </Badge>
                        {item.link ? (
                          <Link to={item.link} className="underline-offset-2 hover:underline">{item.text}</Link>
                        ) : (
                          <span>{item.text}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No briefing yet. The daily briefing is written at the time set under Autonomy; the Business Pulse on the dashboard shows the same one.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Acted on its own — notify-level runs nobody has looked at yet */}
        {(notified.data?.total ?? 0) > 0 && (
          <Card className="border-warning/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  Acted on its own · {notified.data?.total}
                </CardTitle>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={acknowledge.isPending} onClick={() => acknowledge.mutate(undefined)}>
                  Mark all seen
                </Button>
              </div>
              <CardDescription className="text-xs">
                Skills on trust level “notify” run without asking and land here until someone has looked. While
                FlowPilot is still proving itself, skills that would normally wait for approval run this way too. To
                require approval instead, set the skill’s
                trust level under Approvals → Gated Skills.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {(notified.data?.rows ?? []).map((a) => {
                  const out = (a.output ?? {}) as Record<string, unknown>;
                  const note = typeof out.note === 'string' ? out.note : typeof out.message === 'string' ? out.message : '';
                  return (
                    <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{(a.skill_name ?? 'skill').replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted-foreground"> · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
                        {note && <div className="text-xs text-muted-foreground truncate">{note}</div>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 text-xs shrink-0" onClick={() => acknowledge.mutate([a.id])}>
                        Seen
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}

        {(staged.data ?? 0) > 0 && (
          <Card>
            <CardContent className="py-3 flex items-center justify-between gap-3 text-sm">
              <span>{staged.data} staged {staged.data === 1 ? 'action waits' : 'actions wait'} for approval.</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link to="/admin/approvals?tab=staged">Review</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Last heartbeat — what FlowPilot did and why, in its own words */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                Last heartbeat
              </CardTitle>
              {heartbeat.data && (
                <span className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(heartbeat.data.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
            <CardDescription className="text-xs">
              FlowPilot's own account of the run: what it did, what it left alone, and why.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {heartbeatSummary ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{heartbeatSummary}</p>
            ) : (
              <div className="text-sm text-muted-foreground">
                No heartbeat has run yet. It runs at the hours set under Autonomy.
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Every run and why is in the{' '}
          <Link to="/admin/flowpilot?tab=log" className="underline underline-offset-2">Log</Link>; every call an
          agent made is under{' '}
          <Link to="/admin/system#observability" className="underline underline-offset-2">System → Observability → MCP activity</Link>.
          What agents may do:{' '}
          <Link to="/admin/skills?tab=manage" className="underline underline-offset-2">Skills</Link>.
        </p>
    </div>
  );
}
