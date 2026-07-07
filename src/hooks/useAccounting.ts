import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Types
// ============================================================

export interface ChartAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_category: string;
  normal_balance: string;
  is_active: boolean;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  description: string;
  reference_number: string | null;
  status: string;
  source: string;
  invoice_id: string | null;
  journal_id: string | null;
  created_by: string | null;
  created_at: string;
  voucher_series?: string | null;
  voucher_number?: number | null;
  voucher_year?: number | null;
  // Enriched by useJournalEntries:
  total_cents?: number;
  line_count?: number;
  is_balanced?: boolean;
  account_codes?: string[];
  lines?: JournalEntryLine[];
}

export interface Journal {
  id: string;
  code: string;
  name: string;
  journal_type: 'sales' | 'purchase' | 'bank' | 'cash' | 'misc';
  currency: string;
  default_account_code: string | null;
  sequence_prefix: string | null;
  is_active: boolean;
  description: string | null;
}

export function useJournals() {
  return useQuery({
    queryKey: ['journals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journals' as any)
        .select('*')
        .eq('is_active', true)
        .order('code');
      if (error) throw error;
      return data as unknown as Journal[];
    },
  });
}

export interface JournalEntryLine {
  id: string;
  journal_entry_id: string;
  account_code: string;
  account_name: string;
  debit_cents: number;
  credit_cents: number;
  description: string | null;
}

export interface AccountingTemplate {
  id: string;
  template_name: string;
  description: string;
  category: string;
  keywords: string[] | null;
  template_lines: TemplateLine[];
  is_system: boolean;
  usage_count: number;
}

export interface TemplateLine {
  account_code: string;
  account_name: string;
  type: 'debit' | 'credit';
  description: string;
}

export interface AccountBalance {
  account_code: string;
  account_name: string;
  account_type: string;
  debit_total: number;
  credit_total: number;
  balance: number;
  opening_cents: number;
  closing_cents: number;
}

// ============================================================
// Chart of Accounts
// ============================================================

export function useChartOfAccounts(locale?: string) {
  return useQuery({
    queryKey: ['chart-of-accounts', locale],
    queryFn: async () => {
      let query = supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('is_active', true)
        .order('account_code');
      if (locale) {
        query = query.eq('locale', locale);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as ChartAccount[];
    },
  });
}

// ============================================================
// Journal Entries
// ============================================================

export function useJournalEntries(statusFilter?: string, journalId?: string) {
  return useQuery({
    queryKey: ['journal-entries', statusFilter, journalId],
    queryFn: async () => {
      let query = supabase
        .from('journal_entries')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (journalId && journalId !== 'all') {
        query = query.eq('journal_id', journalId);
      }

      const { data: entries, error } = await query;
      if (error) throw error;

      const ids = (entries || []).map((e) => e.id);
      if (ids.length === 0) return entries as JournalEntry[];

      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, account_code, debit_cents, credit_cents')
        .in('journal_entry_id', ids);

      const agg = new Map<string, { debit: number; credit: number; count: number; codes: Set<string> }>();
      for (const l of lines || []) {
        const cur = agg.get(l.journal_entry_id) || { debit: 0, credit: 0, count: 0, codes: new Set<string>() };
        cur.debit += Number(l.debit_cents || 0);
        cur.credit += Number(l.credit_cents || 0);
        cur.count += 1;
        cur.codes.add(l.account_code);
        agg.set(l.journal_entry_id, cur);
      }

      return (entries || []).map((e) => {
        const a = agg.get(e.id);
        const debit = a?.debit || 0;
        const credit = a?.credit || 0;
        return {
          ...e,
          total_cents: Math.max(debit, credit),
          line_count: a?.count || 0,
          is_balanced: debit === credit && (a?.count || 0) > 0,
          account_codes: a ? Array.from(a.codes).sort() : [],
        };
      }) as JournalEntry[];
    },
  });
}

export function useJournalEntryWithLines(entryId: string | null) {
  return useQuery({
    queryKey: ['journal-entry', entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('id', entryId!)
        .single();
      if (entryError) throw entryError;

      const { data: lines, error: linesError } = await supabase
        .from('journal_entry_lines')
        .select('*')
        .eq('journal_entry_id', entryId!)
        .order('created_at');
      if (linesError) throw linesError;

      return { ...entry, lines } as JournalEntry;
    },
  });
}

export interface CreateJournalEntryInput {
  entry_date: string;
  description: string;
  reference_number?: string;
  status?: string;
  source?: string;
  invoice_id?: string;
  journal_id?: string;
  lines: {
    account_code: string;
    account_name: string;
    debit_cents: number;
    credit_cents: number;
    description?: string;
    analytic_account_id?: string | null;
  }[];
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateJournalEntryInput) => {
      // Validate: sum of debits must equal sum of credits
      const totalDebit = input.lines.reduce((s, l) => s + l.debit_cents, 0);
      const totalCredit = input.lines.reduce((s, l) => s + l.credit_cents, 0);
      if (totalDebit !== totalCredit) {
        throw new Error(`Debit (${totalDebit}) must equal Credit (${totalCredit})`);
      }

      const { data: entry, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          entry_date: input.entry_date,
          description: input.description,
          reference_number: input.reference_number || null,
          status: input.status || 'posted',
          source: input.source || 'manual',
          invoice_id: input.invoice_id || null,
          journal_id: input.journal_id || null,
        } as any)
        .select()
        .single();
      if (entryError) throw entryError;

      const { data: insertedLines, error: linesError } = await supabase
        .from('journal_entry_lines')
        .insert(
          input.lines.map((l) => ({
            journal_entry_id: entry.id,
            account_code: l.account_code,
            account_name: l.account_name,
            debit_cents: l.debit_cents,
            credit_cents: l.credit_cents,
            description: l.description || null,
          }))
        )
        .select();
      if (linesError) throw linesError;

      // Create analytic_lines for any tagged JE lines
      const analyticRows: any[] = [];
      (insertedLines ?? []).forEach((row, i) => {
        const src = input.lines[i];
        if (!src?.analytic_account_id) return;
        const amount = src.debit_cents - src.credit_cents; // debit positive (cost), credit negative (revenue)
        if (amount === 0) return;
        analyticRows.push({
          analytic_account_id: src.analytic_account_id,
          journal_entry_line_id: row.id,
          journal_entry_id: entry.id,
          entry_date: input.entry_date,
          account_code: src.account_code,
          description: src.description || input.description,
          amount_cents: amount,
        });
      });
      if (analyticRows.length) {
        const { error: alErr } = await (supabase as any).from('analytic_lines').insert(analyticRows);
        if (alErr) throw alErr;
      }

      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
      queryClient.invalidateQueries({ queryKey: ['analytic-lines'] });
      queryClient.invalidateQueries({ queryKey: ['analytic-balances'] });
      toast({ title: 'Journal entry created' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

// ============================================================
// Account Balances (General Ledger)
// ============================================================

export function useAccountBalances() {
  return useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      // Fetch all posted entry lines
      const { data: lines, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          account_code,
          account_name,
          debit_cents,
          credit_cents,
          journal_entries!inner(status)
        `)
        .eq('journal_entries.status', 'posted');

      if (error) throw error;

      // Fetch opening balances for current fiscal year
      const currentYear = new Date().getFullYear();
      const { data: openingData } = await supabase
        .from('opening_balances')
        .select('*')
        .eq('fiscal_year', currentYear);

      // Aggregate by account
      const map = new Map<string, AccountBalance>();

      // Seed with opening balances first
      for (const ob of openingData || []) {
        const amountCents = Number((ob as any).amount_cents || 0);
        const balType = (ob as any).balance_type || 'debit';
        map.set((ob as any).account_code, {
          account_code: (ob as any).account_code,
          account_name: (ob as any).account_name,
          account_type: '',
          debit_total: balType === 'debit' ? amountCents : 0,
          credit_total: balType === 'credit' ? amountCents : 0,
          balance: 0,
          opening_cents: 0,
          closing_cents: 0,
        });
      }

      for (const line of lines || []) {
        const existing = map.get(line.account_code) || {
          account_code: line.account_code,
          account_name: line.account_name,
          account_type: '',
          debit_total: 0,
          credit_total: 0,
          balance: 0,
          opening_cents: 0,
          closing_cents: 0,
        };
        existing.debit_total += Number(line.debit_cents || 0);
        existing.credit_total += Number(line.credit_cents || 0);
        map.set(line.account_code, existing);
      }

      // Fetch chart to get account_type
      const { data: chart } = await supabase
        .from('chart_of_accounts')
        .select('account_code, account_type, normal_balance')
        .eq('is_active', true);

      const chartMap = new Map((chart || []).map((a) => [a.account_code, a]));

      const balances: AccountBalance[] = [];
      for (const [code, bal] of map) {
        const chartAccount = chartMap.get(code);
        bal.account_type = chartAccount?.account_type || '';
        const normalBalance = chartAccount?.normal_balance || 'debit';
        bal.balance =
          normalBalance === 'debit'
            ? bal.debit_total - bal.credit_total
            : bal.credit_total - bal.debit_total;
        balances.push(bal);
      }

      balances.sort((a, b) => a.account_code.localeCompare(b.account_code));
      return balances;
    },
  });
}

// ============================================================
// Ledger lines for a single account (with opening balance)
// ============================================================

export interface LedgerLine {
  entry_id: string;
  entry_date: string;
  voucher_series: string | null;
  voucher_number: number | null;
  voucher_year: number | null;
  reference_number: string | null;
  description: string;
  debit_cents: number;
  credit_cents: number;
}

export interface AccountLedger {
  account_code: string;
  account_name: string;
  normal_balance: 'debit' | 'credit';
  opening_cents: number; // signed in account's normal direction
  lines: LedgerLine[];
  closing_cents: number;
}

export function useAccountLedger(accountCode: string | null) {
  return useQuery({
    queryKey: ['account-ledger', accountCode],
    enabled: !!accountCode,
    queryFn: async (): Promise<AccountLedger | null> => {
      if (!accountCode) return null;
      const currentYear = new Date().getFullYear();

      const { data: chart } = await supabase
        .from('chart_of_accounts')
        .select('account_code, account_name, normal_balance')
        .eq('account_code', accountCode)
        .maybeSingle();

      const normalBalance: 'debit' | 'credit' =
        (chart?.normal_balance as 'debit' | 'credit') || 'debit';

      const { data: opening } = await supabase
        .from('opening_balances')
        .select('amount_cents, balance_type, account_name')
        .eq('fiscal_year', currentYear)
        .eq('account_code', accountCode)
        .maybeSingle();

      let opening_cents = 0;
      if (opening) {
        const amt = Number((opening as any).amount_cents || 0);
        const t = ((opening as any).balance_type || 'debit') as 'debit' | 'credit';
        opening_cents = t === normalBalance ? amt : -amt;
      }

      const { data: rows, error } = await supabase
        .from('journal_entry_lines')
        .select(`
          debit_cents,
          credit_cents,
          journal_entries!inner(
            id, entry_date, description, reference_number, status,
            voucher_series, voucher_number, voucher_year
          )
        `)
        .eq('account_code', accountCode)
        .eq('journal_entries.status', 'posted')
        .order('entry_date', { foreignTable: 'journal_entries', ascending: true });

      if (error) throw error;

      const lines: LedgerLine[] = (rows || []).map((r: any) => ({
        entry_id: r.journal_entries.id,
        entry_date: r.journal_entries.entry_date,
        voucher_series: r.journal_entries.voucher_series,
        voucher_number: r.journal_entries.voucher_number,
        voucher_year: r.journal_entries.voucher_year,
        reference_number: r.journal_entries.reference_number,
        description: r.journal_entries.description,
        debit_cents: Number(r.debit_cents || 0),
        credit_cents: Number(r.credit_cents || 0),
      }));

      const debitSum = lines.reduce((s, l) => s + l.debit_cents, 0);
      const creditSum = lines.reduce((s, l) => s + l.credit_cents, 0);
      const netMovement =
        normalBalance === 'debit' ? debitSum - creditSum : creditSum - debitSum;

      return {
        account_code: accountCode,
        account_name: chart?.account_name || (opening as any)?.account_name || accountCode,
        normal_balance: normalBalance,
        opening_cents,
        lines,
        closing_cents: opening_cents + netMovement,
      };
    },
  });
}



// ============================================================
// Accounting Templates
// ============================================================

export function useAccountingTemplates(locale?: string) {
  return useQuery({
    queryKey: ['accounting-templates', locale],
    queryFn: async () => {
      let query = supabase
        .from('accounting_templates')
        .select('*')
        .order('usage_count', { ascending: false });
      if (locale) {
        query = query.eq('locale', locale);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as AccountingTemplate[];
    },
  });
}

export interface TemplateInput {
  id?: string;
  template_name: string;
  description: string;
  category: string;
  keywords: string[] | null;
  template_lines: TemplateLine[];
  locale: string;
  is_system?: boolean;
}

export function useUpsertAccountingTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: TemplateInput) => {
      const payload: any = {
        template_name: input.template_name,
        description: input.description,
        category: input.category,
        keywords: input.keywords,
        template_lines: input.template_lines,
        locale: input.locale,
        is_system: input.is_system ?? false,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from('accounting_templates')
          .update(payload)
          .eq('id', input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('accounting_templates')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['accounting-templates'] });
      toast({ title: vars.id ? 'Template updated' : 'Template created' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAccountingTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounting_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-templates'] });
      toast({ title: 'Template deleted' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });
}
