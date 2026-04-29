import { useMemo, useState } from 'react';
import { XCircle, CheckCircle2, Radio, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMoActivityFeed, type MoEventAction } from '@/hooks/useMoActivityFeed';
import { cn } from '@/lib/utils';

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

type StatusFilter = 'all' | MoEventAction;

const ACTION_META: Record<MoEventAction, {
  label: string;
  icon: typeof XCircle;
  iconClass: string;
  rowAccent: string;
}> = {
  'mo.cancelled': {
    label: 'Cancelled',
    icon: XCircle,
    iconClass: 'text-destructive',
    rowAccent: 'border-l-destructive/60',
  },
  'mo.completed': {
    label: 'Completed',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    rowAccent: 'border-l-emerald-500/60',
  },
};

export function MoActivityFeed() {
  const { events, loading } = useMoActivityFeed();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  // Distinct user_ids appearing in the feed for the user dropdown.
  const userIds = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) if (ev.user_id) set.add(ev.user_id);
    return Array.from(set);
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (statusFilter !== 'all' && ev.action !== statusFilter) return false;
      if (userFilter === 'all') return true;
      if (userFilter === '__system__') return ev.user_id == null;
      return ev.user_id === userFilter;
    });
  }, [events, statusFilter, userFilter]);

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4" />
          Activity feed
          <Badge variant="outline" className="ml-auto gap-1 text-[10px] font-normal">
            <Radio className="h-3 w-3 animate-pulse text-emerald-500" />
            live
          </Badge>
        </CardTitle>

        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="mo.completed">Completed</SelectItem>
              <SelectItem value="mo.cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-8 w-[260px] text-xs">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="__system__">System / agent (no user)</SelectItem>
              {userIds.map((uid) => (
                <SelectItem key={uid} value={uid}>
                  <span className="font-mono text-[11px]">{uid.slice(0, 8)}…</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={userFilter !== 'all' && userFilter !== '__system__' ? userFilter : ''}
            onChange={(e) => setUserFilter(e.target.value || 'all')}
            placeholder="Filter by exact user_id…"
            className="h-8 w-[280px] font-mono text-[11px]"
          />
        </div>

        <div className="text-[11px] text-muted-foreground">
          Showing {filtered.length} of {events.length} events
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">No events match the current filters.</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((ev) => {
              const meta = ACTION_META[ev.action];
              const Icon = meta.icon;
              return (
                <li
                  key={ev.id}
                  className={cn(
                    'flex items-start gap-3 border-l-2 py-2 pl-3 text-xs',
                    meta.rowAccent,
                  )}
                >
                  <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', meta.iconClass)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-medium">
                        {ev.metadata?.mo_number ?? ev.entity_id ?? 'unknown'}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {meta.label}
                      </Badge>
                      {ev.metadata?.previous_status && (
                        <Badge variant="secondary" className="text-[10px]">
                          was {String(ev.metadata.previous_status)}
                        </Badge>
                      )}
                      {ev.metadata?.quantity != null && (
                        <span className="text-muted-foreground">
                          qty {String(ev.metadata.quantity)}
                        </span>
                      )}
                      <span className="ml-auto text-muted-foreground">{fmt(ev.created_at)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>by</span>
                      <span className="font-mono">
                        {ev.user_id ? `${ev.user_id.slice(0, 8)}…` : 'system / agent'}
                      </span>
                    </div>
                    {ev.action === 'mo.cancelled' && ev.metadata?.notes_tail && (
                      <p className="mt-1 truncate italic text-muted-foreground">
                        {String(ev.metadata.notes_tail).split('\n').pop()}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
