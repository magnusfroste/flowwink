import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

export function McpActivityLog() {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['mcp-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('id, skill_name, status, created_at, duration_ms, error_message, input, output')
        .eq('agent', 'mcp')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000, // Poll every 10s
  });

  if (isLoading) {
    return <div className="space-y-2">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>;
  }

  if (!activities?.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6 text-center">
          <Cpu className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No MCP activity yet. Waiting for agents to call tools...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-1.5">
      {activities.map(a => {
        const isSuccess = a.status === 'success';
        const StatusIcon = isSuccess ? CheckCircle2 : XCircle;
        const statusColor = isSuccess ? 'text-green-500' : 'text-destructive';

        return (
          <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm">
            <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
            <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{a.skill_name}</code>
            {a.duration_ms != null && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {a.duration_ms}ms
              </span>
            )}
            {a.error_message && (
              <Badge variant="destructive" className="text-[10px] truncate max-w-[200px]">
                {a.error_message}
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
