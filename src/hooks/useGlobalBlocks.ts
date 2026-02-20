import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { GlobalBlock, GlobalBlockSlot, FooterBlockData, FooterLegalLink, HeaderBlockData } from '@/types/cms';
import type { Json } from '@/integrations/supabase/types';

// Default header data
export const defaultHeaderData: HeaderBlockData = {
  variant: 'sticky',
  showLogo: true,
  showNameWithLogo: false,
  logoSize: 'md',
  stickyHeader: true,
  showThemeToggle: true,
  backgroundStyle: 'solid',
  headerShadow: 'sm',
  linkColorScheme: 'default',
  navAlignment: 'right',
  headerHeight: 'default',
  showBorder: true,
  mobileMenuStyle: 'default',
  customNavItems: [],
};

// Header presets for different variants
export const headerVariantPresets: Record<string, Partial<HeaderBlockData>> = {
  clean: {
    variant: 'clean',
    stickyHeader: false,
    backgroundStyle: 'transparent',
    headerShadow: 'none',
    showBorder: false,
    headerHeight: 'tall',
    linkColorScheme: 'contrast',
    mobileMenuStyle: 'fullscreen',
  },
  sticky: {
    variant: 'sticky',
    stickyHeader: true,
    backgroundStyle: 'blur',
    headerShadow: 'sm',
    showBorder: true,
    headerHeight: 'default',
    linkColorScheme: 'default',
    mobileMenuStyle: 'slide',
  },
  'mega-menu': {
    variant: 'mega-menu',
    stickyHeader: true,
    backgroundStyle: 'solid',
    headerShadow: 'md',
    showBorder: true,
    headerHeight: 'tall',
    linkColorScheme: 'default',
    megaMenuEnabled: true,
    megaMenuColumns: 3,
    mobileMenuStyle: 'fullscreen',
  },
};

// Default footer data
export const defaultFooterData: FooterBlockData = {
  variant: 'full',
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
    { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
    { id: 'accessibility', label: 'Accessibility', url: '/accessibility', enabled: true },
  ],
  showComplianceBadges: false,
  complianceBadges: [],
};

// Footer presets for different variants
export const footerVariantPresets: Record<string, Partial<FooterBlockData>> = {
  minimal: {
    variant: 'minimal',
    showBrand: true,
    showQuickLinks: false,
    showContact: false,
    showHours: false,
    sectionOrder: ['brand'],
    legalLinks: [
      { id: 'privacy', label: 'Privacy', url: '/privacy-policy', enabled: true },
    ],
  },
  full: {
    variant: 'full',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: true,
    sectionOrder: ['brand', 'quickLinks', 'contact', 'hours'],
    legalLinks: [
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms of Service', url: '/terms', enabled: true },
    ],
  },
  enterprise: {
    variant: 'enterprise',
    showBrand: true,
    showQuickLinks: true,
    showContact: true,
    showHours: false,
    sectionOrder: ['brand', 'quickLinks', 'contact'],
    showComplianceBadges: true,
    complianceBadges: ['SOC2', 'GDPR', 'ISO27001'],
    legalLinks: [
      { id: 'privacy', label: 'Privacy Policy', url: '/privacy-policy', enabled: true },
      { id: 'terms', label: 'Terms of Service', url: '/terms', enabled: true },
      { id: 'security', label: 'Security', url: '/security', enabled: true },
      { id: 'sla', label: 'SLA', url: '/sla', enabled: true },
    ],
  },
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

// Hook to fetch header block specifically
export function useHeaderBlock() {
  return useGlobalBlock<HeaderBlockData>('header');
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
      logger.error(`Failed to update global block ${slot}:`, error);
    },
  });
}

// Hook to update footer block specifically
export function useUpdateFooterBlock() {
  return useUpdateGlobalBlock<FooterBlockData>('footer');
}

// Hook to update header block specifically
export function useUpdateHeaderBlock() {
  return useUpdateGlobalBlock<HeaderBlockData>('header');
}
