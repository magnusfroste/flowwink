import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Expense (travel) advances — money paid to an employee before the trip, settled
 * against their expense reports when those are booked. One RPC, four actions.
 */

export interface ExpenseAdvance {
  id: string;
  user_id: string;
  employee_name: string | null;
  amount_cents: number;
  currency: string;
  purpose: string | null;
  status: 'open' | 'closed';
  settled_cents: number;
  repaid_cents: number;
  remaining_cents: number;
  granted_at: string;
  method: string | null;
  reference: string | null;
  journal_entry_id: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ExpenseAdvanceSettlement {
  id: string;
  advance_id: string;
  report_id: string;
  period: string;
  amount_cents: number;
  journal_entry_id: string | null;
  created_at: string;
}

type AdvanceArgs = Record<string, unknown>;

async function advanceRpc<T>(args: AdvanceArgs): Promise<T> {
  const { data, error } = await supabase.rpc('manage_expense_advance' as never, args as never);
  if (error) throw error;
  return data as T;
}

export function useExpenseAdvances(status?: 'open' | 'closed') {
  return useQuery({
    queryKey: ['expense_advances', status ?? 'all'],
    queryFn: () => advanceRpc<{ advances: ExpenseAdvance[]; open_cents: number }>({ p_action: 'list', p_status: status ?? null }),
  });
}

export function useExpenseAdvance(advanceId: string | null) {
  return useQuery({
    queryKey: ['expense_advances', 'one', advanceId],
    enabled: !!advanceId,
    queryFn: () => advanceRpc<{ advance: ExpenseAdvance; settlements: ExpenseAdvanceSettlement[] }>({ p_action: 'get', p_advance_id: advanceId }),
  });
}

function useAdvanceMutation<TArgs extends AdvanceArgs>(action: 'grant' | 'repay', success: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: TArgs) => advanceRpc<{ success: boolean; remaining_cents: number; status: string }>({ p_action: action, ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense_advances'] });
      toast({ title: success });
    },
    onError: (err: unknown) => {
      toast({ title: 'Advance not recorded', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    },
  });
}

export function useGrantExpenseAdvance() {
  return useAdvanceMutation<{ p_user_id: string; p_amount_cents: number; p_purpose?: string | null; p_method?: string | null; p_reference?: string | null; p_paid_at?: string | null }>(
    'grant', 'Advance paid out and booked',
  );
}

export function useRepayExpenseAdvance() {
  return useAdvanceMutation<{ p_advance_id: string; p_amount_cents?: number | null; p_paid_at?: string | null; p_notes?: string | null }>(
    'repay', 'Repayment booked',
  );
}
