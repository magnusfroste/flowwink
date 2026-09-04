import { Gauge, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { usePerformanceModeStatus, useApplyPerformanceMode } from '@/hooks/usePerformanceMode';
import { PERFORMANCE_MODES, pulseVerdict, startupTimeoutShare, driftedJobs } from '@/lib/performance-mode';

/**
 * Performance mode — one dial for how often the instance pulses.
 *
 * The schedules are the database's (cron_cadence, applied by
 * apply_performance_mode); this card shows the dial and pg_cron's own
 * evidence of whether the instance keeps up. The provenance line under each
 * mode says what it promises, so the choice is a reaction-time decision, not
 * a cron-expression decision.
 */
export function PerformanceModeCard() {
  const { data, isLoading, error } = usePerformanceModeStatus();
  const apply = useApplyPerformanceMode();

  const verdict = data ? pulseVerdict(data) : null;
  const share = data ? startupTimeoutShare(data) : 0;
  const drifted = data ? driftedJobs(data) : [];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="font-serif flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4 text-sky-500" />
          Performance mode
        </CardTitle>
        <CardDescription>
          {isLoading
            ? '…'
            : error
              ? 'status unavailable'
              : data?.cron_available === false
                ? 'no pg_cron on this instance — the mode has nothing to tune'
                : `How often this instance pulses. ${data?.runs_last_hour ?? 0} scheduled ticks in the last hour.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {PERFORMANCE_MODES.map((m) => {
                const selected = data?.mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={apply.isPending || !data?.cron_available}
                    onClick={() => !selected && apply.mutate({ mode: m.value })}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
                      selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{m.label}</span>
                      {selected && <Badge variant="secondary" className="text-[10px]">current</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{m.reacts}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{m.fit}</p>
                  </button>
                );
              })}
            </div>

            {data?.cron_available && verdict && (
              <div className="flex items-start gap-2 text-sm">
                {verdict === 'keeping_up' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', verdict === 'starving' ? 'text-red-500' : 'text-amber-500')} />
                )}
                <div className="text-xs text-muted-foreground">
                  {verdict === 'keeping_up' && 'Every tick in the last hour started on time. The instance keeps up with this mode.'}
                  {verdict === 'straining' &&
                    `${data.startup_timeouts_last_hour} of ${data.runs_last_hour} ticks timed out on startup and ${data.failed_last_hour} failed in the last hour. Watch it; a calmer mode helps on small compute.`}
                  {verdict === 'starving' &&
                    `${share}% of the last hour's ticks never started — the pulse itself is starving the database. Choose Low, or move to a larger compute instance.`}
                  {data.applied_at && (
                    <span className="block mt-1">
                      Mode set {formatDistanceToNow(new Date(data.applied_at), { addSuffix: true })}
                      {data.reason ? ` · ${data.reason}` : ''}
                    </span>
                  )}
                </div>
              </div>
            )}

            {drifted.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                {drifted.length} job{drifted.length === 1 ? '' : 's'} run on a different schedule than this mode says
                ({drifted.map((j) => j.jobname).join(', ')}). Re-selecting the mode reapplies it.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
