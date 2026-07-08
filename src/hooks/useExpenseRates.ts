import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ExpenseRate {
  id: string;
  code: string;
  kind: 'mileage' | 'per_diem';
  label: string;
  rate_cents: number;
  unit: string;
  currency: string;
  account_code: string | null;
  valid_from: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** List all rate rows (all versions, active or archived). */
export function useExpenseRates() {
  return useQuery({
    queryKey: ['expense-rates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('expense_rate_tables')
        .select('*')
        .order('kind')
        .order('code')
        .order('valid_from', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpenseRate[];
    },
  });
}

/** Only the *currently active* rate per code, resolved for today. */
export function useActiveExpenseRates(kind?: 'mileage' | 'per_diem') {
  return useQuery({
    queryKey: ['expense-rates', 'active', kind ?? 'all'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      let q = (supabase as any)
        .from('expense_rate_tables')
        .select('*')
        .eq('active', true)
        .lte('valid_from', today)
        .order('valid_from', { ascending: false });
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q;
      if (error) throw error;
      // Reduce to the most recent valid version per code.
      const seen = new Set<string>();
      const latest: ExpenseRate[] = [];
      for (const row of (data ?? []) as ExpenseRate[]) {
        if (seen.has(row.code)) continue;
        seen.add(row.code);
        latest.push(row);
      }
      return latest;
    },
  });
}

export function useUpsertExpenseRate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: Partial<ExpenseRate> & { code: string; kind: 'mileage' | 'per_diem'; label: string; rate_cents: number; unit: string; valid_from: string }) => {
      const payload = {
        code: input.code,
        kind: input.kind,
        label: input.label,
        rate_cents: input.rate_cents,
        unit: input.unit,
        currency: input.currency ?? 'SEK',
        account_code: input.account_code ?? null,
        valid_from: input.valid_from,
        active: input.active ?? true,
        notes: input.notes ?? null,
      };
      if (input.id) {
        const { data, error } = await (supabase as any)
          .from('expense_rate_tables')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single();
        if (error) throw error;
        return data as ExpenseRate;
      }
      const { data, error } = await (supabase as any)
        .from('expense_rate_tables')
        .upsert(payload, { onConflict: 'code,valid_from' })
        .select()
        .single();
      if (error) throw error;
      return data as ExpenseRate;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-rates'] });
      toast({ title: 'Rate saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });
}

export function useToggleExpenseRate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await (supabase as any)
        .from('expense_rate_tables')
        .update({ active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-rates'] });
      toast({ title: 'Rate updated' });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });
}
