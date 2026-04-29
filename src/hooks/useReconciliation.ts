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
  bank_account_id: string | null;
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

export function useBankTransactions(statusFilter?: BankTxStatus, bankAccountId?: string) {
  return useQuery({
    queryKey: ['bank_transactions', statusFilter, bankAccountId],
    queryFn: async () => {
      let q = supabase
        .from('bank_transactions')
        .select('*')
        .order('transaction_date', { ascending: false })
        .limit(500);
      if (statusFilter) q = q.eq('status', statusFilter);
      if (bankAccountId) q = q.eq('bank_account_id', bankAccountId);
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

export interface OcrTransaction {
  transaction_date: string;
  amount_cents: number;
  currency: string;
  counterparty?: string;
  reference?: string;
  description?: string;
}

/** OCR a bank statement image/PDF — preview only, returns parsed rows. */
export function usePreviewBankImage() {
  return useMutation({
    mutationFn: async (input: {
      fileName: string;
      contentBase64: string;
      mimeType: string;
      provider?: 'openai' | 'gemini';
      model?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('reconciliation-import-image', {
        body: { ...input, commit: false },
      });
      if (error) throw error;
      return data as { transactions: OcrTransaction[]; currency_default: string };
    },
    onError: (e: Error) => toast.error(`OCR failed: ${e.message}`),
  });
}

/** Commit user-approved OCR rows into bank_transactions. */
export function useCommitBankImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fileName: string;
      transactions: OcrTransaction[];
      currency_default?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('reconciliation-import-image', {
        body: { ...input, commit: true },
      });
      if (error) throw error;
      return data as { imported: number; errors: number; batch_id: string };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['bank_import_batches'] });
      toast.success(`Imported ${d.imported}${d.errors ? ` (${d.errors} errors)` : ''}`);
    },
    onError: (e: Error) => toast.error(`Commit failed: ${e.message}`),
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

/**
 * Book an unmatched bank transaction directly:
 * creates a journal entry (Dt counter / Cr bank, or vice-versa) AND a reconciliation match
 * so the row becomes both posted AND reconciled in one step.
 */
export function useBookFromUnmatched() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bank_transaction_id: string;
      bank_gl_account: string; // e.g. '1930'
      counter_account_code: string;
      counter_account_name: string;
      amount_cents: number; // signed: negative = bank outflow
      currency: string;
      entry_date: string;
      description: string;
      reference?: string;
    }) => {
      const isOutflow = input.amount_cents < 0;
      const abs = Math.abs(input.amount_cents);

      // Outflow (e.g. supplier payment): Dt counter, Cr bank
      // Inflow (e.g. customer payment): Dt bank, Cr counter
      const lines = isOutflow
        ? [
            { account_code: input.counter_account_code, account_name: input.counter_account_name, debit_cents: abs, credit_cents: 0 },
            { account_code: input.bank_gl_account, account_name: 'Bank', debit_cents: 0, credit_cents: abs },
          ]
        : [
            { account_code: input.bank_gl_account, account_name: 'Bank', debit_cents: abs, credit_cents: 0 },
            { account_code: input.counter_account_code, account_name: input.counter_account_name, debit_cents: 0, credit_cents: abs },
          ];

      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: input.entry_date,
          description: input.description,
          reference_number: input.reference || null,
          status: 'posted',
          source: 'reconciliation',
        } as any)
        .select()
        .single();
      if (entryErr) throw entryErr;

      const { error: linesErr } = await supabase
        .from('journal_entry_lines')
        .insert(lines.map((l) => ({ ...l, journal_entry_id: entry.id })));
      if (linesErr) throw linesErr;

      const { data: { user } } = await supabase.auth.getUser();

      const { error: matchErr } = await supabase.from('reconciliation_matches').insert({
        bank_transaction_id: input.bank_transaction_id,
        entity_type: 'manual',
        entity_id: entry.id,
        amount_cents: abs,
        match_type: 'manual',
        notes: `Booked: ${input.description}`,
        created_by: user?.id || null,
      });
      if (matchErr) throw matchErr;

      // Mark transaction as matched
      await supabase
        .from('bank_transactions')
        .update({ status: 'matched', matched_amount_cents: abs })
        .eq('id', input.bank_transaction_id);

      return entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_transactions'] });
      qc.invalidateQueries({ queryKey: ['reconciliation_matches'] });
      qc.invalidateQueries({ queryKey: ['journal-entries'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      qc.invalidateQueries({ queryKey: ['bank_reconciliation_summary'] });
      toast.success('Booked & reconciled');
    },
    onError: (e: Error) => toast.error(`Booking failed: ${e.message}`),
  });
}
