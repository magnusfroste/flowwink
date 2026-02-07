import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
    local_llm: boolean;
    n8n: boolean;
  };
}

interface IntegrationsSettings {
  stripe?: { enabled: boolean };
  stripe_webhook?: { enabled: boolean };
  resend?: { enabled: boolean };
  openai?: { enabled: boolean; config?: { baseUrl?: string; model?: string } };
  gemini?: { enabled: boolean; config?: { model?: string } };
  unsplash?: { enabled: boolean };
  firecrawl?: { enabled: boolean };
  local_llm?: { enabled: boolean; config?: { endpoint?: string; model?: string } };
  n8n?: { enabled: boolean; config?: { webhookUrl?: string; webhookType?: string; triggerMode?: string; triggerKeywords?: string[] } };
}

export function useIntegrationStatus() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['integration-status', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-secrets');
      if (error) {
        console.error('[useIntegrationStatus] Error:', error);
        return null;
      }
      return data as IntegrationStatus;
    },
    staleTime: 30 * 1000,
    gcTime: 60 * 1000,
    retry: 0,
    refetchOnWindowFocus: false,
    enabled: !!user,
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
