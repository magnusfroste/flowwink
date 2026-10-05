import { useIntegrationStatus } from '@/hooks/useIntegrationStatus';
import { useIntegrations } from '@/hooks/useIntegrations';
import {
  chooseEmailProvider,
  type ProviderChoice,
} from '../../supabase/functions/_shared/email/provider-choice';

/**
 * Which provider will carry mail of this kind — the same function email-send
 * runs (`_shared/email/provider-choice.ts`), fed with what the browser can see:
 * the integration settings and check-secrets' presence probes. Undefined while
 * either is loading.
 */
export function useEmailRoute(opts: { expectsReply?: boolean } = {}): ProviderChoice | undefined {
  const { data: secrets } = useIntegrationStatus();
  const { data: integrations } = useIntegrations();
  if (!secrets || !integrations) return undefined;
  return chooseEmailProvider({
    integrations: integrations as unknown as Record<string, unknown>,
    secrets: {
      resendKey: !!secrets.integrations?.resend,
      composioKey: !!secrets.integrations?.composio,
      smtpHost: !!secrets.integrations?.smtp_host,
    },
    expectsReply: opts.expectsReply,
  });
}
