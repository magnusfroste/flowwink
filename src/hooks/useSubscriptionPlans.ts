import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  product_id: string | null;
  product_name: string;
  unit_amount_cents: number;
  currency: string;
  billing_interval: 'day' | 'week' | 'month' | 'year' | string;
  billing_interval_count: number;
  trial_days: number;
  commitment_months: number;
  features: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSubscriptionPlans(activeOnly = false) {
  return useQuery({
    queryKey: ['subscription-plans', activeOnly ? 'active' : 'all'],
    queryFn: async () => {
      let q = supabase.from('subscription_plans' as never).select('*').order('name');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SubscriptionPlan[];
    },
  });
}

export function useUpsertSubscriptionPlan() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (plan: Partial<SubscriptionPlan> & { name: string; product_name: string; unit_amount_cents: number }) => {
      if (plan.id) {
        const { error } = await supabase
          .from('subscription_plans' as never)
          .update({ ...plan, updated_at: new Date().toISOString() } as never)
          .eq('id', plan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('subscription_plans' as never).insert([plan] as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription-plans'] });
      toast({ title: 'Plan saved' });
    },
    onError: (e: Error) => toast({ title: 'Could not save plan', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteSubscriptionPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subscription_plans' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription-plans'] }),
  });
}

export function useConvertTrial() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (subscriptionId: string) => {
      const { data, error } = await supabase.rpc('convert_trial_to_active' as never, {
        _subscription_id: subscriptionId,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['subscription-metrics'] });
      toast({ title: 'Trial converted to active' });
    },
    onError: (e: Error) => toast({ title: 'Conversion failed', description: e.message, variant: 'destructive' }),
  });
}
