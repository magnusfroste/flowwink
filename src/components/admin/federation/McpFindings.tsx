import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Bug, Lightbulb, ThumbsUp, Zap, Package, CheckCircle2, X, RotateCcw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

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
  const queryClient = useQueryClient();

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

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolve }: { id: string; resolve: boolean }) => {
      const { error } = await supabase
        .from('beta_test_findings')
        .update({ resolved_at: resolve ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-findings'] });
    },
    onError: () => {
      toast.error('Failed to update finding');
    },
  });

  const resolveAllMutation = useMutation({
    mutationFn: async () => {
      const openIds = findings?.filter(f => !f.resolved_at).map(f => f.id) || [];
      if (openIds.length === 0) return;
      const { error } = await supabase
        .from('beta_test_findings')
        .update({ resolved_at: new Date().toISOString() })
        .in('id', openIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-findings'] });
      toast.success('All findings resolved');
    },
    onError: () => {
      toast.error('Failed to resolve findings');
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('beta_test_findings')
        .delete()
        .not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-findings'] });
      toast.success('All findings cleared');
    },
    onError: () => {
      toast.error('Failed to clear findings');
    },
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
        {open > 0 && (
          <>
            <span>·</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[11px] px-2 text-muted-foreground hover:text-foreground"
              onClick={() => resolveAllMutation.mutate()}
              disabled={resolveAllMutation.isPending}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Resolve all
            </Button>
          </>
        )}
        <span>·</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[11px] px-2 text-destructive/70 hover:text-destructive"
          onClick={() => clearAllMutation.mutate()}
          disabled={clearAllMutation.isPending}
        >
          <X className="h-3 w-3 mr-1" />
          Clear all
        </Button>
      </div>

      <div className="space-y-1.5">
        {findings.map(f => {
          const config = TYPE_CONFIG[f.type] || TYPE_CONFIG.suggestion;
          const Icon = f.resolved_at ? CheckCircle2 : config.icon;
          const iconColor = f.resolved_at ? 'text-green-500' : 
            f.severity === 'critical' || f.severity === 'high' ? 'text-destructive' : 'text-muted-foreground';

          return (
            <div key={f.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm">
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
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => resolveMutation.mutate({ id: f.id, resolve: !f.resolved_at })}
                  disabled={resolveMutation.isPending}
                  title={f.resolved_at ? 'Reopen' : 'Resolve'}
                >
                  {f.resolved_at ? (
                    <RotateCcw className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <X className="h-3 w-3 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
