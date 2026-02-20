import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { createDocumentFromMarkdown } from '@/lib/tiptap-utils';
import { triggerWebhook } from '@/lib/webhook-utils';
import { generateSlug, isTiptapDocument } from './helpers';
import {
  ModuleDefinition,
  BlogModuleInput,
  BlogModuleOutput,
  blogModuleInputSchema,
  blogModuleOutputSchema,
} from '@/types/module-contracts';

export const blogModule: ModuleDefinition<BlogModuleInput, BlogModuleOutput> = {
  id: 'blog',
  name: 'Blog',
  version: '1.0.0',
  description: 'Publish content to the blog',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: blogModuleInputSchema,
  outputSchema: blogModuleOutputSchema,

  async publish(input: BlogModuleInput): Promise<BlogModuleOutput> {
    try {
      const validated = blogModuleInputSchema.parse(input);
      const baseSlug = generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = `${baseSlug}-${timestamp}`;

      let contentJson: Json;
      if (isTiptapDocument(validated.content)) {
        contentJson = validated.content as Json;
      } else if (typeof validated.content === 'string') {
        contentJson = createDocumentFromMarkdown(validated.content) as unknown as Json;
      } else {
        contentJson = validated.content as Json;
      }

      const status = validated.options?.status || 'draft';
      const postData = {
        title: validated.title,
        slug,
        content_json: contentJson,
        excerpt: validated.excerpt || null,
        featured_image: validated.featured_image || null,
        featured_image_alt: validated.featured_image_alt || null,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null,
        scheduled_at: validated.options?.schedule_at || null,
        author_id: validated.options?.author_id || null,
        meta_json: validated.meta ? {
          source_module: validated.meta.source_module,
          source_id: validated.meta.source_id,
          keywords: validated.meta.keywords,
          description: validated.meta.description,
        } as Json : null,
      };

      const { data, error } = await supabase
        .from('blog_posts')
        .insert(postData)
        .select('id, slug, status, published_at')
        .single();

      if (error) {
        logger.error('[BlogModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      if (status === 'published') {
        try {
          await triggerWebhook({
            event: 'blog_post.published',
            data: { id: data.id, title: validated.title, slug: data.slug, url: `/blog/${data.slug}`, source_module: validated.meta?.source_module, source_id: validated.meta?.source_id },
          });
        } catch (webhookError) {
          logger.warn('[BlogModule] Webhook trigger failed:', webhookError);
        }
      }

      return {
        success: true,
        id: data.id,
        slug: data.slug,
        url: `/blog/${data.slug}`,
        status: data.status,
        published_at: data.published_at || undefined,
      };
    } catch (error) {
      logger.error('[BlogModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
