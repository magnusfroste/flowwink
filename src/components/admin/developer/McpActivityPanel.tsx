import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

interface McpActivityRow {
  id: string;
  agent: string | null;
  skill_name: string | null;
  status: string | null;
  duration_ms: number | null;
  created_at: string;
  conversation_id: string | null;
}

export function McpActivityPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('id, agent, skill_name, status, duration_ms, created_at, conversation_id')
        .eq('agent', 'mcp')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as McpActivityRow[];
    },
    refetchInterval: 15000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">MCP Activity</CardTitle>
        <CardDescription>
          Recent skill executions initiated by external MCP clients (OpenClaw, ClawWink,
          Claude Desktop, etc.). FlowPilot's internal activity is shown in the FlowPilot Engine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading activity…
          </div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-12 text-center">
            No MCP calls yet. When an external agent calls a skill via the MCP server, it
            will appear here.
          </p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Skill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.skill_name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === 'success' ? 'secondary' : row.status === 'failed' ? 'destructive' : 'outline'}
                        className="text-[10px]"
                      >
                        {row.status ?? 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {row.duration_ms ? `${row.duration_ms}ms` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
