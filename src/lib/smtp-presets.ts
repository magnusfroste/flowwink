/**
 * SMTP presets — the server fields named per provider, so the card asks "which
 * server?" instead of "which port?".
 *
 * Why: the SMTP card is the one integration that is both config-based (host,
 * port, user, TLS live in site_settings) and carries a real secret (SMTP_PASS).
 * An admin setting up Cloudflare on 2026-10-29 could not tell from the card
 * that the username is the literal `api_token`, that only port 465 works, or
 * that the password is an API token — the card linked to nodemailer's docs.
 * A preset carries exactly that knowledge; the password is never in it. It is
 * the one SMTP value that is a secret, and `passwordHint` says what goes there.
 *
 * Pure data + two pure functions. No React, no Supabase.
 */
export interface SmtpPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  /** Implicit TLS (SMTPS, port 465). False = STARTTLS on 587. */
  secure: boolean;
  /** A fixed username, or '' when the admin supplies their own. */
  user: string;
  /** Shown as the username field's placeholder when `user` is ''. */
  userPlaceholder?: string;
  /** What SMTP_PASS must hold for this provider. */
  passwordHint: string;
  /** True when a relay commonly accepts mail without a password. */
  passwordOptional?: boolean;
  docsUrl?: string;
}

export const SMTP_PRESETS: readonly SmtpPreset[] = [
  {
    id: 'cloudflare',
    label: 'Cloudflare Email Service',
    host: 'smtp.mx.cloudflare.net',
    port: 465,
    secure: true,
    user: 'api_token',
    passwordHint:
      'A Cloudflare API token with the permission "Email Sending: Edit". Cloudflare only offers port 465 with implicit TLS, and the From domain must be onboarded for Email Sending in the same Cloudflare account.',
    docsUrl: 'https://developers.cloudflare.com/email-service/api/send-emails/smtp/',
  },
  {
    id: 'google',
    label: 'Google Workspace / Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: '',
    userPlaceholder: 'you@yourcompany.com',
    passwordHint:
      'An app password from Google Account → Security → App passwords (2-step verification required). Not the account password.',
    docsUrl: 'https://support.google.com/a/answer/176600',
  },
  {
    id: 'mailgun',
    label: 'Mailgun (EU)',
    host: 'smtp.eu.mailgun.org',
    port: 587,
    secure: false,
    user: '',
    userPlaceholder: 'postmaster@mg.yourcompany.com',
    passwordHint: 'The SMTP password from Sending → Domain settings → SMTP credentials.',
    docsUrl: 'https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/',
  },
  {
    id: 'ses',
    label: 'Amazon SES (eu-north-1)',
    host: 'email-smtp.eu-north-1.amazonaws.com',
    port: 587,
    secure: false,
    user: '',
    userPlaceholder: 'AKIA… (SMTP user name)',
    passwordHint: 'The SMTP password generated under SES → SMTP settings. Not your IAM secret key.',
    docsUrl: 'https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html',
  },
  {
    id: 'relay',
    label: 'Own relay (Postfix, Exchange, internal)',
    host: '',
    port: 587,
    secure: false,
    user: '',
    userPlaceholder: 'optional',
    passwordHint: 'Whatever the relay issues. A relay that accepts mail from this network needs no SMTP_PASS at all.',
    passwordOptional: true,
  },
  {
    id: 'mailpit',
    label: 'Mailpit (local development)',
    host: 'mailpit',
    port: 1025,
    secure: false,
    user: '',
    passwordHint: 'None. Mailpit accepts every message; read them at http://localhost:8025.',
    passwordOptional: true,
  },
];

export const CUSTOM_SMTP_PRESET_ID = 'custom';

export function smtpPresetById(id: string | null | undefined): SmtpPreset | null {
  return SMTP_PRESETS.find((p) => p.id === id) ?? null;
}

/** The preset a stored config matches, by host — or null for a hand-typed server. */
export function matchSmtpPreset(config: { host?: string } | undefined | null): SmtpPreset | null {
  const host = (config?.host ?? '').trim().toLowerCase();
  if (!host) return null;
  return SMTP_PRESETS.find((p) => p.host && p.host.toLowerCase() === host) ?? null;
}

/** Spread a preset over a config: server fields replaced, everything else (From, user-typed values) kept. */
export function applySmtpPreset<T extends object>(config: T | undefined, preset: SmtpPreset): T & {
  host: string; port: number; secure: boolean; user: string;
} {
  const base = (config ?? {}) as T;
  return {
    ...base,
    host: preset.host,
    port: preset.port,
    secure: preset.secure,
    // A fixed username (Cloudflare's `api_token`) is set; otherwise the admin's
    // own value survives a preset switch.
    user: preset.user || ((base as { user?: string }).user ?? ''),
  };
}
