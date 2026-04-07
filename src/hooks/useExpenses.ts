import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface Expense {
  id: string;
  user_id: string | null;
  expense_date: string;
  description: string;
  amount_cents: number;
  vat_cents: number;
  currency: string;
  category: string;
  vendor: string | null;
  account_code: string | null;
  is_representation: boolean;
  attendees: unknown[] | null;
  receipt_url: string | null;
  receipt_data: unknown | null;
  status: string;
  report_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseReport {
  id: string;
  user_id: string | null;
  period: string;
  status: string;
  total_cents: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Expenses
// ============================================================

export function useExpenses(statusFilter?: string) {
  return useQuery({
    queryKey: ['expenses', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Expense[];
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: Partial<Expense>) => {
      if (input.is_representation && (!input.attendees || input.attendees.length === 0)) {
        throw new Error('Representation expenses require attendees (name + company)');
      }

      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: input.user_id || null,
          expense_date: input.expense_date || new Date().toISOString().slice(0, 10),
          description: input.description || '',
          amount_cents: input.amount_cents || 0,
          vat_cents: input.vat_cents || 0,
          currency: input.currency || 'SEK',
          category: input.category || 'other',
          vendor: input.vendor || null,
          account_code: input.account_code || null,
          is_representation: input.is_representation || false,
          attendees: input.attendees || null,
          receipt_url: input.receipt_url || null,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'Expense created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateExpenseStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('expenses')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'Expense updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Expense Reports
// ============================================================

export function useExpenseReports() {
  return useQuery({
    queryKey: ['expense-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ExpenseReport[];
    },
  });
}
