/**
 * Module → Webhook Events Mapping
 * 
 * Maps each module to the webhook events it can emit.
 * Displayed in the ModuleDetailSheet so admins can see
 * what events they can subscribe to for each module.
 */

import type { ModulesSettings } from '@/hooks/useModules';
import type { WebhookEventType } from '@/lib/webhook-utils';

export interface WebhookEventInfo {
  event: WebhookEventType;
  description: string;
}

export const MODULE_WEBHOOK_EVENTS: Partial<Record<keyof ModulesSettings, WebhookEventInfo[]>> = {
  pages: [
    { event: 'page.published', description: 'A page was published' },
    { event: 'page.updated', description: 'A page was updated' },
    { event: 'page.deleted', description: 'A page was deleted' },
  ],

  blog: [
    { event: 'blog_post.published', description: 'A blog post was published' },
    { event: 'blog_post.updated', description: 'A blog post was updated' },
    { event: 'blog_post.deleted', description: 'A blog post was deleted' },
  ],

  forms: [
    { event: 'form.submitted', description: 'A form was submitted' },
  ],

  bookings: [
    { event: 'booking.submitted', description: 'A booking was submitted' },
    { event: 'booking.confirmed', description: 'A booking was confirmed' },
    { event: 'booking.cancelled', description: 'A booking was cancelled' },
  ],

  newsletter: [
    { event: 'newsletter.subscribed', description: 'A new subscriber joined' },
    { event: 'newsletter.unsubscribed', description: 'A subscriber left' },
  ],

  ecommerce: [
    { event: 'order.created', description: 'An order was placed' },
    { event: 'order.paid', description: 'An order was paid' },
    { event: 'order.cancelled', description: 'An order was cancelled' },
    { event: 'order.refunded', description: 'An order was refunded' },
    { event: 'product.created', description: 'A product was created' },
    { event: 'product.updated', description: 'A product was updated' },
    { event: 'product.deleted', description: 'A product was deleted' },
  ],

  deals: [
    { event: 'deal.created', description: 'A deal was created' },
    { event: 'deal.updated', description: 'A deal was updated' },
    { event: 'deal.stage_changed', description: 'A deal changed stage' },
    { event: 'deal.won', description: 'A deal was won' },
    { event: 'deal.lost', description: 'A deal was lost' },
  ],

  companies: [
    { event: 'company.created', description: 'A company was created' },
    { event: 'company.updated', description: 'A company was updated' },
  ],

  mediaLibrary: [
    { event: 'media.uploaded', description: 'A file was uploaded' },
    { event: 'media.deleted', description: 'A file was deleted' },
  ],

  knowledgeBase: [
    { event: 'kb_article.published', description: 'An article was published' },
    { event: 'kb_article.updated', description: 'An article was updated' },
  ],

  purchasing: [
    { event: 'purchase_order.created', description: 'A PO was created' },
    { event: 'purchase_order.sent', description: 'A PO was sent to vendor' },
    { event: 'purchase_order.received', description: 'All goods received for PO' },
    { event: 'goods_receipt.created', description: 'Goods were received' },
    { event: 'vendor.created', description: 'A vendor was added' },
    { event: 'vendor.updated', description: 'A vendor was updated' },
  ],
};

/**
 * Get webhook events for a specific module.
 */
export function getModuleWebhookEvents(moduleId: keyof ModulesSettings): WebhookEventInfo[] {
  return MODULE_WEBHOOK_EVENTS[moduleId] ?? [];
}
