import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readInboundPayload, payloadFromParsedMime } from '../../../supabase/functions/_shared/email/inbound-payload';
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

describe('raw MIME from the paste-in Worker', () => {
  const mail = {
    subject: 'Offert på serviceavtal',
    text: 'Hej! Vi vill ha en offert.',
    html: '<p>Hej!</p>',
    messageId: '<x1@kafe-norr.se>',
    inReplyTo: '<o1@nordbrygg.flowwink.com>',
    from: { address: 'elin@kafe-norr.se', name: 'Elin' },
    to: [{ address: 'someone-else@nordbrygg.flowwink.com' }],
    headers: [{ key: 'from', value: 'Elin <elin@kafe-norr.se>' }],
  };

  it('the SMTP envelope wins over the headers — a catch-all routes by envelope recipient', () => {
    const body = payloadFromParsedMime(mail, { from: 'bounce+x@kafe-norr.se', to: 'info@nordbrygg.flowwink.com' });
    const r = readInboundPayload(body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.message).toMatchObject({
      from: 'bounce+x@kafe-norr.se',
      to: 'info@nordbrygg.flowwink.com',
      subject: 'Offert på serviceavtal',
      messageIdHeader: '<x1@kafe-norr.se>',
      inReplyTo: '<o1@nordbrygg.flowwink.com>',
    });
  });

  it('falls back to the headers when the relay sends no envelope', () => {
    const r = readInboundPayload(payloadFromParsedMime(mail, {}));
    expect(r.ok && r.message.from).toBe('elin@kafe-norr.se');
    expect(r.ok && r.message.to).toBe('someone-else@nordbrygg.flowwink.com');
  });

  it('the Worker has no dependencies, so it can be pasted into the dashboard', () => {
    const worker = read('deploy/cloudflare/email-inbound/worker.js');
    expect(worker).not.toMatch(/^\s*import\s/m);
    expect(worker).toMatch(/message\/rfc822/);
    expect(worker).toMatch(/x-envelope-to/);
  });

  it('the router parses raw MIME itself', () => {
    const router = read('supabase/functions/email-webhook/index.ts');
    expect(router).toMatch(/npm:postal-mime@\d/);
    expect(router).toMatch(/payloadFromParsedMime\(/);
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

  it('the event carries the thread the row was filed on — a relay has no provider thread id', () => {
    const shared = read('supabase/functions/_shared/email/ingest-message.ts');
    expect(shared).toMatch(/\.select\('thread_id'\)/);
    const payload = shared.slice(shared.indexOf('_payload: {'));
    expect(payload).toMatch(/thread_id: threadId,/);
  });

  it('the event dispatcher surfaces a failed skill as last_error', () => {
    const d = read('supabase/functions/event-dispatcher/index.ts');
    expect(d).toMatch(/out\?\.status === "failed"/);
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
