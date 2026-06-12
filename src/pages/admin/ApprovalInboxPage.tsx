/**
 * Inbox section for chain-based approval requests. Extracted as a named export
 * so the unified ApprovalsPage can render it as a tab.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Request {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  chain_id: string;
  current_step: number;
  created_at: string;
  amount_cents: number | null;
  currency: string | null;
  chain?: { name: string } | null;
}

export function InboxSection() {
  const qc = useQueryClient();
  const [comment, setComment] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkComment, setBulkComment] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['approval-inbox'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_requests')
        .select('id,entity_type,entity_id,status,chain_id,current_step,created_at,amount_cents,currency, chain:approval_chains(name)')
        .eq('status', 'pending')
        .not('chain_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Request[];
    },
  });

  const allIds = useMemo(() => data?.map(r => r.id) ?? [], [data]);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const decide = useMutation({
    mutationFn: async (input: { id: string; decision: 'approve' | 'reject' }) => {
      const { error } = await supabase.rpc('advance_approval_step', {
        p_request_id: input.id,
        p_decision: input.decision,
        p_comment: comment[input.id] || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['approval-inbox'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      setComment(c => ({ ...c, [v.id]: '' }));
      toast.success(`Request ${v.decision}d`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: async (decision: 'approve' | 'reject') => {
      const ids = Array.from(selected);
      const { data, error } = await supabase.rpc('bulk_advance_approvals' as never, {
        p_request_ids: ids,
        p_decision: decision,
        p_comment: bulkComment || null,
      } as never);
      if (error) throw error;
      return data as { processed?: number; failed?: number; failures?: Array<{ id: string; error: string }> } | null;
    },
    onSuccess: (result, decision) => {
      const processed = result?.processed ?? 0;
      const failed = result?.failed ?? 0;
      qc.invalidateQueries({ queryKey: ['approval-inbox'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      setSelected(new Set());
      setBulkComment('');
      if (failed > 0) {
        const firstError = result?.failures?.[0]?.error ?? '';
        toast.warning(`${processed} ${decision}d, ${failed} failed`, {
          description: firstError ? `First error: ${firstError}` : undefined,
        });
        result?.failures?.forEach(f => {
          console.warn('[bulk approval failed]', f.id, f.error);
        });
      } else {
        toast.success(`${processed} request(s) ${decision}d`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data?.length) return (
    <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Inbox is empty</CardContent></Card>
  );
  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected ? true : someSelected ? 'indeterminate' : false}
              onCheckedChange={toggleAll}
              aria-label="Select all"
            />
            <span className="text-sm text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : `Select all (${allIds.length})`}
            </span>
          </div>
          {selected.size > 0 && (
            <>
              <Textarea
                placeholder="Bulk comment (optional)"
                value={bulkComment}
                onChange={e => setBulkComment(e.target.value)}
                className="text-sm min-h-[36px] h-9 flex-1 min-w-[200px]"
              />
              <Button size="sm" onClick={() => bulk.mutate('approve')} disabled={bulk.isPending}>
                {bulk.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve selected
              </Button>
              <Button size="sm" variant="destructive" onClick={() => bulk.mutate('reject')} disabled={bulk.isPending}>
                <XCircle className="h-3.5 w-3.5" />
                Reject selected
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {data.map(req => (
        <Card key={req.id}>
          <CardContent className="p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Checkbox
                checked={selected.has(req.id)}
                onCheckedChange={() => toggleOne(req.id)}
                aria-label={`Select ${req.id}`}
              />
              <Badge variant="outline" className="text-xs">{req.entity_type}</Badge>
              <span className="text-sm font-medium">{req.chain?.name ?? 'Chain'}</span>
              <Badge variant="secondary" className="text-xs">Step {req.current_step}</Badge>
              {req.amount_cents != null && (
                <span className="text-xs text-muted-foreground">
                  {(req.amount_cents / 100).toFixed(2)} {req.currency ?? ''}
                </span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
              </span>
            </div>
            <Textarea
              placeholder="Comment (optional)"
              value={comment[req.id] ?? ''}
              onChange={e => setComment(c => ({ ...c, [req.id]: e.target.value }))}
              className="text-sm min-h-[60px]"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide.mutate({ id: req.id, decision: 'approve' })} disabled={decide.isPending}>
                {decide.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => decide.mutate({ id: req.id, decision: 'reject' })} disabled={decide.isPending}>
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Standalone page kept for /admin/approvals/inbox redirect compatibility. */
export default function ApprovalInboxPage() {
  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Reviewer inbox" description="Chain-based approval requests waiting on your decision." />
        <InboxSection />
      </AdminPageContainer>
    </AdminLayout>
  );
}
