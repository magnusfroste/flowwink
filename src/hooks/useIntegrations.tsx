import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIntegrationStatus } from './useIntegrationStatus';

// Integration configuration type
export interface IntegrationConfig {
  enabled: boolean;
  name: string;
  description: string;
  icon: string;
  category: 'payments' | 'communication' | 'ai' | 'media';
  features: string[];
  secretName: string;
  docsUrl: string;
  docsLabel?: string;
  settingsUrl?: string;
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
  },
  openai: {
    enabled: false,
    name: 'OpenAI',
    description: 'GPT-4o, GPT-4o-mini',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration', 'Company enrichment'],
    secretName: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'Get API key',
    settingsUrl: '/admin/settings/chat',
  },
  gemini: {
    enabled: false,
    name: 'Google Gemini',
    description: 'Gemini 2.0, 1.5 Pro',
    icon: 'Bot',
    category: 'ai',
    features: ['AI Chat', 'Text generation', 'Content migration', 'Company enrichment'],
    secretName: 'GEMINI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    docsLabel: 'Get API key',
    settingsUrl: '/admin/settings/chat',
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
  media: { label: 'Media & Tools', order: 4 },
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
      console.error('Failed to update integration settings:', error);
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
