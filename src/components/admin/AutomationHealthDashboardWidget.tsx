import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle, Clock, Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomationHealth } from '@/hooks/useAutomationHealth';
import { cn } from '@/lib/utils';

function MiniSparkline({ data, color = 'text-primary' }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  const height = 24;
  const width = 56;
  const step = width / (data.length - 1 || 1);

  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} className={cn('inline-block', color)}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AutomationHealthDashboardWidget() {
  const { data: health, isLoading } = useAutomationHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Automation Health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!health || health.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Automation Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No automations configured yet.
          </p>
          <Link to="/admin/flowpilot?tab=health" className="text-xs text-primary hover:underline flex items-center justify-center gap-1">
            Set up automations <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const hasIssues = health.erroring > 0 || health.warning > 0 || health.stale > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Automation Health
          </CardTitle>
          <Link to="/admin/flowpilot?tab=health" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            Details <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold">{health.totalRuns7d}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Runs (7d)</p>
          </div>
          <div className="text-center">
            <p className={cn(
              'text-2xl font-bold',
              health.overallErrorRate > 0.1 ? 'text-destructive' : 'text-foreground'
            )}>
              {(health.overallErrorRate * 100).toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Error Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{health.enabled}/{health.total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex gap-2 flex-wrap">
          {health.healthy > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              {health.healthy} healthy
            </span>
          )}
          {health.warning > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              {health.warning} warning
            </span>
          )}
          {health.erroring > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <Zap className="h-3 w-3" />
              {health.erroring} erroring
            </span>
          )}
          {health.stale > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {health.stale} stale
            </span>
          )}
        </div>

        {/* Top 3 automations with issues or most active */}
        {hasIssues ? (
          <div className="space-y-2">
            {health.items
              .filter(i => i.health === 'error' || i.health === 'warning' || i.health === 'stale')
              .slice(0, 3)
              .map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/50">
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    item.health === 'error' ? 'bg-destructive' :
                    item.health === 'warning' ? 'bg-warning' : 'bg-muted-foreground'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {item.lastError || `${item.triggerType} · ${item.runCount} runs`}
                    </p>
                  </div>
                  <MiniSparkline
                    data={item.dailyRuns}
                    color={item.health === 'error' ? 'text-destructive' : 'text-muted-foreground'}
                  />
                </div>
              ))}
          </div>
        ) : (
          <div className="space-y-2">
            {health.items
              .filter(i => i.enabled)
              .sort((a, b) => b.runCount - a.runCount)
              .slice(0, 3)
              .map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border">
                  <div className="h-2 w-2 rounded-full shrink-0 bg-emerald-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.triggerType} · {item.runCount} runs</p>
                  </div>
                  <MiniSparkline data={item.dailyRuns} />
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
