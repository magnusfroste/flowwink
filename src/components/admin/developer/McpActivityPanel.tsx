import { Fragment, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ValidationErrorDetails, hasValidationDetails } from '@/components/admin/agent/ValidationErrorDetails';

interface McpActivityRow {
  id: string;
  agent: string | null;
  skill_name: string | null;
  status: string | null;
  duration_ms: number | null;
  created_at: string;
  conversation_id: string | null;
  error_message: string | null;
  output: Record<string, unknown> | null;
  input: Record<string, unknown> | null;
}

function getCallerApiKeyId(input: Record<string, unknown> | null): string | null {
  if (!input || typeof input !== 'object') return null;
  const v = (input as any)._caller_api_key_id;
  return typeof v === 'string' ? v : null;
}

export function McpActivityPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('id, agent, skill_name, status, duration_ms, created_at, conversation_id, error_message, output, input')
        .eq('agent', 'mcp')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as McpActivityRow[];
    },
    refetchInterval: 15000,
  });

  // Collect unique caller api_key_ids and resolve to peer names
  const callerIds = useMemo(() => {
    if (!data) return [] as string[];
    const set = new Set<string>();
    for (const r of data) {
      const id = getCallerApiKeyId(r.input);
      if (id) set.add(id);
    }
    return Array.from(set);
  }, [data]);

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
                  <TableHead>Sender</TableHead>
                  <TableHead>Skill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => {
                  const showDetails =
                    row.status === 'failed' &&
                    (hasValidationDetails(row.output) || !!row.error_message);
                  const callerId = getCallerApiKeyId(row.input);
                  const senderName = callerId
                    ? (peerMap?.[callerId] ?? `key:${callerId.slice(0, 8)}…`)
                    : null;
                  return (
                    <Fragment key={row.id}>
                      <TableRow>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {senderName ? (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              {senderName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">unknown</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.skill_name ?? '—'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === 'success'
                                ? 'secondary'
                                : row.status === 'failed'
                                  ? 'destructive'
                                  : 'outline'
                            }
                            className="text-[10px]"
                          >
                            {row.status ?? 'unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {row.duration_ms ? `${row.duration_ms}ms` : '—'}
                        </TableCell>
                      </TableRow>
                      {showDetails && (
                        <TableRow key={`${row.id}-error`} className="bg-destructive/5 hover:bg-destructive/5">
                          <TableCell colSpan={5} className="py-2">
                            <ValidationErrorDetails
                              output={row.output}
                              errorMessage={row.error_message}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
