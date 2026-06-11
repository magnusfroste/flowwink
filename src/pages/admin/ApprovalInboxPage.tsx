/**
 * Inbox section for chain-based approval requests. Extracted as a named export
 * so the unified ApprovalsPage can render it as a tab.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data?.length) return (
    <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Inbox is empty</CardContent></Card>
  );
  return (
    <div className="space-y-2">
      {data.map(req => (
        <Card key={req.id}>
          <CardContent className="p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
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
