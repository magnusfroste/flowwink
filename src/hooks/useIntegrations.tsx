import { logger } from '@/lib/logger';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIntegrationStatus } from './useIntegrationStatus';

// Email configuration (shared across all email-sending functions)
export interface EmailConfig {
  fromEmail: string;
  fromName: string;
}

// Newsletter tracking configuration
export interface NewsletterTrackingConfig {
  enableOpenTracking: boolean;
  enableClickTracking: boolean;
}

// Provider-specific configuration stored per integration
export interface IntegrationProviderConfig {
  // Common
  apiKey?: string;  // For integrations where user can set key in UI
  // OpenAI
  baseUrl?: string;
  model?: string;
  // Local LLM
  endpoint?: string;
  // N8N
  webhookUrl?: string;
  webhookType?: 'chat' | 'generic';
  triggerMode?: 'always' | 'keywords' | 'fallback';
  triggerKeywords?: string[];
  // Email (for resend integration)
  emailConfig?: EmailConfig;
  // Newsletter tracking (for resend integration)
  newsletterTracking?: NewsletterTrackingConfig;
  // SMTP — values that aren't secrets (host/port/user/secure live here for visibility; password is in SMTP_PASS)
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  // Email router (which provider system emails use)
  provider?: 'smtp' | 'resend';
  fromEmail?: string;
  fromName?: string;
  // Google Analytics
  measurementId?: string;
  // Meta Pixel
  pixelId?: string;
  // Slack / Teams notifications
  notifyOnNewLead?: boolean;
  notifyOnDealWon?: boolean;
  notifyOnFormSubmit?: boolean;
  // Jina
  preferFreeTier?: boolean;
  // Meta Ads
  adAccountId?: string;
  // Hunter.io
  maxContacts?: number; // How many decision-makers to keep per prospect (saves credits)
  // OpenAI usage guard — soft monthly USD budget. UI warns when month-to-date
  // estimated spend reaches `warnAtPct` of this value. Does not block requests.
  monthlyBudgetUsd?: number;
  warnAtPct?: number; // 0-100, default 80
  // SearXNG — self-hosted search base URL (e.g. https://searx.example.com)
  url?: string;
}

// Integration configuration type
export interface IntegrationConfig {
  enabled?: boolean;
  name: string;
  description: string;
  icon: string;
  category: 'payments' | 'communication' | 'ai' | 'media' | 'automation' | 'analytics' | 'notifications' | 'sales' | 'advertising';
  features: string[];
  secretName?: string;
  docsUrl: string;
  docsLabel?: string;
  settingsUrl?: string;
  // Provider-specific config (stored per integration)
  config?: IntegrationProviderConfig;
}

// All integrations settings
export interface IntegrationsSettings {
  stripe: IntegrationConfig;
  stripe_webhook: IntegrationConfig;
  resend: IntegrationConfig;
  smtp: IntegrationConfig;
  openai: IntegrationConfig;
  gemini: IntegrationConfig;
  anthropic: IntegrationConfig;
  unsplash: IntegrationConfig;
  firecrawl: IntegrationConfig;
  local_llm: IntegrationConfig;
  n8n: IntegrationConfig;
  google_analytics: IntegrationConfig;
  meta_pixel: IntegrationConfig;
  slack: IntegrationConfig;
  hunter: IntegrationConfig;
  jina: IntegrationConfig;
  meta_ads: IntegrationConfig;
  composio: IntegrationConfig;
  searxng: IntegrationConfig;
}

// Default settings - auto-enabled when API key exists, admin can explicitly disable
export const defaultIntegrationsSettings: IntegrationsSettings = {
  stripe: {

    name: 'Stripe',
    description: 'Payment processing',
    icon: 'CreditCard',
    category: 'payments',
    features: ['E-commerce', 'Checkout', 'Subscriptions'],
    secretName: 'STRIPE_SECRET_KEY',
    docsUrl: 'https://stripe.com/docs/keys',
    docsLabel: 'Get API key',
  },
  stripe_webhook: {

    name: 'Stripe Webhook',
    description: 'Payment event notifications',
    icon: 'CreditCard',
    category: 'payments',
    features: ['Order status updates', 'Payment confirmations'],
    secretName: 'STRIPE_WEBHOOK_SECRET',
    docsUrl: 'https://stripe.com/docs/webhooks',
    docsLabel: 'Configure webhook',
  },
  resend: {

    name: 'Resend',
    description: 'Hosted email API — drop-in alternative to SMTP.',
    icon: 'Mail',
    category: 'communication',
    features: ['Newsletter', 'Order confirmations', 'Booking confirmations', 'Dunning'],
    secretName: 'RESEND_API_KEY',
    docsUrl: 'https://resend.com/docs/introduction',
    docsLabel: 'Get API key',
    config: {
      emailConfig: {
        fromEmail: 'onboarding@resend.dev',
        fromName: 'Newsletter',
      },
      newsletterTracking: {
        enableOpenTracking: false,
        enableClickTracking: false,
      },
    },
  },
  smtp: {
    name: 'SMTP',
    description:
      'Self-host friendly email transport. Works with Postfix, Mailgun SMTP, SES SMTP, Gmail SMTP, and any standards-compliant server.',
    icon: 'Mail',
    category: 'communication',
    features: ['Dunning', 'Newsletter', 'Order/booking confirmations', 'No vendor lock-in'],
    secretName: 'SMTP_PASS',
    docsUrl: 'https://nodemailer.com/smtp/',
    docsLabel: 'SMTP setup guide',
    config: {
      host: '',
      port: 587,
      secure: false,
      user: '',
    },
  },
  // Email Router moved to modules (see useModules.tsx → 'email').
  // It is an internal infrastructure module that consumes SMTP/Resend integrations.
  openai: {

    name: 'OpenAI',
    description: 'GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration'],
    secretName: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get API key',
    config: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      monthlyBudgetUsd: 50,
      warnAtPct: 80,
    },
  },
  gemini: {

    name: 'Google Gemini',
    description: 'Gemini 2.0, 1.5 Pro',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration'],
    secretName: 'GEMINI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'Get API key',
    config: {
      model: 'gemini-2.0-flash-exp',
    },
  },
  anthropic: {

    name: 'Anthropic',
    description: 'Claude Sonnet 4, Claude Opus 4',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration', 'Superior tool use'],
    secretName: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get API key',
    config: {
      model: 'claude-sonnet-4-6',
    },
  },
  local_llm: {

    name: 'Local LLM',
    description: 'Self-hosted AI (Ollama, vLLM)',
    icon: 'Server',
    category: 'ai',
    features: ['HIPAA-compliant', 'Private', 'No API costs'],
    secretName: 'LOCAL_LLM_API_KEY',
    docsUrl: 'https://ollama.ai/',
    docsLabel: 'Setup guide',
    config: {
      endpoint: '',
      model: '',
    },
  },
  n8n: {

    name: 'N8N',
    description: 'Workflow automation',
    icon: 'Webhook',
    category: 'automation',
    features: ['Agentic workflows', 'Custom logic', 'Tool calling'],
    secretName: 'N8N_API_KEY',
    docsUrl: 'https://n8n.io/docs',
    docsLabel: 'Setup guide',
    config: {
      webhookUrl: '',
      webhookType: 'chat',
      triggerMode: 'always',
      triggerKeywords: [],
    },
  },
  unsplash: {

    name: 'Unsplash',
    description: 'Stock photo integration',
    icon: 'Image',
    category: 'media',
    features: ['Image picker in editor'],
    secretName: 'UNSPLASH_ACCESS_KEY',
    docsUrl: 'https://unsplash.com/developers',
    docsLabel: 'Get API key',
  },
  google_analytics: {

    name: 'Google Analytics',
    description: 'Website traffic & attribution',
    icon: 'BarChart3',
    category: 'analytics',
    features: ['Page views', 'Events', 'Conversions', 'Attribution'],
    secretName: '',
    docsUrl: 'https://support.google.com/analytics/answer/9539598',
    docsLabel: 'Find Measurement ID',
    config: {
      measurementId: '',
    },
  },
  meta_pixel: {

    name: 'Meta Pixel',
    description: 'Facebook/Instagram ad tracking',
    icon: 'Target',
    category: 'analytics',
    features: ['Ad conversions', 'Retargeting', 'Lookalike audiences'],
    secretName: '',
    docsUrl: 'https://www.facebook.com/business/help/952192354843755',
    docsLabel: 'Find Pixel ID',
    config: {
      pixelId: '',
    },
  },
  slack: {

    name: 'Slack',
    description: 'Team notifications',
    icon: 'MessageSquare',
    category: 'notifications',
    features: ['New lead alerts', 'Deal won alerts', 'Form submission alerts'],
    secretName: '',
    docsUrl: 'https://api.slack.com/messaging/webhooks',
    docsLabel: 'Create webhook',
    config: {
      webhookUrl: '',
      notifyOnNewLead: true,
      notifyOnDealWon: true,
      notifyOnFormSubmit: false,
    },
  },
  firecrawl: {

    name: 'Firecrawl',
    description: 'Web scraping and search',
    icon: 'Flame',
    category: 'sales',
    features: ['Web scraping', 'Search', 'Company enrichment'],
    secretName: 'FIRECRAWL_API_KEY',
    docsUrl: 'https://firecrawl.dev/docs',
    docsLabel: 'Get API key',
  },
  hunter: {

    name: 'Hunter.io',
    description: 'Email finder & domain search',
    icon: 'Target',
    category: 'sales',
    features: ['Domain Search', 'Email Finder', 'Prospect Research'],
    secretName: 'HUNTER_API_KEY',
    docsUrl: 'https://hunter.io/api',
    docsLabel: 'Get API key',
    config: {
      maxContacts: 2,
    },
  },
  jina: {

    name: 'Jina AI',
    description: 'Web search & reader API',
    icon: 'Search',
    category: 'sales',
    features: ['Jina Search', 'Jina Reader', 'Prospect Research', 'Content Extraction'],
    secretName: 'JINA_API_KEY',
    docsUrl: 'https://jina.ai/reader/',
    docsLabel: 'Get API key',
    config: {
      preferFreeTier: true,
    },
  },
  meta_ads: {

    name: 'Meta Ads',
    description: 'Facebook & Instagram campaign management',
    icon: 'Megaphone',
    category: 'advertising',
    features: ['Campaign creation', 'Creative generation', 'Performance tracking', 'Budget optimization'],
    secretName: 'META_ADS_ACCESS_TOKEN',
    docsUrl: 'https://developers.facebook.com/docs/marketing-apis',
    docsLabel: 'Get access token',
    config: {
      adAccountId: '',
    },
  },
  composio: {
    name: 'Composio',
    description: 'Connect to 1000+ apps via managed OAuth',
    icon: 'Network',
    category: 'automation',
    features: ['Gmail', 'Slack', 'HubSpot', 'Sheets', 'Intent-based tool resolution'],
    secretName: 'COMPOSIO_API_KEY',
    docsUrl: 'https://docs.composio.dev',
    docsLabel: 'Get API key',
  },
  searxng: {
    name: 'SearXNG',
    description: 'Self-hosted, privacy-respecting metasearch',
    icon: 'Globe',
    category: 'sales',
    features: ['Web search', 'Self-hosted', 'Free', 'Fallback for Firecrawl/Jina'],
    docsUrl: 'https://docs.searxng.org/',
    docsLabel: 'SearXNG docs',
    config: {
      url: '',
    },
  },
};

// Category definitions
export const INTEGRATION_CATEGORIES = {
  payments: { label: 'Payments', order: 1 },
  communication: { label: 'Communication', order: 2 },
  ai: { label: 'AI Providers', order: 3 },
  sales: { label: 'Sales Intelligence', order: 4 },
  automation: { label: 'Automation', order: 5 },
  media: { label: 'Media & Tools', order: 6 },
  analytics: { label: 'Analytics & Attribution', order: 7 },
  notifications: { label: 'Notifications', order: 8 },
  advertising: { label: 'Advertising', order: 9 },
} as const;

// Fetch integrations settings
export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'integrations')
        .maybeSingle();

      if (error) throw error;

      // Merge with defaults to ensure all integrations exist
      const stored = (data?.value as Partial<IntegrationsSettings>) || {};
      const merged: IntegrationsSettings = { ...defaultIntegrationsSettings };

      for (const key of Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[]) {
        if (stored[key]) {
          merged[key] = { ...defaultIntegrationsSettings[key], ...stored[key] };
        }
      }

      return merged;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Update integrations settings
export function useUpdateIntegrations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<IntegrationsSettings>) => {
      // Get current settings
      const { data: existing } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'integrations')
        .maybeSingle();

      const currentSettings = (existing?.value as unknown as IntegrationsSettings) || {};
      const newSettings = { ...currentSettings };

      // Merge updates
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          newSettings[key as keyof IntegrationsSettings] = {
            ...(currentSettings[key as keyof IntegrationsSettings] || {}),
            ...value,
          } as IntegrationConfig;
        }
      }

      const upsertData = {
        key: 'integrations',
        value: JSON.parse(JSON.stringify(newSettings)),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('site_settings')
        .upsert(upsertData, { onConflict: 'key' });

      if (error) throw error;
      return newSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations-settings'] });
      toast.success('Integration settings updated');
    },
    onError: (error) => {
      logger.error('Failed to update integration settings:', error);
      toast.error('Failed to update settings');
    },
  });
}

// Toggle a single integration
export function useToggleIntegration() {
  const updateIntegrations = useUpdateIntegrations();

  return (key: keyof IntegrationsSettings, enabled: boolean) => {
    updateIntegrations.mutate({
      [key]: { enabled },
    });
  };
}

// Config-based integrations: no vault secret needed, presence of required
// config field determines credential. EXPORTED so all callers share one list.
export const CONFIG_BASED_KEYS: ReadonlyArray<keyof IntegrationsSettings> = [
  'local_llm', 'n8n', 'google_analytics', 'meta_pixel', 'slack', 'searxng',
];

export function configHasCredential(
  key: keyof IntegrationsSettings,
  config: IntegrationProviderConfig | undefined,
): boolean {
  switch (key) {
    case 'local_llm': return !!config?.endpoint;
    case 'n8n': return !!config?.webhookUrl;
    case 'google_analytics': return !!config?.measurementId;
    case 'meta_pixel': return !!config?.pixelId;
    case 'slack': return !!config?.webhookUrl;
    case 'searxng': return !!config?.url;
    default: return false;
  }
}

/**
 * Single source of truth for "is this integration usable right now?".
 * Pure function — call from hooks, components, or count loops.
 *
 * Rules (in order):
 *   1. Config-based (local_llm/n8n/ga/pixel/slack) → presence of required field
 *   2. Secret-based → presence of secret in Supabase vault
 *   3. Explicit `enabled: false` always wins → status='disabled'
 */
export function resolveIntegrationStatus(
  key: keyof IntegrationsSettings,
  secretsPresent: Partial<Record<keyof IntegrationsSettings, boolean>> | undefined,
  settings: Partial<IntegrationsSettings> | undefined,
): { hasKey: boolean; isActive: boolean; status: 'not_configured' | 'disabled' | 'active' } {
  const requiresSecret = !CONFIG_BASED_KEYS.includes(key);
  const cfg = settings?.[key]?.config ?? defaultIntegrationsSettings[key]?.config;
  const hasKey = requiresSecret
    ? (secretsPresent?.[key] ?? false)
    : configHasCredential(key, cfg);
  const explicitlyDisabled = settings?.[key]?.enabled === false;
  const isActive = hasKey && !explicitlyDisabled;
  return {
    hasKey,
    isActive,
    status: !hasKey ? 'not_configured' : explicitlyDisabled ? 'disabled' : 'active',
  };
}

// Check if an integration is active (has key/config + not explicitly disabled)
export function useIsIntegrationActive(key: keyof IntegrationsSettings) {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();

  const { hasKey, isActive, status } = resolveIntegrationStatus(
    key,
    secretsStatus?.integrations,
    integrationSettings,
  );

  return { hasKey, isEnabled: isActive, isActive, status } as const;
}

// Get count of active integrations (uses shared resolveIntegrationStatus)
export function useActiveIntegrationsCount() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();

  if (!secretsStatus || !integrationSettings) return { active: 0, total: 0 };

  const keys = Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[];
  let active = 0;
  for (const key of keys) {
    if (resolveIntegrationStatus(key, secretsStatus.integrations, integrationSettings).isActive) {
      active++;
    }
  }
  return { active, total: keys.length };
}
