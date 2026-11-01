import { describe, it, expect } from 'vitest';
import { chooseSender } from '../../../supabase/functions/_shared/email/provider-choice';

/**
 * One sender identity, whichever provider carries the mail.
 *
 * Before 2026-10-29 the From address an admin set on the Email page lived on
 * the Resend card and was read only when Resend carried the mail. With SMTP as
 * the carrier the sender fell through to the SMTP_FROM secret or
 * noreply@example.com — which Cloudflare refuses with 550 (domain not
 * onboarded). Nordbrygg had every field filled in and would still have failed.
 */
describe('chooseSender', () => {
  it('the carrier card wins when it names a sender', () => {
    const s = chooseSender({
      active: { fromEmail: 'info@nordbrygg.flowwink.com', fromName: 'Nordbrygg' },
      router: { fromEmail: 'news@acme.se', fromName: 'Acme' },
      envFrom: 'env@acme.se',
    });
    expect(s).toEqual({ fromEmail: 'info@nordbrygg.flowwink.com', fromName: 'Nordbrygg', source: 'card' });
  });

  it("falls back to the Email page's sender when the carrier card has none — the SMTP case", () => {
    const s = chooseSender({
      active: { host: 'smtp.mx.cloudflare.net' },
      router: { fromEmail: 'info@nordbrygg.flowwink.com', fromName: 'Nordbrygg' },
      envFrom: null,
    });
    expect(s.fromEmail).toBe('info@nordbrygg.flowwink.com');
    expect(s.fromName).toBe('Nordbrygg');
    expect(s.source).toBe('router');
  });

  it('then the SMTP_FROM secret, then the placeholder — and says so', () => {
    expect(chooseSender({ active: {}, router: {}, envFrom: 'relay@acme.se' })).toMatchObject({
      fromEmail: 'relay@acme.se', source: 'env',
    });
    const none = chooseSender({ active: {}, router: {}, envFrom: null });
    expect(none).toMatchObject({ fromEmail: 'noreply@example.com', fromName: 'FlowWink', source: 'placeholder' });
  });

  it('name and address resolve independently (a card may name only one)', () => {
    const s = chooseSender({
      active: { fromName: 'Nordbrygg' },
      router: { fromEmail: 'info@nordbrygg.flowwink.com', fromName: 'Newsletter' },
      envFrom: null,
    });
    expect(s.fromName).toBe('Nordbrygg');
    expect(s.fromEmail).toBe('info@nordbrygg.flowwink.com');
  });
});
