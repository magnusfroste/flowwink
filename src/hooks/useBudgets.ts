import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Budget {
  id: string;
  account_code: string;
  fiscal_year: number;
  period_month: number | null;
  amount_cents: number;
  currency: string;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetVsActualRow {
  account_code: string;
  account_name?: string | null;
  budget_cents: number;
  actual_cents: number;
  variance_cents: number;
}

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase.rpc('manage_budget' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      return ((data as any)?.budgets ?? (data as any) ?? []) as Budget[];
    },
  });
}

export function useUpsertBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      p_budget_id?: string | null;
      p_account_code: string;
      p_fiscal_year: number;
      p_period_month?: number | null;
      p_amount_cents: number;
      p_currency?: string;
    }) => {
      const { data, error } = await supabase.rpc('manage_budget' as any, {
        p_action: 'upsert',
        p_budget_id: input.p_budget_id ?? null,
        p_account_code: input.p_account_code,
        p_fiscal_year: input.p_fiscal_year,
        p_period_month: input.p_period_month ?? null,
        p_amount_cents: input.p_amount_cents,
        p_currency: input.p_currency ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget_vs_actual'] });
      toast.success('Budget saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (budgetId: string) => {
      const { data, error } = await supabase.rpc('manage_budget' as any, {
        p_action: 'delete',
        p_budget_id: budgetId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      qc.invalidateQueries({ queryKey: ['budget_vs_actual'] });
      toast.success('Budget deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useBudgetVsActual(fiscalYear: number | null, periodMonth: number | null) {
  return useQuery({
    queryKey: ['budget_vs_actual', fiscalYear, periodMonth],
    enabled: fiscalYear != null,
    queryFn: async (): Promise<BudgetVsActualRow[]> => {
      const { data, error } = await supabase.rpc('budget_vs_actual' as any, {
        p_fiscal_year: fiscalYear,
        p_period_month: periodMonth,
      });
      if (error) throw error;
      const rows = (data as any)?.rows ?? (data as any) ?? [];
      return (rows as any[]).map((r) => ({
        account_code: r.account_code,
        account_name: r.account_name ?? null,
        budget_cents: Number(r.budget_cents ?? 0),
        actual_cents: Number(r.actual_cents ?? 0),
        variance_cents: Number(r.variance_cents ?? Number(r.budget_cents ?? 0) - Number(r.actual_cents ?? 0)),
      }));
    },
  });
}
