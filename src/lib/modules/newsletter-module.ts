import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { renderToHtml } from '@/lib/tiptap-utils';
import { defineModule } from '@/lib/module-def';
import {
  NewsletterModuleInput,
  NewsletterModuleOutput,
  newsletterModuleInputSchema,
  newsletterModuleOutputSchema,
} from '@/types/module-contracts';

export const newsletterModule = defineModule<NewsletterModuleInput, NewsletterModuleOutput>({
  id: 'newsletter',
  name: 'Newsletter',
  version: '1.0.0',
  description: 'Create newsletter drafts for sending',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: newsletterModuleInputSchema,
  outputSchema: newsletterModuleOutputSchema,

  skills: [
    'send_newsletter',
    'manage_newsletters',
    'execute_newsletter_send',
    'manage_newsletter_subscribers',
    'newsletter_subscribe',
  ],

  webhookEvents: [
    { event: 'newsletter.subscribed', description: 'A new subscriber joined' },
    { event: 'newsletter.unsubscribed', description: 'A subscriber left' },
  ],

  async publish(input: NewsletterModuleInput): Promise<NewsletterModuleOutput> {
    try {
      const validated = newsletterModuleInputSchema.parse(input);

      let contentHtml: string | null = null;
      let contentJson: Json | null = null;

      if (validated.content_html) {
        contentHtml = validated.content_html;
      } else if (validated.content_tiptap) {
        contentHtml = renderToHtml(validated.content_tiptap);
        contentJson = validated.content_tiptap as Json;
      } else if (validated.content_json) {
        contentJson = validated.content_json as Json;
      }

      const status = validated.options?.status || 'draft';
      const { data, error } = await supabase
        .from('newsletters')
        .insert({
          subject: validated.subject,
          content_html: contentHtml,
          content_json: contentJson,
          status,
          scheduled_at: validated.options?.send_at || null,
        })
        .select('id, status')
        .single();

      if (error) {
        logger.error('[NewsletterModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, status: data.status };
    } catch (error) {
      logger.error('[NewsletterModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
