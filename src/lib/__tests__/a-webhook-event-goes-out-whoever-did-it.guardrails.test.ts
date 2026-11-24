/**
 * A webhook event goes out whoever did the step (2026-11-24).
 *
 * Developer → Webhooks offers events; until today 24 of the 31 went out only
 * when a person clicked through the admin (the browser called send-webhook),
 * never when an agent, an import or a customer did the same thing. The events
 * the platform raises itself are delivered from the bus. What is still only
 * the admin's may shrink, never grow: a new offered event is raised by the
 * platform in the same PR.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_RAISED_EVENTS } from '../../../supabase/functions/_shared/events/platform-raised';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Offered, but raised only by the admin's own save. May only shrink. */
const ADMIN_ONLY = new Set([
  'page.updated', 'page.deleted',
  'blog_post.updated', 'blog_post.deleted',
  'booking.submitted',
  'product.updated', 'product.deleted',
  'deal.updated',
  'company.updated',
  'media.uploaded', 'media.deleted',
  'global_block.updated',
  'kb_article.updated',
]);

function offered(): string[] {
  const src = read('src/hooks/useWebhooks.ts');
  const union = src.slice(src.indexOf('export type WebhookEvent'), src.indexOf('export interface Webhook'));
  return [...union.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]);
}

describe('a webhook event goes out whoever did the step', () => {
  it('every offered event is raised by the platform, or is on the shrinking admin-only list', () => {
    const notRaised = offered().filter((e) => !PLATFORM_RAISED_EVENTS.has(e));
    expect(notRaised.filter((e) => !ADMIN_ONLY.has(e)), 'raise it in a trigger and add it to platform-raised.ts').toEqual([]);
  });

  it('the admin-only list names nothing the platform now raises', () => {
    expect([...ADMIN_ONLY].filter((e) => PLATFORM_RAISED_EVENTS.has(e)), 'take it off ADMIN_ONLY').toEqual([]);
  });

  it('the publish, deal, record and subscriber events are the rows\' own', () => {
    const sql = read('supabase/migrations/20261124130000_handelsen-gar-ut-vem-som-an-gjorde-det.sql');
    for (const e of ['page.published', 'blog_post.published', 'kb_article.published', 'deal.created', 'deal.stage_changed',
      'deal.lost', 'company.created', 'product.created', 'newsletter.subscribed', 'newsletter.unsubscribed', 'form.submitted']) {
      expect(sql, e).toContain(`'${e}'`);
      expect(PLATFORM_RAISED_EVENTS.has(e), e).toBe(true);
    }
  });
});
