import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, Activity, Users, Eye, FileText, Bot, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLatestBriefing } from '@/hooks/useFlowPilotBriefings';
import { cn } from '@/lib/utils';

function TrendIndicator({ value, unit = '%' }: { value: number | null | undefined; unit?: string }) {
  if (value == null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (value > 0) return <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-medium"><TrendingUp className="h-3 w-3" />+{value}{unit}</span>;
  if (value < 0) return <span className="flex items-center gap-0.5 text-destructive text-xs font-medium"><TrendingDown className="h-3 w-3" />{value}{unit}</span>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function HealthRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? 'stroke-emerald-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-destructive';

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" className="stroke-muted" strokeWidth="4" />
        <circle
          cx="32" cy="32" r={radius} fill="none"
          className={cn(color, 'transition-all duration-1000')}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold">{score}</span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, icon: Icon }: { label: string; value: number | string; trend?: number | null; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className="p-2 rounded-md bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold leading-none mt-0.5">{value}</p>
      </div>
      {trend !== undefined && <TrendIndicator value={trend} />}
    </div>
  );
}

export function BusinessPulseWidget() {
  const { data: briefing, isLoading } = useLatestBriefing();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="h-24 flex items-center justify-center">
            <Activity className="h-5 w-5 text-muted-foreground animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Business Pulse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Bot className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No briefings yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">FlowPilot will generate your first daily briefing soon</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const m = briefing.metrics;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Business Pulse
          </CardTitle>
          <span className="text-[10px] text-muted-foreground">
            {new Date(briefing.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health score + summary */}
        <div className="flex items-center gap-4">
          <HealthRing score={m.health_score} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Health Score</p>
            <p className="text-sm text-foreground/80 mt-1 line-clamp-2">{briefing.summary}</p>
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Visitors (7d)" value={m.traffic_week} trend={m.traffic_trend} icon={Eye} />
          <MetricCard label="New Leads (7d)" value={m.leads_week} icon={Users} />
          <MetricCard label="Content Published" value={m.content_published} icon={FileText} />
          <MetricCard label="FlowPilot Actions" value={m.flowpilot_actions} icon={Bot} />
        </div>

        {/* Action items preview */}
        {briefing.action_items.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {briefing.action_items.length} action item{briefing.action_items.length > 1 ? 's' : ''} need attention
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/admin/flowpilot">Open FlowPilot →</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
