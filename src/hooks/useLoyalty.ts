import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LoyaltyAccount {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  points_balance: number;
  lifetime_points: number;
  tier: 'bronze' | 'silver' | 'gold' | string;
  active: boolean;
  created_at?: string;
}

export interface LoyaltyTransaction {
  id: string;
  account_id: string;
  sale_id: string | null;
  points: number;
  kind: string;
  note: string | null;
  created_at: string;
}

function extractAccounts(data: any): LoyaltyAccount[] {
  if (Array.isArray(data)) return data;
  return data?.accounts ?? data?.loyalty_accounts ?? [];
}

export function useLoyaltyAccounts() {
  return useQuery({
    queryKey: ['loyalty-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_loyalty' as any, { p_action: 'list' });
      if (error) throw error;
      return extractAccounts(data);
    },
  });
}

export function useLoyaltyAccount(email: string | null) {
  return useQuery({
    queryKey: ['loyalty-account', email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('manage_loyalty' as any, {
        p_action: 'get',
        p_customer_email: email,
      });
      if (error) throw error;
      return data as { account: LoyaltyAccount; transactions: LoyaltyTransaction[] } | any;
    },
  });
}

export function useLoyaltyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      action: 'enroll' | 'earn' | 'redeem' | 'adjust';
      customer_email?: string;
      customer_name?: string;
      points?: number;
      sale_id?: string;
      note?: string;
    }) => {
      const { data, error } = await supabase.rpc('manage_loyalty' as any, {
        p_action: params.action,
        p_customer_email: params.customer_email ?? null,
        p_customer_name: params.customer_name ?? null,
        p_points: params.points ?? null,
        p_sale_id: params.sale_id ?? null,
        p_note: params.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['loyalty-accounts'] });
      qc.invalidateQueries({ queryKey: ['loyalty-account'] });
      toast.success(`Loyalty ${v.action} done`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
