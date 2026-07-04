import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DiscountType = 'percent' | 'fixed';

export interface DiscountCode {
  id: string;
  code: string;
  type: DiscountType;
  /** Percent codes: whole percent (10 = 10%). Fixed codes: amount in cents. */
  value: number;
  currency: string | null;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  use_count: number;
  min_order_cents: number | null;
  created_at: string;
  updated_at: string;
}

export interface DiscountCodeInput {
  code: string;
  type: DiscountType;
  value: number;
  currency?: string | null;
  active?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  max_uses?: number | null;
  min_order_cents?: number | null;
}

// discount_codes is not in the generated Supabase types yet — same pattern
// as other recently added tables (see useA2A.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const discountCodesTable = () => supabase.from('discount_codes' as any);

export function useDiscountCodes() {
  return useQuery({
    queryKey: ['discount-codes'],
    queryFn: async () => {
      const { data, error } = await discountCodesTable()
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as DiscountCode[];
    },
  });
}

export function useCreateDiscountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DiscountCodeInput) => {
      const { data, error } = await discountCodesTable()
        .insert({
          ...input,
          code: input.code.trim(),
          currency: input.type === 'fixed' ? (input.currency || 'SEK').toUpperCase() : null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as DiscountCode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success('Discount code created');
    },
    onError: (error: Error & { code?: string }) => {
      logger.error('Create discount code error:', error);
      toast.error(
        error.message?.includes('discount_codes_code_lower_key')
          ? 'A code with that name already exists'
          : 'Could not create discount code'
      );
    },
  });
}

export function useUpdateDiscountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DiscountCodeInput> & { id: string }) => {
      const { data, error } = await discountCodesTable()
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as DiscountCode;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success('Discount code updated');
    },
    onError: (error) => {
      logger.error('Update discount code error:', error);
      toast.error('Could not update discount code');
    },
  });
}

export function useDeleteDiscountCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await discountCodesTable().delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success('Discount code deleted');
    },
    onError: (error) => {
      logger.error('Delete discount code error:', error);
      toast.error('Could not delete discount code');
    },
  });
}
