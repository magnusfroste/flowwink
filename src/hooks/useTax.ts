import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TaxCode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  locale: string;
  tax_type: 'sale' | 'purchase' | 'none';
  computation: 'percent' | 'fixed' | 'group' | 'none';
  rate_pct: number;
  output_account_code: string | null;
  input_account_code: string | null;
  price_include: boolean;
  is_reverse_charge: boolean;
  is_eu: boolean;
  is_active: boolean;
  sequence: number;
}

export interface TaxGrid {
  id: string;
  code: string;
  name: string;
  description: string | null;
  locale: string;
  category: 'output' | 'input' | 'base' | 'adjustment' | 'info';
  sequence: number;
  is_active: boolean;
}

export interface VatReportRow {
  grid_code: string;
  grid_name: string;
  category: string;
  amount_cents: number;
}

export function useTaxCodes(locale: string = 'SE') {
  return useQuery({
    queryKey: ['tax_codes', locale],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_codes' as any)
        .select('*')
        .eq('locale', locale)
        .order('sequence');
      if (error) throw error;
      return data as unknown as TaxCode[];
    },
  });
}

export function useTaxGrids(locale: string = 'SE') {
  return useQuery({
    queryKey: ['tax_grids', locale],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_grids' as any)
        .select('*')
        .eq('locale', locale)
        .eq('is_active', true)
        .order('sequence');
      if (error) throw error;
      return data as unknown as TaxGrid[];
    },
  });
}

export function useUpdateTaxCode() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: Partial<TaxCode> & { id: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase
        .from('tax_codes' as any)
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax_codes'] });
      toast({ title: 'Tax code updated' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useVatReport(year: number, startMonth: number, endMonth?: number) {
  return useQuery({
    queryKey: ['vat_report', year, startMonth, endMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculate_vat_report' as any, {
        p_year: year,
        p_start_month: startMonth,
        p_end_month: endMonth ?? null,
      });
      if (error) throw error;
      return (data || []) as unknown as VatReportRow[];
    },
  });
}
