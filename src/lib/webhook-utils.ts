import { supabase } from '@/integrations/supabase/client';

export type WebhookEventType = 
  | 'page.published'
  | 'page.updated'
  | 'page.deleted'
  | 'blog_post.published'
  | 'blog_post.updated'
  | 'blog_post.deleted'
  | 'form.submitted'
  | 'booking.submitted'
  | 'newsletter.subscribed'
  | 'newsletter.unsubscribed'
  | 'order.created'
  | 'order.paid'
  | 'order.cancelled'
  | 'order.refunded';

interface TriggerWebhookOptions {
  event: WebhookEventType;
  data: Record<string, unknown>;
}

/**
 * Triggers webhooks for a given event. 
 * This is a fire-and-forget operation - errors are logged but not thrown.
 */
export async function triggerWebhook({ event, data }: TriggerWebhookOptions): Promise<void> {
  try {
    console.log(`[triggerWebhook] Triggering event: ${event}`);
    
    const { error } = await supabase.functions.invoke('send-webhook', {
      body: { event, data },
    });
    
    if (error) {
      console.warn(`[triggerWebhook] Failed to trigger ${event}:`, error);
    } else {
      console.log(`[triggerWebhook] Successfully triggered: ${event}`);
    }
  } catch (err) {
    // Don't throw - webhooks should not block the main operation
    console.warn(`[triggerWebhook] Error triggering ${event}:`, err);
  }
}

// Convenience functions for common events
export const webhookEvents = {
  pagePublished: (page: { id: string; slug: string; title: string }) => 
    triggerWebhook({ 
      event: 'page.published', 
      data: { 
        id: page.id, 
        slug: page.slug, 
        title: page.title,
        published_at: new Date().toISOString(),
      } 
    }),
    
  pageUpdated: (page: { id: string; slug: string; title: string }) => 
    triggerWebhook({ 
      event: 'page.updated', 
      data: { 
        id: page.id, 
        slug: page.slug, 
        title: page.title,
        updated_at: new Date().toISOString(),
      } 
    }),
    
  pageDeleted: (pageId: string) => 
    triggerWebhook({ 
      event: 'page.deleted', 
      data: { 
        id: pageId,
        deleted_at: new Date().toISOString(),
      } 
    }),
    
  blogPostPublished: (post: { id: string; slug: string; title: string; excerpt?: string | null }) => 
    triggerWebhook({ 
      event: 'blog_post.published', 
      data: { 
        id: post.id, 
        slug: post.slug, 
        title: post.title,
        excerpt: post.excerpt,
        published_at: new Date().toISOString(),
      } 
    }),
    
  blogPostUpdated: (post: { id: string; slug: string; title: string }) => 
    triggerWebhook({ 
      event: 'blog_post.updated', 
      data: { 
        id: post.id, 
        slug: post.slug, 
        title: post.title,
        updated_at: new Date().toISOString(),
      } 
    }),
    
  blogPostDeleted: (postId: string) => 
    triggerWebhook({ 
      event: 'blog_post.deleted', 
      data: { 
        id: postId,
        deleted_at: new Date().toISOString(),
      } 
    }),
    
  formSubmitted: (submission: { 
    form_name: string; 
    block_id: string; 
    page_id?: string | null; 
    data: Record<string, unknown>;
  }) => 
    triggerWebhook({ 
      event: 'form.submitted', 
      data: { 
        form_name: submission.form_name,
        block_id: submission.block_id,
        page_id: submission.page_id,
        submission_data: submission.data,
        submitted_at: new Date().toISOString(),
      } 
    }),
    
  newsletterSubscribed: (subscriber: { email: string; name?: string | null }) => 
    triggerWebhook({ 
      event: 'newsletter.subscribed', 
      data: { 
        email: subscriber.email,
        name: subscriber.name,
        subscribed_at: new Date().toISOString(),
      } 
    }),
    
  newsletterUnsubscribed: (email: string) => 
    triggerWebhook({ 
      event: 'newsletter.unsubscribed', 
      data: { 
        email,
        unsubscribed_at: new Date().toISOString(),
      } 
    }),
    
  bookingSubmitted: (booking: { 
    block_id: string;
    page_id?: string | null;
    service?: { id: string; name: string } | null;
    customer: { name: string; email: string; phone?: string };
    preferred_date?: string;
    preferred_time?: string;
    message?: string;
  }) => 
    triggerWebhook({ 
      event: 'booking.submitted', 
      data: { 
        block_id: booking.block_id,
        page_id: booking.page_id,
        service: booking.service,
        customer: booking.customer,
        preferred_date: booking.preferred_date,
        preferred_time: booking.preferred_time,
        message: booking.message,
        submitted_at: new Date().toISOString(),
      } 
    }),
    
  orderCreated: (order: { 
    id: string; 
    customer_email: string;
    customer_name?: string | null;
    total_cents: number;
    currency: string;
    items: Array<{ product_name: string; quantity: number; price_cents: number }>;
  }) => 
    triggerWebhook({ 
      event: 'order.created', 
      data: { 
        id: order.id,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        total_cents: order.total_cents,
        currency: order.currency,
        items: order.items,
        created_at: new Date().toISOString(),
      } 
    }),
    
  orderPaid: (order: { 
    id: string; 
    customer_email: string;
    customer_name?: string | null;
    total_cents: number;
    currency: string;
    stripe_payment_intent?: string | null;
    items: Array<{ product_name: string; quantity: number; price_cents: number }>;
  }) => 
    triggerWebhook({ 
      event: 'order.paid', 
      data: { 
        id: order.id,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        total_cents: order.total_cents,
        currency: order.currency,
        stripe_payment_intent: order.stripe_payment_intent,
        items: order.items,
        paid_at: new Date().toISOString(),
      } 
    }),
    
  orderCancelled: (orderId: string, reason?: string) => 
    triggerWebhook({ 
      event: 'order.cancelled', 
      data: { 
        id: orderId,
        reason,
        cancelled_at: new Date().toISOString(),
      } 
    }),
    
  orderRefunded: (orderId: string, amount_cents: number, currency: string) => 
    triggerWebhook({ 
      event: 'order.refunded', 
      data: { 
        id: orderId,
        amount_cents,
        currency,
        refunded_at: new Date().toISOString(),
      } 
    }),
};
