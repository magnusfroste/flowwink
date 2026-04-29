import { XCircle, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoCancellationFeed } from '@/hooks/useMoCancellationFeed';

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function MoCancellationFeed() {
  const { events, loading } = useMoCancellationFeed();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <XCircle className="h-4 w-4 text-destructive" />
          Cancellation feed
          <Badge variant="outline" className="ml-auto gap-1 text-[10px] font-normal">
            <Radio className="h-3 w-3 animate-pulse text-emerald-500" />
            live
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No manufacturing orders have been cancelled yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 py-2 text-xs">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-medium">
                      {ev.metadata?.mo_number ?? ev.entity_id ?? 'unknown'}
                    </span>
                    {ev.metadata?.previous_status && (
                      <Badge variant="outline" className="text-[10px]">
                        was {String(ev.metadata.previous_status)}
                      </Badge>
                    )}
                    <span className="ml-auto text-muted-foreground">{fmt(ev.created_at)}</span>
                  </div>
                  {ev.metadata?.notes_tail && (
                    <p className="mt-1 truncate italic text-muted-foreground">
                      {String(ev.metadata.notes_tail).split('\n').pop()}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
