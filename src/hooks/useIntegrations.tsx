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
  // Google Analytics
  measurementId?: string;
  // Meta Pixel
  pixelId?: string;
  // Slack / Teams notifications
  notifyOnNewLead?: boolean;
  notifyOnDealWon?: boolean;
  notifyOnFormSubmit?: boolean;
}

// Integration configuration type
export interface IntegrationConfig {
  enabled: boolean;
  name: string;
  description: string;
  icon: string;
  category: 'payments' | 'communication' | 'ai' | 'media' | 'automation' | 'analytics' | 'notifications';
  features: string[];
  secretName: string;
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
  openai: IntegrationConfig;
  gemini: IntegrationConfig;
  unsplash: IntegrationConfig;
  firecrawl: IntegrationConfig;
  local_llm: IntegrationConfig;
  n8n: IntegrationConfig;
  google_analytics: IntegrationConfig;
  meta_pixel: IntegrationConfig;
  slack: IntegrationConfig;
}

// Default settings - all disabled by default, requiring explicit activation
export const defaultIntegrationsSettings: IntegrationsSettings = {
  stripe: {
    enabled: false,
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
    enabled: false,
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
    enabled: false,
    name: 'Resend',
    description: 'Email delivery service',
    icon: 'Mail',
    category: 'communication',
    features: ['Newsletter', 'Order confirmations', 'Booking confirmations'],
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
  openai: {
    enabled: false,
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration'],
    secretName: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get API key',
    config: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    },
  },
  gemini: {
    enabled: false,
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
  local_llm: {
    enabled: false,
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
      model: 'llama3',
    },
  },
  n8n: {
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
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
    enabled: false,
    name: 'Firecrawl',
    description: 'Web scraping and analysis',
    icon: 'Flame',
    category: 'media',
    features: ['Brand analyzer', 'Company enrichment'],
    secretName: 'FIRECRAWL_API_KEY',
    docsUrl: 'https://firecrawl.dev/docs',
    docsLabel: 'Get API key',
  },
};

// Category definitions
export const INTEGRATION_CATEGORIES = {
  payments: { label: 'Payments', order: 1 },
  communication: { label: 'Communication', order: 2 },
  ai: { label: 'AI Providers', order: 3 },
  automation: { label: 'Automation', order: 4 },
  media: { label: 'Media & Tools', order: 5 },
  analytics: { label: 'Analytics & Attribution', order: 6 },
  notifications: { label: 'Notifications', order: 7 },
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

// Check if an integration is active (has key + is enabled)
export function useIsIntegrationActive(key: keyof IntegrationsSettings) {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();

  const hasKey = secretsStatus?.integrations?.[key] ?? false;
  const isEnabled = integrationSettings?.[key]?.enabled ?? false;

  return {
    hasKey,
    isEnabled,
    isActive: hasKey && isEnabled,
    status: !hasKey ? 'not_configured' : isEnabled ? 'active' : 'disabled',
  } as const;
}

// Get count of active integrations
export function useActiveIntegrationsCount() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();

  if (!secretsStatus || !integrationSettings) return { active: 0, total: 0 };

  const keys = Object.keys(defaultIntegrationsSettings) as (keyof IntegrationsSettings)[];
  let active = 0;

  for (const key of keys) {
    const hasKey = secretsStatus.integrations?.[key] ?? false;
    const isEnabled = integrationSettings[key]?.enabled ?? false;
    if (hasKey && isEnabled) active++;
  }

  return { active, total: keys.length };
}
