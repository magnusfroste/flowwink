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

export interface SeoSettings {
  siteTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  ogImage: string;
  twitterHandle: string;
  googleSiteVerification: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

export interface PerformanceSettings {
  lazyLoadImages: boolean;
  prefetchLinks: boolean;
  minifyHtml: boolean;
  enableServiceWorker: boolean;
  imageCacheMaxAge: number;
  cacheStaticAssets: boolean;
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

const defaultSeoSettings: SeoSettings = {
  siteTitle: '',
  titleTemplate: '%s',
  defaultDescription: '',
  ogImage: '',
  twitterHandle: '',
  googleSiteVerification: '',
  robotsIndex: true,
  robotsFollow: true,
};

const defaultPerformanceSettings: PerformanceSettings = {
  lazyLoadImages: true,
  prefetchLinks: true,
  minifyHtml: false,
  enableServiceWorker: false,
  imageCacheMaxAge: 31536000,
  cacheStaticAssets: true,
};

// Generic hook for fetching settings
function useSiteSettings<T>(key: string, defaultValue: T) {
  return useQuery({
    queryKey: ['site-settings', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) throw error;
      return (data?.value as unknown as T) || defaultValue;
    },
    staleTime: 1000 * 60 * 5,
  });
}

// Generic hook for updating settings
function useUpdateSiteSettings<T>(key: string, successMessage: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: T) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', key)
        .maybeSingle();

      const jsonValue = settings as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ 
            value: jsonValue,
            updated_at: new Date().toISOString()
          })
          .eq('key', key);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ 
            key, 
            value: jsonValue
          });

        if (error) throw error;
      }

      return settings;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['site-settings', key], settings);
      toast({
        title: 'Sparat',
        description: successMessage,
      });
    },
    onError: (error) => {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara inställningarna.',
        variant: 'destructive',
      });
      console.error(`Failed to update ${key} settings:`, error);
    },
  });
}

// Footer hooks
export function useFooterSettings() {
  return useSiteSettings<FooterSettings>('footer', defaultFooterSettings);
}

export function useUpdateFooterSettings() {
  return useUpdateSiteSettings<FooterSettings>('footer', 'Footer-inställningarna har uppdaterats.');
}

// SEO hooks
export function useSeoSettings() {
  return useSiteSettings<SeoSettings>('seo', defaultSeoSettings);
}

export function useUpdateSeoSettings() {
  return useUpdateSiteSettings<SeoSettings>('seo', 'SEO-inställningarna har uppdaterats.');
}

// Performance hooks
export function usePerformanceSettings() {
  return useSiteSettings<PerformanceSettings>('performance', defaultPerformanceSettings);
}

export function useUpdatePerformanceSettings() {
  return useUpdateSiteSettings<PerformanceSettings>('performance', 'Prestandainställningarna har uppdaterats.');
}
