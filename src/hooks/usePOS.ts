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

export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      register_id: string;
      session_id?: string;
      lines: PosSaleLine[];
      payment_method: string;
      customer_email?: string;
      discount_cents?: number;
    }) => {
      const { data, error } = await supabase.rpc('record_pos_sale', {
        p_register_id: params.register_id,
        p_session_id: params.session_id ?? null,
        p_lines: params.lines as any,
        p_payment_method: params.payment_method,
        p_customer_email: params.customer_email ?? null,
        p_discount_cents: params.discount_cents ?? 0,
      });
      if (error) throw error;
      return data as { sale_id: string; receipt_number: string; total_cents: number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-today-sales'] });
      qc.invalidateQueries({ queryKey: ['pos-open-session'] });
      toast.success(`Sale ${data.receipt_number} — ${(data.total_cents / 100).toFixed(2)}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Sale failed'),
  });
}
