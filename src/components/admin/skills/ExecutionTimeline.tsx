import { useMemo, useState } from 'react';
import { formatDistanceStrict } from 'date-fns';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { ChevronDown, ChevronRight, Zap, AlertCircle, Clock, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useActivity, useApproveActivity } from '@/hooks/useSkillHub';
import type { AgentActivity, AgentActivityStatus } from '@/types/agent';

const STATUS_DOT: Record<AgentActivityStatus, string> = {
  success: 'bg-emerald-500',
  failed: 'bg-red-500',
  pending_approval: 'bg-amber-500',
  approved: 'bg-blue-500',
  rejected: 'bg-muted-foreground/50',
  refused: 'bg-muted-foreground/30',
};

const STATUS_LABEL: Record<AgentActivityStatus, string> = {
  success: 'Success',
  failed: 'Failed',
  pending_approval: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  refused: 'Refused',
};

interface ConversationGroup {
  conversationId: string | null;
  entries: AgentActivity[];
  firstAt: string;
  lastAt: string;
  totalDuration: number;
  hasFailure: boolean;
  hasPending: boolean;
}

function groupByConversation(activities: AgentActivity[]): ConversationGroup[] {
  const map = new Map<string, AgentActivity[]>();

  for (const a of activities) {
    const key = a.conversation_id ?? `solo_${a.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  const groups: ConversationGroup[] = [];
  for (const [key, entries] of map) {
    // Sort entries chronologically within group
    entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    groups.push({
      conversationId: key.startsWith('solo_') ? null : key,
      entries,
      firstAt: entries[0].created_at,
      lastAt: entries[entries.length - 1].created_at,
      totalDuration: entries.reduce((sum, e) => sum + (e.duration_ms ?? 0), 0),
      hasFailure: entries.some((e) => e.status === 'failed'),
      hasPending: entries.some((e) => e.status === 'pending_approval'),
    });
  }

  // Sort groups by most recent first
  groups.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  return groups;
}

export function ExecutionTimeline({ filters }: { filters?: { status?: string; agent?: string } }) {
  const { data: activities = [], isLoading } = useActivity(filters);
  const approve = useApproveActivity();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const { formatDateTime, formatTime } = usePlatformFormat();

  const groups = useMemo(() => groupByConversation(activities), [activities]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading timeline…</p>;
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No activity yet</p>
        <p className="text-sm mt-1">Skill executions will appear here as chains.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const groupKey = group.conversationId ?? group.entries[0].id;
        const isChain = group.entries.length > 1;
        const isExpanded = expandedGroup === groupKey;

        return (
          <Card key={groupKey} className="overflow-hidden">
            {/* Group header */}
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedGroup(isExpanded ? null : groupKey)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}

              {/* Skill chain preview */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {group.entries.slice(0, 5).map((e, i) => (
                  <span key={e.id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground/40">→</span>}
                    <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[e.status]}`} />
                    <span className="text-xs font-mono truncate max-w-[120px]">
                      {e.skill_name ?? 'unknown'}
                    </span>
                  </span>
                ))}
                {group.entries.length > 5 && (
                  <span className="text-xs text-muted-foreground">+{group.entries.length - 5}</span>
                )}
              </div>

              {/* Meta badges */}
              <div className="flex items-center gap-2 shrink-0">
                {isChain && (
                  <Badge variant="secondary" className="text-[10px]">
                    {group.entries.length} steps
                  </Badge>
                )}
                {group.hasFailure && (
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                )}
                {group.hasPending && (
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {group.totalDuration > 0 && `${group.totalDuration}ms · `}
                  {formatDateTime(group.firstAt, { year: undefined, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </button>

            {/* Expanded: vertical timeline of entries */}
            {isExpanded && (
              <CardContent className="pt-0 pb-4 px-4">
                <div className="relative ml-6 border-l border-border pl-6 space-y-0">
                  {group.entries.map((entry, idx) => {
                    const isEntryExpanded = expandedEntry === entry.id;
                    const isLast = idx === group.entries.length - 1;

                    return (
                      <div key={entry.id} className={`relative ${isLast ? '' : 'pb-4'}`}>
                        {/* Timeline dot */}
                        <div
                          className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-background ${STATUS_DOT[entry.status]}`}
                        />

                        {/* Entry card */}
                        <div className="group">
                          <button
                            className="w-full text-left flex items-center gap-3 py-1 hover:bg-muted/20 rounded-md px-2 -mx-2 transition-colors"
                            onClick={() => setExpandedEntry(isEntryExpanded ? null : entry.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono font-medium">
                                  {entry.skill_name ?? 'unknown'}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {entry.agent}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    entry.status === 'failed'
                                      ? 'border-destructive/30 text-destructive'
                                      : entry.status === 'pending_approval'
                                      ? 'border-amber-400/30 text-amber-600'
                                      : ''
                                  }`}
                                >
                                  {STATUS_LABEL[entry.status]}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                <span>{formatTime(entry.created_at, { second: '2-digit' })}</span>
                                {entry.duration_ms != null && <span>{entry.duration_ms}ms</span>}
                                {entry.error_message && (
                                  <span className="text-destructive truncate max-w-[300px]">
                                    {entry.error_message}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Approve/reject inline */}
                            {entry.status === 'pending_approval' && (
                              <div
                                className="flex gap-1 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => approve.mutate({ id: entry.id, approved: true })}
                                >
                                  <Check className="h-4 w-4 text-primary" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => approve.mutate({ id: entry.id, approved: false })}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            )}

                            {isEntryExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                          </button>

                          {/* Expanded detail: input/output */}
                          {isEntryExpanded && (
                            <div className="mt-2 mx-2 grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="font-medium text-muted-foreground">Input</span>
                                <pre className="mt-1 p-2 rounded bg-muted font-mono text-[11px] overflow-auto max-h-36">
                                  {JSON.stringify(entry.input, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <span className="font-medium text-muted-foreground">Output</span>
                                <pre className="mt-1 p-2 rounded bg-muted font-mono text-[11px] overflow-auto max-h-36">
                                  {JSON.stringify(entry.output, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Chain summary footer */}
                {group.entries.length > 1 && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-muted-foreground ml-6">
                    <span>
                      {group.entries.filter((e) => e.status === 'success').length}/
                      {group.entries.length} succeeded
                    </span>
                    <span>
                      Total: {group.totalDuration}ms
                    </span>
                    <span>
                      Span:{' '}
                      {formatDistanceStrict(
                        new Date(group.firstAt),
                        new Date(group.lastAt)
                      )}
                    </span>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
