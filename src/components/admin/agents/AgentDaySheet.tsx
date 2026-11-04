import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { useAgentDay, type ConnectedAgent } from '@/hooks/useAgents';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

/**
 * "What did Hermes do today?" — one connected agent's day (or week): calls and
 * how they ended, the skills it ran, the reports it published, the steps in
 * order. Read through agent_day(), which an admin and the agent's owner may
 * call; nothing here writes.
 */
export function AgentDaySheet({ agent, open, onOpenChange }: { agent: ConnectedAgent | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [hours, setHours] = useState(24);
  const { data, isLoading, isError, error } = useAgentDay(open ? agent?.id ?? null : null, hours);
  const { formatDateTime } = usePlatformFormat();
  const tone = (s: string) => s === 'failed' ? 'destructive' : s === 'refused' || s === 'pending_approval' ? 'secondary' : 'outline';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{agent?.name ?? 'Agent'} — what it did</SheetTitle>
          <SheetDescription>
            Every call it made, how it ended, and what it published. {agent?.owner_name ? `It acts for ${agent.owner_name}.` : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex gap-1.5">
          {[24, 24 * 7, 24 * 30].map((h) => (
            <Button key={h} size="sm" variant={hours === h ? 'secondary' : 'outline'} className="h-7" onClick={() => setHours(h)}>
              {h === 24 ? 'Today' : h === 168 ? '7 days' : '30 days'}
            </Button>
          ))}
        </div>
        {isLoading ? (
          <div className="mt-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : isError ? (
          <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>
        ) : data ? (
          <div className="mt-4 space-y-5">
            {data.note && <p className="text-sm text-muted-foreground">{data.note}</p>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {[
                ['Calls', data.calls], ['OK', data.by_status?.success ?? 0], ['Failed', data.by_status?.failed ?? 0],
                ['Refused', data.by_status?.refused ?? 0], ['Reports', data.reports_published ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md border border-border p-2">
                  <div className="text-xl font-semibold">{value as number}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            {(data.by_status?.pending_approval ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">{data.by_status.pending_approval} call{data.by_status.pending_approval === 1 ? '' : 's'} waiting for a person under Approvals.</p>
            )}
            {data.skills.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-sm font-medium">Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {data.skills.map((s) => (
                    <Badge key={s.name} variant="outline" className="font-normal" title={`${s.calls} call${s.calls === 1 ? '' : 's'}${s.failed ? `, ${s.failed} failed` : ''}${s.refused ? `, ${s.refused} refused` : ''}`}>
                      <code className="text-xs">{s.name}</code>&nbsp;· {s.calls}{s.failed ? <span className="text-destructive"> · {s.failed} ✗</span> : null}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="mb-1.5 text-sm font-medium">Steps{data.calls > data.steps.length ? ` (last ${data.steps.length} of ${data.calls})` : ''}</h4>
              {data.steps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing in this window{data.last_at ? ` — last call ${formatDistanceToNow(new Date(data.last_at), { addSuffix: true })}` : ''}.</p>
              ) : (
                <ol className="space-y-1.5">
                  {data.steps.map((s, i) => (
                    <li key={`${s.at}-${i}`} className="rounded-md border border-border p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground" title={formatDateTime(s.at)}>{formatDateTime(s.at, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</span>
                        <code className="text-xs">{s.skill ?? '—'}{s.action ? ` ${s.action}` : ''}</code>
                        <Badge variant={tone(s.status)} className="ml-auto font-normal">{s.status.replace('_', ' ')}</Badge>
                        {typeof s.duration_ms === 'number' && <span className="text-xs text-muted-foreground">{(s.duration_ms / 1000).toFixed(1)} s</span>}
                      </div>
                      {s.error && <p className="mt-1 text-xs text-muted-foreground">{s.code ? <code>{s.code}</code> : null}{s.code ? ' · ' : ''}{s.error}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
