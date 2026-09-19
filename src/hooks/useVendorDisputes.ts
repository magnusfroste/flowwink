import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// Vendor invoice disputes
// ============================================================

export type DisputeStatus = 'open' | 'resolved' | 'cancelled';

export interface VendorInvoiceDispute {
  id: string;
  vendor_invoice_id: string;
  reason: string;
  status: DisputeStatus;
  disputed_amount_cents: number | null;
  resolution: string | null;
  opened_by: string | null;
  opened_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useVendorDisputes(status?: DisputeStatus | 'all') {
  return useQuery({
    queryKey: ['vendor-disputes', status ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('vendor_invoice_disputes' as any)
        .select('*, vendor_invoices(invoice_number, vendor_id, total_cents, currency, vendors(name))')
        .order('opened_at', { ascending: false });
      if (status && status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useOpenDispute() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      vendor_invoice_id: string;
      reason: string;
      disputed_amount_cents?: number;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('vendor_invoice_disputes' as any)
        .insert({
          vendor_invoice_id: input.vendor_invoice_id,
          reason: input.reason,
          disputed_amount_cents: input.disputed_amount_cents ?? null,
          opened_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-disputes'] });
      toast({ title: 'Dispute opened' });
    },
    onError: (e: Error) => toast({ title: 'Failed to open dispute', description: e.message, variant: 'destructive' }),
  });
}

export function useResolveDispute() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { id: string; resolution: string; status?: DisputeStatus }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('vendor_invoice_disputes' as any)
        .update({
          status: input.status ?? 'resolved',
          resolution: input.resolution,
          resolved_by: userData.user?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-disputes'] });
      toast({ title: 'Dispute resolved' });
    },
    onError: (e: Error) => toast({ title: 'Resolve failed', description: e.message, variant: 'destructive' }),
  });
}

// ============================================================
// Vendor credit memos
// ============================================================

export type CreditMemoStatus = 'issued' | 'applied' | 'cancelled';

export interface VendorCreditMemo {
  id: string;
  credit_number: string;
  vendor_id: string;
  vendor_invoice_id: string | null;
  dispute_id: string | null;
  credit_date: string;
  amount_cents: number;
  currency: string;
  reason: string | null;
  status: CreditMemoStatus;
  applied_at: string | null;
  journal_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useVendorCreditMemos() {
  return useQuery({
    queryKey: ['vendor-credit-memos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_credit_memos' as any)
        .select('*, vendors(name), vendor_invoices(invoice_number)')
        .order('credit_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useIssueCreditMemo() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      vendor_id: string;
      amount_cents: number;
      currency?: string;
      credit_date?: string;
      reason?: string;
      vendor_invoice_id?: string | null;
      dispute_id?: string | null;
      credit_number?: string;
      notes?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const creditNumber =
        input.credit_number ??
        `CM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`;

      const { data, error } = await supabase
        .from('vendor_credit_memos' as any)
        .insert({
          credit_number: creditNumber,
          vendor_id: input.vendor_id,
          vendor_invoice_id: input.vendor_invoice_id ?? null,
          dispute_id: input.dispute_id ?? null,
          credit_date: input.credit_date ?? new Date().toISOString().slice(0, 10),
          amount_cents: input.amount_cents,
          currency: input.currency ?? 'SEK',
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          created_by: userData.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-credit-memos'] });
      toast({ title: 'Credit memo issued' });
    },
    onError: (e: Error) => toast({ title: 'Failed to issue credit memo', description: e.message, variant: 'destructive' }),
  });
}

export function useApplyCreditMemo() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      // Applied means booked: the function debits payables and reverses the
      // VAT share. Setting the status by hand reduced no debt, and the table
      // refuses it now.
      const { data, error } = await supabase.rpc('apply_vendor_credit_memo' as never, { p_credit_memo_id: id } as never);
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (!result?.success) throw new Error(result?.error ?? 'The credit memo could not be applied');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendor-credit-memos'] });
      qc.invalidateQueries({ queryKey: ['vendor-invoices'] });
      toast({ title: 'Credit memo applied and booked' });
    },
    onError: (e: Error) => toast({ title: 'Apply failed', description: e.message, variant: 'destructive' }),
  });
}
