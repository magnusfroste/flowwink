import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { GlobalBlock, GlobalBlockSlot, FooterBlockData, FooterLegalLink } from '@/types/cms';
import type { Json } from '@/integrations/supabase/types';

// Default footer data
export const defaultFooterData: FooterBlockData = {
  phone: '',
  email: '',
  address: '',
  postalCode: '',
  weekdayHours: '',
  weekendHours: '',
  facebook: '',
  instagram: '',
  linkedin: '',
  twitter: '',
  youtube: '',
  showBrand: true,
  showQuickLinks: true,
  showContact: true,
  showHours: true,
  sectionOrder: ['brand', 'quickLinks', 'contact', 'hours'],
  legalLinks: [
    { id: 'privacy', label: 'Integritetspolicy', url: '/integritetspolicy', enabled: true },
    { id: 'accessibility', label: 'Tillgänglighet', url: '/tillganglighet', enabled: true },
  ],
};

// Hook to fetch a global block by slot
export function useGlobalBlock<T = Record<string, unknown>>(slot: GlobalBlockSlot) {
  return useQuery({
    queryKey: ['global-blocks', slot],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_blocks')
        .select('*')
        .eq('slot', slot)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) return null;
      
      return {
        ...data,
        data: data.data as T,
      } as GlobalBlock & { data: T };
    },
    staleTime: 1000 * 60 * 5,
  });
}

// Hook to fetch footer block specifically
export function useFooterBlock() {
  return useGlobalBlock<FooterBlockData>('footer');
}

// Hook to update a global block
export function useUpdateGlobalBlock<T = Record<string, unknown>>(slot: GlobalBlockSlot) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (blockData: T) => {
      const { data: existing } = await supabase
        .from('global_blocks')
        .select('id')
        .eq('slot', slot)
        .maybeSingle();

      const jsonData = blockData as unknown as Json;

      if (existing) {
        const { data, error } = await supabase
          .from('global_blocks')
          .update({ 
            data: jsonData,
            updated_at: new Date().toISOString(),
          })
          .eq('slot', slot)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('global_blocks')
          .insert({ 
            slot,
            type: slot, // Use slot as type for now
            data: jsonData,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['global-blocks', slot] });
      toast({
        title: 'Saved',
        description: 'Global block updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to save global block.',
        variant: 'destructive',
      });
      console.error(`Failed to update global block ${slot}:`, error);
    },
  });
}

// Hook to update footer block specifically
export function useUpdateFooterBlock() {
  return useUpdateGlobalBlock<FooterBlockData>('footer');
}
