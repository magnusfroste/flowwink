/**
 * The business is told in the site's language (2026-11-20).
 *
 * Every notice to the admins was English whatever the site spoke — "New
 * booking: Anna — 2026-12-10T17:00:00+00:00", a raw UTC timestamp and a
 * relative "/admin/bookings" link no mail client opens; the quote and
 * agreement notices were English HTML in quote-sign and contract-sign, sent to
 * the first five profiles. One renderer now (admin-notice.ts); these pin it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderAdminNotice, type AdminNoticeInput } from '../../../supabase/functions/_shared/notices/admin-notice';
import { FALLBACK_HOME, homeFormat } from '../../../supabase/functions/_shared/locale/home';
import { resolveUiText } from '../../../supabase/functions/_shared/locale/ui-text';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

function ctx(lang: string, siteUrl = 'https://example.se') {
  return {
    t: resolveUiText({}, lang, lang),
    f: homeFormat(FALLBACK_HOME, lang, { audience: 'admin' }),
    siteUrl,
    business: 'Exempel AB',
  };
}

const booking: AdminNoticeInput = {
  kind: 'booking.created',
  booking: {
    customer_name: 'Anna Andersson',
    customer_email: 'anna@example.test',
    // 17:00 UTC is 18:00 in Stockholm in December.
    start_time: '2026-12-10T17:00:00+00:00',
    end_time: '2026-12-10T17:30:00+00:00',
    service_name: 'Rådgivning',
    status: 'confirmed',
  },
};

describe('admin notices', () => {
  it('a Swedish site is told in Swedish, on the business clock', () => {
    const { subject, html } = renderAdminNotice(booking, ctx('sv'));
    expect(subject).toBe('Ny bokning: Anna Andersson — 10 dec. 18:00');
    expect(html).toContain('bokade en tid.');
    expect(html).toContain('torsdag 10 december 2026 18:00–18:30');
    expect(html).not.toMatch(/T17:00|\+00:00/);
  });

  it('an English site is told in English', () => {
    const { subject } = renderAdminNotice(booking, ctx('en'));
    expect(subject).toMatch(/^New booking: Anna Andersson — /);
  });

  it('the link is absolute, or there is none', () => {
    expect(renderAdminNotice(booking, ctx('sv')).html).toContain('href="https://example.se/admin/bookings"');
    expect(renderAdminNotice(booking, ctx('sv', '')).html).not.toContain('href=');
  });

  it('a moved booking says from and to; a cancellation carries the message', () => {
    const moved = renderAdminNotice({ kind: 'booking.rescheduled', booking: { ...booking.booking, previous_start_time: '2026-12-09T09:00:00+00:00' } }, ctx('sv'));
    expect(moved.subject).toMatch(/^Bokning flyttad:/);
    expect(moved.html).toContain('onsdag 9 december 2026 10:00');
    const cancelled = renderAdminNotice({ kind: 'booking.cancelled_by_customer', booking: { ...booking.booking, reason: 'Sjuk <b>' } }, ctx('sv'));
    expect(cancelled.html).toContain('Sjuk &lt;b&gt;');
  });

  it('quote and agreement notices are the same renderer', () => {
    const q = renderAdminNotice({ kind: 'quote.answered', quote: { quote_number: 'QUO-0007', accepted: true, signer_name: 'Bo', signer_email: 'bo@x.test', total: '1 000,00 kr', invoice_number: 'INV-2026-00003' } }, ctx('sv'));
    expect(q.subject).toBe('Offert QUO-0007 accepterad av Bo');
    expect(q.html).toContain('INV-2026-00003');
    const c = renderAdminNotice({ kind: 'contract.answered', contract: { title: 'Fiber', signed: false, counterparty_name: 'Bo AB', signer_name: 'Bo', signer_email: 'bo@x.test' } }, ctx('sv'));
    expect(c.subject).toBe('Avtal avböjt: Fiber');
  });

  it('no edge function writes an English notice to the admins by hand', () => {
    for (const fn of ['quote-sign', 'contract-sign']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src, fn).toContain('sendAdminNotice(');
      expect(src, fn).not.toMatch(/profiles!inner\(email\)/);
    }
  });

  it('the booking automations name a notice, never an English subject', () => {
    const seeds = read('src/lib/modules/booking-module.ts');
    const admin = seeds.split("skill_name: 'email_admins'").slice(1);
    expect(admin.length).toBe(3);
    for (const block of admin) {
      const args = block.slice(0, block.indexOf('\n    },\n'));
      expect(args).toMatch(/notice: 'booking\./);
      expect(args).not.toMatch(/subject:/);
    }
  });

  it('live rows move only while they carry the seeded text', () => {
    const file = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.includes('aviseringar-till-foretaget'));
    expect(file).toBeTruthy();
    const sql = read(`supabase/migrations/${file}`);
    expect(sql.match(/AND skill_arguments->>'subject' = '/g)?.length).toBe(3);
  });
});
