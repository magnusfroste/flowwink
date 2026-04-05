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

export interface InvoiceLead {
  id: string;
  name: string | null;
  email: string;
  company_id: string | null;
  companies: { name: string } | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  deal_id: string | null;
  lead_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
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
  leads: InvoiceLead | null;
}

/** Resolve display name: lead name > override > fallback */
export function getInvoiceCustomerName(inv: Invoice): string {
  return inv.leads?.name || inv.customer_name || '—';
}

export function getInvoiceCustomerEmail(inv: Invoice): string {
  return inv.leads?.email || inv.customer_email || '';
}

export function getInvoiceCompanyName(inv: Invoice): string | null {
  return inv.leads?.companies?.name || null;
}

export function computeInvoiceTotals(lineItems: InvoiceLineItem[], taxRate: number) {
  const subtotal_cents = lineItems.reduce((sum, item) => sum + item.qty * item.unit_price_cents, 0);
  const tax_cents = Math.round(subtotal_cents * taxRate);
  const total_cents = subtotal_cents + tax_cents;
  return { subtotal_cents, tax_cents, total_cents };
}

const INVOICE_SELECT = '*, leads(id, name, email, company_id, companies(name))';

export function useInvoices(statusFilter?: InvoiceStatus) {
  return useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(INVOICE_SELECT)
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
        .select(INVOICE_SELECT)
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
      lead_id: string;
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
          lead_id: input.lead_id,
          customer_email: '',
          customer_name: '',
          line_items: input.line_items as any,
          tax_rate: taxRate,
          ...totals,
          currency: input.currency || 'SEK',
          due_date: input.due_date || null,
          deal_id: input.deal_id || null,
          notes: input.notes || null,
          created_by: user?.id || null,
        })
        .select(INVOICE_SELECT)
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
      // Strip joined data before sending to DB
      const { leads, ...dbUpdates } = updates as any;

      // Recompute totals if line_items or tax_rate changed
      let computed = {};
      if (dbUpdates.line_items || dbUpdates.tax_rate !== undefined) {
        const lineItems = dbUpdates.line_items || [];
        const taxRate = dbUpdates.tax_rate ?? 0.25;
        computed = computeInvoiceTotals(lineItems, taxRate);
      }

      const { data, error } = await supabase
        .from('invoices')
        .update({ ...dbUpdates, ...computed } as any)
        .eq('id', id)
        .select(INVOICE_SELECT)
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

/** Hook to fetch leads for the lead picker */
export function useLeadsForPicker() {
  return useQuery({
    queryKey: ['leads-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, company_id, companies(name)')
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as InvoiceLead[];
    },
  });
}
