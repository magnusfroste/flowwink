import { supabase } from '@/integrations/supabase/client';
import type { BrandingSettings } from '@/hooks/useSiteSettings';

export const defaultBranding: BrandingSettings = {
  logo: '',
  logoDark: '',
  favicon: '',
  organizationName: '',
  primaryColor: '220 100% 26%',
  secondaryColor: '210 40% 96%',
  accentColor: '199 89% 48%',
  headingFont: 'PT Serif',
  bodyFont: 'Inter',
  borderRadius: 'md',
  shadowIntensity: 'subtle',
};

/** One reading of the branding row, shared by the theme and branding providers. */
export const brandingQuery = {
  queryKey: ['site-settings', 'branding'] as const,
  queryFn: async (): Promise<BrandingSettings> => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'branding')
      .maybeSingle();

    if (error) throw error;
    return (data?.value as unknown as BrandingSettings) || defaultBranding;
  },
  staleTime: 1000 * 60 * 5,
};
