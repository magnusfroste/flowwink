import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'paused' | 'incomplete' | 'incomplete_expired' | 'unpaid';

export interface Subscription {
  id: string;
  user_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  product_id: string | null;
  product_name: string | null;
  status: SubscriptionStatus;
  quantity: number;
  unit_amount_cents: number;
  currency: string;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  provider: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  provider_price_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useSubscriptions(status?: SubscriptionStatus) {
  return useQuery({
    queryKey: ['subscriptions', status ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('subscriptions').select('*').order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Subscription[];
    },
  });
}

export function useSubscriptionMetrics() {
  return useQuery({
    queryKey: ['subscription-metrics'],
    queryFn: async () => {
      const { data: active } = await supabase
        .from('subscriptions')
        .select('unit_amount_cents, quantity, billing_interval, currency, status')
        .in('status', ['active', 'trialing']);

      let mrrCents = 0;
      const currencies = new Set<string>();
      (active ?? []).forEach((s: any) => {
        currencies.add(s.currency);
        const monthly =
          s.billing_interval === 'year' ? (s.unit_amount_cents * s.quantity) / 12 :
          s.billing_interval === 'week' ? s.unit_amount_cents * s.quantity * 4.33 :
          s.billing_interval === 'day' ? s.unit_amount_cents * s.quantity * 30 :
          s.unit_amount_cents * s.quantity;
        mrrCents += monthly;
      });

      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count: canceled30 } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'canceled')
        .gte('canceled_at', since30);

      const { count: trialing } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'trialing');

      const { count: pastDue } = await supabase
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'past_due');

      return {
        mrrCents: Math.round(mrrCents),
        arrCents: Math.round(mrrCents * 12),
        activeCount: active?.length ?? 0,
        canceled30,
        trialing,
        pastDue,
        currency: currencies.size === 1 ? Array.from(currencies)[0] : 'mixed',
      };
    },
  });
}

export function useSubscriptionAction() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      action: 'cancel' | 'resume' | 'change_plan';
      subscriptionId: string;
      newPriceId?: string;
      atPeriodEnd?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke('subscriptions-manage', { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['subscription-metrics'] });
      toast({ title: 'Subscription updated' });
    },
    onError: (e: any) => {
      toast({ title: 'Action failed', description: e?.message, variant: 'destructive' });
    },
  });
}

export async function openCustomerPortal(subscriptionId: string) {
  const { data, error } = await supabase.functions.invoke('subscriptions-portal', {
    body: { subscriptionId, returnUrl: window.location.href },
  });
  if (error) throw error;
  if (data?.url) window.open(data.url, '_blank');
}
