import { logger } from '@/lib/logger';
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
    anthropic: boolean;
    local_llm: boolean;
    google_client_id: boolean;
    google_client_secret: boolean;
    n8n: boolean;
    google_analytics: boolean;
    meta_pixel: boolean;
    slack: boolean;
    hunter: boolean;
    jina: boolean;
  };
}

interface IntegrationsSettings {
  stripe?: { enabled: boolean };
  stripe_webhook?: { enabled: boolean };
  resend?: { enabled: boolean };
  openai?: { enabled: boolean; config?: { baseUrl?: string; model?: string } };
  gemini?: { enabled: boolean; config?: { model?: string } };
  anthropic?: { enabled: boolean; config?: { model?: string } };
  unsplash?: { enabled: boolean };
  firecrawl?: { enabled: boolean };
  local_llm?: { enabled: boolean; config?: { endpoint?: string; model?: string } };
  n8n?: { enabled: boolean; config?: { webhookUrl?: string; webhookType?: string; triggerMode?: string; triggerKeywords?: string[] } };
  google_analytics?: { enabled: boolean; config?: { measurementId?: string } };
  meta_pixel?: { enabled: boolean; config?: { pixelId?: string } };
  slack?: { enabled: boolean; config?: { webhookUrl?: string; notifyOnNewLead?: boolean; notifyOnDealWon?: boolean; notifyOnFormSubmit?: boolean } };
}

export function useIntegrationStatus() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['integration-status', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-secrets');
      if (error) {
        logger.error('[useIntegrationStatus] Error:', error);
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

// Auto-enabled when key exists, unless explicitly disabled by admin
export function useIsResendConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.resend ?? false;
  const explicitlyDisabled = enabledSettings?.resend?.enabled === false;
  
  return hasKey && !explicitlyDisabled;
}

export function useIsStripeConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.stripe ?? false;
  const explicitlyDisabled = enabledSettings?.stripe?.enabled === false;
  
  return hasKey && !explicitlyDisabled;
}

export function useIsOpenAIConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.openai ?? false;
  const explicitlyDisabled = enabledSettings?.openai?.enabled === false;
  
  return hasKey && !explicitlyDisabled;
}

export function useIsGeminiConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.gemini ?? false;
  const explicitlyDisabled = enabledSettings?.gemini?.enabled === false;
  
  return hasKey && !explicitlyDisabled;
}

// Local LLM: enabled if the integration is enabled (no secret needed, just config)
export function useIsLocalLLMConfigured() {
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const isEnabled = enabledSettings?.local_llm?.enabled === true;
  const hasEndpoint = !!enabledSettings?.local_llm?.config?.endpoint;
  
  return isEnabled && hasEndpoint;
}

// Combined helper: true if ANY AI provider is configured and not disabled
export function useIsAnthropicConfigured() {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: enabledSettings } = useIntegrationsEnabledSettings();
  
  const hasKey = secretsStatus?.integrations?.anthropic ?? false;
  const explicitlyDisabled = enabledSettings?.anthropic?.enabled === false;
  
  return hasKey && !explicitlyDisabled;
}

export function useIsAIConfigured() {
  const isOpenAI = useIsOpenAIConfigured();
  const isGemini = useIsGeminiConfigured();
  const isAnthropic = useIsAnthropicConfigured();
  const isLocal = useIsLocalLLMConfigured();
  return isOpenAI || isGemini || isAnthropic || isLocal;
}
