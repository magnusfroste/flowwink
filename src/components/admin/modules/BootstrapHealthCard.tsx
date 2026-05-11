import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, History, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface BootstrapHealthCardProps {
  moduleId: string;
}

interface BootstrapRun {
  id: string;
  status: 'success' | 'failed' | 'degraded';
  seeded_skills: number;
  seeded_automations: number;
  errors: unknown;
  config_hash: string | null;
  duration_ms: number | null;
  triggered_by: string | null;
  created_at: string;
}

/**
 * Shows the last 5 bootstrap runs for a module + a degraded warning if 3+ failures in a row.
 * Backed by the `bootstrap_runs` table (circuit breaker history).
 */
export function BootstrapHealthCard({ moduleId }: BootstrapHealthCardProps) {
  const { data: runs } = useQuery({
    queryKey: ['bootstrap-runs', moduleId],
    queryFn: async (): Promise<BootstrapRun[]> => {
      const { data, error } = await supabase
        .from('bootstrap_runs')
        .select('*')
        .eq('module_id', moduleId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as BootstrapRun[];
    },
  });

  const { data: health } = useQuery({
    queryKey: ['bootstrap-health', moduleId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_bootstrap_health', { _module_id: moduleId });
      if (error) throw error;
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    },
  });

  if (!runs || runs.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4" />
          Bootstrap history
          {health?.is_degraded && (
            <Badge variant="destructive" className="ml-auto text-[10px]">
              Degraded — {health.failure_streak} failures
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {runs.map((run) => {
          const Icon = run.status === 'success' ? CheckCircle2 : run.status === 'failed' ? XCircle : AlertTriangle;
          const color = run.status === 'success' ? 'text-emerald-500' : 'text-destructive';
          const errs = Array.isArray(run.errors) ? (run.errors as string[]) : [];
          return (
            <div key={run.id} className="flex items-start gap-2 text-xs border-b border-border/50 pb-1.5 last:border-0">
              <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {run.seeded_skills} skill{run.seeded_skills === 1 ? '' : 's'}, {run.seeded_automations} automation{run.seeded_automations === 1 ? '' : 's'}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {run.triggered_by ?? 'manual'}
                  {run.duration_ms != null && ` • ${run.duration_ms}ms`}
                  {run.config_hash && ` • hash ${run.config_hash}`}
                </div>
                {errs.length > 0 && (
                  <div className="text-destructive text-[10px] mt-0.5 truncate" title={errs.join('\n')}>
                    {errs[0]}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
