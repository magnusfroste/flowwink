import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type MatchField = 'counterparty' | 'reference' | 'description';
export type MatchType = 'contains' | 'equals' | 'regex';

export interface ReconciliationRule {
  id: string;
  name: string;
  priority: number;
  match_field: MatchField;
  match_type: MatchType;
  pattern: string;
  suggested_account_code: string | null;
  suggested_category: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ReconciliationReport {
  success: true;
  from: string | null;
  to: string | null;
  total_count: number;
  total_cents: number;
  matched_count: number;
  matched_cents: number;
  unmatched_count: number;
  unmatched_cents: number;
  rule_suggested_count: number;
}

export interface RuleInput {
  p_rule_id?: string;
  p_name?: string;
  p_match_field?: MatchField;
  p_match_type?: MatchType;
  p_pattern?: string;
  p_suggested_account_code?: string;
  p_suggested_category?: string;
  p_priority?: number;
}

export function useReconciliationRules() {
  return useQuery({
    queryKey: ['reconciliation_rules'],
    queryFn: async (): Promise<ReconciliationRule[]> => {
      const { data, error } = await supabase.rpc('manage_reconciliation_rule' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      const rules = (data as any)?.rules ?? [];
      return rules as ReconciliationRule[];
    },
  });
}

export function useSaveReconciliationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RuleInput & { mode: 'create' | 'update' }) => {
      const { mode, ...rest } = input;
      const { data, error } = await supabase.rpc('manage_reconciliation_rule' as any, {
        p_action: mode,
        ...rest,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['reconciliation_rules'] });
      toast.success(vars.mode === 'create' ? 'Rule created' : 'Rule updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteReconciliationRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { data, error } = await supabase.rpc('manage_reconciliation_rule' as any, {
        p_action: 'delete',
        p_rule_id: ruleId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation_rules'] });
      toast.success('Rule deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApplyReconciliationRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('apply_reconciliation_rules' as any);
      if (error) throw error;
      return data as { success: true; tagged_count: number } & Record<string, any>;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['reconciliation_report'] });
      const n = (d as any)?.tagged_count ?? (d as any)?.matched ?? 0;
      toast.success(`Rules applied — ${n} transaction${n === 1 ? '' : 's'} tagged`);
    },
    onError: (e: Error) => toast.error(`Apply failed: ${e.message}`),
  });
}

export function useReconciliationReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ['reconciliation_report', from ?? null, to ?? null],
    queryFn: async (): Promise<ReconciliationReport> => {
      const { data, error } = await supabase.rpc('reconciliation_report' as any, {
        p_from: from || null,
        p_to: to || null,
      });
      if (error) throw error;
      return data as ReconciliationReport;
    },
  });
}
