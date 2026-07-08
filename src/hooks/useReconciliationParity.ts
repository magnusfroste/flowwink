import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// -------- Partial match with variance --------
export function useCreatePartialMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bank_transaction_id: string;
      entity_type: 'invoice' | 'expense' | 'order' | 'manual';
      entity_id?: string | null;
      match_cents: number;
      variance_cents: number;
      variance_account_code?: string;
      variance_account_name?: string;
      bank_gl_account?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('create_partial_match_with_variance', {
        p_bank_transaction_id: input.bank_transaction_id,
        p_entity_type: input.entity_type,
        p_entity_id: input.entity_id ?? null,
        p_match_cents: input.match_cents,
        p_variance_cents: input.variance_cents,
        p_variance_account_code: input.variance_account_code ?? '3740',
        p_variance_account_name: input.variance_account_name ?? 'Öresutjämning',
        p_bank_gl_account: input.bank_gl_account ?? '1930',
        p_notes: input.notes ?? null,
      } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['reconciliation_matches'] });
      toast.success('Partial match posted');
    },
    onError: (e: Error) => toast.error(`Partial match failed: ${e.message}`),
  });
}

// -------- Petty cash --------
export interface PettyCashCount {
  id: string;
  cash_account_code: string;
  count_date: string;
  counted_cents: number;
  book_balance_cents: number;
  difference_cents: number;
  diff_account_code: string | null;
  currency: string;
  notes: string | null;
  journal_entry_id: string | null;
  created_at: string;
}

export function usePettyCashCounts(accountCode?: string) {
  return useQuery({
    queryKey: ['petty_cash_counts', accountCode],
    queryFn: async () => {
      let q = supabase.from('petty_cash_counts').select('*').order('count_date', { ascending: false }).limit(50);
      if (accountCode) q = q.eq('cash_account_code', accountCode);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PettyCashCount[];
    },
  });
}

export function useRecordPettyCashCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cash_account_code: string;
      counted_cents: number;
      diff_account_code?: string;
      count_date?: string;
      notes?: string;
      currency?: string;
    }) => {
      const { data, error } = await supabase.rpc('record_petty_cash_count', {
        p_cash_account_code: input.cash_account_code,
        p_counted_cents: input.counted_cents,
        p_diff_account_code: input.diff_account_code ?? '7960',
        p_count_date: input.count_date ?? null,
        p_notes: input.notes ?? null,
        p_currency: input.currency ?? 'SEK',
      } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petty_cash_counts'] });
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      toast.success('Petty-cash count recorded');
    },
    onError: (e: Error) => toast.error(`Count failed: ${e.message}`),
  });
}

// -------- Sign-off --------
export interface ReconciliationSignoff {
  id: string;
  bank_account_id: string;
  period_start: string;
  period_end: string;
  statement_balance_cents: number;
  book_balance_cents: number;
  difference_cents: number;
  currency: string;
  notes: string | null;
  reconciled_by: string | null;
  reconciled_at: string;
}

export function useReconciliationSignoffs(bankAccountId?: string) {
  return useQuery({
    queryKey: ['reconciliation_signoffs', bankAccountId],
    queryFn: async () => {
      let q = supabase.from('reconciliation_signoffs').select('*').order('period_end', { ascending: false }).limit(50);
      if (bankAccountId) q = q.eq('bank_account_id', bankAccountId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ReconciliationSignoff[];
    },
  });
}

export function useSignoffReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bank_account_id: string;
      period_start: string;
      period_end: string;
      statement_balance_cents: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc('signoff_reconciliation', {
        p_bank_account_id: input.bank_account_id,
        p_period_start: input.period_start,
        p_period_end: input.period_end,
        p_statement_balance_cents: input.statement_balance_cents,
        p_notes: input.notes ?? null,
      } as any);
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation_signoffs'] });
      toast.success('Period signed off & locked');
    },
    onError: (e: Error) => toast.error(`Sign-off failed: ${e.message}`),
  });
}

export function useUnlockSignoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('unlock_reconciliation_signoff', { p_signoff_id: id } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation_signoffs'] });
      toast.success('Sign-off removed');
    },
    onError: (e: Error) => toast.error(`Unlock failed: ${e.message}`),
  });
}

// -------- Bank feed connections --------
export interface BankFeedConnection {
  id: string;
  bank_account_id: string | null;
  provider: 'plaid' | 'tink' | 'gocardless' | 'csv' | 'manual' | 'stripe';
  status: 'not_connected' | 'pending' | 'connected' | 'error' | 'disabled';
  external_ref: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function useBankFeedConnections() {
  return useQuery({
    queryKey: ['bank_feed_connections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_feed_connections')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as BankFeedConnection[];
    },
  });
}

export function useUpsertBankFeedConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<BankFeedConnection> & { provider: BankFeedConnection['provider'] }) => {
      const { data, error } = await supabase
        .from('bank_feed_connections')
        .upsert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bank_feed_connections'] }),
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });
}
