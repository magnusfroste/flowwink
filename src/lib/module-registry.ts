/**
 * Module Registry
 * 
 * Central coordinator for all FlowWink modules. Handles registration,
 * validation, and execution of module operations.
 * 
 * @see docs/MODULE-API.md for full documentation
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  ModuleDefinition,
  ModuleCapability,
  BlogModuleInput,
  BlogModuleOutput,
  blogModuleInputSchema,
  blogModuleOutputSchema,
  NewsletterModuleInput,
  NewsletterModuleOutput,
  newsletterModuleInputSchema,
  newsletterModuleOutputSchema,
  CRMLeadInput,
  CRMLeadOutput,
  crmLeadInputSchema,
  crmLeadOutputSchema,
  PageModuleInput,
  PageModuleOutput,
  pageModuleInputSchema,
  pageModuleOutputSchema,
  KBArticleModuleInput,
  KBArticleModuleOutput,
  kbArticleModuleInputSchema,
  kbArticleModuleOutputSchema,
  tiptapDocumentSchema,
} from '@/types/module-contracts';
import { triggerWebhook } from '@/lib/webhook-utils';
import { renderToHtml } from '@/lib/tiptap-utils';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate URL-safe slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 100);
}

/**
 * Check if content is a Tiptap document
 */
function isTiptapDocument(content: unknown): boolean {
  const result = tiptapDocumentSchema.safeParse(content);
  return result.success;
}

// =============================================================================
// Blog Module Implementation
// =============================================================================

const blogModule: ModuleDefinition<BlogModuleInput, BlogModuleOutput> = {
  id: 'blog',
  name: 'Blog',
  version: '1.0.0',
  description: 'Publish content to the blog',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: blogModuleInputSchema,
  outputSchema: blogModuleOutputSchema,

  async publish(input: BlogModuleInput): Promise<BlogModuleOutput> {
    try {
      // Validate input
      const validated = blogModuleInputSchema.parse(input);
      
      // Generate slug
      const baseSlug = generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = `${baseSlug}-${timestamp}`;
      
      // Prepare content - convert to block array format (ContentBlock[])
      // Blog posts use block-based content, not Tiptap documents directly
      let contentJson: Json;
      
      if (Array.isArray(validated.content)) {
        // Already an array of blocks
        contentJson = validated.content as Json;
      } else if (typeof validated.content === 'string') {
        // Plain text - wrap in a Text block with Tiptap structure
        contentJson = [{
          id: crypto.randomUUID(),
          type: 'text',
          data: {
            content: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.content }] }]
            }
          }
        }] as Json;
      } else if (isTiptapDocument(validated.content)) {
        // Tiptap document - wrap in a Text block
        contentJson = [{
          id: crypto.randomUUID(),
          type: 'text',
          data: {
            content: validated.content
          }
        }] as Json;
      } else {
        // Unknown format - wrap in a single text block
        const contentStr = typeof validated.content === 'object' 
          ? JSON.stringify(validated.content) 
          : String(validated.content);
        contentJson = [{
          id: crypto.randomUUID(),
          type: 'text',
          data: {
            content: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: contentStr }] }]
            }
          }
        }] as Json;
      }

      // Prepare post data
      const status = validated.options?.status || 'draft';
      const postData = {
        title: validated.title,
        slug,
        content_json: contentJson as Json,
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

      // Insert to database
      const { data, error } = await supabase
        .from('blog_posts')
        .insert(postData)
        .select('id, slug, status, published_at')
        .single();

      if (error) {
        console.error('[BlogModule] Insert error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      // Trigger webhook if published
      if (status === 'published') {
        try {
          await triggerWebhook({
            event: 'blog_post.published',
            data: {
              id: data.id,
              title: validated.title,
              slug: data.slug,
              url: `/blog/${data.slug}`,
              source_module: validated.meta?.source_module,
              source_id: validated.meta?.source_id,
            },
          });
        } catch (webhookError) {
          console.warn('[BlogModule] Webhook trigger failed:', webhookError);
          // Don't fail the operation for webhook errors
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
      console.error('[BlogModule] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// =============================================================================
// Newsletter Module Implementation
// =============================================================================

const newsletterModule: ModuleDefinition<NewsletterModuleInput, NewsletterModuleOutput> = {
  id: 'newsletter',
  name: 'Newsletter',
  version: '1.0.0',
  description: 'Create newsletter drafts for sending',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: newsletterModuleInputSchema,
  outputSchema: newsletterModuleOutputSchema,

  async publish(input: NewsletterModuleInput): Promise<NewsletterModuleOutput> {
    try {
      // Validate input
      const validated = newsletterModuleInputSchema.parse(input);
      
      // Determine content format
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

      // Prepare newsletter data
      const status = validated.options?.status || 'draft';
      const newsletterData = {
        subject: validated.subject,
        content_html: contentHtml,
        content_json: contentJson,
        status,
        scheduled_at: validated.options?.send_at || null,
      };

      // Insert to database
      const { data, error } = await supabase
        .from('newsletters')
        .insert(newsletterData)
        .select('id, status')
        .single();

      if (error) {
        console.error('[NewsletterModule] Insert error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        id: data.id,
        status: data.status,
      };
    } catch (error) {
      console.error('[NewsletterModule] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// =============================================================================
// CRM Module Implementation
// =============================================================================

const crmModule: ModuleDefinition<CRMLeadInput, CRMLeadOutput> = {
  id: 'crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'Create and manage leads',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: crmLeadInputSchema,
  outputSchema: crmLeadOutputSchema,

  async publish(input: CRMLeadInput): Promise<CRMLeadOutput> {
    try {
      // Validate input
      const validated = crmLeadInputSchema.parse(input);
      
      // Check for existing lead
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, score, status')
        .eq('email', validated.email)
        .maybeSingle();

      if (existingLead) {
        // Update existing lead score
        const newScore = (existingLead.score || 0) + (validated.initial_score || 5);
        
        await supabase
          .from('leads')
          .update({ score: newScore, updated_at: new Date().toISOString() })
          .eq('id', existingLead.id);

        return {
          success: true,
          lead_id: existingLead.id,
          is_new: false,
          score: newScore,
          status: existingLead.status,
        };
      }

      // Create new lead - status 'lead' is the initial state in the enum
      const leadData: {
        email: string;
        name: string | null;
        phone: string | null;
        source: string;
        source_id: string | null;
        score: number;
        status: 'lead';
      } = {
        email: validated.email,
        name: validated.name || null,
        phone: validated.phone || null,
        source: validated.source,
        source_id: validated.source_id || null,
        score: validated.initial_score || 10,
        status: 'lead',
      };

      const { data, error } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id, score, status')
        .single();

      if (error) {
        console.error('[CRMModule] Insert error:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      // Trigger webhook (lead events use form.submitted as closest available event)
      try {
        await triggerWebhook({
          event: 'form.submitted',
          data: {
            type: 'lead_created',
            id: data.id,
            email: validated.email,
            source: validated.source,
            source_module: validated.meta?.source_module,
          },
        });
      } catch (webhookError) {
        console.warn('[CRMModule] Webhook trigger failed:', webhookError);
      }

      return {
        success: true,
        lead_id: data.id,
        is_new: true,
        score: data.score,
        status: data.status,
      };
    } catch (error) {
      console.error('[CRMModule] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// =============================================================================
// Pages Module Implementation
// =============================================================================

const pagesModule: ModuleDefinition<PageModuleInput, PageModuleOutput> = {
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
      
      // Generate slug if not provided
      const baseSlug = validated.slug || generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = validated.slug ? baseSlug : `${baseSlug}-${timestamp}`;
      
      // Prepare content as ContentBlock[]
      let contentJson: Json;
      
      if (Array.isArray(validated.content)) {
        contentJson = validated.content as Json;
      } else if (typeof validated.content === 'string') {
        contentJson = [{
          id: crypto.randomUUID(),
          type: 'text',
          data: {
            content: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.content }] }]
            }
          }
        }] as Json;
      } else if (isTiptapDocument(validated.content)) {
        contentJson = [{
          id: crypto.randomUUID(),
          type: 'text',
          data: { content: validated.content }
        }] as Json;
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
        console.error('[PagesModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      if (status === 'published') {
        try {
          await triggerWebhook({
            event: 'page.published',
            data: {
              id: data.id,
              title: validated.title,
              slug: data.slug,
              url: `/${data.slug}`,
              source_module: validated.meta?.source_module,
            },
          });
        } catch (webhookError) {
          console.warn('[PagesModule] Webhook failed:', webhookError);
        }
      }

      return {
        success: true,
        id: data.id,
        slug: data.slug,
        url: `/${data.slug}`,
        status: data.status,
      };
    } catch (error) {
      console.error('[PagesModule] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// =============================================================================
// Knowledge Base Module Implementation
// =============================================================================

const kbModule: ModuleDefinition<KBArticleModuleInput, KBArticleModuleOutput> = {
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
      
      // Generate slug
      const baseSlug = validated.slug || generateSlug(validated.title);
      const timestamp = Date.now().toString(36);
      const slug = validated.slug ? baseSlug : `${baseSlug}-${timestamp}`;
      
      // Prepare answer content
      let answerJson: Record<string, unknown> | null = null;
      let answerText: string | null = null;
      
      if (typeof validated.answer === 'string') {
        answerText = validated.answer;
        answerJson = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: validated.answer }] }]
        };
      } else if (isTiptapDocument(validated.answer)) {
        answerJson = validated.answer as Record<string, unknown>;
        // Extract plain text for answerText
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
        console.error('[KBModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        id: data.id,
        slug: data.slug,
        url: `/kb/${data.slug}`,
      };
    } catch (error) {
      console.error('[KBModule] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};

// =============================================================================
// Module Registry Class
// =============================================================================

class ModuleRegistry {
  private modules: Map<string, ModuleDefinition<unknown, unknown>> = new Map();

  constructor() {
    // Register built-in modules
    this.register(blogModule as ModuleDefinition<unknown, unknown>);
    this.register(newsletterModule as ModuleDefinition<unknown, unknown>);
    this.register(crmModule as ModuleDefinition<unknown, unknown>);
    this.register(pagesModule as ModuleDefinition<unknown, unknown>);
    this.register(kbModule as ModuleDefinition<unknown, unknown>);
  }

  /**
   * Register a new module
   */
  register<TInput, TOutput>(module: ModuleDefinition<TInput, TOutput>): void {
    if (this.modules.has(module.id)) {
      console.warn(`[ModuleRegistry] Module '${module.id}' already registered, overwriting`);
    }
    this.modules.set(module.id, module as ModuleDefinition<unknown, unknown>);
    console.log(`[ModuleRegistry] Registered module: ${module.id} v${module.version}`);
  }

  /**
   * Get a registered module
   */
  get<TInput, TOutput>(moduleId: string): ModuleDefinition<TInput, TOutput> | undefined {
    return this.modules.get(moduleId) as ModuleDefinition<TInput, TOutput> | undefined;
  }

  /**
   * List all registered modules
   */
  list(): Array<{
    id: string;
    name: string;
    version: string;
    description?: string;
    capabilities: ModuleCapability[];
  }> {
    return Array.from(this.modules.values()).map(m => ({
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      capabilities: m.capabilities,
    }));
  }

  /**
   * Publish content through a module
   */
  async publish<TInput, TOutput>(
    moduleId: string,
    input: TInput
  ): Promise<TOutput> {
    const module = this.modules.get(moduleId);
    
    if (!module) {
      throw new Error(`Module '${moduleId}' not found`);
    }

    // Validate input against schema
    const validationResult = module.inputSchema.safeParse(input);
    if (!validationResult.success) {
      console.error(`[ModuleRegistry] Validation failed for ${moduleId}:`, validationResult.error);
      return {
        success: false,
        error: 'Validation failed',
        validation_errors: validationResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      } as TOutput;
    }

    // Execute module
    console.log(`[ModuleRegistry] Publishing to ${moduleId}...`);
    const result = await module.publish(validationResult.data);
    
    // Validate output
    const outputValidation = module.outputSchema.safeParse(result);
    if (!outputValidation.success) {
      console.warn(`[ModuleRegistry] Output validation failed for ${moduleId}:`, outputValidation.error);
    }

    return result as TOutput;
  }

  /**
   * Check if a module has a specific capability
   */
  hasCapability(moduleId: string, capability: ModuleCapability): boolean {
    const module = this.modules.get(moduleId);
    return module?.capabilities.includes(capability) ?? false;
  }

  /**
   * Get all modules with a specific capability
   */
  getByCapability(capability: ModuleCapability): string[] {
    return Array.from(this.modules.entries())
      .filter(([_, m]) => m.capabilities.includes(capability))
      .map(([id]) => id);
  }
}

// Export singleton instance
export const moduleRegistry = new ModuleRegistry();

// Export types for external use
export type { ModuleDefinition };
