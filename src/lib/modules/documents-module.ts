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
        description: 'CRUD for the document archive',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'search', 'list', 'delete', 'categorize'] },
            document_id: { type: 'string' },
            title: { type: 'string' },
            category: { type: 'string', enum: ['general', 'contract', 'hr', 'finance', 'project'] },
            folder: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            search_query: { type: 'string' },
          },
          required: ['action'],
        },
      },
    },
    instructions: 'Central document store. Categories map to modules: contract→Contracts, hr→HR, finance→Expenses/Invoicing, project→Projects. Auto-categorize based on related_entity_type when possible. Swedish: "dokument", "fil", "arkiv", "mapp".',
  },
];

// =============================================================================
// Module Definition
// =============================================================================

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
