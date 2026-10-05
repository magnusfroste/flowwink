import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A bounce is the provider's word about ONE delivery — it has to land there.
 *
 * email-webhook had recorded Resend's bounces and complaints into email_events
 * since July, and the auto-suppress trigger kept the global list; but the
 * newsletter never heard: the delivery stayed "sent", the subscriber
 * "confirmed", the row said 42 sent when 3 never arrived, and the next send
 * tried again (counted as "failed"). These guards keep the chain intact:
 * provider → webhook (signed) → email_events → the delivery row, the
 * subscriber, the summary, the page.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the webhook', () => {
  const fn = read('supabase/functions/email-webhook/index.ts');

  it('verifies the svix signature when the secret is set, and never silently otherwise', () => {
    expect(fn).toMatch(/Deno\.env\.get\("RESEND_WEBHOOK_SECRET"\)/);
    expect(fn).toMatch(/verifySvix\(req\.headers, bodyText, secret\)/);
    expect(fn).toMatch(/status: 401/);
    expect(fn).toMatch(/accepted UNVERIFIED — set RESEND_WEBHOOK_SECRET/);
    // the signature covers the raw body, so the body is read as text first
    expect(fn).toMatch(/const bodyText = await req\.text\(\);/);
    expect(fn).not.toMatch(/await req\.json\(\)/);
  });

  it('reads Resend events and keeps the tags in the payload for the newsletter to find', () => {
    expect(fn).toMatch(/"email\.bounced": \{ type: "bounced", hard: true \}/);
    expect(fn).toMatch(/payload = raw\.data \?\? raw;/);
  });
});

describe('the newsletter hears it', () => {
  const m = read('supabase/migrations/20261005070000_studsen-nar-nyhetsbrevet.sql');

  it('a trigger on email_events writes the delivery row, the subscriber, and reads tags in both shapes', () => {
    expect(m).toMatch(/CREATE TRIGGER trg_newsletter_reflect_email_event AFTER INSERT ON public\.email_events/);
    expect(m).toMatch(/jsonb_typeof\(t\) = 'object'/);
    expect(m).toMatch(/jsonb_typeof\(t\) = 'array'/);
    expect(m).toMatch(/WHERE provider_message_id = NEW\.message_id/);
    expect(m).toMatch(/SET status = 'bounced', updated_at = now\(\)\s*WHERE lower\(email\) = v_recipient AND status IN \('pending', 'confirmed'\)/);
    expect(m).toMatch(/CHECK \(status IN \('pending', 'confirmed', 'unsubscribed', 'bounced'\)\)/);
    expect(m).toMatch(/CHECK \(status IN \('pending', 'sent', 'failed', 'bounced', 'complained', 'suppressed'\)\)/);
  });

  it('the sender keeps the provider message id and never retries a suppressed address', () => {
    const send = read('supabase/functions/newsletter/send.ts');
    expect(send).toMatch(/provider_message_id: providerMessageId \?\? null,/);
    expect(send).toMatch(/answer\?\.result\?\.id \?\? null/);
    expect(send).toMatch(/await markDelivery\("suppressed"/);
    expect(send).toMatch(/from\("email_suppressions"\)\.select\("email"\)/);
  });

  it('the summary and the page carry bounced, complained and suppressed', () => {
    expect(m).toMatch(/'bounced', p\.bounced, 'complained', p\.complained, 'suppressed', p\.suppressed/);
    const page = read('src/pages/admin/NewsletterPage.tsx');
    expect(page).toMatch(/\{d\.bounced\} bounced/);
    expect(page).toMatch(/case "bounced":/);
    expect(page).toMatch(/data-newsletter-delivery-card/);
    expect(read('src/hooks/useNewsletterDeliveries.ts')).toMatch(/\.in\('status', \['bounced', 'complained', 'failed', 'suppressed'\]\)/);
  });

  it('the agent sees the same ledger on manage_newsletters get', () => {
    expect(read('supabase/functions/agent-execute/index.ts')).toMatch(/return \{ \.\.\.data, delivery: mine \};/);
  });
});
