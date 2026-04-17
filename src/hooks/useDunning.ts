import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type DunningStatus = 'active' | 'recovered' | 'failed' | 'cancelled' | 'paused';

export interface DunningSequence {
  id: string;
  subscription_id: string;
  status: DunningStatus;
  current_step: number;
  next_action_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  provider_invoice_id: string | null;
  mrr_at_risk_cents: number;
  currency: string;
  attempt_count: number;
  recovered_at: string | null;
  cancelled_at: string | null;
  paused_until: string | null;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
  subscriptions?: {
    id: string;
    customer_email: string | null;
    customer_name: string | null;
    product_name: string | null;
    status: string;
  };
}

export interface DunningAction {
  id: string;
  sequence_id: string;
  step_number: number;
  action_type: string;
  email_template: string | null;
  email_message_id: string | null;
  recipient_email: string | null;
  error_message: string | null;
  triggered_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useDunningSequences(status?: DunningStatus | 'all') {
  return useQuery({
    queryKey: ['dunning-sequences', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('dunning_sequences')
        .select('*, subscriptions(id, customer_email, customer_name, product_name, status)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (status && status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DunningSequence[];
    },
  });
}

export function useDunningMetrics() {
  return useQuery({
    queryKey: ['dunning-metrics'],
    queryFn: async () => {
      const { data: active } = await supabase
        .from('dunning_sequences')
        .select('mrr_at_risk_cents, currency')
        .eq('status', 'active');

      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('dunning_sequences')
        .select('status, mrr_at_risk_cents')
        .gte('created_at', since30);

      const activeCount = active?.length ?? 0;
      const mrrAtRisk = (active ?? []).reduce((s: number, r: any) => s + (r.mrr_at_risk_cents ?? 0), 0);

      const recovered30 = (recent ?? []).filter((r: any) => r.status === 'recovered').length;
      const failed30 = (recent ?? []).filter((r: any) => r.status === 'failed').length;
      const totalCompleted30 = recovered30 + failed30;
      const recoveryRate = totalCompleted30 > 0 ? (recovered30 / totalCompleted30) * 100 : null;

      const recoveredMrr30 = (recent ?? [])
        .filter((r: any) => r.status === 'recovered')
        .reduce((s: number, r: any) => s + (r.mrr_at_risk_cents ?? 0), 0);

      const currencies = new Set((active ?? []).map((r: any) => r.currency));
      return {
        activeCount,
        mrrAtRisk,
        recovered30,
        failed30,
        recoveryRate,
        recoveredMrr30,
        currency: currencies.size === 1 ? Array.from(currencies)[0] : 'usd',
      };
    },
  });
}

export function useDunningActions(sequenceId: string | null) {
  return useQuery({
    queryKey: ['dunning-actions', sequenceId],
    queryFn: async () => {
      if (!sequenceId) return [];
      const { data, error } = await supabase
        .from('dunning_actions')
        .select('*')
        .eq('sequence_id', sequenceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DunningAction[];
    },
    enabled: !!sequenceId,
  });
}

export function useDunningControl() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      sequenceId: string;
      action: 'pause' | 'resume' | 'cancel' | 'escalate';
      reason?: string;
    }) => {
      const updates: Record<string, unknown> = {};
      if (input.action === 'pause') {
        updates.status = 'paused';
        updates.paused_reason = input.reason ?? 'Manual pause';
        updates.next_action_at = null;
      } else if (input.action === 'resume') {
        updates.status = 'active';
        updates.next_action_at = new Date().toISOString();
        updates.paused_reason = null;
      } else if (input.action === 'cancel') {
        updates.status = 'cancelled';
        updates.cancelled_at = new Date().toISOString();
        updates.next_action_at = null;
      } else if (input.action === 'escalate') {
        // Jump to last step (final cancel) on next tick
        updates.current_step = 4;
        updates.next_action_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('dunning_sequences')
        .update(updates)
        .eq('id', input.sequenceId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['dunning-sequences'] });
      qc.invalidateQueries({ queryKey: ['dunning-metrics'] });
      qc.invalidateQueries({ queryKey: ['dunning-actions', vars.sequenceId] });
      toast({ title: 'Dunning sequence updated' });
    },
    onError: (e: any) => {
      toast({ title: 'Action failed', description: e?.message, variant: 'destructive' });
    },
  });
}

export async function runDunningProcessor() {
  const { data, error } = await supabase.functions.invoke('dunning-processor', { body: {} });
  if (error) throw error;
  return data as { processed: number; recovered: number; cancelled: number; emailsSent: number };
}
