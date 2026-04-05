import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { computeInvoiceTotals, type InvoiceLineItem, type InvoiceLead } from '@/hooks/useInvoices';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface Quote {
  id: string;
  quote_number: string;
  lead_id: string | null;
  deal_id: string | null;
  invoice_id: string | null;
  status: QuoteStatus;
  line_items: InvoiceLineItem[];
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  valid_until: string | null;
  notes: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  leads: InvoiceLead | null;
}

export function getQuoteCustomerName(q: Quote): string {
  return q.leads?.name || '—';
}

export function getQuoteCustomerEmail(q: Quote): string {
  return q.leads?.email || '';
}

export function getQuoteCompanyName(q: Quote): string | null {
  return q.leads?.companies?.name || null;
}

const QUOTE_SELECT = '*, leads(id, name, email, company_id, companies(name))';

export function useQuotes(statusFilter?: QuoteStatus) {
  return useQuery({
    queryKey: ['quotes', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('quotes')
        .select(QUOTE_SELECT)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Quote[];
    },
  });
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['quote', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('quotes')
        .select(QUOTE_SELECT)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as Quote;
    },
    enabled: !!id,
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      lead_id: string;
      line_items?: InvoiceLineItem[];
      tax_rate?: number;
      currency?: string;
      valid_until?: string;
      deal_id?: string;
      notes?: string;
    }) => {
      const taxRate = input.tax_rate ?? 0.25;
      const lineItems = input.line_items || [{ description: '', qty: 1, unit_price_cents: 0 }];
      const totals = computeInvoiceTotals(lineItems, taxRate);

      const { count } = await supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true });
      const nextNum = (count || 0) + 1;
      const quote_number = `QUO-${String(nextNum).padStart(4, '0')}`;

      const { data, error } = await supabase
        .from('quotes')
        .insert({
          quote_number,
          lead_id: input.lead_id,
          line_items: lineItems as any,
          tax_rate: taxRate,
          ...totals,
          currency: input.currency || 'SEK',
          valid_until: input.valid_until || null,
          deal_id: input.deal_id || null,
          notes: input.notes || null,
          created_by: user?.id || null,
        } as any)
        .select(QUOTE_SELECT)
        .single();

      if (error) throw error;
      return data as unknown as Quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote created');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Quote> & { id: string }) => {
      const { leads, ...dbUpdates } = updates as any;

      let computed = {};
      if (dbUpdates.line_items || dbUpdates.tax_rate !== undefined) {
        const lineItems = dbUpdates.line_items || [];
        const taxRate = dbUpdates.tax_rate ?? 0.25;
        computed = computeInvoiceTotals(lineItems, taxRate);
      }

      const { data, error } = await supabase
        .from('quotes')
        .update({ ...dbUpdates, ...computed } as any)
        .eq('id', id)
        .select(QUOTE_SELECT)
        .single();

      if (error) throw error;
      return data as unknown as Quote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote', data.id] });
      toast.success('Quote updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Quote deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Convert an accepted quote into an invoice */
export function useConvertQuoteToInvoice() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (quote: Quote) => {
      // Generate invoice number
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });
      const nextNum = (count || 0) + 1;
      const invoice_number = `INV-${String(nextNum).padStart(4, '0')}`;

      // Create invoice from quote
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          invoice_number,
          lead_id: quote.lead_id,
          deal_id: quote.deal_id,
          customer_email: '',
          customer_name: '',
          line_items: quote.line_items as any,
          tax_rate: quote.tax_rate,
          subtotal_cents: quote.subtotal_cents,
          tax_cents: quote.tax_cents,
          total_cents: quote.total_cents,
          currency: quote.currency,
          notes: quote.notes,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (invError) throw invError;

      // Link invoice back to quote
      const { error: linkError } = await supabase
        .from('quotes')
        .update({ invoice_id: invoice.id } as any)
        .eq('id', quote.id);

      if (linkError) throw linkError;

      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice created from quote');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
