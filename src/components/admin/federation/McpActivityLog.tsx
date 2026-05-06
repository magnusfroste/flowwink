import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Cpu, CheckCircle2, XCircle, Clock, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

function getCallerApiKeyId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const v = (input as Record<string, unknown>)._caller_api_key_id;
  return typeof v === 'string' ? v : null;
}

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

  const callerIds = useMemo(() => {
    if (!activities) return [] as string[];
    const set = new Set<string>();
    for (const r of activities) {
      const id = getCallerApiKeyId(r.input);
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [activities]);

  const { data: peerMap } = useQuery({
    queryKey: ['mcp-activity-peers', callerIds.join(',')],
    enabled: callerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('a2a_peers')
        .select('api_key_id, name')
        .in('api_key_id', callerIds);
      if (error) throw error;
      const m: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ api_key_id: string; name: string }>) {
        if (row.api_key_id) m[row.api_key_id] = row.name;
      }
      return m;
    },
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
        const callerId = getCallerApiKeyId(a.input);
        const senderName = callerId
          ? (peerMap?.[callerId] ?? `key:${callerId.slice(0, 8)}…`)
          : null;

        return (
          <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-sm">
            <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
            {senderName ? (
              <Badge variant="outline" className="text-[10px] font-normal gap-1">
                <User className="h-2.5 w-2.5" />
                {senderName}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">unknown</span>
            )}
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
