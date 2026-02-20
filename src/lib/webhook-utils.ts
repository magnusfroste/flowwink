import { logger } from '@/lib/logger';
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
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'newsletter.subscribed'
  | 'newsletter.unsubscribed'
  | 'order.created'
  | 'order.paid'
  | 'order.cancelled'
  | 'order.refunded'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'deal.created'
  | 'deal.updated'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'company.created'
  | 'company.updated'
  | 'media.uploaded'
  | 'media.deleted'
  | 'global_block.updated'
  | 'kb_article.published'
  | 'kb_article.updated';

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
    logger.log(`[triggerWebhook] Triggering event: ${event}`);
    
    const { error } = await supabase.functions.invoke('send-webhook', {
      body: { event, data },
    });
    
    if (error) {
      logger.warn(`[triggerWebhook] Failed to trigger ${event}:`, error);
    } else {
      logger.log(`[triggerWebhook] Successfully triggered: ${event}`);
    }
  } catch (err) {
    // Don't throw - webhooks should not block the main operation
    logger.warn(`[triggerWebhook] Error triggering ${event}:`, err);
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
    
  // Product events
  productCreated: (product: { id: string; name: string; price_cents: number; currency: string }) => 
    triggerWebhook({ 
      event: 'product.created', 
      data: { 
        id: product.id,
        name: product.name,
        price_cents: product.price_cents,
        currency: product.currency,
        created_at: new Date().toISOString(),
      } 
    }),
    
  productUpdated: (product: { id: string; name: string; price_cents: number; currency: string }) => 
    triggerWebhook({ 
      event: 'product.updated', 
      data: { 
        id: product.id,
        name: product.name,
        price_cents: product.price_cents,
        currency: product.currency,
        updated_at: new Date().toISOString(),
      } 
    }),
    
  productDeleted: (productId: string) => 
    triggerWebhook({ 
      event: 'product.deleted', 
      data: { 
        id: productId,
        deleted_at: new Date().toISOString(),
      } 
    }),
    
  // Booking events
  bookingConfirmed: (booking: { 
    id: string; 
    customer_email: string; 
    customer_name: string;
    service_name?: string;
    start_time: string;
    end_time: string;
  }) => 
    triggerWebhook({ 
      event: 'booking.confirmed', 
      data: { 
        id: booking.id,
        customer_email: booking.customer_email,
        customer_name: booking.customer_name,
        service_name: booking.service_name,
        start_time: booking.start_time,
        end_time: booking.end_time,
        confirmed_at: new Date().toISOString(),
      } 
    }),
    
  bookingCancelled: (bookingId: string, reason?: string) => 
    triggerWebhook({ 
      event: 'booking.cancelled', 
      data: { 
        id: bookingId,
        reason,
        cancelled_at: new Date().toISOString(),
      } 
    }),
    
  // Deal events
  dealCreated: (deal: { 
    id: string; 
    lead_id: string; 
    value_cents: number; 
    currency: string;
    stage: string;
  }) => 
    triggerWebhook({ 
      event: 'deal.created', 
      data: { 
        id: deal.id,
        lead_id: deal.lead_id,
        value_cents: deal.value_cents,
        currency: deal.currency,
        stage: deal.stage,
        created_at: new Date().toISOString(),
      } 
    }),
    
  dealUpdated: (deal: { id: string; value_cents: number; currency: string; stage: string }) => 
    triggerWebhook({ 
      event: 'deal.updated', 
      data: { 
        id: deal.id,
        value_cents: deal.value_cents,
        currency: deal.currency,
        stage: deal.stage,
        updated_at: new Date().toISOString(),
      } 
    }),
    
  dealStageChanged: (deal: { id: string; previous_stage: string; new_stage: string; value_cents: number }) => 
    triggerWebhook({ 
      event: 'deal.stage_changed', 
      data: { 
        id: deal.id,
        previous_stage: deal.previous_stage,
        new_stage: deal.new_stage,
        value_cents: deal.value_cents,
        changed_at: new Date().toISOString(),
      } 
    }),
    
  dealWon: (deal: { id: string; value_cents: number; currency: string }) => 
    triggerWebhook({ 
      event: 'deal.won', 
      data: { 
        id: deal.id,
        value_cents: deal.value_cents,
        currency: deal.currency,
        won_at: new Date().toISOString(),
      } 
    }),
    
  dealLost: (deal: { id: string; reason?: string }) => 
    triggerWebhook({ 
      event: 'deal.lost', 
      data: { 
        id: deal.id,
        reason: deal.reason,
        lost_at: new Date().toISOString(),
      } 
    }),
    
  // Company events
  companyCreated: (company: { id: string; name: string; domain?: string | null }) => 
    triggerWebhook({ 
      event: 'company.created', 
      data: { 
        id: company.id,
        name: company.name,
        domain: company.domain,
        created_at: new Date().toISOString(),
      } 
    }),
    
  companyUpdated: (company: { id: string; name: string; domain?: string | null }) => 
    triggerWebhook({ 
      event: 'company.updated', 
      data: { 
        id: company.id,
        name: company.name,
        domain: company.domain,
        updated_at: new Date().toISOString(),
      } 
    }),
    
  // Media events
  mediaUploaded: (media: { id: string; filename: string; url: string; mime_type?: string }) => 
    triggerWebhook({ 
      event: 'media.uploaded', 
      data: { 
        id: media.id,
        filename: media.filename,
        url: media.url,
        mime_type: media.mime_type,
        uploaded_at: new Date().toISOString(),
      } 
    }),
    
  mediaDeleted: (mediaId: string, filename?: string) => 
    triggerWebhook({ 
      event: 'media.deleted', 
      data: { 
        id: mediaId,
        filename,
        deleted_at: new Date().toISOString(),
      } 
    }),
    
  // Global block events
  globalBlockUpdated: (block: { id: string; slot: string; type: string }) => 
    triggerWebhook({ 
      event: 'global_block.updated', 
      data: { 
        id: block.id,
        slot: block.slot,
        type: block.type,
        updated_at: new Date().toISOString(),
      } 
    }),
    
  // KB article events
  kbArticlePublished: (article: { id: string; slug: string; title: string; category_id: string }) => 
    triggerWebhook({ 
      event: 'kb_article.published', 
      data: { 
        id: article.id,
        slug: article.slug,
        title: article.title,
        category_id: article.category_id,
        published_at: new Date().toISOString(),
      } 
    }),
    
  kbArticleUpdated: (article: { id: string; slug: string; title: string }) => 
    triggerWebhook({ 
      event: 'kb_article.updated', 
      data: { 
        id: article.id,
        slug: article.slug,
        title: article.title,
        updated_at: new Date().toISOString(),
      } 
    }),
};
