import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface FooterSettings {
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  weekdayHours: string;
  weekendHours: string;
  brandName: string;
  brandTagline: string;
}

const defaultFooterSettings: FooterSettings = {
  phone: '',
  email: '',
  address: '',
  postalCode: '',
  weekdayHours: '',
  weekendHours: '',
  brandName: '',
  brandTagline: '',
};

export function useFooterSettings() {
  return useQuery({
    queryKey: ['site-settings', 'footer'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'footer')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return defaultFooterSettings;
        }
        throw error;
      }

      return (data?.value as unknown as FooterSettings) || defaultFooterSettings;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateFooterSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: FooterSettings) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'footer')
        .single();

      const jsonValue = settings as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ 
            value: jsonValue,
            updated_at: new Date().toISOString()
          })
          .eq('key', 'footer');

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ 
            key: 'footer', 
            value: jsonValue
          });

        if (error) throw error;
      }

      return settings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['site-settings', 'footer'], settings);
      toast({
        title: 'Sparat',
        description: 'Footer-inställningarna har uppdaterats.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara inställningarna.',
        variant: 'destructive',
      });
      console.error('Failed to update footer settings:', error);
    },
  });
}
