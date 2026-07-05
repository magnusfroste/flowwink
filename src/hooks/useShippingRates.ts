import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ShippingRate {
  id: string;
  carrier_id: string;
  name: string;
  min_weight_grams: number;
  max_weight_grams: number | null;
  price_cents: number;
  currency: string;
  dim_divisor?: number | null;
}

export interface CarrierLite {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface CalcRateResult {
  success: boolean;
  price_cents?: number;
  currency?: string;
  billable_grams?: number;
  billed_on?: 'actual' | 'dimensional';
  matched_rate_id?: string;
  matched_rate_name?: string;
  reason?: string;
}

export function useShippingRates() {
  return useQuery({
    queryKey: ['shipping_rates'],
    queryFn: async (): Promise<ShippingRate[]> => {
      const { data, error } = await supabase.rpc('manage_shipping_rate' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      const rows = (data as any)?.rates ?? (data as any)?.shipping_rates ?? (data as any) ?? [];
      return rows as ShippingRate[];
    },
  });
}

export function useCarriersList() {
  return useQuery({
    queryKey: ['carriers_list_rpc'],
    queryFn: async (): Promise<CarrierLite[]> => {
      const { data, error } = await supabase.rpc('manage_carrier' as any, {
        p_action: 'list',
      });
      if (error) throw error;
      const rows = (data as any)?.carriers ?? (data as any) ?? [];
      return rows as CarrierLite[];
    },
  });
}

interface UpsertInput {
  p_rate_id?: string | null;
  p_carrier_id: string;
  p_name: string;
  p_min_weight_grams: number;
  p_max_weight_grams?: number | null;
  p_price_cents: number;
  p_currency?: string;
  p_dim_divisor?: number | null;
}

export function useCreateShippingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertInput) => {
      const { data, error } = await supabase.rpc('manage_shipping_rate' as any, {
        p_action: 'create',
        p_carrier_id: input.p_carrier_id,
        p_name: input.p_name,
        p_min_weight_grams: input.p_min_weight_grams,
        p_max_weight_grams: input.p_max_weight_grams ?? null,
        p_price_cents: input.p_price_cents,
        p_currency: input.p_currency ?? 'SEK',
        p_dim_divisor: input.p_dim_divisor ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping_rates'] });
      toast.success('Rate created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateShippingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertInput & { p_rate_id: string }) => {
      const { data, error } = await supabase.rpc('manage_shipping_rate' as any, {
        p_action: 'update',
        p_rate_id: input.p_rate_id,
        p_carrier_id: input.p_carrier_id,
        p_name: input.p_name,
        p_min_weight_grams: input.p_min_weight_grams,
        p_max_weight_grams: input.p_max_weight_grams ?? null,
        p_price_cents: input.p_price_cents,
        p_currency: input.p_currency ?? 'SEK',
        p_dim_divisor: input.p_dim_divisor ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping_rates'] });
      toast.success('Rate updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteShippingRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rateId: string) => {
      const { data, error } = await supabase.rpc('manage_shipping_rate' as any, {
        p_action: 'delete',
        p_rate_id: rateId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping_rates'] });
      toast.success('Rate deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function calcShippingRate(input: {
  p_carrier_id: string;
  p_weight_grams: number;
  p_length_cm?: number | null;
  p_width_cm?: number | null;
  p_height_cm?: number | null;
  p_dim_divisor?: number | null;
}): Promise<CalcRateResult> {
  const args: Record<string, any> = {
    p_carrier_id: input.p_carrier_id,
    p_weight_grams: input.p_weight_grams,
  };
  if (input.p_length_cm != null) args.p_length_cm = input.p_length_cm;
  if (input.p_width_cm != null) args.p_width_cm = input.p_width_cm;
  if (input.p_height_cm != null) args.p_height_cm = input.p_height_cm;
  if (input.p_dim_divisor != null) args.p_dim_divisor = input.p_dim_divisor;
  const { data, error } = await supabase.rpc('calc_shipping_rate' as any, args);
  if (error) throw error;
  return data as CalcRateResult;
}
