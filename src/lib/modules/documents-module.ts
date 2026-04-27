/**
 * Documents Module — Unified Definition
 * 
 * Single source of truth for the Documents module.
 * Replaces entries in: module-contracts.ts, skill-map.ts, 
 * module-bootstraps/documents.ts, and module-registry.ts import list.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

// =============================================================================
// Schemas
// =============================================================================

const documentsInputSchema = z.object({
  action: z.enum(['create', 'list', 'get', 'update']),
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  file_url: z.string().optional(),
  related_entity_type: z.string().optional(),
  related_entity_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const documentsOutputSchema = z.object({
  success: z.boolean(),
  document_id: z.string().optional(),
  message: z.string().optional(),
});

type DocumentsInput = z.infer<typeof documentsInputSchema>;
type DocumentsOutput = z.infer<typeof documentsOutputSchema>;

// =============================================================================
// Skill Seeds
// =============================================================================

const DOCS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_document',
    description: 'Upload, search, categorize, and delete documents in the central archive. Use when: storing contracts, HR docs, financial records, or project files. NOT for: media library images (use manage_media), blog content.',
    category: 'content',
    handler: 'db:documents',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_document',
        description: 'CRUD for the document archive. action=create REQUIRES title + file_url + file_name (file_name auto-defaults to title if omitted). For PDFs uploaded to chat, pass the public URL as file_url. Aliases accepted: mime_type→file_type, size_bytes→file_size_bytes, storage_path/url→file_url, name/filename→file_name. Body/markdown content is NOT stored — only the file at file_url.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'search', 'list', 'get', 'update', 'delete', 'categorize'] },
            document_id: { type: 'string', description: 'Required for get/update/delete' },
            id: { type: 'string', description: 'Alias for document_id' },
            title: { type: 'string', description: 'Required for create — short human-readable name' },
            file_url: { type: 'string', description: 'Required for create — public URL or storage path of the file. Aliases accepted: storage_path, url, path.' },
            file_name: { type: 'string', description: 'Optional for create — defaults to title if omitted. Aliases: name, filename.' },
            file_type: { type: 'string', description: 'MIME type, e.g. application/pdf. Aliases: mime_type, content_type.' },
            file_size_bytes: { type: 'number', description: 'File size in bytes. Aliases: size_bytes, file_size.' },
            category: { type: 'string', enum: ['general', 'contract', 'hr', 'finance', 'project'], description: 'Required for create — choose the closest match.' },
            folder: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            description: { type: 'string', description: 'Notes / summary of the document' },
            related_entity_type: { type: 'string', description: 'e.g. contract, employee, project, deal' },
            related_entity_id: { type: 'string' },
            search_query: { type: 'string' },
          },
          required: ['action'],
          allOf: [
            {
              if: { properties: { action: { const: 'create' } } },
              then: { required: ['action', 'title', 'file_url', 'category'] },
            },
          ],
        },
      },
    },
    instructions: 'Central document store. action=create REQUIRES title + file_url + category; file_name auto-fills from title. Categories: contract→Contracts, hr→HR, finance→Expenses/Invoicing, project→Projects. Use related_entity_type to link to a record (e.g. "deal" + deal_id). For PDFs from chat attachments, pass the attachment URL as file_url. The body/markdown of the document is NOT stored — only the file URL. Swedish: "dokument", "fil", "arkiv", "mapp".',
  },
];

// =============================================================================
// Module Definition
// =============================================================================

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const DOCUMENTS_SKILLS: SkillSeed[] = [
  {
    name: 'extract_pdf_text',
    description: 'Extract text content from any PDF document. Uses AI vision to read the PDF and return structured text. Use when: a user uploads a PDF and asks for its content; you need to extract data from a document; converting PDF documents into searchable text. NOT for: browsing web pages (browser_fetch); analyzing images without text.',
    category: 'content',
    handler: 'edge:extract-pdf-text',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'extract_pdf_text',
        description: 'Extract text content from any PDF document. Uses AI vision to read the PDF and return structured text. Use when: a user uploads a PDF and asks for its content; you need to extract data from a document; converting PDF documents into searchable text. NOT for: browsing web pages (browser_fetch); analyzing images without text.',
        parameters: {
          type: 'object',
          properties: {
            file_url: {
              type: 'string',
              description: 'Public URL of the PDF file',
            },
            storage_path: {
              type: 'string',
              description: 'Storage path (bucket/path) of the PDF in media library',
            },
          },
        },
      },
    },
    instructions: `## When to use
- User attaches a PDF file in chat (you'll see a file URL or storage path)
- User asks to "read", "parse", or "extract" a PDF
- Before creating a consultant profile from a resume PDF

## Chaining
After extracting text from a resume PDF, chain with:
1. Call parse_resume with the extracted text to get structured data
2. Call manage_consultant_profile to save the profile

For non-resume PDFs, return the extracted text directly to the user.`,
  },
];

export const documentsModule = defineModule<DocumentsInput, DocumentsOutput>({
  id: 'documents',
  name: 'Documents',
  version: '1.0.0',
  description: 'Document management with categorization, entity linking, and version tracking',
  capabilities: ['data:write', 'data:read'],
  inputSchema: documentsInputSchema,
  outputSchema: documentsOutputSchema,

  // ── FlowPilot Integration ──
  skills: ['manage_document'],
  skillSeeds: DOCS_SKILLS,
  automations: [],

  // ── Webhook Events ──
  webhookEvents: [
    { event: 'document.created' as any, description: 'A document was uploaded or created' },
  ],

  // ── API ──
  async publish(input: DocumentsInput): Promise<DocumentsOutput> {
    const validated = documentsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.title) {
        return { success: false, message: 'title is required' };
      }

      const { data, error } = await supabase
        .from('documents')
        .insert({
          title: validated.title!,
          file_name: validated.title!,
          file_url: validated.file_url || '',
          category: validated.category,
          description: validated.notes,
          related_entity_type: validated.related_entity_type,
          related_entity_id: validated.related_entity_id,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[documents] create failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, document_id: data.id, message: 'Document created' };
    }

    if (validated.action === 'list') {
      let query = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (validated.category) {
        query = query.eq('category', validated.category);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} documents` };
    }

    return { success: false, message: 'Unsupported action' };
  },
});
