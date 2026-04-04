import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface InvoiceLineItem {
  description: string;
  qty: number;
  unit_price_cents: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  deal_id: string | null;
  customer_email: string;
  customer_name: string;
  status: InvoiceStatus;
  line_items: InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function computeInvoiceTotals(lineItems: InvoiceLineItem[], taxRate: number) {
  const subtotal_cents = lineItems.reduce((sum, item) => sum + item.qty * item.unit_price_cents, 0);
  const tax_cents = Math.round(subtotal_cents * taxRate);
  const total_cents = subtotal_cents + tax_cents;
  return { subtotal_cents, tax_cents, total_cents };
}

export function useInvoices(statusFilter?: InvoiceStatus) {
  return useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Invoice[];
    },
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as Invoice;
    },
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      customer_email: string;
      customer_name: string;
      line_items: InvoiceLineItem[];
      tax_rate?: number;
      currency?: string;
      due_date?: string;
      deal_id?: string;
      notes?: string;
    }) => {
      const taxRate = input.tax_rate ?? 0.25;
      const totals = computeInvoiceTotals(input.line_items, taxRate);

      // Generate invoice number: INV-XXXX
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });
      const nextNum = (count || 0) + 1;
      const invoice_number = `INV-${String(nextNum).padStart(4, '0')}`;

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number,
          customer_email: input.customer_email,
          customer_name: input.customer_name,
          line_items: input.line_items as any,
          tax_rate: taxRate,
          ...totals,
          currency: input.currency || 'SEK',
          due_date: input.due_date || null,
          deal_id: input.deal_id || null,
          notes: input.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Invoice> & { id: string }) => {
      // Recompute totals if line_items or tax_rate changed
      let computed = {};
      if (updates.line_items || updates.tax_rate !== undefined) {
        const lineItems = updates.line_items || [];
        const taxRate = updates.tax_rate ?? 0.25;
        computed = computeInvoiceTotals(lineItems, taxRate);
      }

      const { data, error } = await supabase
        .from('invoices')
        .update({ ...updates, ...computed } as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Invoice;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', data.id] });
      toast.success('Invoice updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invoices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
