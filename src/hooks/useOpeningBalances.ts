import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OpeningBalance {
  id: string;
  account_code: string;
  account_name: string;
  amount_cents: number;
  balance_type: 'debit' | 'credit';
  locale: string;
  fiscal_year: number;
  created_at: string;
  updated_at: string;
}

export function useOpeningBalances(locale: string, fiscalYear: number) {
  return useQuery({
    queryKey: ['opening-balances', locale, fiscalYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opening_balances')
        .select('*')
        .eq('locale', locale)
        .eq('fiscal_year', fiscalYear)
        .order('account_code');
      if (error) throw error;
      return data as unknown as OpeningBalance[];
    },
  });
}

export function useUpsertOpeningBalance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: Omit<OpeningBalance, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('opening_balances')
        .upsert(input, { onConflict: 'account_code,locale,fiscal_year' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-balances'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      toast({ title: 'Opening balance saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteOpeningBalance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('opening_balances')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opening-balances'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      toast({ title: 'Opening balance deleted' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}
