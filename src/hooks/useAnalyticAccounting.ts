import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type AnalyticAccountType = 'cost_center' | 'project' | 'department' | 'campaign' | 'other';

export interface AnalyticAccount {
  id: string;
  code: string;
  name: string;
  account_type: AnalyticAccountType;
  parent_id: string | null;
  project_id: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnalyticLine {
  id: string;
  analytic_account_id: string;
  journal_entry_line_id: string | null;
  journal_entry_id: string | null;
  entry_date: string;
  account_code: string | null;
  description: string | null;
  amount_cents: number;
  currency: string;
  created_at: string;
}

export interface AnalyticBalance {
  analytic_account_id: string;
  code: string;
  name: string;
  account_type: AnalyticAccountType;
  project_id: string | null;
  balance_cents: number;
  line_count: number;
  first_entry: string | null;
  last_entry: string | null;
}

export function useAnalyticAccounts(activeOnly = true) {
  return useQuery({
    queryKey: ['analytic-accounts', activeOnly],
    queryFn: async () => {
      let q = (supabase as any).from('analytic_accounts').select('*').order('code');
      if (activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AnalyticAccount[];
    },
  });
}

export function useAnalyticBalances() {
  return useQuery({
    queryKey: ['analytic-balances'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('analytic_account_balances')
        .select('*')
        .order('code');
      if (error) throw error;
      return (data ?? []) as AnalyticBalance[];
    },
  });
}

export function useAnalyticLines(analyticAccountId: string | null) {
  return useQuery({
    queryKey: ['analytic-lines', analyticAccountId],
    enabled: !!analyticAccountId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('analytic_lines')
        .select('*')
        .eq('analytic_account_id', analyticAccountId!)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AnalyticLine[];
    },
  });
}

export function useCreateAnalyticAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      name: string;
      account_type: AnalyticAccountType;
      parent_id?: string | null;
      project_id?: string | null;
      description?: string;
    }) => {
      const { data, error } = await (supabase as any)
        .from('analytic_accounts')
        .insert([input])
        .select()
        .single();
      if (error) throw error;
      return data as AnalyticAccount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytic-accounts'] });
      qc.invalidateQueries({ queryKey: ['analytic-balances'] });
      toast.success('Analytic account created');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to create analytic account'),
  });
}

export function useUpdateAnalyticAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AnalyticAccount> & { id: string }) => {
      const { error } = await (supabase as any)
        .from('analytic_accounts')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytic-accounts'] });
      qc.invalidateQueries({ queryKey: ['analytic-balances'] });
      toast.success('Updated');
    },
  });
}

export interface AnalyticDistributionInput {
  analytic_account_id: string;
  amount_cents: number; // signed
  description?: string;
}

/** Tag an existing journal entry line with one or more analytic accounts */
export function useTagJournalEntryLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      journal_entry_line_id: string;
      journal_entry_id: string;
      entry_date: string;
      account_code?: string;
      currency?: string;
      distributions: AnalyticDistributionInput[];
    }) => {
      // Replace existing analytic lines for this JE line
      await (supabase as any)
        .from('analytic_lines')
        .delete()
        .eq('journal_entry_line_id', input.journal_entry_line_id);

      if (!input.distributions.length) return;

      const rows = input.distributions.map(d => ({
        analytic_account_id: d.analytic_account_id,
        journal_entry_line_id: input.journal_entry_line_id,
        journal_entry_id: input.journal_entry_id,
        entry_date: input.entry_date,
        account_code: input.account_code,
        description: d.description,
        amount_cents: d.amount_cents,
        currency: input.currency ?? 'SEK',
      }));

      const { error } = await (supabase as any).from('analytic_lines').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytic-lines'] });
      qc.invalidateQueries({ queryKey: ['analytic-balances'] });
      toast.success('Analytic tags saved');
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to tag entry'),
  });
}
