import { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, Zap, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAutomationHealth, type AutomationHealthItem } from '@/hooks/useAutomationHealth';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

function Sparkline({ data, color = 'text-primary', height = 32, width = 120 }: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1 || 1);
  const barWidth = Math.max(step * 0.6, 4);

  return (
    <svg width={width} height={height} className={cn('inline-block', color)}>
      {data.map((v, i) => {
        const barH = Math.max((v / max) * (height - 2), v > 0 ? 2 : 0);
        return (
          <rect
            key={i}
            x={i * step}
            y={height - barH}
            width={barWidth}
            height={barH}
            rx={1}
            fill="currentColor"
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

function HealthBadge({ health }: { health: AutomationHealthItem['health'] }) {
  const config = {
    healthy: { label: 'Healthy', variant: 'default' as const, icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    warning: { label: 'Warning', variant: 'secondary' as const, icon: AlertTriangle, className: 'bg-warning/10 text-warning border-warning/20' },
    error: { label: 'Error', variant: 'destructive' as const, icon: Zap, className: 'bg-destructive/10 text-destructive border-destructive/20' },
    stale: { label: 'Stale', variant: 'secondary' as const, icon: Clock, className: 'bg-muted text-muted-foreground' },
    disabled: { label: 'Disabled', variant: 'secondary' as const, icon: Activity, className: 'bg-muted text-muted-foreground' },
  };

  const c = config[health];
  const Icon = c.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', c.className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

function AutomationRow({ item }: { item: AutomationHealthItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className={cn(
          'h-2.5 w-2.5 rounded-full shrink-0',
          item.health === 'healthy' ? 'bg-emerald-500' :
          item.health === 'warning' ? 'bg-warning' :
          item.health === 'error' ? 'bg-destructive' :
          item.health === 'stale' ? 'bg-muted-foreground' :
          'bg-muted-foreground/50'
        )} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.triggerType} · {item.skillName?.replace(/_/g, ' ') || 'no skill'}
          </p>
        </div>

        <div className="hidden sm:block">
          <Sparkline
            data={item.dailyRuns}
            color={
              item.health === 'error' ? 'text-destructive' :
              item.health === 'warning' ? 'text-warning' :
              'text-primary'
            }
          />
        </div>

        <div className="text-right shrink-0 min-w-[60px]">
          <p className="text-sm font-mono">{item.runCount}</p>
          <p className="text-[10px] text-muted-foreground">runs</p>
        </div>

        <HealthBadge health={item.health} />

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t bg-muted/30 space-y-3 animate-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Error Rate (7d)</p>
              <p className={cn(
                'text-lg font-bold',
                item.errorRate > 0.1 ? 'text-destructive' : 'text-foreground'
              )}>
                {(item.errorRate * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</p>
              <p className="text-lg font-bold">{item.runCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Run</p>
              <p className="text-sm">
                {item.lastTriggeredAt
                  ? formatDistanceToNow(new Date(item.lastTriggeredAt), { addSuffix: true })
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</p>
              <p className="text-sm">{item.enabled ? 'Enabled' : 'Disabled'}</p>
            </div>
          </div>

          {/* Error sparkline */}
          {item.dailyErrors.some(e => e > 0) && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Errors (7d)</p>
              <Sparkline data={item.dailyErrors} color="text-destructive" width={200} />
            </div>
          )}

          {/* Runs sparkline (larger) */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Logged runs (7d)</p>
            <Sparkline data={item.dailyRuns} width={200} />
          </div>

          {item.lastError && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Error</p>
              <p className="text-xs text-destructive bg-destructive/5 p-2 rounded font-mono break-all">
                {item.lastError}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AutomationHealthPanel() {
  const { data: health, isLoading, refetch } = useAutomationHealth();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!health || health.total === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          No automations configured. Create one in the Automations tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold">{health.totalRuns7d}</p>
            <p className="text-xs text-muted-foreground">Logged runs (7 days)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className={cn(
              'text-3xl font-bold',
              health.overallErrorRate > 0.1 ? 'text-destructive' : 'text-foreground'
            )}>
              {(health.overallErrorRate * 100).toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Error Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold">{health.enabled}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex justify-center gap-2">
              {health.healthy > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" /> {health.healthy}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Healthy</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {health.warning > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" /> {health.warning}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Warning</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {health.erroring > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-destructive">
                        <Zap className="h-3.5 w-3.5" /> {health.erroring}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Erroring</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Status</p>
          </CardContent>
        </Card>
      </div>

      {/* Automation list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          All Automations ({health.total})
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
          <RefreshCw className="h-3 w-3" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {/* Show erroring/warning first, then healthy, then disabled */}
        {health.items
          .sort((a, b) => {
            const order = { error: 0, warning: 1, stale: 2, healthy: 3, disabled: 4 };
            return order[a.health] - order[b.health];
          })
          .map(item => (
            <AutomationRow key={item.id} item={item} />
          ))}
      </div>
    </div>
  );
}
