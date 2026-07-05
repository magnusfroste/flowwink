import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ExpensePolicy {
  id: string;
  category: string;
  max_amount_cents: number | null;
  requires_receipt: boolean;
  requires_approval_over_cents: number | null;
  created_at?: string;
  updated_at?: string;
}

export function useExpensePolicies() {
  return useQuery({
    queryKey: ['expense_policies'],
    queryFn: async (): Promise<ExpensePolicy[]> => {
      const { data, error } = await supabase.rpc('manage_expense_policy' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      return ((data as any)?.policies ?? []) as ExpensePolicy[];
    },
  });
}

export function useUpsertExpensePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      p_policy_id?: string;
      p_category: string;
      p_max_amount_cents?: number | null;
      p_requires_receipt?: boolean;
      p_requires_approval_over_cents?: number | null;
    }) => {
      const { data, error } = await supabase.rpc('manage_expense_policy' as any, {
        p_action: 'upsert',
        p_policy_id: input.p_policy_id ?? null,
        p_category: input.p_category,
        p_max_amount_cents: input.p_max_amount_cents ?? null,
        p_requires_receipt: input.p_requires_receipt ?? false,
        p_requires_approval_over_cents: input.p_requires_approval_over_cents ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense_policies'] });
      toast.success('Policy saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExpensePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (policyId: string) => {
      const { data, error } = await supabase.rpc('manage_expense_policy' as any, {
        p_action: 'delete',
        p_policy_id: policyId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense_policies'] });
      toast.success('Policy deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
