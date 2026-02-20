import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { generateSlug, isTiptapDocument } from './helpers';
import {
  ModuleDefinition,
  KBArticleModuleInput,
  KBArticleModuleOutput,
  kbArticleModuleInputSchema,
  kbArticleModuleOutputSchema,
} from '@/types/module-contracts';

export const kbModule: ModuleDefinition<KBArticleModuleInput, KBArticleModuleOutput> = {
  id: 'kb',
  name: 'Knowledge Base',
  version: '1.0.0',
  description: 'Create knowledge base articles',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: kbArticleModuleInputSchema,
  outputSchema: kbArticleModuleOutputSchema,

  async publish(input: KBArticleModuleInput): Promise<KBArticleModuleOutput> {
    try {
      const validated = kbArticleModuleInputSchema.parse(input);
      const baseSlug = validated.slug || generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = validated.slug ? baseSlug : `${baseSlug}-${timestamp}`;

      let answerJson: Record<string, unknown> | null = null;
      let answerText: string | null = null;

      if (typeof validated.answer === 'string') {
        answerText = validated.answer;
        answerJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.answer }] }] };
      } else if (isTiptapDocument(validated.answer)) {
        answerJson = validated.answer as Record<string, unknown>;
        answerText = JSON.stringify(validated.answer);
      }

      const articleData = {
        title: validated.title,
        question: validated.question,
        slug,
        category_id: validated.category_id,
        answer_json: answerJson as Json,
        answer_text: answerText,
        is_published: validated.options?.is_published ?? true,
        is_featured: validated.options?.is_featured ?? false,
        include_in_chat: validated.options?.include_in_chat ?? true,
        meta_json: validated.meta ? {
          source_module: validated.meta.source_module,
          source_id: validated.meta.source_id,
          seo_title: validated.meta.seo_title,
          seo_description: validated.meta.seo_description,
        } as Json : null,
      };

      const { data, error } = await supabase
        .from('kb_articles')
        .insert(articleData)
        .select('id, slug')
        .single();

      if (error) {
        logger.error('[KBModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, slug: data.slug, url: `/kb/${data.slug}` };
    } catch (error) {
      logger.error('[KBModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
