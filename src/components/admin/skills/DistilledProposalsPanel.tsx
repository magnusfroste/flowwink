import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Check, X, RefreshCw, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

type ProposalStatus = 'pending' | 'approved' | 'dismissed';

interface Proposal {
  id?: string;
  sequence: string[];
  occurrences: number;
  distinct_groups: number;
  first_seen?: string;
  last_seen?: string;
  status?: ProposalStatus;
  approved_at?: string;
  dismissed_at?: string;
}

interface ProposalsValue {
  proposals: Proposal[];
  generated_at?: string;
  window_days?: number;
  total_activity_rows?: number;
}

const MEMORY_KEY = 'skill_distillation_proposals';

function proposalKey(p: Proposal) {
  return p.id || p.sequence.join('→');
}

export function DistilledProposalsPanel() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['distill-proposals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_memory')
        .select('id, value, updated_at')
        .eq('key', MEMORY_KEY)
        .maybeSingle();
      return data;
    },
  });

  const value = (data?.value as unknown as ProposalsValue) || { proposals: [] };
  const allProposals = value.proposals || [];

  const pending = useMemo(() => allProposals.filter(p => (p.status || 'pending') === 'pending'), [allProposals]);
  const handled = useMemo(() => allProposals.filter(p => p.status === 'approved' || p.status === 'dismissed'), [allProposals]);

  const handleRunDistill = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('flowpilot-distill');
      if (error) throw error;
      toast.success('Distill loop ran');
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['distill-proposals'] });
    } catch (e: any) {
      toast.error(e?.message || 'Distill failed');
    } finally {
      setRunning(false);
    }
  };

  const updateProposal = async (target: Proposal, status: ProposalStatus) => {
    if (!data?.id) {
      toast.error('No proposals memory row to update');
      return;
    }
    const key = proposalKey(target);
    setBusyKey(key);
    try {
      const updated: ProposalsValue = {
        ...value,
        proposals: allProposals.map(p =>
          proposalKey(p) === key
            ? {
                ...p,
                status,
                ...(status === 'approved' ? { approved_at: new Date().toISOString() } : {}),
                ...(status === 'dismissed' ? { dismissed_at: new Date().toISOString() } : {}),
              }
            : p,
        ),
      };
      const { error } = await supabase
        .from('agent_memory')
        .update({ value: updated as any, updated_at: new Date().toISOString() })
        .eq('id', data.id);
      if (error) throw error;
      toast.success(status === 'approved' ? 'Proposal approved' : 'Proposal dismissed');
      await refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update proposal');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Distilled Skill Proposals
            </CardTitle>
            <CardDescription>
              Recurring skill sequences detected in real conversations. Approve to let FlowPilot
              propose them as chained skills, or dismiss noise.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleRunDistill} disabled={running} className="gap-1.5 shrink-0">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Run distill
          </Button>
        </div>
        {value.generated_at && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Last run {formatDistanceToNow(new Date(value.generated_at), { addSuffix: true })}
            {typeof value.total_activity_rows === 'number' && ` · scanned ${value.total_activity_rows} rows`}
            {typeof value.window_days === 'number' && ` · ${value.window_days}d window`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : allProposals.length === 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border/60 bg-muted/30 px-3.5 py-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>
              No proposals yet. The daily distill loop (03:15 UTC) scans the last 30 days of agent
              activity for repeated skill sequences (≥3×, across ≥2 sessions) and proposes them
              here. Use “Run distill” to trigger it now.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Pending ({pending.length})
              </p>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>
              ) : (
                <ScrollArea className="max-h-[320px]">
                  <div className="space-y-2">
                    {pending.map(p => {
                      const key = proposalKey(p);
                      const busy = busyKey === key;
                      return (
                        <div key={key} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.sequence.map((s, i) => (
                              <span key={i} className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-xs font-mono">{s}</Badge>
                                {i < p.sequence.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] text-muted-foreground">
                              {p.occurrences}× across {p.distinct_groups} session{p.distinct_groups === 1 ? '' : 's'}
                              {p.last_seen && ` · last ${formatDistanceToNow(new Date(p.last_seen), { addSuffix: true })}`}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => updateProposal(p, 'dismissed')}
                                disabled={busy}
                                className="h-7 gap-1 text-xs"
                              >
                                <X className="h-3.5 w-3.5" />
                                Dismiss
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => updateProposal(p, 'approved')}
                                disabled={busy}
                                className="h-7 gap-1 text-xs"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Approve
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            {handled.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Handled ({handled.length})
                </p>
                <ScrollArea className="max-h-[200px]">
                  <div className="space-y-1.5">
                    {handled.map(p => {
                      const key = proposalKey(p);
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                          <Badge
                            variant={p.status === 'approved' ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {p.status}
                          </Badge>
                          <span className="font-mono truncate">{p.sequence.join(' → ')}</span>
                          <span className="ml-auto text-muted-foreground shrink-0">{p.occurrences}×</span>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
