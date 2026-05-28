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
    composio: boolean;
  };
}

export function useIntegrationStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['integration-status', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-secrets');
      if (error) {
        logger.error('[useIntegrationStatus] Error:', error);
        throw error;
      }
      return data as IntegrationStatus;
    },
    staleTime: 30 * 1000,
    gcTime: 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: !!user,
  });
}

// Per-provider helpers — thin wrappers over the single resolver in
// useIntegrations.tsx (resolveIntegrationStatus). DO NOT duplicate the
// hasKey/enabled logic here; route everything through useIsIntegrationActive
// so adding a new config-based integration only touches CONFIG_BASED_KEYS.
import { useIsIntegrationActive } from './useIntegrations';

export function useIsResendConfigured() {
  return useIsIntegrationActive('resend').isActive;
}

export function useIsStripeConfigured() {
  return useIsIntegrationActive('stripe').isActive;
}

export function useIsOpenAIConfigured() {
  return useIsIntegrationActive('openai').isActive;
}

export function useIsGeminiConfigured() {
  return useIsIntegrationActive('gemini').isActive;
}

export function useIsAnthropicConfigured() {
  return useIsIntegrationActive('anthropic').isActive;
}

export function useIsLocalLLMConfigured() {
  return useIsIntegrationActive('local_llm').isActive;
}

export function useIsAIConfigured() {
  const isOpenAI = useIsOpenAIConfigured();
  const isGemini = useIsGeminiConfigured();
  const isAnthropic = useIsAnthropicConfigured();
  const isLocal = useIsLocalLLMConfigured();
  return isOpenAI || isGemini || isAnthropic || isLocal;
}
