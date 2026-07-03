import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { applyPricelistToLineItems } from '@/lib/pricelist-resolver';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceLineItem {
  description: string;
  qty: number;
  unit_price_cents: number;
  /** Optional product reference — enables automatic pricelist lookup */
  product_id?: string | null;
  /** When true, skip pricelist resolution (sales rep set price manually) */
  unit_price_locked?: boolean;
  /** Audit: which pricelist supplied this price (set by resolver) */
  pricelist_id?: string | null;
  /** Audit: 'pricelist' | 'product_base' | 'manual' */
  price_source?: 'pricelist' | 'product_base' | 'manual' | null;
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
  paid_amount_cents: number;
  invoice_type: 'invoice' | 'credit_note';
  credited_invoice_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  leads: InvoiceLead | null;
}

export interface CreditNote {
  id: string;
  invoice_number: string;
  total_cents: number;
  currency: string;
  notes: string | null;
  issue_date: string;
  created_at: string;
}

export interface ArAgingCustomer {
  customer_name: string;
  customer_email: string;
  lead_id: string | null;
  currency: string;
  current_cents: number;
  overdue_1_30_cents: number;
  overdue_31_60_cents: number;
  overdue_61_90_cents: number;
  overdue_90_plus_cents: number;
  total_outstanding_cents: number;
  invoice_count: number;
}

export interface ArAgingReport {
  success: boolean;
  as_of: string;
  buckets: {
    current_cents: number;
    overdue_1_30_cents: number;
    overdue_31_60_cents: number;
    overdue_61_90_cents: number;
    overdue_90_plus_cents: number;
    total_outstanding_cents: number;
  };
  customers: ArAgingCustomer[];
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
        // Credit notes are their own document type — shown on the originating
        // invoice's detail view, not mixed into the main invoice list.
        .eq('invoice_type', 'invoice')
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

      // Resolve customer context for pricelist lookup
      const { data: leadCtx } = await supabase
        .from('leads')
        .select('company_id')
        .eq('id', input.lead_id)
        .maybeSingle();

      const pricedLines = await applyPricelistToLineItems(input.line_items, {
        lead_id: input.lead_id,
        company_id: leadCtx?.company_id ?? null,
        currency: input.currency || 'SEK',
      });

      const totals = computeInvoiceTotals(pricedLines, taxRate);

      // Gapless, race-safe invoice number (atomic counter, never reused on delete).
      const { data: invoice_number, error: numErr } = await supabase
        .rpc('next_document_number', { p_kind: 'invoice', p_prefix: 'INV' });
      if (numErr || !invoice_number) throw numErr ?? new Error('Could not allocate invoice number');

      const { data, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number,
          lead_id: input.lead_id,
          customer_email: '',
          customer_name: '',
          line_items: pricedLines as any,
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

      // Recompute totals if line_items or tax_rate changed; resolve pricelist if lines changed.
      let computed = {};
      if (dbUpdates.line_items || dbUpdates.tax_rate !== undefined) {
        // A tax-only update MUST recompute from the EXISTING line items — never
        // default to [] or the invoice total silently zeroes out.
        const { data: current } = await supabase
          .from('invoices')
          .select('lead_id, currency, tax_rate, line_items, leads(company_id)')
          .eq('id', id)
          .maybeSingle();

        let lineItems = dbUpdates.line_items ?? (current as any)?.line_items ?? [];
        if (dbUpdates.line_items) {
          lineItems = await applyPricelistToLineItems(lineItems, {
            lead_id: (current as any)?.lead_id ?? null,
            company_id: (current as any)?.leads?.company_id ?? null,
            currency: dbUpdates.currency || (current as any)?.currency || 'SEK',
          });
          dbUpdates.line_items = lineItems;
        }
        const taxRate = dbUpdates.tax_rate ?? (current as any)?.tax_rate ?? 0.25;
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

/** Credit notes already issued against a given invoice (credited_invoice_id = invoiceId) */
export function useCreditNotesForInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['credit-notes', invoiceId],
    queryFn: async () => {
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_cents, currency, notes, issue_date, created_at')
        .eq('credited_invoice_id', invoiceId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CreditNote[];
    },
    enabled: !!invoiceId,
  });
}

/** Issue a credit note (full or partial) against an invoice via the create_credit_note RPC */
export function useCreateCreditNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { invoice_id: string; reason?: string; amount_cents?: number }) => {
      const { data, error } = await supabase.rpc('create_credit_note', {
        p_invoice_id: input.invoice_id,
        p_reason: input.reason || null,
        p_amount_cents: input.amount_cents ?? null,
      });
      if (error) throw error;
      return data as { success: boolean; credit_note_id: string; credit_note_number: string; kind: 'full' | 'partial' };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoice_id] });
      queryClient.invalidateQueries({ queryKey: ['credit-notes', variables.invoice_id] });
      toast.success(`Credit note ${data.credit_note_number} issued`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Record a manual payment (cash/Swish/card, no bank transaction) via record_invoice_payment RPC */
export function useRecordInvoicePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { invoice_id: string; amount_cents: number; method?: string; paid_at?: string }) => {
      const { data, error } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: input.invoice_id,
        p_amount_cents: input.amount_cents,
        p_method: input.method || 'manual',
        p_paid_at: input.paid_at || new Date().toISOString(),
      });
      if (error) throw error;
      return data as { success: boolean; paid_amount_cents: number; remaining_cents: number; fully_paid: boolean; status: string };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoice_id] });
      toast.success(data.fully_paid ? 'Payment recorded — invoice fully paid' : 'Payment recorded');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

/** AR aging report: open invoices bucketed per customer by days overdue */
export function useArAgingReport(asOf?: string) {
  return useQuery({
    queryKey: ['ar-aging-report', asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ar_aging_report' as any, { p_as_of: asOf || null });
      if (error) throw error;
      return data as unknown as ArAgingReport;
    },
  });
}
