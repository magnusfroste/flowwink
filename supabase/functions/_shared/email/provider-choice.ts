/**
 * Which provider carries a mail — ONE rule, two readers.
 *
 * `email-send` asks it for every outgoing message; the admin asks it to say
 * which way mail will actually go. Before this file the admin only asked "is
 * Resend on?" (NewsletterPage), so synclairvision, sending its newsletters
 * through Composio/Gmail, was told "Email integration not configured — Resend
 * API key is missing" while every newsletter was being delivered (2026-10-05).
 * Two readers of one decision gave two answers; now they read the same code.
 *
 * Pure: no Deno, no fetch, no env. The caller supplies what it can see — the
 * edge function reads the vault directly, the browser reads check-secrets.
 */

export type EmailProvider = 'resend' | 'smtp' | 'composio';

export interface ProviderChoiceInput {
  /** `site_settings.integrations` as stored. */
  integrations: Record<string, unknown> | null | undefined;
  /** What the vault holds. */
  secrets: { resendKey: boolean; composioKey: boolean; smtpHost: boolean };
  /** A per-call preference (send_email_to_lead asks for 'composio'). */
  perCall?: EmailProvider | null;
  /** Reply-friendly mail prefers a personal mailbox. */
  expectsReply?: boolean;
}

export interface ProviderChoice {
  /** The provider that carries the mail, or null — then email-send simulates. */
  provider: EmailProvider | null;
  /** The provider someone asked for (per call or the router default), if any. */
  preferred: EmailProvider | null;
  /** The preferred provider is set but not active, so another one (or none) carries the mail. */
  preferredInactive: boolean;
  enabled: Record<EmailProvider, boolean>;
  order: EmailProvider[];
}

type Cfg = { enabled?: boolean; config?: Record<string, unknown> & { emailConfig?: { provider?: EmailProvider }; host?: string; provider?: EmailProvider } };

export function chooseEmailProvider(input: ProviderChoiceInput): ProviderChoice {
  const integrations = (input.integrations ?? {}) as Record<string, Cfg | undefined>;
  const resend = integrations.resend ?? {};
  const smtp = integrations.smtp ?? {};
  const composio = integrations.composio ?? {};

  // Per call wins over the router default. The router default is stored on more
  // than one card for historical reasons; the first one set wins, in this order.
  const preferred: EmailProvider | null =
    input.perCall ||
    composio.config?.emailConfig?.provider ||
    resend.config?.emailConfig?.provider ||
    smtp.config?.provider ||
    null;

  const enabled: Record<EmailProvider, boolean> = {
    resend: resend.enabled !== false && input.secrets.resendKey,
    smtp: smtp.enabled === true && (input.secrets.smtpHost || !!smtp.config?.host),
    composio: composio.enabled === true && input.secrets.composioKey,
  };

  // reply-friendly (expects a reply, or Composio asked for): Composio → SMTP → Resend
  // default (transactional, newsletters): Resend → SMTP → Composio
  const replyFriendly = input.expectsReply === true || preferred === 'composio';
  const order: EmailProvider[] = replyFriendly ? ['composio', 'smtp', 'resend'] : ['resend', 'smtp', 'composio'];

  const provider = preferred && enabled[preferred]
    ? preferred
    : order.find((p) => enabled[p]) ?? null;

  return { provider, preferred, preferredInactive: !!preferred && !enabled[preferred], enabled, order };
}

export const EMAIL_PROVIDER_LABEL: Record<EmailProvider, string> = {
  resend: 'Resend',
  smtp: 'SMTP',
  composio: 'Composio (Gmail)',
};
