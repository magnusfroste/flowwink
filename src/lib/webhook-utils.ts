import { supabase } from '@/integrations/supabase/client';

export type WebhookEventType = 
  | 'page.published'
  | 'page.updated'
  | 'page.deleted'
  | 'blog_post.published'
  | 'blog_post.updated'
  | 'blog_post.deleted'
  | 'form.submitted'
  | 'newsletter.subscribed'
  | 'newsletter.unsubscribed';

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
};
