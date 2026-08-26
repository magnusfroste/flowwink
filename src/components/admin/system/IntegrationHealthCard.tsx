import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, Plug, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useAcknowledgeIntegrationHealth,
  useIntegrationHealth,
  useRunIntegrationCheck,
} from '@/hooks/useIntegrationHealth';

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

/**
 * Integration Health — the state the daily sweep used to shout into chat.
 *
 * This card is the surface the principle asks for: it wants nothing from you,
 * it just wants to be true. It is always current and it replaces itself. The
 * card that says "2 failing" on the third morning says exactly what it said on
 * the first, and that is correct here — a state repeating itself is not news,
 * and repeating it as news is how the old chat warning turned into wallpaper.
 *
 * News lives in the bell instead (the notices below are the same rows, shown
 * here so you can close them from where you fixed the thing).
 */
export function IntegrationHealthCard() {
  const { data, isLoading } = useIntegrationHealth();
  const runCheck = useRunIntegrationCheck();
  const acknowledge = useAcknowledgeIntegrationHealth();
  const { toast } = useToast();

  const openNotices = (data?.notices ?? []).filter((n) => !n.acknowledged_at);
  const failing = (data?.integrations ?? []).filter((i) => i.status === 'fail');

  const handleRun = async () => {
    try {
      const result = await runCheck.mutateAsync();
      toast({
        title: 'Integrations probed',
        description: result?.summary ?? 'Check complete.',
      });
    } catch (e) {
      toast({
        title: 'Integration check failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-serif flex items-center gap-2 text-base">
            <Plug className="h-4 w-4 text-indigo-500" />
            Integration Health
          </CardTitle>
          <CardDescription>
            {isLoading
              ? '…'
              : !data
                ? 'never probed on this instance'
                : `${data.summary} · checked ${timeAgo(data.checked_at)}${
                    data.source === 'automation' ? ' by the daily sweep' : ''
                  }`}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={handleRun} disabled={runCheck.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runCheck.isPending ? 'animate-spin' : ''}`} />
          Check now
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !data ? (
          /* Absence is an answer, and a different one from "healthy". */
          <p className="text-sm text-muted-foreground">
            No integration check has run yet. The daily sweep probes every enabled integration at
            06:30 UTC — or press <strong>Check now</strong>.
          </p>
        ) : (
          <div className="space-y-3">
            {data.healthy ? (
              <p className="text-sm text-success flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Every integration in use is responding.
              </p>
            ) : (
              <ul className="space-y-2">
                {failing.map((i) => {
                  const since = data.failing_since?.[i.name];
                  return (
                    <li key={i.name} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {i.name}
                          {since && (
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                              failing since {timeAgo(since)}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{i.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {(data.unused?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Not in use:</span>
                {data.unused.map((name) => (
                  <Badge key={name} variant="secondary" className="text-[10px]">
                    {name}
                  </Badge>
                ))}
              </div>
            )}

            {openNotices.length > 0 && (
              <div className="border-t pt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {openNotices.length} unacknowledged change
                    {openNotices.length > 1 ? 's' : ''}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    disabled={acknowledge.isPending}
                    onClick={() => acknowledge.mutate(undefined)}
                  >
                    Mark all read
                  </Button>
                </div>
                {openNotices.map((n) => (
                  <div key={n.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="min-w-0">
                      <span
                        className={
                          n.kind === 'recovered'
                            ? 'text-success'
                            : 'text-warning'
                        }
                      >
                        {n.headline}
                      </span>
                      <span className="text-muted-foreground"> · {timeAgo(n.at)}</span>
                    </span>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground underline"
                      onClick={() => acknowledge.mutate(n.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground pt-1">
              A state, not a message: this card replaces itself on every probe. Only a change —
              healthy&nbsp;→&nbsp;failing, a new failure, or a recovery — raises a notice.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
