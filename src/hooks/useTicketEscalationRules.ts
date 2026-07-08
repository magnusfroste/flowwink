import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TicketEscalationRule {
  id: string;
  name: string;
  is_active: boolean;
  match_status: string | null;
  match_priority: string | null;
  match_unassigned: boolean;
  age_hours: number;
  age_field: 'created_at' | 'updated_at';
  action_raise_priority: string | null;
  action_reassign_to: string | null;
  action_reassign_kind: 'user' | 'team' | null;
  action_notify: boolean;
  created_at: string;
  updated_at: string;
}

export function useTicketEscalationRules() {
  return useQuery({
    queryKey: ['ticket-escalation-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ticket_escalation_rules' as never)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TicketEscalationRule[];
    },
  });
}

export function useUpsertEscalationRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rule: Partial<TicketEscalationRule> & { name: string }) => {
      if (rule.id) {
        const { error } = await supabase
          .from('ticket_escalation_rules' as never)
          .update({ ...rule, updated_at: new Date().toISOString() } as never)
          .eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ticket_escalation_rules' as never)
          .insert([rule] as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-escalation-rules'] });
      toast({ title: 'Rule saved' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save rule', description: err.message, variant: 'destructive' }),
  });
}

export function useDeleteEscalationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ticket_escalation_rules' as never)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-escalation-rules'] }),
  });
}

export function useRunEscalations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_ticket_escalations' as never);
      if (error) throw error;
      return data as { rules_evaluated: number; tickets_escalated: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      toast({
        title: 'Escalation sweep complete',
        description: `${res.rules_evaluated} rules, ${res.tickets_escalated} tickets escalated`,
      });
    },
    onError: (err: Error) =>
      toast({ title: 'Sweep failed', description: err.message, variant: 'destructive' }),
  });
}
