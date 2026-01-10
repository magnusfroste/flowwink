import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useIntegrationStatus } from '@/hooks/useIntegrationStatus';
import { useIntegrations, type IntegrationsSettings } from '@/hooks/useIntegrations';

interface IntegrationWarningProps {
  integration: 'resend' | 'stripe' | 'openai' | 'gemini';
  title?: string;
  description?: string;
}

const defaultMessages = {
  resend: {
    title: 'Email integration not configured',
    descriptionNotConfigured: 'Resend API key is missing. Newsletter emails, order confirmations, and booking emails will not be sent.',
    descriptionDisabled: 'Resend integration is disabled. Enable it in Integrations settings to send emails.',
  },
  stripe: {
    title: 'Payment integration not configured',
    descriptionNotConfigured: 'Stripe is not configured. Payment processing and checkout functionality will not work.',
    descriptionDisabled: 'Stripe integration is disabled. Enable it in Integrations settings to process payments.',
  },
  openai: {
    title: 'OpenAI API not configured',
    descriptionNotConfigured: 'OPENAI_API_KEY is missing in Supabase Secrets. AI chat and content generation will not work.',
    descriptionDisabled: 'OpenAI integration is disabled. Enable it in Integrations settings to use AI features.',
  },
  gemini: {
    title: 'Google Gemini API not configured',
    descriptionNotConfigured: 'GEMINI_API_KEY is missing in Supabase Secrets. AI chat and content generation will not work.',
    descriptionDisabled: 'Gemini integration is disabled. Enable it in Integrations settings to use AI features.',
  },
};

// Map integration prop to integration key
const integrationKeyMap: Record<IntegrationWarningProps['integration'], keyof IntegrationsSettings> = {
  resend: 'resend',
  stripe: 'stripe',
  openai: 'openai',
  gemini: 'gemini',
};

export function useIntegrationWarningStatus(integration: IntegrationWarningProps['integration']) {
  const { data: secretsStatus } = useIntegrationStatus();
  const { data: integrationSettings } = useIntegrations();

  const key = integrationKeyMap[integration];
  const hasKey = secretsStatus?.integrations?.[key] ?? false;
  const isEnabled = integrationSettings?.[key]?.enabled ?? false;

  return {
    shouldShowWarning: !hasKey || !isEnabled,
    reason: !hasKey ? 'not_configured' : 'disabled',
    hasKey,
    isEnabled,
  };
}

export function IntegrationWarning({ integration, title, description }: IntegrationWarningProps) {
  const { shouldShowWarning, reason, hasKey, isEnabled } = useIntegrationWarningStatus(integration);
  const defaults = defaultMessages[integration];

  // Don't show warning if fully configured and enabled
  if (!shouldShowWarning) return null;

  const displayDescription = description || (
    reason === 'not_configured' 
      ? defaults.descriptionNotConfigured 
      : defaults.descriptionDisabled
  );

  return (
    <Alert variant="destructive" className="mb-6">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title || defaults.title}</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{displayDescription}</span>
        <Button variant="outline" size="sm" asChild className="ml-4 shrink-0">
          <Link to="/admin/integrations">
            <ExternalLink className="h-3 w-3 mr-1" />
            Configure
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
