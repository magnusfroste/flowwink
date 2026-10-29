import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInboundPayload } from '../../../supabase/functions/_shared/email/inbound-payload';
import { classifyInbound } from '../../../supabase/functions/_shared/email/classify-inbound';

/**
 * One email router, providers underneath. Mail that arrives through DNS
 * (Cloudflare Email Routing → the Worker → email-webhook /inbound) is filed by
 * the same code as mail that arrives through Gmail/Composio. These pin the
 * relay contract and that there is one filing path, not two.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('inbound relay payload', () => {
  it('reads what the Cloudflare Worker posts', () => {
    const r = readInboundPayload({
      from: 'elin@kafe-norr.se',
      to: 'info@nordbrygg.flowwink.com',
      subject: 'Maskinen läcker',
      text: 'Hej, vår Jura läcker vatten sedan i morse.',
      html: '<p>Hej</p>',
      message_id: '<abc@kafe-norr.se>',
      in_reply_to: '',
      headers: [{ key: 'From', value: 'Elin <elin@kafe-norr.se>' }, { key: 'List-Id', value: '' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message).toMatchObject({
      from: 'elin@kafe-norr.se',
      to: 'info@nordbrygg.flowwink.com',
      subject: 'Maskinen läcker',
      messageIdHeader: '<abc@kafe-norr.se>',
      inReplyTo: null,
    });
    expect(r.message.headers.from).toBe('Elin <elin@kafe-norr.se>');
  });

  it('accepts a header object as well as a header list', () => {
    const r = readInboundPayload({ from: 'a@b.se', to: 'c@d.se', subject: 'x', headers: { 'Message-ID': '<m@b.se>' } });
    expect(r.ok && r.message.messageIdHeader).toBe('<m@b.se>');
  });

  it('refuses a body that is not a mail', () => {
    expect(readInboundPayload(null).ok).toBe(false);
    expect(readInboundPayload([]).ok).toBe(false);
    expect(readInboundPayload({ from: 'nobody', to: 'c@d.se', text: 'x' }).ok).toBe(false);
    expect(readInboundPayload({ from: 'a@b.se', to: '', text: 'x' }).ok).toBe(false);
    expect(readInboundPayload({ from: 'a@b.se', to: 'c@d.se' }).ok).toBe(false);
  });

  it('caps the body sizes', () => {
    const r = readInboundPayload({ from: 'a@b.se', to: 'c@d.se', text: 'x'.repeat(60_000), html: 'y'.repeat(300_000) });
    expect(r.ok && r.message.text.length).toBe(50_000);
    expect(r.ok && r.message.html?.length).toBe(200_000);
  });

  it('a relayed newsletter is noise, never a ticket', () => {
    const r = readInboundPayload({ from: 'news@leverantor.se', to: 'info@x.se', subject: 'Nyhetsbrev', text: 'x', headers: { 'List-Unsubscribe': '<mailto:u@x>' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(classifyInbound({ headers: r.message.headers, fromEmail: r.message.from, resolvedToCrm: false })).toBe('noise');
  });
});

describe('one filing path for every provider', () => {
  it('Gmail and the relay route both file through ingest-message.ts', () => {
    const gmail = read('supabase/functions/_shared/email/ingest-gmail.ts');
    const router = read('supabase/functions/email-webhook/index.ts');
    expect(gmail).toMatch(/ingestInboundMessage\(/);
    expect(router).toMatch(/ingestInboundMessage\(/);
    // Neither inserts the inbound row itself any more.
    expect(gmail).not.toMatch(/from\('outbound_communications'\)\.insert/);
    expect(router).not.toMatch(/from\("outbound_communications"\)\.insert/);
  });

  it('the /inbound route fails closed without its secret', () => {
    const router = read('supabase/functions/email-webhook/index.ts');
    const branch = router.slice(router.indexOf('endsWith("/inbound")'));
    expect(branch).toMatch(/EMAIL_INBOUND_SECRET/);
    expect(branch).toMatch(/503/);
    expect(branch).toMatch(/401/);
  });

  it('the Worker posts to the router with the secret header the route checks', () => {
    const worker = read('deploy/cloudflare/email-inbound/worker.js');
    expect(worker).toMatch(/x-webhook-secret/);
    expect(worker).toMatch(/setReject/);
  });
});
