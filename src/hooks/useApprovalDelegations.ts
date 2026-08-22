import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ApprovalDelegation {
  id: string;
  from_user: string;
  to_user: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

/** Delegations visible to admins/approvers. */
export function useApprovalDelegations() {
  return useQuery({
    queryKey: ['approval-delegations'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('approval_delegations')
        .select('*')
        .order('starts_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApprovalDelegation[];
    },
  });
}

export function useCreateApprovalDelegation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { from_user: string; to_user: string; starts_at?: string; ends_at?: string | null }) => {
      const { data, error } = await (supabase as any)
        .from('approval_delegations')
        .insert({
          from_user: input.from_user,
          to_user: input.to_user,
          starts_at: input.starts_at ?? new Date().toISOString(),
          ends_at: input.ends_at ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ApprovalDelegation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-delegations'] });
      toast({ title: 'Delegation created' });
    },
    onError: (e: Error) => toast({ title: 'Create failed', description: e.message, variant: 'destructive' }),
  });
}

export function useRevokeApprovalDelegation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      // RLS-denied updates return success with 0 rows — count them, or the
      // delegation reads as revoked while it still grants approval rights.
      const { data, error } = await (supabase as any)
        .from('approval_delegations')
        .update({ ends_at: new Date().toISOString() })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!(data as unknown[] | null)?.length) {
        throw new Error('Nothing was revoked — you may not have permission, or the delegation is already gone.');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-delegations'] });
      toast({ title: 'Delegation revoked' });
    },
    onError: (e: Error) => toast({ title: 'Revoke failed', description: e.message, variant: 'destructive' }),
  });
}

export function isDelegationActive(d: ApprovalDelegation, at: Date = new Date()): boolean {
  const t = at.getTime();
  const start = new Date(d.starts_at).getTime();
  if (start > t) return false;
  if (d.ends_at && new Date(d.ends_at).getTime() < t) return false;
  return true;
}
