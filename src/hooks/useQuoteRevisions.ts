import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useApprovals } from '@/hooks/useApprovals';

export interface QuoteRevision {
  id: string;
  quote_id: string;
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

export function useQuoteRevisions(quoteId: string | null | undefined) {
  return useQuery({
    queryKey: ['quote-revisions', quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quote_revisions' as any)
        .select('*')
        .eq('quote_id', quoteId!)
        .order('revision_number', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QuoteRevision[];
    },
  });
}

export interface AmendQuoteInput {
  quote_id: string;
  reason: string;
  prev_snapshot: any;
  new_snapshot: any;
  prev_total_cents: number;
  new_total_cents: number;
  reset_acceptance?: boolean;
}

/**
 * Snapshot the prior state of a quote as a revision. If total grew past the
 * approval threshold, open a re-approval request. If reset_acceptance, revert
 * quote to draft so it can be re-sent.
 */
export function useAmendQuote() {
  const qc = useQueryClient();
  const { evaluate, request } = useApprovals();

  return useMutation({
    mutationFn: async (input: AmendQuoteInput) => {
      const delta = input.new_total_cents - input.prev_total_cents;

      const { data: last } = await supabase
        .from('quote_revisions' as any)
        .select('revision_number')
        .eq('quote_id', input.quote_id)
        .order('revision_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextRev = ((last as any)?.revision_number ?? 0) + 1;

      let approvalRequestId: string | null = null;
      if (delta > 0) {
        const evalResult = await evaluate('quote', input.new_total_cents);
        if (evalResult.required) {
          const req = await request.mutateAsync({
            entity_type: 'quote',
            entity_id: input.quote_id,
            amount_cents: input.new_total_cents,
            reason: `Quote amendment (+${(delta / 100).toFixed(2)}): ${input.reason}`,
            context: { revision_number: nextRev, delta_cents: delta },
          });
          approvalRequestId = (req as any)?.id ?? null;
        }
      }

      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('quote_revisions' as any)
        .insert({
          quote_id: input.quote_id,
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

      if (input.reset_acceptance) {
        await supabase
          .from('quotes')
          .update({ status: 'draft', sent_at: null, accepted_at: null } as any)
          .eq('id', input.quote_id);
      }

      return { revision: data as any, approvalRequestId };
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['quote-revisions', input.quote_id] });
      qc.invalidateQueries({ queryKey: ['quote', input.quote_id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      toast.success('Quote amendment recorded');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
