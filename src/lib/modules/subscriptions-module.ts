import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';

const inputSchema = z.object({
  action: z.enum(['list', 'mrr', 'churn']).default('list'),
  status: z.string().optional(),
  limit: z.number().optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Subscriptions — recurring billing lifecycle.
 *
 * Provider-agnostic (Stripe today, Paddle next). Mirrors provider state
 * via webhooks into the `subscriptions` table so FlowWink owns visibility,
 * MRR, churn and self-service customer flows.
 */
export const subscriptionsModule = defineModule<Input, Output>({
  id: 'subscriptions',
  name: 'Subscriptions',
  version: '1.0.0',
  description: 'Recurring revenue lifecycle — active customers, MRR, churn, dunning, plan changes',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    'list_subscriptions',
    'subscription_mrr',
    'list_dunning_sequences',
    'pause_dunning',
    'escalate_dunning',
  ],

  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);
      if (v.action === 'mrr') {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('unit_amount_cents, quantity, billing_interval, currency, status')
          .in('status', ['active', 'trialing']);
        if (error) throw error;
        const mrr = (data ?? []).reduce((sum, s: any) => {
          const monthly =
            s.billing_interval === 'year' ? (s.unit_amount_cents * s.quantity) / 12 :
            s.billing_interval === 'week' ? s.unit_amount_cents * s.quantity * 4.33 :
            s.billing_interval === 'day'  ? s.unit_amount_cents * s.quantity * 30 :
            s.unit_amount_cents * s.quantity;
          return sum + monthly;
        }, 0);
        return { success: true, data: { mrr_cents: Math.round(mrr), count: data?.length ?? 0 } };
      }

      if (v.action === 'churn') {
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { count, error } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'canceled')
          .gte('canceled_at', since);
        if (error) throw error;
        return { success: true, data: { canceled_30d: count ?? 0 } };
      }

      const query = supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(v.limit ?? 100);
      if (v.status) query.eq('status', v.status as any);
      const { data, error } = await query;
      if (error) throw error;
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },
});
