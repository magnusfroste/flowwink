import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useApprovals } from '@/hooks/useApprovals';

export interface PoRevision {
  id: string;
  purchase_order_id: string;
  revision_number: number;
  reason: string | null;
  snapshot: any;
  prev_total_cents: number | null;
  new_total_cents: number | null;
  amount_delta_cents: number | null;
  approval_request_id: string | null;
  created_by: string | null;
  created_at: string;
}

export function usePoRevisions(poId: string | null) {
  return useQuery({
    queryKey: ['po-revisions', poId],
    enabled: !!poId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_revisions' as any)
        .select('*')
        .eq('purchase_order_id', poId!)
        .order('revision_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PoRevision[];
    },
  });
}

export interface AmendPoInput {
  purchase_order_id: string;
  reason: string;
  prev_snapshot: any;
  new_snapshot: any;
  prev_total_cents: number;
  new_total_cents: number;
}

/**
 * Snapshot the prior state of a PO, and if the amount increased past
 * the approvals threshold, open an approval request for the change.
 */
export function useAmendPurchaseOrder() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { evaluate, request } = useApprovals();

  return useMutation({
    mutationFn: async (input: AmendPoInput) => {
      const delta = input.new_total_cents - input.prev_total_cents;

      // Determine next revision number
      const { data: last } = await supabase
        .from('purchase_order_revisions' as any)
        .select('revision_number')
        .eq('purchase_order_id', input.purchase_order_id)
        .order('revision_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextRev = ((last as any)?.revision_number ?? 0) + 1;

      // Route re-approval when the amount grew
      let approvalRequestId: string | null = null;
      if (delta > 0) {
        const evalResult = await evaluate('purchase_order', input.new_total_cents);
        if (evalResult.required) {
          const req = await request.mutateAsync({
            entity_type: 'purchase_order',
            entity_id: input.purchase_order_id,
            amount_cents: input.new_total_cents,
            reason: `PO amendment (+${(delta / 100).toFixed(2)}): ${input.reason}`,
            context: { revision_number: nextRev, delta_cents: delta },
          });
          approvalRequestId = (req as any)?.id ?? null;
        }
      }

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('purchase_order_revisions' as any)
        .insert({
          purchase_order_id: input.purchase_order_id,
          revision_number: nextRev,
          reason: input.reason,
          snapshot: { prev: input.prev_snapshot, next: input.new_snapshot },
          prev_total_cents: input.prev_total_cents,
          new_total_cents: input.new_total_cents,
          amount_delta_cents: delta,
          approval_request_id: approvalRequestId,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return { revision: data as any, approvalRequestId };
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['po-revisions', input.purchase_order_id] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      toast({ title: 'PO amendment recorded' });
    },
    onError: (e: Error) => toast({ title: 'Amendment failed', description: e.message, variant: 'destructive' }),
  });
}
