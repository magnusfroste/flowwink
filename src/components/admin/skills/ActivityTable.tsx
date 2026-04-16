import { useState } from 'react';
import { format } from 'date-fns';
import { Check, X, ChevronDown, ChevronRight, List, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActivity, useApproveActivity } from '@/hooks/useSkillHub';
import { ExecutionTimeline } from './ExecutionTimeline';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AgentActivity, AgentActivityStatus } from '@/types/agent';

function useDistinctAgents() {
  return useQuery({
    queryKey: ['agent-activity-distinct-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('agent')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => r?.agent && set.add(r.agent));
      return Array.from(set).sort();
    },
    refetchInterval: 30_000,
  });
}

const STATUS_BADGE: Record<AgentActivityStatus, string> = {
  success: 'bg-green-500/10 text-green-700 border-green-200',
  failed: 'bg-red-500/10 text-red-700 border-red-200',
  pending_approval: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  approved: 'bg-blue-500/10 text-blue-700 border-blue-200',
  rejected: 'bg-gray-500/10 text-gray-700 border-gray-200',
};

type ViewMode = 'table' | 'timeline';

export function ActivityTable() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  const filters = {
    status: statusFilter === 'all' ? undefined : statusFilter,
    agent: agentFilter === 'all' ? undefined : agentFilter,
  };

  const { data: activities = [], isLoading } = useActivity(filters);
  const { data: distinctAgents = [] } = useDistinctAgents();
  const approve = useApproveActivity();

  return (
    <div className="space-y-4">
      {/* Filters + View Toggle */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending_approval">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Agent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {distinctAgents.map((a) => (
              <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-none h-8 gap-1.5 text-xs"
            onClick={() => setViewMode('timeline')}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Timeline
          </Button>
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-none h-8 gap-1.5 text-xs"
            onClick={() => setViewMode('table')}
          >
            <List className="h-3.5 w-3.5" />
            Table
          </Button>
        </div>
      </div>

      {/* Timeline View */}
      {viewMode === 'timeline' && <ExecutionTimeline filters={filters} />}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Skill</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && activities.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No activity yet
                  </TableCell>
                </TableRow>
              )}
              {activities.map((a) => {
                const expanded = expandedId === a.id;
                return (
                  <TableRow key={a.id} className="group">
                    <TableCell>
                      <button onClick={() => setExpandedId(expanded ? null : a.id)}>
                        {expanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.skill_name ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{a.agent}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE[a.status]}>
                        {a.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.duration_ms != null ? `${a.duration_ms}ms` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(a.created_at), 'MMM d HH:mm')}
                    </TableCell>
                    <TableCell>
                      {a.status === 'pending_approval' && (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => approve.mutate({ id: a.id, approved: true })}
                          >
                            <Check className="h-4 w-4 text-primary" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => approve.mutate({ id: a.id, approved: false })}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Expanded detail */}
          {expandedId && (() => {
            const a = activities.find((x) => x.id === expandedId);
            if (!a) return null;
            return (
              <div className="border-t px-4 py-3 bg-muted/30 space-y-2 text-xs">
                {a.error_message && (
                  <div>
                    <span className="font-medium text-destructive">Error: </span>
                    {a.error_message}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Input</span>
                    <pre className="mt-1 p-2 rounded bg-muted font-mono text-[11px] overflow-auto max-h-40">
                      {JSON.stringify(a.input, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="font-medium">Output</span>
                    <pre className="mt-1 p-2 rounded bg-muted font-mono text-[11px] overflow-auto max-h-40">
                      {JSON.stringify(a.output, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
