/**
 * A customer-facing mail is sent in the business's name, never the
 * platform's. Eleven builders read `general.site_name` / `general.siteName` —
 * keys no settings screen writes — so Nordbrygg's customers would have got
 * "Invoice 1042 from FlowWink" and bookings signed "Our Website" (2026-10-30).
 * One reader, `_shared/org-name.ts`, answers the question everywhere.
 *
 * Discover, don't enumerate: the scan covers every edge function, so the
 * next mail builder that guesses the name from `general` alone turns this red.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { orgNameFrom } from '../../../supabase/functions/_shared/org-name.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('orgNameFrom', () => {
  it('reads the name an operator actually sets, before the legacy keys', () => {
    expect(orgNameFrom({ branding: { organizationName: 'Nordbrygg AB' }, general: { site_name: 'x' } })).toBe('Nordbrygg AB');
    expect(orgNameFrom({ company_profile: { company_name: 'Nordbrygg' }, general: {} })).toBe('Nordbrygg');
    expect(orgNameFrom({ general: { siteName: 'Legacy' } })).toBe('Legacy');
  });

  it('falls back to the site host, never to the platform', () => {
    expect(orgNameFrom({ general: { siteUrl: 'https://www.nordbrygg.se' } })).toBe('nordbrygg.se');
    expect(orgNameFrom({})).toBe('');
  });
});

describe('no mail builder guesses the name from general alone', () => {
  const files = walk('supabase/functions').filter((f) => !f.includes('/_shared/org-name.ts'));
  it("no `general.site_name || 'FlowWink'` / `siteName || \"Our Website\"` fallbacks", () => {
    const offenders = files.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /\?\.site_name \|\| ['"]FlowWink['"]/.test(s) || /\?\.siteName\)? \|\| ['"]Our (Website|Store)['"]/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it('the invoice, quote, booking, order and reminder mails read loadOrgName', () => {
    for (const f of ['comms-send/invoice_email.ts', 'comms-send/quote_email.ts', 'comms-send/booking_confirmation.ts', 'comms-send/order_confirmation.ts', 'comms-send/webinar_reminders.ts', 'quote-sign/index.ts', 'contract-sign/index.ts']) {
      expect(readFileSync(`supabase/functions/${f}`, 'utf8'), f).toMatch(/await loadOrgName\(supabase, /);
    }
  });
});
