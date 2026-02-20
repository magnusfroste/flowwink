import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import { generateSlug, isTiptapDocument } from './helpers';
import {
  ModuleDefinition,
  PageModuleInput,
  PageModuleOutput,
  pageModuleInputSchema,
  pageModuleOutputSchema,
} from '@/types/module-contracts';

export const pagesModule: ModuleDefinition<PageModuleInput, PageModuleOutput> = {
  id: 'pages',
  name: 'Pages',
  version: '1.0.0',
  description: 'Create and publish CMS pages',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: pageModuleInputSchema,
  outputSchema: pageModuleOutputSchema,

  async publish(input: PageModuleInput): Promise<PageModuleOutput> {
    try {
      const validated = pageModuleInputSchema.parse(input);
      const baseSlug = validated.slug || generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = validated.slug ? baseSlug : `${baseSlug}-${timestamp}`;

      let contentJson: Json;
      if (Array.isArray(validated.content)) {
        contentJson = validated.content as Json;
      } else if (typeof validated.content === 'string') {
        contentJson = [{ id: crypto.randomUUID(), type: 'text', data: { content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.content }] }] } } }] as Json;
      } else if (isTiptapDocument(validated.content)) {
        contentJson = [{ id: crypto.randomUUID(), type: 'text', data: { content: validated.content } }] as Json;
      } else {
        contentJson = [] as Json;
      }

      const status = validated.options?.status || 'draft';
      const pageData = {
        title: validated.title,
        slug,
        content_json: contentJson as Json,
        status,
        show_in_menu: validated.options?.show_in_menu ?? false,
        menu_order: validated.options?.menu_order ?? 0,
        scheduled_at: validated.options?.schedule_at || null,
        meta_json: validated.meta ? {
          source_module: validated.meta.source_module,
          source_id: validated.meta.source_id,
          seo_title: validated.meta.seo_title,
          seo_description: validated.meta.seo_description,
        } as Json : null,
      };

      const { data, error } = await supabase
        .from('pages')
        .insert(pageData)
        .select('id, slug, status')
        .single();

      if (error) {
        logger.error('[PagesModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      if (status === 'published') {
        try {
          await triggerWebhook({
            event: 'page.published',
            data: { id: data.id, title: validated.title, slug: data.slug, url: `/${data.slug}`, source_module: validated.meta?.source_module },
          });
        } catch (webhookError) {
          logger.warn('[PagesModule] Webhook failed:', webhookError);
        }
      }

      return { success: true, id: data.id, slug: data.slug, url: `/${data.slug}`, status: data.status };
    } catch (error) {
      logger.error('[PagesModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
