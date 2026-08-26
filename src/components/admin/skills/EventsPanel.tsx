import { useState } from 'react';
import { Zap, Search, CheckCircle2, Clock, Info } from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useAgentEvents } from '@/hooks/useAgentEvents';

/**
 * Events Panel
 *
 * Shows the latest 50 platform events from `agent_events` so admins can debug
 * "why didn't my event-based automation fire?" without leaving the UI.
 */
export function EventsPanel() {
  const [filter, setFilter] = useState('');
  const { data: events = [], isLoading } = useAgentEvents(filter);
  const [openId, setOpenId] = useState<string | null>(null);
  const { formatDateTime } = usePlatformFormat();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Live feed of platform events. Event-based automations subscribe to
          these names (e.g. <code>lead.created</code>) and fire when the event-dispatcher
          picks them up (every minute).
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by event name (e.g. lead, order.paid)…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading events…</p>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No events yet</p>
          <p className="text-sm mt-1">
            Events appear here as soon as platform actions emit them
            (a new lead, a paid order, a deal won, etc.).
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {events.map((ev) => {
            const isOpen = openId === ev.id;
            return (
              <Card
                key={ev.id}
                className="cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all"
                onClick={() => setOpenId(isOpen ? null : ev.id)}
              >
                <CardContent className="py-2.5 px-3.5">
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="font-mono text-[11px] shrink-0">
                      {ev.event_name}
                    </Badge>
                    {ev.source && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        from {ev.source}
                      </span>
                    )}
                    <div className="flex-1" />
                    {ev.processed_at ? (
                      <span className="flex items-center gap-1 text-[11px] text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        processed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-warning">
                        <Clock className="h-3 w-3" />
                        pending
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {formatDateTime(ev.created_at, { year: undefined, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  {isOpen && ev.payload && (
                    <pre className="mt-2.5 p-2.5 rounded-md bg-muted/50 text-[11px] font-mono overflow-x-auto max-h-72">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
