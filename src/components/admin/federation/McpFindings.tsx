import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Bug, Lightbulb, ThumbsUp, Zap, Package, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

const TYPE_CONFIG: Record<string, { icon: typeof Bug; label: string }> = {
  bug: { icon: Bug, label: 'Bug' },
  ux_issue: { icon: AlertTriangle, label: 'UX Issue' },
  suggestion: { icon: Lightbulb, label: 'Suggestion' },
  positive: { icon: ThumbsUp, label: 'Positive' },
  performance: { icon: Zap, label: 'Performance' },
  missing_feature: { icon: Package, label: 'Missing Feature' },
};

const SEVERITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

export function McpFindings() {
  const { data: findings, isLoading } = useQuery({
    queryKey: ['mcp-findings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beta_test_findings')
        .select('id, title, type, severity, description, resolved_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return <div className="space-y-2">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>;
  }

  if (!findings?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No findings reported yet. Agents will report issues here.</p>
        </CardContent>
      </Card>
    );
  }

  const open = findings.filter(f => !f.resolved_at).length;
  const resolved = findings.filter(f => f.resolved_at).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">{findings.length} findings</span>
        <span>·</span>
        <span className="text-orange-500 dark:text-orange-400">{open} open</span>
        <span>·</span>
        <span className="text-green-500">{resolved} resolved</span>
      </div>

      <div className="space-y-1.5">
        {findings.map(f => {
          const config = TYPE_CONFIG[f.type] || TYPE_CONFIG.suggestion;
          const Icon = f.resolved_at ? CheckCircle2 : config.icon;
          const iconColor = f.resolved_at ? 'text-green-500' : 
            f.severity === 'critical' || f.severity === 'high' ? 'text-destructive' : 'text-muted-foreground';

          return (
            <div key={f.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm">
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${f.resolved_at ? 'line-through text-muted-foreground' : ''}`}>
                    {f.title}
                  </span>
                  <Badge variant={SEVERITY_VARIANT[f.severity] || 'outline'} className="text-[10px] h-4">
                    {f.severity}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-4">
                    {config.label}
                  </Badge>
                </div>
                {f.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{f.description}</p>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
