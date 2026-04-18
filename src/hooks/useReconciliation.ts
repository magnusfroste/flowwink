import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export type BankTxStatus = 'unmatched' | 'matched' | 'partial' | 'ignored';
export type BankTxSource = 'stripe' | 'csv' | 'camt053' | 'sie' | 'manual';

export interface BankTransaction {
  id: string;
  batch_id: string | null;
  source: BankTxSource;
  external_id: string | null;
  transaction_date: string;
  value_date: string | null;
  amount_cents: number;
  currency: string;
  counterparty: string | null;
  reference: string | null;
  description: string | null;
  raw_data: Record<string, unknown>;
  status: BankTxStatus;
  matched_amount_cents: number;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationMatch {
  id: string;
  bank_transaction_id: string;
  entity_type: 'invoice' | 'expense' | 'order' | 'manual';
  entity_id: string | null;
  amount_cents: number;
  match_type: 'auto' | 'manual' | 'suggested';
  confidence: number | null;
  notes: string | null;
  created_at: string;
}

export interface BankImportBatch {
  id: string;
  source: BankTxSource;
  file_name: string | null;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  status: 'processing' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
}

export function useBankTransactions(statusFilter?: BankTxStatus) {
  return useQuery({
    queryKey: ['bank_transactions', statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .limit(500);
      if (statusFilter) q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as BankTransaction[];
    },
  });
}

export function useBankTransactionMatches(txId: string | undefined) {
  return useQuery({
    queryKey: ['reconciliation_matches', txId],
    queryFn: async () => {
      if (!txId) return [];
      const { data, error } = await supabase
        .from('reconciliation_matches')
        .select('*')
        .eq('bank_transaction_id', txId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ReconciliationMatch[];
    },
    enabled: !!txId,
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ['bank_import_batches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_import_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as BankImportBatch[];
    },
  });
}

export function useCreateMatch() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      bank_transaction_id: string;
      entity_type: 'invoice' | 'expense' | 'order' | 'manual';
      entity_id?: string;
      amount_cents: number;
      match_type?: 'auto' | 'manual' | 'suggested';
      confidence?: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('reconciliation_matches')
        .insert({
          bank_transaction_id: input.bank_transaction_id,
          entity_type: input.entity_type,
          entity_id: input.entity_id || null,
          amount_cents: input.amount_cents,
          match_type: input.match_type || 'manual',
          confidence: input.confidence || null,
          notes: input.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation_matches'] });
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      toast.success('Match created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reconciliation_matches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reconciliation_matches'] });
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      toast.success('Match removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useIgnoreTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bank_transactions')
        .update({ status: 'ignored' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      toast.success('Transaction ignored');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Sync Stripe payouts as bank_transactions */
export function useSyncStripe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('reconciliation-sync-stripe', {
        body: {},
      });
      if (error) throw error;
      return data as { imported: number; skipped: number };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['bank_import_batches'] });
      toast.success(`Stripe sync: ${d.imported} imported, ${d.skipped} skipped`);
    },
    onError: (e: Error) => toast.error(`Stripe sync failed: ${e.message}`),
  });
}

/** Import bank file (CSV / CAMT.053 / SIE) */
export function useImportBankFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { fileName: string; content: string; format: 'csv' | 'camt053' | 'sie' }) => {
      const { data, error } = await supabase.functions.invoke('reconciliation-import-file', {
        body: input,
      });
      if (error) throw error;
      return data as { imported: number; skipped: number; errors: number };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['bank_import_batches'] });
      toast.success(`Imported ${d.imported} (skipped ${d.skipped}, errors ${d.errors})`);
    },
    onError: (e: Error) => toast.error(`Import failed: ${e.message}`),
  });
}

/** Auto-suggest matches by reference / amount */
export function useAutoMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('reconciliation-auto-match', {
        body: {},
      });
      if (error) throw error;
      return data as { matched: number; suggested: number };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['reconciliation_matches'] });
      toast.success(`Auto-matched ${d.matched}, ${d.suggested} suggestions`);
    },
    onError: (e: Error) => toast.error(`Auto-match failed: ${e.message}`),
  });
}
