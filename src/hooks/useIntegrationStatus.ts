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

export function useIsResendConfigured() {
  const { data } = useIntegrationStatus();
  return data?.integrations?.resend ?? null;
}

export function useIsStripeConfigured() {
  const { data } = useIntegrationStatus();
  return data?.integrations?.stripe ?? null;
}

export function useIsOpenAIConfigured() {
  const { data } = useIntegrationStatus();
  return data?.integrations?.openai ?? null;
}

export function useIsGeminiConfigured() {
  const { data } = useIntegrationStatus();
  return data?.integrations?.gemini ?? null;
}
