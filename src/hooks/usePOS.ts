import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PosRegister {
  id: string;
  name: string;
  location: string | null;
  currency: string;
  default_tax_rate: number;
  active: boolean;
}

export interface PosSession {
  id: string;
  register_id: string;
  cashier_name: string | null;
  status: 'open' | 'closed';
  opening_cash_cents: number;
  closing_cash_cents: number | null;
  cash_variance_cents: number | null;
  total_sales_cents: number;
  sales_count: number;
  opened_at: string;
  closed_at: string | null;
}

export interface PosSale {
  id: string;
  receipt_number: string | null;
  register_id: string;
  total_cents: number;
  tip_cents: number;
  currency: string;
  payment_method: string;
  status: string;
  created_at: string;
  customer_email: string | null;
}

export interface PosSaleLine {
  product_id?: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents?: number;
  tax_rate?: number;
}

export function useRegisters() {
  return useQuery({
    queryKey: ['pos-registers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_registers')
        .select('*')
        .eq('active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as PosRegister[];
    },
  });
}

export function useOpenSession(registerId: string | undefined) {
  return useQuery({
    queryKey: ['pos-open-session', registerId],
    enabled: !!registerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_sessions')
        .select('*')
        .eq('register_id', registerId!)
        .eq('status', 'open')
        .maybeSingle();
      if (error) throw error;
      return data as PosSession | null;
    },
  });
}

export function useTodaySales() {
  return useQuery({
    queryKey: ['pos-today-sales'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('pos_sales')
        .select('total_cents, payment_method, currency')
        .gte('created_at', start.toISOString())
        .eq('status', 'completed');
      if (error) throw error;
      const total = (data ?? []).reduce((s, r: any) => s + (r.total_cents ?? 0), 0);
      return { total_cents: total, count: data?.length ?? 0, currency: data?.[0]?.currency ?? 'SEK' };
    },
    refetchInterval: 30_000,
  });
}

export function useRecentSales(limit = 20) {
  return useQuery({
    queryKey: ['pos-recent-sales', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_sales')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PosSale[];
    },
    refetchInterval: 30_000,
  });
}

export function useOpenSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { register_id: string; opening_cash_cents: number; cashier_name?: string }) => {
      const { data, error } = await supabase.rpc('open_pos_session', {
        p_register_id: params.register_id,
        p_opening_cash_cents: params.opening_cash_cents,
        p_cashier_name: params.cashier_name ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-open-session'] });
      toast.success('Session opened');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
}

export function useCloseSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { session_id: string; closing_cash_cents: number }) => {
      const { data, error } = await supabase.rpc('close_pos_session', {
        p_session_id: params.session_id,
        p_closing_cash_cents: params.closing_cash_cents,
      });
      if (error) throw error;
      return data as { variance_cents: number; expected_cash_cents: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-open-session'] });
      const v = data.variance_cents;
      if (v === 0) toast.success('Session closed — cash matches!');
      else toast.warning(`Session closed — variance ${(v / 100).toFixed(2)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
}

export interface PosPayment {
  method: 'cash' | 'card' | 'swish' | 'klarna' | 'gift_card' | 'invoice' | 'other';
  amount_cents: number;
  reference?: string;
}

export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      register_id: string;
      session_id?: string;
      lines: PosSaleLine[];
      payments: PosPayment[];
      customer_email?: string;
      discount_cents?: number;
    }) => {
      const { data, error } = await supabase.rpc('record_pos_sale_v2' as any, {
        p_register_id: params.register_id,
        p_session_id: params.session_id ?? null,
        p_lines: params.lines as any,
        p_payments: params.payments as any,
        p_customer_email: params.customer_email ?? null,
        p_discount_cents: params.discount_cents ?? 0,
      });
      if (error) throw error;
      return data as { sale_id: string; receipt_number: string; total_cents: number; change_cents: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-today-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-open-session'] });
      const change = data.change_cents > 0 ? ` (change ${(data.change_cents / 100).toFixed(2)})` : '';
      toast.success(`Sale ${data.receipt_number} — ${(data.total_cents / 100).toFixed(2)}${change}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Sale failed'),
  });
}

export function useAddTip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sale_id: string; tip_cents: number; method: string }) => {
      const { data, error } = await supabase.rpc('add_tip' as any, {
        p_sale_id: params.sale_id,
        p_tip_cents: params.tip_cents,
        p_method: params.method,
      });
      if (error) throw error;
      return data as { success: boolean; sale_id: string; tip_cents: number; grand_total_cents: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-today-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-open-session'] });
      toast.success(`Tip added — grand total ${(data.grand_total_cents / 100).toFixed(2)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to add tip'),
  });
}

export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { session_id: string; closing_cash_cents: number; notes?: string }) => {
      const { data, error } = await supabase.rpc('close_pos_session_v2' as any, {
        p_session_id: params.session_id,
        p_closing_cash_cents: params.closing_cash_cents,
        p_notes: params.notes ?? null,
      });
      if (error) throw error;
      return data as { variance_cents: number; expected_cash_cents: number; z_report: any };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-open-session'] });
      const v = data.variance_cents;
      if (v === 0) toast.success('Session closed — cash matches!');
      else toast.warning(`Session closed — variance ${(v / 100).toFixed(2)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });
}

export interface PosProduct {
  id: string;
  name: string;
  barcode: string | null;
  price_cents: number;
  currency: string;
  image_url: string | null;
  stock_quantity: number | null;
}

export function usePosProducts(search: string) {
  return useQuery({
    queryKey: ['pos-products', search],
    queryFn: async () => {
      const s = search.trim();
      const builder = supabase
        .from('products')
        .select('id, name, barcode, price_cents, currency, image_url, stock_quantity')
        .eq('available_in_pos', true)
        .eq('is_active', true);
      const filtered = s
        ? builder.or(`name.ilike.%${s}%,barcode.eq.${s}`)
        : builder;
      const { data, error } = await filtered.order('name').limit(40);
      if (error) throw error;
      return ((data ?? []) as unknown) as PosProduct[];
    },
  });
}

export interface PosSaleLineRow {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number | null;
  tax_rate: number | null;
  line_total_cents: number;
}

export function useSaleLines(saleId: string | undefined) {
  return useQuery({
    queryKey: ['pos-sale-lines', saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pos_sale_lines')
        .select('*')
        .eq('sale_id', saleId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as PosSaleLineRow[];
    },
  });
}

export function useRefundSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      sale_id: string;
      lines: Array<{ sale_line_id: string; quantity: number }> | null;
      reason?: string;
      method?: string;
      session_id?: string;
    }) => {
      const { data, error } = await supabase.rpc('refund_pos_sale' as any, {
        p_sale_id: params.sale_id,
        p_lines: (params.lines as any) ?? null,
        p_reason: params.reason ?? null,
        p_method: params.method ?? null,
        p_session_id: params.session_id ?? null,
      });
      if (error) throw error;
      return data as { refund_sale_id: string; receipt_number: string; refund_total_cents: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-today-sales'] });
      const r = (data as any)?.receipt_number ?? (data as any)?.refund_receipt ?? 'refund';
      toast.success(`Refund issued — ${r}`);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Refund failed'),
  });
}

export function useRenderReceipt(saleId: string | undefined) {
  return useQuery({
    queryKey: ['pos-receipt', saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('render_pos_receipt' as any, { p_sale_id: saleId! });
      if (error) throw error;
      return data as any;
    },
  });
}

export function useCreateInvoiceFromSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { sale_id: string; customer_name?: string; customer_email?: string }) => {
      const { data, error } = await supabase.rpc('pos_sale_to_invoice' as any, {
        p_sale_id: params.sale_id,
        p_customer_name: params.customer_name ?? null,
        p_customer_email: params.customer_email ?? null,
      });
      if (error) throw error;
      return data as { invoice_id: string; invoice_number: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      const n = (data as any)?.invoice_number ?? 'invoice';
      toast.success(`Invoice ${n} created`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateRegisterReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { register_id: string; receipt_header?: string | null; receipt_footer?: string | null }) => {
      const { error } = await supabase
        .from('pos_registers')
        .update({
          receipt_header: params.receipt_header ?? null,
          receipt_footer: params.receipt_footer ?? null,
        } as any)
        .eq('id', params.register_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos-registers'] });
      toast.success('Receipt template saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Imperative barcode/name lookup — returns first match or null. */
export async function lookupPosProduct(query: string): Promise<PosProduct | null> {
  const q = query.trim();
  if (!q) return null;
  const { data, error } = await supabase
    .from('products')
    .select('id, name, barcode, price_cents, currency, image_url, stock_quantity')
    .eq('available_in_pos', true)
    .eq('is_active', true)
    .or(`barcode.eq.${q},name.ilike.%${q}%`)
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as unknown as PosProduct) ?? null;
}

