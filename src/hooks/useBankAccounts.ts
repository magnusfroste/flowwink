import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BankAccount {
  id: string;
  name: string;
  account_number: string | null;
  currency: string;
  gl_account: string;
  stripe_account_id: string | null;
  is_default: boolean;
  archived: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useBankAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ['bank_accounts', includeArchived],
    queryFn: async () => {
      let q = supabase.from('bank_accounts').select('*').order('is_default', { ascending: false }).order('name');
      if (!includeArchived) q = q.eq('archived', false);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as BankAccount[];
    },
  });
}

export function useUpsertBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<BankAccount> & { name: string }) => {
      // account_for('bank') is the same locale-aware lookup the posting engine
      // uses, so a bank account created here lands where entries will actually
      // be booked. Naming the account in the client instead — which is what
      // this did — gave every instance on a non-standard chart a default that
      // pointed at someone else's account, silently.
      let resolved = input.gl_account;
      if (!resolved) {
        const { data, error } = await supabase.rpc('account_for', { p_role: 'bank' } as never);
        if (error) throw error;
        resolved = (data as string | null) ?? undefined;
        // No role, no guess. An unmapped role is a setup question with a clear
        // answer; a wrong account number is a reconciliation mystery months on.
        if (!resolved) {
          throw new Error(
            'No account is mapped to the "bank" role for this locale. ' +
            'Set it under Accounting → Chart of accounts, or pass gl_account explicitly.');
        }
      }

      const payload = {
        name: input.name,
        account_number: input.account_number ?? null,
        currency: input.currency || 'SEK',
        gl_account: resolved,
        stripe_account_id: input.stripe_account_id ?? null,
        is_default: input.is_default ?? false,
        archived: input.archived ?? false,
        notes: input.notes ?? null,
      };
      if (input.id) {
        const { data, error } = await supabase.from('bank_accounts').update(payload).eq('id', input.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('bank_accounts').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_accounts'] });
      toast.success('Bank account saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useArchiveBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bank_accounts').update({ archived: true, is_default: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank_accounts'] });
      toast.success('Bank account archived');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Reconciliation summary per bank account for a given period.
 *  Compares sum of bank_transactions vs sum of journal_entry_lines on gl_account.
 */
export interface BankReconciliationSummary {
  bank_account_id: string;
  name: string;
  gl_account: string;
  currency: string;
  bank_total_cents: number;
  bank_count: number;
  bank_unmatched_count: number;
  ledger_total_cents: number;
  ledger_count: number;
  diff_cents: number;
}

export function useBankReconciliationSummary(periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['bank_reconciliation_summary', periodStart, periodEnd],
    queryFn: async (): Promise<BankReconciliationSummary[]> => {
      const { data: accounts, error: aErr } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('archived', false);
      if (aErr) throw aErr;

      const summaries: BankReconciliationSummary[] = [];
      for (const acc of (accounts || []) as unknown as BankAccount[]) {
        const { data: txs, error: tErr } = await supabase
          .from('bank_transactions')
          .select('amount_cents, status')
          .eq('bank_account_id', acc.id)
          .gte('transaction_date', periodStart)
          .lte('transaction_date', periodEnd);
        if (tErr) throw tErr;

        const bank_total_cents = (txs || []).reduce((s: number, t: any) => s + (t.amount_cents || 0), 0);
        const bank_count = (txs || []).length;
        const bank_unmatched_count = (txs || []).filter((t: any) => t.status === 'unmatched').length;

        const { data: lines, error: lErr } = await supabase
          .from('journal_entry_lines')
          .select('debit_cents, credit_cents, journal_entries!inner(entry_date, status)')
          .eq('account_code', acc.gl_account)
          .gte('journal_entries.entry_date', periodStart)
          .lte('journal_entries.entry_date', periodEnd)
          .eq('journal_entries.status', 'posted');
        if (lErr) throw lErr;

        const ledger_total_cents = (lines || []).reduce(
          (s: number, l: any) => s + ((l.debit_cents || 0) - (l.credit_cents || 0)),
          0,
        );
        const ledger_count = (lines || []).length;

        summaries.push({
          bank_account_id: acc.id,
          name: acc.name,
          gl_account: acc.gl_account,
          currency: acc.currency,
          bank_total_cents,
          bank_count,
          bank_unmatched_count,
          ledger_total_cents,
          ledger_count,
          diff_cents: bank_total_cents - ledger_total_cents,
        });
      }
      return summaries;
    },
  });
}
