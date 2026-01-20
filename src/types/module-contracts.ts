/**
 * Module API Contracts
 * 
 * This file defines the formal input/output schemas for all FlowWink modules.
 * All cross-module communication MUST use these contracts.
 * 
 * @see docs/MODULE-API.md for full documentation
 */

import { z } from 'zod';

// =============================================================================
// Common Schemas
// =============================================================================

/**
 * Tiptap document structure for rich text content
 */
export const tiptapDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.record(z.unknown())).optional(),
});

export type TiptapDocument = z.infer<typeof tiptapDocumentSchema>;

/**
 * Module metadata - tracks content origin for traceability
 */
export const moduleMetaSchema = z.object({
  source_module: z.string().optional(),
  source_id: z.string().optional(),
  trace_id: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export type ModuleMeta = z.infer<typeof moduleMetaSchema>;

/**
 * Module capability types
 */
export const moduleCapabilities = [
  'content:receive',
  'content:produce', 
  'webhook:trigger',
  'webhook:receive',
  'data:read',
  'data:write',
] as const;

export type ModuleCapability = typeof moduleCapabilities[number];

// =============================================================================
// Blog Module
// =============================================================================

export const blogModuleInputSchema = z.object({
  // Required
  title: z.string().min(1).max(200),
  content: z.union([tiptapDocumentSchema, z.string()]),
  
  // Optional
  excerpt: z.string().max(500).optional(),
  featured_image: z.string().url().optional().or(z.literal('')),
  featured_image_alt: z.string().max(200).optional(),
  
  // Metadata
  meta: moduleMetaSchema.optional(),
  
  // Publishing options
  options: z.object({
    status: z.enum(['draft', 'published']).default('draft'),
    schedule_at: z.string().datetime().optional(),
    author_id: z.string().uuid().optional(),
    category_ids: z.array(z.string().uuid()).optional(),
    tag_ids: z.array(z.string().uuid()).optional(),
  }).optional(),
});

export type BlogModuleInput = z.infer<typeof blogModuleInputSchema>;

export const blogModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().uuid().optional(),
  slug: z.string().optional(),
  url: z.string().optional(),
  status: z.string().optional(),
  published_at: z.string().datetime().optional(),
  error: z.string().optional(),
});

export type BlogModuleOutput = z.infer<typeof blogModuleOutputSchema>;

// =============================================================================
// Newsletter Module
// =============================================================================

export const newsletterBlockSchema = z.object({
  type: z.string(),
  content: z.unknown(),
});

export const newsletterModuleInputSchema = z.object({
  // Required
  subject: z.string().min(1).max(150),
  
  // Content (at least one)
  content_html: z.string().optional(),
  content_json: z.array(newsletterBlockSchema).optional(),
  content_tiptap: tiptapDocumentSchema.optional(),
  
  // Optional
  preview_text: z.string().max(200).optional(),
  
  // Metadata
  meta: moduleMetaSchema.optional(),
  
  // Options
  options: z.object({
    status: z.enum(['draft', 'scheduled']).default('draft'),
    send_at: z.string().datetime().optional(),
  }).optional(),
});

export type NewsletterModuleInput = z.infer<typeof newsletterModuleInputSchema>;

export const newsletterModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().uuid().optional(),
  status: z.string().optional(),
  subscriber_count: z.number().optional(),
  error: z.string().optional(),
});

export type NewsletterModuleOutput = z.infer<typeof newsletterModuleOutputSchema>;

// =============================================================================
// Webhook Module
// =============================================================================

export const webhookEventTypes = [
  'page.published',
  'page.deleted',
  'blog_post.published',
  'blog_post.updated',
  'blog_post.deleted',
  'form.submitted',
  'newsletter.subscribed',
  'newsletter.unsubscribed',
  'order.created',
  'order.paid',
  'order.shipped',
  'order.cancelled',
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'lead.created',
  'lead.qualified',
  'content.published',
] as const;

export type WebhookEventType = typeof webhookEventTypes[number];

export const webhookModuleInputSchema = z.object({
  // Required
  event: z.enum(webhookEventTypes),
  payload: z.record(z.unknown()),
  
  // Optional
  channel: z.string().optional(),
  
  // Metadata
  meta: moduleMetaSchema.optional(),
});

export type WebhookModuleInput = z.infer<typeof webhookModuleInputSchema>;

export const webhookResultSchema = z.object({
  webhook_id: z.string(),
  webhook_name: z.string(),
  success: z.boolean(),
  status_code: z.number().optional(),
  error: z.string().optional(),
});

export const webhookModuleOutputSchema = z.object({
  success: z.boolean(),
  triggered_count: z.number(),
  results: z.array(webhookResultSchema),
  error: z.string().optional(),
});

export type WebhookModuleOutput = z.infer<typeof webhookModuleOutputSchema>;

// =============================================================================
// CRM Module
// =============================================================================

export const crmLeadInputSchema = z.object({
  // Required
  email: z.string().email(),
  
  // Optional
  name: z.string().optional(),
  phone: z.string().optional(),
  source: z.string().default('manual'),
  source_id: z.string().optional(),
  
  // Scoring
  initial_score: z.number().min(0).max(100).optional(),
  
  // Metadata
  meta: z.object({
    source_module: z.string().optional(),
    form_data: z.record(z.unknown()).optional(),
  }).optional(),
});

export type CRMLeadInput = z.infer<typeof crmLeadInputSchema>;

export const crmLeadOutputSchema = z.object({
  success: z.boolean(),
  lead_id: z.string().uuid().optional(),
  is_new: z.boolean().optional(),
  score: z.number().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

export type CRMLeadOutput = z.infer<typeof crmLeadOutputSchema>;

// =============================================================================
// Pages Module
// =============================================================================

export const pageModuleInputSchema = z.object({
  // Required
  title: z.string().min(1).max(200),
  
  // Content - supports both ContentBlock[] and Tiptap
  content: z.union([
    z.array(z.record(z.unknown())), // ContentBlock[]
    tiptapDocumentSchema,
    z.string(),
  ]),
  
  // Optional
  slug: z.string().max(100).optional(), // Auto-generated if not provided
  
  // Metadata
  meta: z.object({
    source_module: z.string().optional(),
    source_id: z.string().optional(),
    seo_title: z.string().max(60).optional(),
    seo_description: z.string().max(160).optional(),
  }).optional(),
  
  // Options
  options: z.object({
    status: z.enum(['draft', 'published']).default('draft'),
    show_in_menu: z.boolean().default(false),
    menu_order: z.number().optional(),
    schedule_at: z.string().datetime().optional(),
  }).optional(),
});

export type PageModuleInput = z.infer<typeof pageModuleInputSchema>;

export const pageModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().uuid().optional(),
  slug: z.string().optional(),
  url: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

export type PageModuleOutput = z.infer<typeof pageModuleOutputSchema>;

// =============================================================================
// Knowledge Base Module
// =============================================================================

export const kbArticleModuleInputSchema = z.object({
  // Required
  title: z.string().min(1).max(200),
  question: z.string().min(1).max(500),
  category_id: z.string().uuid(),
  
  // Content
  answer: z.union([tiptapDocumentSchema, z.string()]),
  
  // Optional
  slug: z.string().max(100).optional(),
  
  // Metadata
  meta: z.object({
    source_module: z.string().optional(),
    source_id: z.string().optional(),
    seo_title: z.string().optional(),
    seo_description: z.string().optional(),
  }).optional(),
  
  // Options
  options: z.object({
    is_published: z.boolean().default(true),
    is_featured: z.boolean().default(false),
    include_in_chat: z.boolean().default(true),
  }).optional(),
});

export type KBArticleModuleInput = z.infer<typeof kbArticleModuleInputSchema>;

export const kbArticleModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().uuid().optional(),
  slug: z.string().optional(),
  url: z.string().optional(),
  error: z.string().optional(),
});

export type KBArticleModuleOutput = z.infer<typeof kbArticleModuleOutputSchema>;

// =============================================================================
// Generic Module Error
// =============================================================================

export const moduleErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  error_code: z.enum([
    'VALIDATION_ERROR',
    'NOT_FOUND',
    'PERMISSION_DENIED',
    'DUPLICATE',
    'EXTERNAL_ERROR',
    'UNKNOWN_ERROR',
  ]).optional(),
  validation_errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
  })).optional(),
});

export type ModuleError = z.infer<typeof moduleErrorSchema>;

// =============================================================================
// Module Definition Interface
// =============================================================================

/**
 * Base interface for all module definitions
 */
export interface ModuleDefinition<TInput, TOutput> {
  id: string;
  name: string;
  version: string;
  description?: string;
  capabilities: ModuleCapability[];
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  publish: (input: TInput) => Promise<TOutput>;
}
