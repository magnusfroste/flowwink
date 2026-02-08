import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';


export interface GeneralSettings {
  homepageSlug: string;
  selectedTemplate?: string;
}

const defaultGeneralSettings: GeneralSettings = {
  homepageSlug: 'hem',
};

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
  // Edge caching
  enableEdgeCaching: boolean;
  edgeCacheTtlMinutes: number;
}

export interface BrandingSettings {
  // Identity
  logo?: string;
  logoDark?: string;
  favicon?: string;
  organizationName?: string;
  brandTagline?: string;
  
  // Admin panel branding
  adminName?: string;
  
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
  heroOverlayOpacity?: 'none' | 'light' | 'medium' | 'strong';
  
  // Header display
  showLogoInHeader?: boolean;
  showNameWithLogo?: boolean;
  headerLogoSize?: 'sm' | 'md' | 'lg';
  
  // Theme toggle
  allowThemeToggle?: boolean;
  defaultTheme?: 'light' | 'dark' | 'system';
}

const defaultBrandingSettings: BrandingSettings = {
  logo: '',
  logoDark: '',
  favicon: '',
  organizationName: '',
  brandTagline: '',
  adminName: '', // Empty default - shows as "CMS" when not configured
  primaryColor: '220 100% 26%',
  secondaryColor: '210 40% 96%',
  accentColor: '199 89% 48%',
  headingFont: 'PT Serif',
  bodyFont: 'Inter',
  borderRadius: 'md',
  shadowIntensity: 'subtle',
  heroOverlayOpacity: 'medium',
  showLogoInHeader: true,
  showNameWithLogo: false,
  headerLogoSize: 'md',
  allowThemeToggle: true,
  defaultTheme: 'light',
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
  enableEdgeCaching: false,
  edgeCacheTtlMinutes: 5,
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
  title: 'We use cookies',
  description: 'We use cookies to improve your experience on our website, analyze traffic, and personalize content. By clicking "Accept all", you consent to our use of cookies.',
  policyLinkText: 'Read our Privacy Policy',
  policyLinkUrl: '/privacy-policy',
  acceptButtonText: 'Accept all',
  rejectButtonText: 'Essential only',
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
export type ChatAiProvider = 'openai' | 'gemini' | 'local' | 'n8n';
export type ChatWidgetStyle = 'floating' | 'pill' | 'expanded';
export type ChatWidgetSize = 'sm' | 'md' | 'lg';

export interface ChatSettings {
  // Grundläggande
  enabled: boolean;
  title: string;
  placeholder: string;
  welcomeMessage: string;
  
  // AI-leverantör
  aiProvider: ChatAiProvider;
  
  // OpenAI (model selection only - keys managed via integrations)
  openaiModel: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
  openaiBaseUrl: string;
  
  // Google Gemini (model selection only - keys managed via integrations)
  geminiModel: 'gemini-2.0-flash-exp' | 'gemini-1.5-pro' | 'gemini-1.5-flash';
  
  // Local AI - endpoint config (keys managed via integrations or Supabase secrets)
  localEndpoint: string;
  localModel: string;
  
  // N8N Integration - webhook config (keys managed via integrations or Supabase secrets)
  n8nWebhookUrl: string;
  n8nWebhookType: 'chat' | 'generic';
  n8nTriggerMode: 'always' | 'keywords' | 'fallback';
  n8nTriggerKeywords: string[];
  
  // System prompt
  systemPrompt: string;
  
  // Tool Calling (Agentic AI)
  toolCallingEnabled: boolean;
  firecrawlSearchEnabled: boolean;
  humanHandoffEnabled: boolean;
  sentimentDetectionEnabled: boolean;
  sentimentThreshold: number; // 0-10, triggers handoff when exceeded
  localSupportsToolCalling: boolean; // Whether local AI supports OpenAI-compatible tool calling
  
  // General Knowledge
  allowGeneralKnowledge: boolean; // Allow AI to use its own knowledge beyond page content
  
  // Widget-inställningar
  widgetEnabled: boolean;
  widgetPosition: 'bottom-right' | 'bottom-left';
  widgetButtonText: string;
  widgetStyle: ChatWidgetStyle;
  widgetSize: ChatWidgetSize;
  widgetMaxPrompts: number;
  widgetShowOnMobile: boolean;
  
  // Landing page
  landingPageEnabled: boolean;
  
  // Block
  blockEnabled: boolean;
  
  // Privacy & Compliance
  saveConversations: boolean;
  anonymizeData: boolean;
  auditLogging: boolean;
  dataRetentionDays: number;
  
  // Knowledge Base (CAG)
  includeContentAsContext: boolean;
  contentContextMaxTokens: number;
  includedPageSlugs: string[];
  
  // KB Articles in context
  includeKbArticles: boolean;
  
  // Context indicator
  showContextIndicator: boolean;
  
  // Feedback
  feedbackEnabled: boolean;
  
  // Suggested prompts (shown in empty state)
  suggestedPrompts: string[];
  
  // Live agent indicator settings
  showLiveAgentBanner: boolean; // Show "You are now chatting with a live agent" banner
  liveAgentIconStyle: 'avatar' | 'person' | 'headphones'; // What to show instead of robot icon
  
  // Chat appearance
  showChatIcons: boolean; // Show avatars/icons in chat messages
}

const defaultChatSettings: ChatSettings = {
  enabled: false,
  title: 'AI Assistent',
  placeholder: 'Ställ en fråga...',
  welcomeMessage: 'Hej! Hur kan jag hjälpa dig idag?',
  aiProvider: 'openai',
  openaiModel: 'gpt-4o-mini',
  openaiBaseUrl: 'https://api.openai.com/v1',
  geminiModel: 'gemini-2.0-flash-exp',
  localEndpoint: '',
  localModel: 'llama3',
  n8nWebhookUrl: '',
  n8nWebhookType: 'chat',
  n8nTriggerMode: 'always',
  n8nTriggerKeywords: [],
  systemPrompt: 'Du är en hjälpsam AI-assistent för en svensk organisation. Svara alltid på svenska om inte användaren skriver på ett annat språk.',
  toolCallingEnabled: false,
  firecrawlSearchEnabled: false,
  humanHandoffEnabled: false,
  sentimentDetectionEnabled: true,
  sentimentThreshold: 7,
  localSupportsToolCalling: false,
  allowGeneralKnowledge: false,
  widgetEnabled: false,
  widgetPosition: 'bottom-right',
  widgetButtonText: 'Chatta med oss',
  widgetStyle: 'floating',
  widgetSize: 'md',
  widgetMaxPrompts: 3,
  widgetShowOnMobile: true,
  landingPageEnabled: false,
  blockEnabled: true,
  saveConversations: true,
  anonymizeData: false,
  auditLogging: true,
  dataRetentionDays: 90,
  includeContentAsContext: false,
  contentContextMaxTokens: 50000,
  includedPageSlugs: [],
  includeKbArticles: false,
  showContextIndicator: true,
  feedbackEnabled: true,
  suggestedPrompts: [
    'What can you help me with?',
    'Tell me about your services',
    'How do I book an appointment?',
  ],
  showLiveAgentBanner: true,
  liveAgentIconStyle: 'avatar',
  showChatIcons: true,
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
        title: 'Saved',
        description: successMessage,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Could not save settings.',
        variant: 'destructive',
      });
      console.error(`Failed to update ${key} settings:`, error);
    },
  });
}


// SEO hooks
export function useSeoSettings() {
  return useSiteSettings<SeoSettings>('seo', defaultSeoSettings);
}

export function useUpdateSeoSettings() {
  return useUpdateSiteSettings<SeoSettings>('seo', 'SEO settings have been updated.');
}

// Performance hooks
export function usePerformanceSettings() {
  return useSiteSettings<PerformanceSettings>('performance', defaultPerformanceSettings);
}

export function useUpdatePerformanceSettings() {
  return useUpdateSiteSettings<PerformanceSettings>('performance', 'Performance settings have been updated.');
}

// Branding hooks
export function useBrandingSettings() {
  return useSiteSettings<BrandingSettings>('branding', defaultBrandingSettings);
}

export function useUpdateBrandingSettings() {
  return useUpdateSiteSettings<BrandingSettings>('branding', 'Branding settings have been updated.');
}

// Custom Scripts hooks
export function useCustomScriptsSettings() {
  return useSiteSettings<CustomScriptsSettings>('custom_scripts', defaultCustomScriptsSettings);
}

export function useUpdateCustomScriptsSettings() {
  return useUpdateSiteSettings<CustomScriptsSettings>('custom_scripts', 'Script settings have been updated.');
}

// Cookie Banner hooks
export function useCookieBannerSettings() {
  return useSiteSettings<CookieBannerSettings>('cookie_banner', defaultCookieBannerSettings);
}

export function useUpdateCookieBannerSettings() {
  return useUpdateSiteSettings<CookieBannerSettings>('cookie_banner', 'Cookie settings have been updated.');
}

// Maintenance hooks
export function useMaintenanceSettings() {
  return useSiteSettings<MaintenanceSettings>('maintenance', defaultMaintenanceSettings);
}

export function useUpdateMaintenanceSettings() {
  return useUpdateSiteSettings<MaintenanceSettings>('maintenance', 'Maintenance settings have been updated.');
}

// Chat hooks
export function useChatSettings() {
  return useSiteSettings<ChatSettings>('chat', defaultChatSettings);
}

export function useUpdateChatSettings() {
  return useUpdateSiteSettings<ChatSettings>('chat', 'Chat settings have been updated.');
}

// General settings hooks
export function useGeneralSettings() {
  return useSiteSettings<GeneralSettings>('general', defaultGeneralSettings);
}

export function useUpdateGeneralSettings() {
  return useUpdateSiteSettings<GeneralSettings>('general', 'General settings have been updated.');
}

// Blog settings
export interface BlogSettings {
  enabled: boolean;
  postsPerPage: number;
  showAuthorBio: boolean;
  showReadingTime: boolean;
  showReviewer: boolean;
  archiveTitle: string;
  archiveSlug: string;
  rssEnabled: boolean;
  rssTitle: string;
  rssDescription: string;
}

const defaultBlogSettings: BlogSettings = {
  enabled: true,
  postsPerPage: 10,
  showAuthorBio: true,
  showReadingTime: true,
  showReviewer: false,
  archiveTitle: 'Blogg',
  archiveSlug: 'blogg',
  rssEnabled: true,
  rssTitle: 'RSS Feed',
  rssDescription: 'Senaste inläggen från vår blogg',
};

export function useBlogSettings() {
  return useSiteSettings<BlogSettings>('blog', defaultBlogSettings);
}

export function useUpdateBlogSettings() {
  return useUpdateSiteSettings<BlogSettings>('blog', 'Blog settings have been updated.');
}


// AEO (Answer Engine Optimization) settings
export type SchemaOrgType = 
  | 'Organization'
  | 'LocalBusiness'
  | 'MedicalOrganization'
  | 'EducationalOrganization'
  | 'GovernmentOrganization'
  | 'Corporation';

export interface BusinessHours {
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

export interface AeoSettings {
  // General
  enabled: boolean;
  organizationName: string;
  shortDescription: string;
  contactEmail: string;
  primaryLanguage: string;
  
  // llms.txt configuration
  llmsTxtEnabled: boolean;
  llmsTxtExcludedSlugs: string[];
  llmsFullTxtEnabled: boolean;
  maxWordsPerPage: number;
  
  // Schema.org / JSON-LD
  schemaOrgEnabled: boolean;
  schemaOrgType: SchemaOrgType;
  schemaOrgLogo: string;
  socialProfiles: string[];
  
  // LocalBusiness specific
  businessHours: BusinessHours[];
  priceRange: string;
  
  // FAQ Schema (auto-generated from accordion blocks)
  faqSchemaEnabled: boolean;
  
  // Article Schema for blog posts
  articleSchemaEnabled: boolean;
  
  // Sitemap
  sitemapEnabled: boolean;
  sitemapChangefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  sitemapPriority: number;
}

const defaultAeoSettings: AeoSettings = {
  enabled: false,
  organizationName: '',
  shortDescription: '',
  contactEmail: '',
  primaryLanguage: 'sv',
  llmsTxtEnabled: true,
  llmsTxtExcludedSlugs: [],
  llmsFullTxtEnabled: true,
  maxWordsPerPage: 2000,
  schemaOrgEnabled: true,
  schemaOrgType: 'Organization',
  schemaOrgLogo: '',
  socialProfiles: [],
  businessHours: [],
  priceRange: '',
  faqSchemaEnabled: true,
  articleSchemaEnabled: true,
  sitemapEnabled: true,
  sitemapChangefreq: 'weekly',
  sitemapPriority: 0.5,
};

export function useAeoSettings() {
  return useSiteSettings<AeoSettings>('aeo', defaultAeoSettings);
}

export function useUpdateAeoSettings() {
  return useUpdateSiteSettings<AeoSettings>('aeo', 'AEO settings have been updated.');
}

// System AI settings (internal AI tools: text generation, company enrichment, lead qualification, etc.)
export type SystemAiProvider = 'openai' | 'gemini';

export interface SystemAiSettings {
  provider: SystemAiProvider;
  openaiModel: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
  geminiModel: 'gemini-2.0-flash-exp' | 'gemini-1.5-pro' | 'gemini-1.5-flash';
  // Content generation preferences
  defaultTone: 'professional' | 'friendly' | 'formal';
  defaultLanguage: string;
}

const defaultSystemAiSettings: SystemAiSettings = {
  provider: 'openai',
  openaiModel: 'gpt-4o-mini',
  geminiModel: 'gemini-2.0-flash-exp',
  defaultTone: 'professional',
  defaultLanguage: 'sv',
};

export function useSystemAiSettings() {
  return useSiteSettings<SystemAiSettings>('system_ai', defaultSystemAiSettings);
}

export function useUpdateSystemAiSettings() {
  return useUpdateSiteSettings<SystemAiSettings>('system_ai', 'System AI settings have been updated.');
}

// Re-export modules hooks for convenience
export { useModules, useUpdateModules, useIsModuleEnabled, useEnabledModules } from './useModules';
export type { ModulesSettings, ModuleConfig } from './useModules';
