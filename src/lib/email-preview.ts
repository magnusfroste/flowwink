/**
 * Email template preview — what the recipient will actually see.
 *
 * The preview imports the SAME shell the router applies at send time
 * (supabase/functions/_shared/email-shell.ts) rather than reimplementing the
 * frame in the admin app. A preview built from a second copy would drift from
 * the real mail, and a preview that lies is worse than no preview: it looks
 * like verification while proving nothing.
 */
import {
  hslTripletToHex,
  wrapInShell,
  type EmailShell,
} from '../../supabase/functions/_shared/email-shell';
import { renderTemplate } from '../../supabase/functions/_shared/template-render';
import type { BrandingSettings, GeneralSettings } from '@/hooks/useSiteSettings';

export { wrapInShell, type EmailShell };

/** Mirrors `emailSafeLogo` in the shell: SVG is unusable in mail clients. */
function emailSafeLogo(branding: BrandingSettings): string | null {
  const explicit = branding.logoEmail?.trim();
  if (explicit) return explicit;
  const logo = branding.logo?.trim();
  if (!logo) return null;
  return logo.split('?')[0].toLowerCase().endsWith('.svg') ? null : logo;
}

export function buildShellFromSettings(
  branding: BrandingSettings | undefined,
  general: GeneralSettings | undefined,
): EmailShell {
  const b = branding ?? {};
  return {
    organizationName: b.organizationName || b.adminName || '',
    logoUrl: emailSafeLogo(b),
    primaryHex: hslTripletToHex(b.primaryColor) ?? '#1f6feb',
    siteUrl: (general?.siteUrl ?? '').replace(/\/+$/, ''),
    tagline: b.brandTagline || null,
  };
}

/** Every {{token}} appearing in the subject or body, in first-seen order. */
export function detectTokens(...sources: string[]): string[] {
  const seen: string[] = [];
  for (const src of sources) {
    for (const m of (src ?? '').matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
      if (!seen.includes(m[1])) seen.push(m[1]);
    }
  }
  return seen;
}

/**
 * Plausible stand-in values, so the preview reads like a real mail instead of a
 * page of {{placeholders}} — a subject line's length and tone only become
 * judgeable once the blanks are filled.
 */
export function sampleValueFor(token: string): string {
  const t = token.toLowerCase();
  const pick = (pairs: Array<[RegExp, string]>, fallback: string) =>
    pairs.find(([re]) => re.test(t))?.[1] ?? fallback;

  return pick(
    [
      [/first_?name|förnamn/, 'Anna'],
      [/last_?name|efternamn/, 'Lindqvist'],
      [/full_?name|customer_?name|contact_?name|^name$|namn/, 'Anna Lindqvist'],
      [/company|företag|organisation/, 'Nordisk Fiber AB'],
      [/email|e-?post|mail/, 'anna.lindqvist@example.com'],
      [/phone|tel|mobil/, '070-123 45 67'],
      [/invoice_?number|faktura(nummer)?/, '2026-0042'],
      [/order_?number|order/, 'ORD-10231'],
      [/quote|offert/, 'OFF-2026-017'],
      [/amount|total|belopp|sum|price|pris/, '12 500 kr'],
      [/date|datum|due|förfall/, new Date().toLocaleDateString('sv-SE')],
      [/url|link|länk/, 'https://example.com/x'],
      [/org_?number|orgnr|organisationsnummer/, '556616-1658'],
      [/ref|nummer|number|id$/, 'REF-8842'],
    ],
    `[${token}]`,
  );
}

export function buildSampleValues(tokens: string[]): Record<string, string> {
  return Object.fromEntries(tokens.map((t) => [t, sampleValueFor(t)]));
}

/**
 * THE substitution engine the senders use (_shared/template-render), sections
 * included — a preview with its own copy of the rule would show literal
 * {{#notes}} markers the sent mail never contains.
 */
export function renderTokens(input: string, vars: Record<string, string>): string {
  return renderTemplate(input ?? '', vars);
}
