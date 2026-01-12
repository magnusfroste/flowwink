import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface IntegrationStatus {
  core: {
    supabase_url: boolean;
    supabase_anon_key: boolean;
    supabase_service_role_key: boolean;
  };
  integrations: {
    resend: boolean;
    stripe: boolean;
    stripe_webhook: boolean;
    unsplash: boolean;
    firecrawl: boolean;
    openai: boolean;
    gemini: boolean;
  };
}

interface IntegrationsSettings {
  stripe?: { enabled: boolean };
  stripe_webhook?: { enabled: boolean };
  resend?: { enabled: boolean };
  openai?: { enabled: boolean };
  gemini?: { enabled: boolean };
  unsplash?: { enabled: boolean };
  firecrawl?: { enabled: boolean };
}

export function useIntegrationStatus() {
  return useQuery({
    queryKey: ['integration-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-secrets');
      if (error) throw error;
      return data as IntegrationStatus;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1,
  });
}

// Helper to get integration enabled status from site_settings
function useIntegrationsEnabledSettings() {
  return useQuery({
    queryKey: ['integrations-enabled-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'integrations')
        .maybeSingle();
      
      if (error) throw error;
      return (data?.value as IntegrationsSettings) || {};
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Returns true ONLY if both key exists AND integration is enabled
export function useIsResendConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.resend ?? false;
  const isEnabled = enabledSettings?.resend?.enabled ?? false;
  
  return hasKey && isEnabled;
}

export function useIsStripeConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.stripe ?? false;
  const isEnabled = enabledSettings?.stripe?.enabled ?? false;
  
  return hasKey && isEnabled;
}

export function useIsOpenAIConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.openai ?? false;
  const isEnabled = enabledSettings?.openai?.enabled ?? false;
  
  return hasKey && isEnabled;
}

export function useIsGeminiConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.gemini ?? false;
  const isEnabled = enabledSettings?.gemini?.enabled ?? false;
  
  return hasKey && isEnabled;
}

// Combined helper: true if ANY AI provider is configured and enabled
export function useIsAIConfigured() {
  const isOpenAI = useIsOpenAIConfigured();
  const isGemini = useIsGeminiConfigured();
  return isOpenAI || isGemini;
}
