import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface DunningSettings {
  enabled: boolean;
  highValueThresholdCents: number;
  brandName?: string;
  supportEmail?: string;
  updatePaymentUrl?: string;
}

const DEFAULTS: DunningSettings = {
  enabled: false,
  highValueThresholdCents: 50000,
  brandName: '',
  supportEmail: '',
  updatePaymentUrl: '',
};

const KEY = 'dunning';

export function useDunningSettings() {
  return useQuery({
    queryKey: ['site-settings', KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', KEY)
        .maybeSingle();
      if (error) throw error;
      if (!data?.value) return DEFAULTS;
      return { ...DEFAULTS, ...(data.value as Partial<DunningSettings>) };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateDunningSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (settings: DunningSettings) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', KEY)
        .maybeSingle();
      const payload = settings as unknown as Json;
      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ value: payload, updated_at: new Date().toISOString() })
          .eq('key', KEY);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ key: KEY, value: payload });
        if (error) throw error;
      }
      return settings;
    },
    onSuccess: (s) => {
      qc.setQueryData(['site-settings', KEY], s);
      toast({ title: 'Dunning settings saved' });
    },
    onError: (e: any) => {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    },
  });
}
