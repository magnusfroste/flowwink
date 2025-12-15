import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export type FooterSectionId = 'brand' | 'quickLinks' | 'contact' | 'hours';

export interface FooterLegalLink {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
}

export interface FooterSettings {
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  weekdayHours: string;
  weekendHours: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  // Section visibility
  showBrand?: boolean;
  showQuickLinks?: boolean;
  showContact?: boolean;
  showHours?: boolean;
  // Section order
  sectionOrder?: FooterSectionId[];
  // Legal links
  legalLinks?: FooterLegalLink[];
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
  developmentMode: boolean;
  requireAuthInDevMode: boolean;
}

export interface PerformanceSettings {
  lazyLoadImages: boolean;
  prefetchLinks: boolean;
  minifyHtml: boolean;
  enableServiceWorker: boolean;
  imageCacheMaxAge: number;
  cacheStaticAssets: boolean;
}

export interface BrandingSettings {
  // Identity
  logo?: string;
  logoDark?: string;
  favicon?: string;
  organizationName?: string;
  brandTagline?: string;
  
  // Colors (HSL format)
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  
  // Typography
  headingFont?: string;
  bodyFont?: string;
  
  // Appearance
  borderRadius?: 'none' | 'sm' | 'md' | 'lg';
  shadowIntensity?: 'none' | 'subtle' | 'medium';
  
  // Header display
  showLogoInHeader?: boolean;
  showNameWithLogo?: boolean;
  headerLogoSize?: 'sm' | 'md' | 'lg';
  
  // Theme toggle
  allowThemeToggle?: boolean;
}

const defaultBrandingSettings: BrandingSettings = {
  logo: '',
  logoDark: '',
  favicon: '',
  organizationName: '',
  brandTagline: '',
  primaryColor: '220 100% 26%',
  secondaryColor: '210 40% 96%',
  accentColor: '199 89% 48%',
  headingFont: 'PT Serif',
  bodyFont: 'Inter',
  borderRadius: 'md',
  shadowIntensity: 'subtle',
  showLogoInHeader: true,
  showNameWithLogo: false,
  headerLogoSize: 'md',
  allowThemeToggle: true,
};

const defaultFooterSettings: FooterSettings = {
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

const defaultSeoSettings: SeoSettings = {
  siteTitle: '',
  titleTemplate: '%s',
  defaultDescription: '',
  ogImage: '',
  twitterHandle: '',
  googleSiteVerification: '',
  robotsIndex: true,
  robotsFollow: true,
  developmentMode: false,
  requireAuthInDevMode: false,
};

const defaultPerformanceSettings: PerformanceSettings = {
  lazyLoadImages: true,
  prefetchLinks: true,
  minifyHtml: false,
  enableServiceWorker: false,
  imageCacheMaxAge: 31536000,
  cacheStaticAssets: true,
};

export interface CustomScriptsSettings {
  headStart: string;
  headEnd: string;
  bodyStart: string;
  bodyEnd: string;
}

const defaultCustomScriptsSettings: CustomScriptsSettings = {
  headStart: '',
  headEnd: '',
  bodyStart: '',
  bodyEnd: '',
};

export interface CookieBannerSettings {
  enabled: boolean;
  title: string;
  description: string;
  policyLinkText: string;
  policyLinkUrl: string;
  acceptButtonText: string;
  rejectButtonText: string;
}

const defaultCookieBannerSettings: CookieBannerSettings = {
  enabled: true,
  title: 'Vi använder cookies',
  description: 'Vi använder cookies för att förbättra din upplevelse på webbplatsen, analysera trafik och anpassa innehåll. Genom att klicka på "Acceptera alla" samtycker du till vår användning av cookies.',
  policyLinkText: 'Läs mer om vår integritetspolicy',
  policyLinkUrl: '/integritetspolicy',
  acceptButtonText: 'Acceptera alla',
  rejectButtonText: 'Endast nödvändiga',
};

export interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  message: string;
  expectedEndTime?: string;
}

const defaultMaintenanceSettings: MaintenanceSettings = {
  enabled: false,
  title: 'Webbplatsen är under underhåll',
  message: 'Vi genomför planerat underhåll just nu. Webbplatsen kommer att vara tillgänglig igen inom kort.',
  expectedEndTime: '',
};

// Chat settings
export type ChatAiProvider = 'lovable' | 'local' | 'n8n';

export interface ChatSettings {
  // Grundläggande
  enabled: boolean;
  title: string;
  placeholder: string;
  welcomeMessage: string;
  
  // AI-leverantör
  aiProvider: ChatAiProvider;
  
  // Lovable AI (cloud)
  lovableModel: 'google/gemini-2.5-flash' | 'google/gemini-2.5-pro' | 'openai/gpt-5-mini';
  
  // Local AI (HIPAA-compliant)
  localEndpoint: string;
  localModel: string;
  localApiKey: string;
  
  // N8N Integration
  n8nWebhookUrl: string;
  n8nTriggerMode: 'always' | 'keywords' | 'fallback';
  n8nTriggerKeywords: string[];
  
  // System prompt
  systemPrompt: string;
  
  // Widget-inställningar
  widgetEnabled: boolean;
  widgetPosition: 'bottom-right' | 'bottom-left';
  widgetButtonText: string;
  
  // Landing page
  landingPageEnabled: boolean;
  
  // Block
  blockEnabled: boolean;
  
  // Privacy & Compliance
  saveConversations: boolean;
  anonymizeData: boolean;
  auditLogging: boolean;
  dataRetentionDays: number;
}

const defaultChatSettings: ChatSettings = {
  enabled: false,
  title: 'AI Assistent',
  placeholder: 'Ställ en fråga...',
  welcomeMessage: 'Hej! Hur kan jag hjälpa dig idag?',
  aiProvider: 'lovable',
  lovableModel: 'google/gemini-2.5-flash',
  localEndpoint: '',
  localModel: 'llama3',
  localApiKey: '',
  n8nWebhookUrl: '',
  n8nTriggerMode: 'always',
  n8nTriggerKeywords: [],
  systemPrompt: 'Du är en hjälpsam AI-assistent för en svensk organisation. Svara alltid på svenska om inte användaren skriver på ett annat språk.',
  widgetEnabled: false,
  widgetPosition: 'bottom-right',
  widgetButtonText: 'Chatta med oss',
  landingPageEnabled: false,
  blockEnabled: true,
  saveConversations: true,
  anonymizeData: false,
  auditLogging: true,
  dataRetentionDays: 90,
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

// Branding hooks
export function useBrandingSettings() {
  return useSiteSettings<BrandingSettings>('branding', defaultBrandingSettings);
}

export function useUpdateBrandingSettings() {
  return useUpdateSiteSettings<BrandingSettings>('branding', 'Varumärkesinställningarna har uppdaterats.');
}

// Custom Scripts hooks
export function useCustomScriptsSettings() {
  return useSiteSettings<CustomScriptsSettings>('custom_scripts', defaultCustomScriptsSettings);
}

export function useUpdateCustomScriptsSettings() {
  return useUpdateSiteSettings<CustomScriptsSettings>('custom_scripts', 'Script-inställningarna har uppdaterats.');
}

// Cookie Banner hooks
export function useCookieBannerSettings() {
  return useSiteSettings<CookieBannerSettings>('cookie_banner', defaultCookieBannerSettings);
}

export function useUpdateCookieBannerSettings() {
  return useUpdateSiteSettings<CookieBannerSettings>('cookie_banner', 'Cookie-inställningarna har uppdaterats.');
}

// Maintenance hooks
export function useMaintenanceSettings() {
  return useSiteSettings<MaintenanceSettings>('maintenance', defaultMaintenanceSettings);
}

export function useUpdateMaintenanceSettings() {
  return useUpdateSiteSettings<MaintenanceSettings>('maintenance', 'Underhållsinställningarna har uppdaterats.');
}

// Chat hooks
export function useChatSettings() {
  return useSiteSettings<ChatSettings>('chat', defaultChatSettings);
}

export function useUpdateChatSettings() {
  return useUpdateSiteSettings<ChatSettings>('chat', 'Chat-inställningarna har uppdaterats.');
}
