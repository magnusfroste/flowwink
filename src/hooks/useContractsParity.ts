/**
 * Contracts parity r13 — hooks for auto-invoicing schedule, obligations, reminders.
 * Reuses the base useContracts hook for the contract itself.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContractObligation {
  id: string;
  contract_id: string;
  description: string;
  due_date: string | null;
  status: 'pending' | 'met' | 'overdue' | 'waived';
  responsible: string | null;
  met_at: string | null;
  met_by: string | null;
  notes: string | null;
  is_overdue?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractInvoiceReminder {
  id: string;
  invoice_id: string;
  contract_id: string | null;
  offset_days: number;
  triggered_by: string;
  channel: string;
  recipient: string | null;
  sent_at: string;
}

// ── Obligations ─────────────────────────────────────────────
export function useContractObligations(contractId?: string) {
  return useQuery({
    queryKey: ['contract-obligations', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_obligations_with_status' as any)
        .select('*')
        .eq('contract_id', contractId!)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContractObligation[];
    },
  });
}

export function useCreateObligation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      contract_id: string;
      description: string;
      due_date?: string | null;
      responsible?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('contract_obligations')
        .insert({
          contract_id: input.contract_id,
          description: input.description,
          due_date: input.due_date ?? null,
          responsible: input.responsible ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['contract-obligations', vars.contract_id] });
      toast({ title: 'Obligation added' });
    },
    onError: (e: Error) => toast({ title: 'Could not add obligation', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateObligationStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { obligation_id: string; status: ContractObligation['status']; notes?: string }) => {
      const { data, error } = await supabase.rpc('mark_contract_obligation_status', {
        _obligation_id: input.obligation_id,
        _status: input.status,
        _notes: input.notes ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-obligations'] });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteObligation() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contract_obligations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract-obligations'] });
      toast({ title: 'Obligation removed' });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });
}

// ── Billing schedule ────────────────────────────────────────
export interface ContractBillingSchedule {
  billing_enabled: boolean;
  billing_amount_cents: number | null;
  billing_interval: 'week' | 'month' | 'quarter' | 'year' | null;
  billing_interval_count: number;
  billing_next_date: string | null;
  billing_last_invoice_id: string | null;
  billing_tax_rate: number;
  billing_due_in_days: number;
  billing_reminder_offsets: number[];
  billing_reminders_enabled: boolean;
}

export function useUpdateContractBilling() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { contract_id: string; patch: Partial<ContractBillingSchedule> }) => {
      const { data, error } = await supabase
        .from('contracts')
        .update({ ...(input.patch as any), updated_at: new Date().toISOString() })
        .eq('id', input.contract_id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['contract', vars.contract_id] });
      qc.invalidateQueries({ queryKey: ['contracts'] });
      toast({ title: 'Billing schedule saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });
}

export function useGenerateContractInvoiceNow() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (contract_id: string) => {
      const { data, error } = await supabase.rpc('generate_contract_invoice', { _contract_id: contract_id });
      if (error) throw error;
      return data as { invoice_id?: string; invoice_number?: string; total_cents?: number; currency?: string };
    },
    onSuccess: (d, contract_id) => {
      qc.invalidateQueries({ queryKey: ['contract', contract_id] });
      qc.invalidateQueries({ queryKey: ['contract-invoices', contract_id] });
      toast({ title: 'Invoice generated', description: d?.invoice_number ?? 'ok' });
    },
    onError: (e: Error) => toast({ title: 'Invoice failed', description: e.message, variant: 'destructive' }),
  });
}

// ── Contract-generated invoices + reminders ─────────────────
export interface ContractInvoiceRow {
  id: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  paid_amount_cents: number | null;
  currency: string;
  due_date: string | null;
  issue_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  customer_email: string | null;
}

export function useContractInvoices(contractId?: string) {
  return useQuery({
    queryKey: ['contract-invoices', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total_cents, paid_amount_cents, currency, due_date, issue_date, sent_at, paid_at, customer_email')
        .eq('contract_id', contractId!)
        .order('issue_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContractInvoiceRow[];
    },
  });
}

export function useContractInvoiceReminders(contractId?: string) {
  return useQuery({
    queryKey: ['contract-reminders', contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_invoice_reminders')
        .select('*')
        .eq('contract_id', contractId!)
        .order('sent_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContractInvoiceReminder[];
    },
  });
}

export function useTriggerContractBillingCron() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('contract-billing-cron', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['contract-invoices'] });
      qc.invalidateQueries({ queryKey: ['contract-reminders'] });
      toast({
        title: 'Billing sweep run',
        description: `Invoiced ${d?.invoicing?.succeeded ?? 0}, reminders sent ${d?.reminders?.succeeded ?? 0}`,
      });
    },
    onError: (e: Error) => toast({ title: 'Sweep failed', description: e.message, variant: 'destructive' }),
  });
}
