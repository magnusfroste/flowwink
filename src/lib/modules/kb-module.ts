import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { generateSlug, isTiptapDocument } from './helpers';
import {
  KBArticleModuleInput,
  KBArticleModuleOutput,
  kbArticleModuleInputSchema,
  kbArticleModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const KB_SKILLS: SkillSeed[] = [
  {
    name: 'manage_kb_article',
    description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish. Use when: creating a new support article; updating an existing KB entry; controlling KB content visibility. NOT for: analyzing KB gaps (kb_gap_analysis); managing blog posts (manage_blog_posts).',
    category: 'content',
    handler: 'module:kb',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_kb_article',
        description: 'Manage knowledge base articles: list, get, create, update, publish, unpublish. Use when: creating a new support article; updating an existing KB entry; controlling KB content visibility. NOT for: analyzing KB gaps (kb_gap_analysis); managing blog posts (manage_blog_posts).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'create',
                'update',
                'publish',
                'unpublish',
              ],
            },
            article_id: {
              type: 'string',
            },
            slug: {
              type: 'string',
            },
            title: {
              type: 'string',
            },
            question: {
              type: 'string',
            },
            answer: {
              type: 'string',
            },
            category: {
              type: 'string',
            },
            include_in_chat: {
              type: 'boolean',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_kb_article
### What
Manages knowledge base articles: list, get, create, update, publish, unpublish.
### When to use
- Admin asks to create or edit FAQ/KB content
- kb_gap_analysis identifies missing topics
- Chat finds questions it can't answer → create KB article
### Parameters
- **action**: Required. list, get, create, update, publish, unpublish.
- **title**, **question**, **answer**: For create/update.
- **include_in_chat**: Boolean — whether the article is used by chat AI.
### Edge cases
- Articles with include_in_chat=true are embedded into chat context.
- Always set a clear question field for chat matching.`,
  },
];

export const kbModule = defineModule<KBArticleModuleInput, KBArticleModuleOutput>({
  id: 'knowledgeBase',
  name: 'Knowledge Base',
  version: '1.0.0',
  description: 'Create knowledge base articles',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: kbArticleModuleInputSchema,
  outputSchema: kbArticleModuleOutputSchema,

  skills: [
    'manage_kb_article',
  ],
  skillSeeds: KB_SKILLS,

  webhookEvents: [
    { event: 'kb_article.published', description: 'An article was published' },
    { event: 'kb_article.updated', description: 'An article was updated' },
  ],

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
});
